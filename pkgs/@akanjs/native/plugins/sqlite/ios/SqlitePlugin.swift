import Foundation
import SQLite3

/// SQLite through the system libsqlite3. `import SQLite3` also links it: the SDK's module map
/// (usr/include/SQLite3.modulemap) says `link "sqlite3"`, so swiftc autolinks /usr/lib/libsqlite3.dylib
/// without a manifest entry or linker flag (checked with swiftc for the simulator + otool -L).
/// - Files: Library/Application Support/databases/<name>, kept until the app is removed.
/// - Every call runs on one serial queue, off the main thread and in call order, so BEGIN and
///   COMMIT from separate calls see the same connection state (as the Android worker thread).
/// - One statement per call: sqlite3_prepare_v2 compiles the first statement and hands back the
///   rest (the tail); anything but whitespace, comments and ";" there rejects the call, where
///   Android and bun:sqlite would silently drop it (src/common.ts countStatements does the same
///   check on desktop, android/SqlStatements.kt on Android).
/// - Values follow src/index.ts SqlValue: safe integers as INTEGER, other numbers as REAL, JSON
///   booleans (CFBoolean NSNumbers) as 1/0, { base64 } as BLOB. Text and blobs bind with their byte
///   length and SQLITE_TRANSIENT, so NUL characters are kept and SQLite copies the bytes.
///   An empty blob binds with sqlite3_bind_zeroblob: sqlite3_bind_blob with a nil pointer binds NULL.
/// - changes is the difference of sqlite3_total_changes64 (triggers count, DDL is 0), as
///   bun:sqlite's Statement.run() reports it on desktop.
/// - Connections belong to the page that opened them (architecture review, document scope): when it
///   ends (AkanNativeDocument.own), an open transaction is rolled back and its connections close. WAL and a
///   5 s busy timeout, as on desktop.
/// Arguments arrive decoded by the generated SqlitePluginSpec (PL-10).
final class SqlitePlugin: SqlitePluginSpec {
    static let id = "sqlite"
    private let store = SqliteStore()
    /// Pages whose end already closes their connections.
    private var owned = Set<String>()

    init(context: AkanNativePluginContext) {}

    /// The calling page's key ("" for a page without a document id).
    private func page(_ reply: AkanNativeReply<some Any>) -> String { reply.call.document?.id ?? "" }

    func open(_ args: SqliteOpenArgs, _ reply: AkanNativeReply<SqliteOpenResult>) {
        let page = page(reply)
        if let document = reply.call.document, !owned.contains(page) {
            owned.insert(page)
            let store = store
            document.own { [weak self] in
                self?.owned.remove(page)
                store.closePage(page)
            }
        }
        store.perform(reply) { SqliteOpenResult(db: try $0.open(args.name, page: page)) }
    }

    func execute(_ args: SqliteStatementArgs, _ reply: AkanNativeReply<SqliteExecuteResult>) {
        let page = page(reply)
        store.perform(reply) {
            let result = try $0.run(args, page: page, collect: false)
            return SqliteExecuteResult(changes: Double(result.changes), lastInsertId: Double(result.lastInsertId))
        }
    }

    func query(_ args: SqliteStatementArgs, _ reply: AkanNativeReply<SqliteQueryResult>) {
        let page = page(reply)
        store.perform(reply) {
            let result = try $0.run(args, page: page, collect: true)
            return SqliteQueryResult(columns: result.columns, rows: result.rows)
        }
    }

    func close(_ args: SqliteCloseArgs, _ reply: AkanNativeReply<Void>) {
        let page = page(reply)
        store.perform(reply) { $0.close(args.db, page: page) }
    }
}

struct SqliteFailure: Error {
    let code: AkanNativeErrorCode
    let message: String

    init(_ code: AkanNativeErrorCode, _ message: String) {
        self.code = code
        self.message = message
    }
}

/// The open databases, by page and name. Everything but `perform` and `closePage` runs on `queue` only.
final class SqliteStore: @unchecked Sendable {
    private let queue = DispatchQueue(label: "com.akanjs.sqlite")
    private var handles: [String: OpaquePointer] = [:]

    private static func key(_ page: String, _ name: String) -> String { "\(page)\u{0}\(name)" }

    /// SQLITE_TRANSIENT: SQLite copies bound text and blobs before the call returns.
    private static var transient: sqlite3_destructor_type { unsafeBitCast(-1, to: sqlite3_destructor_type.self) }
    private static let maxSafe: Double = 9_007_199_254_740_991

    func perform<T>(_ reply: AkanNativeReply<T>, _ work: @escaping @Sendable (SqliteStore) throws -> T) {
        queue.async {
            do {
                reply.resolve(try work(self))
            } catch let failure as SqliteFailure {
                reply.reject(failure.code, failure.message)
            } catch {
                reply.reject(.internalError, "\(error)")
            }
        }
    }

    func open(_ name: String, page: String) throws -> String {
        guard Self.validName(name) else {
            throw SqliteFailure(.invalidArgs, "name must be a file name: letters, digits, \".\", \"_\" and \"-\", up to 128 characters, starting with a letter or digit, not ending in -journal, -wal or -shm")
        }
        if handles[Self.key(page, name)] != nil { return name }
        let folder: URL
        do {
            folder = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
                .appendingPathComponent("databases", isDirectory: true)
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        } catch {
            throw SqliteFailure(.internalError, "cannot open \(name): \(error.localizedDescription)")
        }
        var db: OpaquePointer?
        let rc = sqlite3_open_v2(folder.appendingPathComponent(name).path, &db, SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE, nil)
        guard rc == SQLITE_OK, let db else {
            let message = db.map { String(cString: sqlite3_errmsg($0)) } ?? "out of memory"
            sqlite3_close_v2(db)
            throw SqliteFailure(.internalError, "cannot open \(name): \(message)")
        }
        sqlite3_busy_timeout(db, 5000)
        guard sqlite3_exec(db, "PRAGMA journal_mode = WAL", nil, nil, nil) == SQLITE_OK,
              sqlite3_exec(db, "PRAGMA foreign_keys = ON", nil, nil, nil) == SQLITE_OK else {
            let message = String(cString: sqlite3_errmsg(db))
            sqlite3_close_v2(db)
            throw SqliteFailure(.internalError, "cannot open \(name): \(message)")
        }
        handles[Self.key(page, name)] = db
        return name
    }

    func close(_ name: String, page: String) {
        guard let db = handles.removeValue(forKey: Self.key(page, name)) else { return }
        Self.shut(db)
    }

    /// The page ended: its connections roll back what is open and close, after the calls before.
    func closePage(_ page: String) {
        queue.async {
            let prefix = page + "\u{0}"
            for key in self.handles.keys where key.hasPrefix(prefix) {
                if let db = self.handles.removeValue(forKey: key) { Self.shut(db) }
            }
        }
    }

    private static func shut(_ db: OpaquePointer) {
        if sqlite3_get_autocommit(db) == 0 { sqlite3_exec(db, "ROLLBACK", nil, nil, nil) }
        sqlite3_close_v2(db)
    }

    struct Outcome {
        var columns: [String] = []
        var rows: [[String: Any]] = []
        var changes: Int64 = 0
        var lastInsertId: Int64 = 0
    }

    func run(_ args: SqliteStatementArgs, page: String, collect: Bool) throws -> Outcome {
        guard let db = handles[Self.key(page, args.db)] else {
            throw SqliteFailure(.notFound, "database \(args.db) is not open in this page (call open first; a page load opens its own)")
        }
        let values = try Self.values(args.params ?? [])
        if let refused = Self.refused(args.sql) { throw SqliteFailure(.notAllowed, refused) }
        let statement = try prepare(db, args.sql)
        defer { sqlite3_finalize(statement) }

        let expected = Int(sqlite3_bind_parameter_count(statement))
        guard expected == values.count else {
            throw SqliteFailure(.invalidArgs, "sql expects \(expected) values, got \(values.count)")
        }
        for (i, value) in values.enumerated() {
            let rc = Self.bind(value, statement, Int32(i + 1))
            guard rc == SQLITE_OK else { throw Self.failure(db, rc) }
        }

        var outcome = Outcome()
        let count = Int(sqlite3_column_count(statement))
        outcome.columns = (0..<count).map { i in sqlite3_column_name(statement, Int32(i)).map { String(cString: $0) } ?? "" }
        let before = sqlite3_total_changes64(db)
        while true {
            let rc = sqlite3_step(statement)
            if rc == SQLITE_DONE { break }
            guard rc == SQLITE_ROW else { throw Self.failure(db, rc) }
            if collect {
                var row: [String: Any] = [:]
                for (i, name) in outcome.columns.enumerated() { row[name] = Self.column(statement, Int32(i)) }
                outcome.rows.append(row)
            }
        }
        outcome.changes = sqlite3_total_changes64(db) - before
        outcome.lastInsertId = sqlite3_last_insert_rowid(db)
        return outcome
    }

    /// The bare words of `sql` (keywords and unquoted names), lowercase, skipping quotes and comments.
    private static func words(_ sql: String) -> [String] {
        let b = Array(sql.utf8)
        let n = b.count
        func idChar(_ c: UInt8) -> Bool { (c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a) || c == 0x5f || c == 0x24 || c >= 0x80 }
        func find(_ needle: [UInt8], from: Int) -> Int? {
            guard from <= n - needle.count else { return nil }
            return (from...(n - needle.count)).first { Array(b[$0..<$0 + needle.count]) == needle }
        }
        var out: [String] = []
        var i = 0
        while i < n {
            let c = b[i]
            if c == 0x2f, i + 1 < n, b[i + 1] == 0x2a { i = find([0x2a, 0x2f], from: i + 2).map { $0 + 1 } ?? n }
            else if c == 0x2d, i + 1 < n, b[i + 1] == 0x2d { i = find([0x0a], from: i + 2) ?? n }
            else if c == 0x5b || c == 0x60 || c == 0x22 || c == 0x27 { i = find([c == 0x5b ? 0x5d : c], from: i + 1) ?? n }
            else if idChar(c) {
                var j = i + 1
                while j < n && idChar(b[j]) { j += 1 }
                out.append(String(decoding: b[i..<j], as: UTF8.self).lowercased())
                i = j - 1
            }
            i += 1
        }
        return out
    }

    /// Why `sql` is refused, or nil: ATTACH opens any SQLite file the app can reach and VACUUM INTO
    /// writes one anywhere, past the filesystem plugin's scopes (src/common.ts refusedStatement).
    static func refused(_ sql: String) -> String? {
        let w = words(sql)
        var i = 0
        if w.first == "explain" { i += w.count > 2 && w[1] == "query" && w[2] == "plan" ? 3 : 1 }
        guard i < w.count else { return nil }
        if w[i] == "attach" { return "ATTACH is not allowed: open every database with open()" }
        if w[i] == "vacuum" && w[(i + 1)...].contains("into") { return "VACUUM INTO is not allowed: it writes a file outside the database" }
        return nil
    }

    /// The first statement of `sql`; rejects the call if the tail holds another one.
    private func prepare(_ db: OpaquePointer, _ sql: String) throws -> OpaquePointer {
        try sql.withCString { base -> OpaquePointer in
            var statement: OpaquePointer?
            var tail: UnsafePointer<CChar>?
            let rc = sqlite3_prepare_v2(db, base, -1, &statement, &tail)
            guard rc == SQLITE_OK else { throw Self.failure(db, rc) }
            guard let statement else { throw SqliteFailure(.invalidArgs, "sql holds no statement") }
            // Whitespace, comments and ";" compile to no statement; anything else is a second one
            // (or text that does not compile, which is not part of the first statement either).
            var rest = tail
            while let at = rest, at.pointee != 0 {
                var next: OpaquePointer?
                var after: UnsafePointer<CChar>?
                let more = sqlite3_prepare_v2(db, at, -1, &next, &after)
                if more != SQLITE_OK || next != nil {
                    sqlite3_finalize(next)
                    sqlite3_finalize(statement)
                    throw SqliteFailure(.invalidArgs, "sql must be one statement; run them one call at a time")
                }
                guard let after, after > at else { break }
                rest = after
            }
            return statement
        }
    }

    private enum Value {
        case null
        case integer(Int64)
        case real(Double)
        case text(String)
        case blob(Data)
    }

    private static func values(_ params: [Any]) throws -> [Value] {
        try params.enumerated().map { i, value in
            switch value {
            case is NSNull:
                return .null
            case let text as String:
                return .text(text)
            case let number as NSNumber:
                if CFGetTypeID(number as CFTypeRef) == CFBooleanGetTypeID() { return .integer(number.boolValue ? 1 : 0) }
                let d = number.doubleValue
                guard d.isFinite else { break }
                if d.rounded(.towardZero) == d, abs(d) <= maxSafe { return .integer(Int64(d)) }
                return .real(d)
            case let object as [String: Any]:
                if object.count == 1, let text = object["base64"] as? String, let data = decodeBase64(text) { return .blob(data) }
            default:
                break
            }
            throw SqliteFailure(.invalidArgs, "params[\(i)] must be a string, number, boolean, null or { base64 }")
        }
    }

    /// Standard alphabet, padding optional, no whitespace (the rule of src/common.ts).
    /// Data(base64Encoded:) needs the padding, so it is added.
    private static func decodeBase64(_ text: String) -> Data? {
        let bytes = Array(text.utf8)
        let padding = bytes.reversed().prefix { $0 == UInt8(ascii: "=") }.count
        let isAlphabet = { (b: UInt8) in
            (b >= 0x41 && b <= 0x5A) || (b >= 0x61 && b <= 0x7A) || (b >= 0x30 && b <= 0x39) || b == UInt8(ascii: "+") || b == UInt8(ascii: "/")
        }
        guard padding <= 2, bytes.count % 4 != 1, padding == 0 || bytes.count % 4 == 0, bytes.dropLast(padding).allSatisfy(isAlphabet) else { return nil }
        return Data(base64Encoded: text + String(repeating: "=", count: (4 - bytes.count % 4) % 4))
    }

    private static func bind(_ value: Value, _ statement: OpaquePointer, _ index: Int32) -> Int32 {
        switch value {
        case .null:
            return sqlite3_bind_null(statement, index)
        case let .integer(v):
            return sqlite3_bind_int64(statement, index, v)
        case let .real(v):
            return sqlite3_bind_double(statement, index, v)
        case let .text(text):
            // utf8CString keeps NUL characters and ends with one terminator, which the length leaves out.
            return text.utf8CString.withUnsafeBufferPointer { sqlite3_bind_text(statement, index, $0.baseAddress, Int32($0.count - 1), transient) }
        case let .blob(data):
            if data.isEmpty { return sqlite3_bind_zeroblob(statement, index, 0) }
            return data.withUnsafeBytes { sqlite3_bind_blob(statement, index, $0.baseAddress, Int32($0.count), transient) }
        }
    }

    /// A column as the bridge carries it: NSNumber, String, NSNull or ["base64": …].
    private static func column(_ statement: OpaquePointer, _ i: Int32) -> Any {
        switch sqlite3_column_type(statement, i) {
        case SQLITE_INTEGER:
            return NSNumber(value: sqlite3_column_int64(statement, i))
        case SQLITE_FLOAT:
            let d = sqlite3_column_double(statement, i)
            return d.isFinite ? NSNumber(value: d) : NSNull() // JSON has no Infinity
        case SQLITE_TEXT:
            // text first, then its byte length (sqlite.org/c3ref/column_blob.html), NULs included
            guard let text = sqlite3_column_text(statement, i) else { return "" }
            return String(decoding: UnsafeBufferPointer(start: text, count: Int(sqlite3_column_bytes(statement, i))), as: UTF8.self)
        case SQLITE_BLOB:
            let bytes = sqlite3_column_blob(statement, i)
            let count = Int(sqlite3_column_bytes(statement, i))
            let data = bytes.map { Data(bytes: $0, count: count) } ?? Data()
            return ["base64": data.base64EncodedString()]
        default:
            return NSNull()
        }
    }

    // Primary result codes that mean the SQL or its values do not fit the database: ERROR
    // (syntax, no such table), TOOBIG, CONSTRAINT, MISMATCH, RANGE (src/common.ts sqliteCode).
    private static func failure(_ db: OpaquePointer, _ rc: Int32) -> SqliteFailure {
        let caller: Set<Int32> = [SQLITE_ERROR, SQLITE_TOOBIG, SQLITE_CONSTRAINT, SQLITE_MISMATCH, SQLITE_RANGE]
        return SqliteFailure(caller.contains(rc & 0xff) ? .invalidArgs : .internalError, String(cString: sqlite3_errmsg(db)))
    }

    private static func validName(_ name: String) -> Bool {
        let scalars = Array(name.unicodeScalars)
        let alnum = { (c: Unicode.Scalar) in (c.value >= 0x30 && c.value <= 0x39) || (c.value >= 0x41 && c.value <= 0x5A) || (c.value >= 0x61 && c.value <= 0x7A) }
        guard let first = scalars.first, scalars.count <= 128, alnum(first),
              scalars.allSatisfy({ alnum($0) || $0 == "." || $0 == "_" || $0 == "-" })
        else { return false }
        let lower = name.lowercased()
        return !(lower.hasSuffix("-journal") || lower.hasSuffix("-wal") || lower.hasSuffix("-shm"))
    }
}
