import Foundation
import UniformTypeIdentifiers

/// Files in four base folders of the app container (plugins/filesystem/src/index.ts has the table):
///   data      Library/Application Support/files   (backed up)
///   cache     Library/Caches/files                (not backed up, purged under storage pressure)
///   documents Documents                           (the user's documents; Files app with UIFileSharingEnabled)
///   temp      tmp/files                           (purged by the system when the app is not running)
/// "files" subfolders keep the shell's and WebKit's own files (tmp/akan-native-files, Caches/<id>/WebKit)
/// out of the page's reach.
/// - Paths are relative, "/"-separated, without "..": the same checks as src/common.ts, the rule of
///   tauri/crates/tauri/src/path/mod.rs:47 (SafePathBuf). Symbolic links are resolved with
///   realpath(3) and must stay inside the resolved base (tauri-plugins-workspace/plugins/fs/src/
///   commands.rs:1606-1640 checks scopes after following links the same way).
/// - All work runs on one serial queue: the UI thread never waits for the disk, and calls finish in
///   the order the page made them, so un-awaited append chunks land in order.
/// - readFile without encoding registers the file itself (no copy) and returns a FileRef; the scheme
///   handler serves it with Range support, so large files never cross the bridge.
/// - Arguments arrive decoded by the generated FilesystemPluginSpec (PL-10). readFile (overloaded in
///   the spec) and writeFile (an intersection with a union) stay untyped there and read call.args.
final class FilesystemPlugin: FilesystemPluginSpec {
    static let id = "filesystem"
    private let context: AkanNativePluginContext
    private let worker: FilesystemWorker
    private let queue = DispatchQueue(label: "com.akanjs.filesystem", qos: .userInitiated)

    init(context: AkanNativePluginContext) {
        self.context = context
        let fm = FileManager.default
        let library = { (dir: FileManager.SearchPathDirectory) in fm.urls(for: dir, in: .userDomainMask)[0] }
        worker = FilesystemWorker(dirs: [
            "data": library(.applicationSupportDirectory).appendingPathComponent("files", isDirectory: true).path,
            "cache": library(.cachesDirectory).appendingPathComponent("files", isDirectory: true).path,
            "documents": library(.documentDirectory).path,
            "temp": fm.temporaryDirectory.appendingPathComponent("files", isDirectory: true).path,
        ])
    }

    /// PL-11: the app's capabilities may limit calls to scopes { base?, path? } (globs, path relative
    /// to its base with "/" separators; src/common.ts checkScope), on the spelled path first. ".."
    /// never gets this far: the argument checks reject it. The worker checks the resolved path again
    /// (a symbolic link's target) and what a recursive call reaches inside a folder.
    private func inScope(_ call: AkanNativeCall, _ targets: [(base: String, path: String)]) -> Bool {
        guard call.scope != nil else { return true }
        for (base, raw) in targets {
            let path = raw.split(separator: "/").filter { $0 != "." }.joined(separator: "/")
            guard call.inScope(["base": base, "path": path], pathFields: ["path"], fold: worker.folds(base), what: "\(base):\(path.isEmpty ? "." : path)") else { return false }
        }
        return true
    }

    /// The scope target of the untyped methods, read from the raw arguments.
    private static func target(_ call: AkanNativeCall) -> [(base: String, path: String)] {
        [(call.args["base"] as? String ?? "", call.args["path"] as? String ?? "")]
    }

    private static func targets(_ args: FilesystemMoveOptions) -> [(base: String, path: String)] {
        [(args.base.rawValue, args.from), ((args.toBase ?? args.base).rawValue, args.to)]
    }

    /// Runs `work` on the queue and answers with its result, or rejects with the error's code.
    private func perform<T>(_ reply: AkanNativeReply<T>, _ work: @escaping @Sendable (FilesystemWorker) throws -> T) {
        let worker = self.worker
        queue.async {
            do {
                reply.resolve(try work(worker))
            } catch {
                FilesystemWorker.reject(reply.call, error)
            }
        }
    }

    func readFile(_ call: AkanNativeCall) {
        guard inScope(call, Self.target(call)) else { return }
        let worker = self.worker
        let context = self.context
        let args = UncheckedBox(call.args)
        let scope = call.scope
        queue.async {
            do {
                switch try worker.readFile(args.value, scope) {
                case .data(let text):
                    call.resolve(["data": text])
                case .file(let url, let mime):
                    DispatchQueue.main.async { MainActor.assumeIsolated { call.resolve(context.fileRef(url, mime: mime).akanNativeJSON) } }
                }
            } catch {
                FilesystemWorker.reject(call, error)
            }
        }
    }

    func writeFile(_ call: AkanNativeCall) {
        guard inScope(call, Self.target(call)) else { return }
        // FileRefs are looked up here, on the main actor, before the work leaves it.
        var fileRef: URL?
        if let url = call.args["url"], !(url is NSNull) {
            guard let ref = url as? String, !ref.isEmpty else { return call.reject(.invalidArgs, "url must be a non-empty string") }
            guard let file = context.file(ref) else { return call.reject(.notFound, "\(ref) is not a file of this session") }
            fileRef = file.url
        }
        let source = fileRef
        let worker = self.worker
        let args = UncheckedBox(call.args)
        let scope = call.scope
        queue.async {
            do {
                try worker.writeFile(args.value, source: source, scope)
                call.resolve()
            } catch {
                FilesystemWorker.reject(call, error)
            }
        }
    }

    func readDir(_ args: FilesystemPathOptions, _ reply: AkanNativeReply<FilesystemReadDirResult>) {
        guard inScope(reply.call, [(args.base.rawValue, args.path)]) else { return }
        let scope = reply.call.scope
        perform(reply) { try $0.readDir(args, scope) }
    }

    func stat(_ args: FilesystemPathOptions, _ reply: AkanNativeReply<FilesystemFileInfo>) {
        guard inScope(reply.call, [(args.base.rawValue, args.path)]) else { return }
        let scope = reply.call.scope
        perform(reply) { try $0.fileInfo(args, scope) }
    }

    func exists(_ args: FilesystemPathOptions, _ reply: AkanNativeReply<FilesystemExistsResult>) {
        guard inScope(reply.call, [(args.base.rawValue, args.path)]) else { return }
        let scope = reply.call.scope
        perform(reply) { try $0.exists(args, scope) }
    }

    func mkdir(_ args: FilesystemMkdirArgs, _ reply: AkanNativeReply<Void>) {
        guard inScope(reply.call, [(args.base.rawValue, args.path)]) else { return }
        let scope = reply.call.scope
        perform(reply) { try $0.mkdir(args, scope) }
    }

    func remove(_ args: FilesystemRemoveArgs, _ reply: AkanNativeReply<Void>) {
        guard inScope(reply.call, [(args.base.rawValue, args.path)]) else { return }
        let scope = reply.call.scope
        perform(reply) { try $0.remove(args, scope) }
    }

    func rename(_ args: FilesystemMoveOptions, _ reply: AkanNativeReply<Void>) {
        guard inScope(reply.call, Self.targets(args)) else { return }
        let scope = reply.call.scope
        perform(reply) { try $0.move(args, keepSource: false, scope) }
    }

    func copy(_ args: FilesystemMoveOptions, _ reply: AkanNativeReply<Void>) {
        guard inScope(reply.call, Self.targets(args)) else { return }
        let scope = reply.call.scope
        perform(reply) { try $0.move(args, keepSource: true, scope) }
    }

    func paths(_ reply: AkanNativeReply<[String: String]>) {
        reply.resolve(worker.dirs)
    }
}

/// The file operations, off the main actor. Stateless apart from the folder paths.
final class FilesystemWorker: Sendable {
    let dirs: [String: String]

    init(dirs: [String: String]) {
        self.dirs = dirs
    }

    struct Problem: Error {
        let code: AkanNativeErrorCode
        let message: String
    }

    enum ReadOutcome {
        case data(String)
        case file(URL, mime: String)
    }

    private static func invalid(_ message: String) -> Problem { Problem(code: .invalidArgs, message: message) }
    private static func notFound(_ message: String) -> Problem { Problem(code: .notFound, message: message) }
    private static var fm: FileManager { .default }

    /// Rejects with a Problem's code, or with the code of a Cocoa or POSIX error.
    static func reject(_ call: AkanNativeCall, _ error: Error) {
        if let problem = error as? Problem {
            call.reject(problem.code, problem.message)
        } else {
            call.reject(code(of: error), error.localizedDescription)
        }
    }

    static func code(of error: Error) -> AkanNativeErrorCode {
        let ns = error as NSError
        if ns.domain == NSCocoaErrorDomain {
            switch CocoaError.Code(rawValue: ns.code) {
            case .fileNoSuchFile, .fileReadNoSuchFile: return .notFound
            case .fileWriteFileExists, .fileReadInvalidFileName, .fileWriteInvalidFileName: return .invalidArgs
            case .fileReadNoPermission, .fileWriteNoPermission, .fileWriteVolumeReadOnly: return .permissionDenied
            default: break
            }
            if let underlying = ns.userInfo[NSUnderlyingErrorKey] as? Error { return code(of: underlying) }
        }
        if ns.domain == NSPOSIXErrorDomain { return posixCode(Int32(ns.code)) }
        return .internalError
    }

    private static func posixCode(_ value: Int32) -> AkanNativeErrorCode {
        switch value {
        case ENOENT: .notFound
        case EEXIST, ENOTEMPTY, EISDIR, ENOTDIR, EINVAL, ENAMETOOLONG, ELOOP: .invalidArgs
        case EACCES, EPERM, EROFS: .permissionDenied
        default: .internalError
        }
    }

    private static func posixError(_ what: String) -> Problem {
        let value = errno
        return Problem(code: posixCode(value), message: "\(what): \(String(cString: strerror(value)))")
    }

    // MARK: arguments (same rules as src/common.ts)

    private struct Base {
        let name: String
        /// realpath of the folder, which exists.
        let root: String
        /// The volume ignores case (scopes compare folded paths).
        let fold: Bool
    }

    /// Whether the base named `name` is on a case-insensitive volume (iOS app containers usually
    /// are not; a volume the user picked may be).
    func folds(_ name: String) -> Bool {
        guard let dir = dirs[name] else { return false }
        let values = try? URL(fileURLWithPath: dir).resourceValues(forKeys: [.volumeSupportsCaseSensitiveNamesKey])
        return values?.volumeSupportsCaseSensitiveNames == false
    }

    /// NOT_ALLOWED unless `parts` of `base` is inside the call's scope.
    private func check(_ scope: AkanNativeScope?, _ base: Base, _ parts: [String]) throws {
        guard let scope else { return }
        let path = parts.joined(separator: "/")
        guard scope.permits(["base": base.name, "path": path], pathFields: ["path"], fold: base.fold) else {
            throw Problem(code: .notAllowed, message: "\(base.name):\(path.isEmpty ? "." : path) is outside the app's capabilities")
        }
    }

    /// With a scope, what a recursive call reaches under a folder must be inside it as well: a copy
    /// or move of "notes" must not carry a denied "notes/secret" along, nor remove it.
    private func checkTree(_ scope: AkanNativeScope?, _ base: Base, _ parts: [String], _ dir: String, to: (Base, [String])? = nil) throws {
        guard scope != nil, let items = Self.fm.enumerator(atPath: dir) else { return }
        for case let rel as String in items {
            let sub = rel.split(separator: "/").map(String.init)
            try check(scope, base, parts + sub)
            if let (toBase, toParts) = to { try check(scope, toBase, toParts + sub) }
        }
    }

    /// The base named `value`; typed arguments pass a valid name, the untyped ones are checked here.
    private func base(_ value: Any?, key: String) throws -> Base {
        guard let name = value as? String, let dir = dirs[name] else {
            throw Self.invalid("\(key) must be one of data, cache, documents, temp")
        }
        try Self.fm.createDirectory(atPath: dir, withIntermediateDirectories: true)
        guard let root = Self.realPath(dir) else { throw Self.posixError(dir) }
        return Base(name: name, root: root, fold: folds(name))
    }

    private func segments(_ value: Any?, allowRoot: Bool, key: String = "path") throws -> [String] {
        guard let path = value as? String else { throw Self.invalid("\(key) must be a string") }
        return try segments(path, allowRoot: allowRoot, key: key)
    }

    private func segments(_ path: String, allowRoot: Bool, key: String = "path") throws -> [String] {
        if path.hasPrefix("/") { throw Self.invalid("\(key) must be relative to its base directory, not absolute (got \(path))") }
        if path.contains("\\") { throw Self.invalid("\(key) must use \"/\" as separator (got \(path))") }
        if path.contains("\0") { throw Self.invalid("\(key) must not contain NUL") }
        let parts = path.split(separator: "/", omittingEmptySubsequences: true).map(String.init).filter { $0 != "." }
        if parts.contains("..") { throw Self.invalid("\(key) must not contain \"..\" (got \(path))") }
        if !allowRoot && parts.isEmpty { throw Self.invalid("\(key) must name a file or folder inside the base directory") }
        return parts
    }

    private func flag(_ args: [String: Any], _ key: String) throws -> Bool {
        switch args[key] {
        case nil, is NSNull: return false
        case let value as NSNumber where CFGetTypeID(value) == CFBooleanGetTypeID(): return value.boolValue
        default: throw Self.invalid("\(key) must be a boolean")
        }
    }

    private func encoding(_ args: [String: Any], allowNone: Bool) throws -> String? {
        switch args["encoding"] {
        case nil, is NSNull: return allowNone ? nil : "utf8"
        case let value as String where value == "utf8" || value == "base64": return value
        default: throw Self.invalid("encoding must be \"utf8\" or \"base64\"")
        }
    }

    /// Strict base64 (standard alphabet, optional padding), as src/common.ts checkBase64.
    private static func decodeBase64(_ text: String) throws -> Data {
        let bytes = Array(text.utf8)
        var body = bytes.count
        while body > 0 && bytes[body - 1] == UInt8(ascii: "=") { body -= 1 }
        let padding = bytes.count - body
        let alphabetOK = bytes[..<body].allSatisfy { b in
            (b >= 65 && b <= 90) || (b >= 97 && b <= 122) || (b >= 48 && b <= 57) || b == 43 || b == 47
        }
        guard alphabetOK, padding <= 2, bytes.count % 4 != 1, padding == 0 || bytes.count % 4 == 0 else {
            throw invalid("data is not valid base64")
        }
        let padded = text + String(repeating: "=", count: (4 - text.utf8.count % 4) % 4)
        guard let data = Data(base64Encoded: padded) else { throw invalid("data is not valid base64") }
        return data
    }

    // MARK: resolving

    private static func realPath(_ path: String) -> String? {
        guard let resolved = realpath(path, nil) else { return nil }
        defer { free(resolved) }
        return String(cString: resolved)
    }

    private static func lstatExists(_ path: String) -> Bool {
        var st = stat()
        return lstat(path, &st) == 0
    }

    private static func join(_ base: String, _ parts: [String]) -> String {
        parts.reduce(base) { ($0 as NSString).appendingPathComponent($1) }
    }

    /// Real location of `parts` in `base`; with `follow` false the last part itself is not resolved.
    /// With a scope, the real location must be inside it too (through a symbolic link); the caller
    /// then uses exactly this path.
    private func resolve(_ base: Base, _ parts: [String], follow: Bool, _ scope: AkanNativeScope? = nil) throws -> (path: String, exists: Bool) {
        let shown = parts.isEmpty ? "." : parts.joined(separator: "/")
        let last = follow ? nil : parts.last
        var current = Self.join(base.root, follow ? parts : Array(parts.dropLast()))
        var rest: [String] = []
        while true {
            if let real = Self.realPath(current) {
                guard real == base.root || real.hasPrefix(base.root + "/") else {
                    throw Problem(code: .permissionDenied, message: "\(shown) leads outside its base directory through a symbolic link")
                }
                let path = Self.join(real, rest.reversed() + (last.map { [$0] } ?? []))
                let exists = rest.isEmpty && (last == nil || Self.lstatExists(path))
                if scope != nil {
                    let actual = path == base.root ? [] : String(path.dropFirst(base.root.count + 1)).split(separator: "/").map(String.init)
                    if actual != parts { try check(scope, base, actual) }
                }
                return (path, exists)
            }
            guard errno == ENOENT || errno == ENOTDIR else { throw Self.posixError(shown) }
            if Self.lstatExists(current) {
                throw Problem(code: .permissionDenied, message: "\(shown) is a dangling symbolic link")
            }
            rest.append((current as NSString).lastPathComponent)
            current = (current as NSString).deletingLastPathComponent
        }
    }

    private enum Kind { case file, directory, symlink, other }

    /// Type without following a final symbolic link (lstat).
    private static func kind(_ path: String) -> Kind? {
        guard let type = try? fm.attributesOfItem(atPath: path)[.type] as? FileAttributeType else { return nil }
        switch type {
        case .typeRegular: return .file
        case .typeDirectory: return .directory
        case .typeSymbolicLink: return .symlink
        default: return .other
        }
    }

    private func info(_ path: String) throws -> FilesystemFileInfo {
        let attrs = try Self.fm.attributesOfItem(atPath: path)
        let type: FilesystemEntryType
        switch attrs[.type] as? FileAttributeType {
        case .typeRegular?: type = .file
        case .typeDirectory?: type = .directory
        case .typeSymbolicLink?: type = .symlink
        default: type = .other
        }
        let size = type == .file ? (attrs[.size] as? NSNumber)?.int64Value ?? 0 : 0
        let mtime = ((attrs[.modificationDate] as? Date)?.timeIntervalSince1970 ?? 0) * 1000
        return FilesystemFileInfo(type: type, size: Double(size), mtime: mtime.rounded())
    }

    private func requireParent(_ base: Base, _ parts: [String], _ shown: String) throws {
        let parent = try resolve(base, Array(parts.dropLast()), follow: true)
        guard parent.exists else { throw Self.notFound("the folder of \(shown) does not exist") }
        var isDir: ObjCBool = false
        guard Self.fm.fileExists(atPath: parent.path, isDirectory: &isDir), isDir.boolValue else {
            throw Self.invalid("the parent of \(shown) is not a folder")
        }
    }

    private static func mime(_ path: String) -> String {
        let ext = (path as NSString).pathExtension
        return ext.isEmpty ? "application/octet-stream" : UTType(filenameExtension: ext)?.preferredMIMEType ?? "application/octet-stream"
    }

    // MARK: operations

    func readFile(_ args: [String: Any], _ scope: AkanNativeScope?) throws -> ReadOutcome {
        let base = try base(args["base"], key: "base")
        let parts = try segments(args["path"], allowRoot: false)
        let encoding = try encoding(args, allowNone: true)
        let shown = parts.joined(separator: "/")
        let target = try resolve(base, parts, follow: true, scope)
        guard target.exists else { throw Self.notFound("\(shown) does not exist") }
        guard Self.kind(target.path) == .file else { throw Self.invalid("\(shown) is not a file") }
        guard let encoding else { return .file(URL(fileURLWithPath: target.path), mime: Self.mime(target.path)) }
        let data = try Data(contentsOf: URL(fileURLWithPath: target.path))
        // String(decoding:) replaces invalid UTF-8 with U+FFFD and keeps a BOM, like the other platforms.
        let text = encoding == "utf8" ? String(decoding: data, as: UTF8.self) : data.base64EncodedString()
        return .data(text)
    }

    func writeFile(_ args: [String: Any], source: URL?, _ scope: AkanNativeScope?) throws {
        let base = try base(args["base"], key: "base")
        let parts = try segments(args["path"], allowRoot: false)
        let append = try flag(args, "append")
        let recursive = try flag(args, "recursive")
        let hasData = !(args["data"] == nil || args["data"] is NSNull)
        guard hasData != (source != nil) else { throw Self.invalid("pass either data or url") }
        var bytes: Data?
        if hasData {
            guard let text = args["data"] as? String else { throw Self.invalid("data must be a string (text, or base64 with encoding: \"base64\")") }
            bytes = try encoding(args, allowNone: false) == "base64" ? Self.decodeBase64(text) : Data(text.utf8)
        } else if !(args["encoding"] == nil || args["encoding"] is NSNull) {
            throw Self.invalid("encoding applies to data, not url")
        }
        let shown = parts.joined(separator: "/")
        if recursive {
            let parent = try resolve(base, Array(parts.dropLast()), follow: true)
            if !parent.exists { try Self.fm.createDirectory(atPath: parent.path, withIntermediateDirectories: true) }
        }
        try requireParent(base, parts, shown)
        let target = try resolve(base, parts, follow: true, scope)
        if target.exists && Self.kind(target.path) != .file { throw Self.invalid("\(shown) is not a file") }
        let url = URL(fileURLWithPath: target.path)

        if append {
            if !target.exists { guard Self.fm.createFile(atPath: target.path, contents: nil) else { throw Self.posixError(shown) } }
            let out = try FileHandle(forWritingTo: url)
            defer { try? out.close() }
            try out.seekToEnd()
            if let bytes {
                try out.write(contentsOf: bytes)
            } else if let source {
                let input = try FileHandle(forReadingFrom: source)
                defer { try? input.close() }
                while let chunk = try input.read(upToCount: 1 << 20), !chunk.isEmpty { try out.write(contentsOf: chunk) }
            }
            return
        }
        if let bytes {
            try bytes.write(to: url, options: .atomic) // temp file + rename
            return
        }
        // Copy next to the target, then rename over it (atomic).
        let tmp = (target.path as NSString).deletingLastPathComponent + "/.\(url.lastPathComponent).\(UUID().uuidString).tmp"
        do {
            try Self.fm.copyItem(atPath: source!.path, toPath: tmp)
            guard Darwin.rename(tmp, target.path) == 0 else { throw Self.posixError(shown) }
        } catch {
            try? Self.fm.removeItem(atPath: tmp)
            throw error
        }
    }

    func readDir(_ args: FilesystemPathOptions, _ scope: AkanNativeScope?) throws -> FilesystemReadDirResult {
        let base = try base(args.base.rawValue, key: "base")
        let parts = try segments(args.path, allowRoot: true)
        let shown = parts.isEmpty ? "." : parts.joined(separator: "/")
        let dir = try resolve(base, parts, follow: true, scope)
        guard dir.exists else { throw Self.notFound("\(shown) does not exist") }
        guard Self.kind(dir.path) == .directory else { throw Self.invalid("\(shown) is not a folder") }
        var entries: [FilesystemDirEntry] = []
        for name in try Self.fm.contentsOfDirectory(atPath: dir.path) {
            // Entries outside the scope are not listed (a dot file under an allowed "notes/**", a denied folder).
            if scope != nil, (try? check(scope, base, parts + [name])) == nil { continue }
            guard let info = try? info((dir.path as NSString).appendingPathComponent(name)) else { continue }
            entries.append(FilesystemDirEntry(type: info.type, size: info.size, mtime: info.mtime, name: name))
        }
        // Sorted by UTF-16 code units, as the JS implementations sort.
        entries.sort { $0.name.utf16.lexicographicallyPrecedes($1.name.utf16) }
        return FilesystemReadDirResult(entries: entries)
    }

    /// stat
    func fileInfo(_ args: FilesystemPathOptions, _ scope: AkanNativeScope?) throws -> FilesystemFileInfo {
        let base = try base(args.base.rawValue, key: "base")
        let target = try resolve(base, try segments(args.path, allowRoot: true), follow: true, scope)
        guard target.exists else { throw Self.notFound("\(args.path) does not exist") }
        return try info(target.path)
    }

    func exists(_ args: FilesystemPathOptions, _ scope: AkanNativeScope?) throws -> FilesystemExistsResult {
        let base = try base(args.base.rawValue, key: "base")
        let target = try resolve(base, try segments(args.path, allowRoot: true), follow: true, scope)
        return FilesystemExistsResult(value: target.exists)
    }

    func mkdir(_ args: FilesystemMkdirArgs, _ scope: AkanNativeScope?) throws {
        let base = try base(args.base.rawValue, key: "base")
        let parts = try segments(args.path, allowRoot: true)
        let recursive = args.recursive ?? false
        let shown = parts.isEmpty ? "the base folder" : parts.joined(separator: "/")
        let target = try resolve(base, parts, follow: true, scope)
        if target.exists {
            if recursive && Self.kind(target.path) == .directory { return }
            throw Self.invalid("\(shown) already exists")
        }
        if !recursive { try requireParent(base, parts, shown) }
        do {
            try Self.fm.createDirectory(atPath: target.path, withIntermediateDirectories: recursive)
        } catch {
            // an ancestor that is a file
            if Self.code(of: error) == .internalError { throw Self.invalid("a file is in the way of \(shown)") }
            throw error
        }
    }

    func remove(_ args: FilesystemRemoveArgs, _ scope: AkanNativeScope?) throws {
        let base = try base(args.base.rawValue, key: "base")
        let parts = try segments(args.path, allowRoot: false)
        let recursive = args.recursive ?? false
        let shown = parts.joined(separator: "/")
        let target = try resolve(base, parts, follow: false, scope)
        guard let kind = Self.kind(target.path) else { throw Self.notFound("\(shown) does not exist") }
        if kind == .directory { try checkTree(scope, base, parts, target.path) }
        // FileManager.removeItem always removes folders recursively.
        if kind == .directory && !recursive {
            guard try Self.fm.contentsOfDirectory(atPath: target.path).isEmpty else {
                throw Self.invalid("\(shown) is not empty (pass recursive: true)")
            }
        }
        try Self.fm.removeItem(atPath: target.path)
    }

    private static func fileId(_ path: String) -> (UInt64, UInt64)? {
        guard let attrs = try? fm.attributesOfItem(atPath: path),
              let node = (attrs[.systemFileNumber] as? NSNumber)?.uint64Value,
              let device = (attrs[.systemNumber] as? NSNumber)?.uint64Value else { return nil }
        return (node, device)
    }

    func move(_ args: FilesystemMoveOptions, keepSource: Bool, _ scope: AkanNativeScope?) throws {
        let base = try base(args.base.rawValue, key: "base")
        let toBase = try args.toBase.map { try self.base($0.rawValue, key: "toBase") } ?? base
        let from = try segments(args.from, allowRoot: false, key: "from")
        let to = try segments(args.to, allowRoot: false, key: "to")
        let fromShown = from.joined(separator: "/")
        let toShown = to.joined(separator: "/")
        // rename moves a link itself, copy copies what it points to
        let src = try resolve(base, from, follow: keepSource, scope)
        guard src.exists, let srcKind = Self.kind(src.path) else { throw Self.notFound("\(fromShown) does not exist") }
        try requireParent(toBase, to, toShown)
        let dst = try resolve(toBase, to, follow: false, scope)
        if dst.path == src.path { throw Self.invalid("from and to are the same path") }
        if dst.path.hasPrefix(src.path + "/") { throw Self.invalid("cannot move or copy a folder into itself") }
        if srcKind == .directory { try checkTree(scope, base, from, src.path, to: (toBase, to)) }
        if let dstKind = Self.kind(dst.path) {
            let same = Self.fileId(dst.path).map { d in Self.fileId(src.path).map { $0 == d } ?? false } ?? false
            if same && keepSource { throw Self.invalid("from and to are the same file") }
            if !same {
                if dstKind == .directory { throw Self.invalid("\(toShown) already exists and is a folder") }
                if srcKind == .directory { throw Self.invalid("\(toShown) already exists and is a file") }
            }
        }
        if keepSource {
            // Copy next to the destination, then rename over it, so an existing file is replaced atomically.
            let tmp = (dst.path as NSString).deletingLastPathComponent + "/.\((dst.path as NSString).lastPathComponent).\(UUID().uuidString).tmp"
            do {
                try Self.fm.copyItem(atPath: src.path, toPath: tmp)
                guard Darwin.rename(tmp, dst.path) == 0 else { throw Self.posixError(toShown) }
            } catch {
                try? Self.fm.removeItem(atPath: tmp)
                throw error
            }
            return
        }
        if Darwin.rename(src.path, dst.path) == 0 { return }
        guard errno == EXDEV else { throw Self.posixError(toShown) }
        // Another volume: copy, then remove the source.
        if Self.kind(dst.path) != nil { try Self.fm.removeItem(atPath: dst.path) }
        try Self.fm.copyItem(atPath: src.path, toPath: dst.path)
        try Self.fm.removeItem(atPath: src.path)
    }
}
