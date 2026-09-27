// Runtime side of the plugin bindings akan-native generates from a plugin's TypeScript spec (PL-10):
// decoding call arguments with the field path in the INVALID_ARGS message, and typed replies.

import Foundation

struct AkanNativeArgsError: Error {
    let message: String
}

/// Decoders used by the generated `init(akan-native:at:)` of argument types.
enum AkanNativeJSON {
    static func key(_ path: String, _ name: String) -> String { path.isEmpty ? name : "\(path).\(name)" }

    static func isNull(_ value: Any?) -> Bool { value == nil || value is NSNull }

    /// JSON booleans arrive as NSNumber too; only CFBoolean ones are true/false.
    private static func isBool(_ n: NSNumber) -> Bool { CFGetTypeID(n as CFTypeRef) == CFBooleanGetTypeID() }

    private static func fail(_ value: Any?, _ path: String, _ expected: String) -> AkanNativeArgsError {
        let name = path.isEmpty ? "the argument" : path
        return AkanNativeArgsError(message: isNull(value) ? "\(name) is required" : "\(name) must be \(expected)")
    }

    static func object(_ value: Any?, _ path: String) throws -> [String: Any] {
        guard let o = value as? [String: Any] else { throw fail(value, path, "an object") }
        return o
    }

    static func string(_ value: Any?, _ path: String) throws -> String {
        guard let s = value as? String else { throw fail(value, path, "a string") }
        return s
    }

    static func number(_ value: Any?, _ path: String) throws -> Double {
        guard let n = value as? NSNumber, !isBool(n), n.doubleValue.isFinite else { throw fail(value, path, "a number") }
        return n.doubleValue
    }

    static func bool(_ value: Any?, _ path: String) throws -> Bool {
        guard let n = value as? NSNumber, isBool(n) else { throw fail(value, path, "true or false") }
        return n.boolValue
    }

    /// TS `unknown`: any JSON value, null included (NSNull).
    static func any(_ value: Any?, _ path: String) throws -> Any {
        value ?? NSNull()
    }

    static func literal<E: RawRepresentable & CaseIterable>(_ value: Any?, _ path: String, _ type: E.Type) throws -> E where E.RawValue == String {
        guard let s = value as? String, let e = E(rawValue: s) else {
            throw fail(value, path, "one of " + E.allCases.map(\.rawValue).joined(separator: ", "))
        }
        return e
    }

    static func array<T>(_ value: Any?, _ path: String, _ item: (Any?, String) throws -> T) throws -> [T] {
        guard let a = value as? [Any] else { throw fail(value, path, "an array") }
        return try a.enumerated().map { try item($1, "\(path)[\($0)]") }
    }

    static func map<T>(_ value: Any?, _ path: String, _ item: (Any?, String) throws -> T) throws -> [String: T] {
        let o = try object(value, path)
        var out: [String: T] = [:]
        for (k, v) in o { out[k] = try item(v, key(path, k)) }
        return out
    }

    /// Missing and null both mean "not given" for optional fields.
    static func optional<T>(_ value: Any?, _ decode: (Any?) throws -> T) rethrows -> T? {
        isNull(value) ? nil : try decode(value)
    }

    /// Decodes a call's arguments, or rejects it with INVALID_ARGS and returns nil.
    static func decode<T>(_ call: AkanNativeCall, _ decode: ([String: Any]) throws -> T) -> T? {
        do {
            return try decode(call.args)
        } catch let error as AkanNativeArgsError {
            call.reject(.invalidArgs, error.message)
        } catch {
            call.reject(.invalidArgs, "\(error)")
        }
        return nil
    }
}

/// A typed answer to one call. Like AkanNativeCall, resolve or reject once, from any thread. `call` is
/// there for what the types do not cover, e.g. `call.inScope(...)` (PL-11).
final class AkanNativeReply<T>: @unchecked Sendable {
    let call: AkanNativeCall
    private let encode: @Sendable (T) -> Any?

    init(_ call: AkanNativeCall, _ encode: @escaping @Sendable (T) -> Any?) {
        self.call = call
        self.encode = encode
    }

    func resolve(_ value: T) { call.resolve(encode(value)) }

    func reject(_ code: AkanNativeErrorCode, _ message: String, data: Any? = nil, retryable: Bool = false) {
        call.reject(code, message, data: data, retryable: retryable)
    }

    /// See AkanNativeCall.onCancel.
    @MainActor
    func onCancel(_ handler: @escaping @MainActor () -> Void) { call.onCancel(handler) }

    var isCancelled: Bool { call.isCancelled }
}

extension AkanNativeReply where T == Void {
    func resolve() { call.resolve() }
}

/// A file served at /__akan_native/file/<id> (PL-7): `FileRef` in plugin specs. Generated types that
/// extend FileRef take one in `init(file:…)`.
struct AkanNativeFileRef: Sendable, Equatable {
    var url: String
    var mime: String
    var size: Double

    init(url: String, mime: String, size: Double) {
        self.url = url
        self.mime = mime
        self.size = size
    }

    init(akanNative value: Any?, at path: String) throws {
        let o = try AkanNativeJSON.object(value, path)
        url = try AkanNativeJSON.string(o["url"], AkanNativeJSON.key(path, "url"))
        mime = try AkanNativeJSON.string(o["mime"], AkanNativeJSON.key(path, "mime"))
        size = try AkanNativeJSON.number(o["size"], AkanNativeJSON.key(path, "size"))
    }

    var akanNativeJSON: [String: Any] { ["url": url, "mime": mime, "size": size] }
}

extension AkanNativePluginContext {
    /// registerFile, as the typed FileRef of generated result types.
    func fileRef(_ url: URL, mime: String) -> AkanNativeFileRef {
        let ref = registerFile(url, mime: mime)
        return AkanNativeFileRef(url: ref["url"] as? String ?? "", mime: mime, size: (ref["size"] as? NSNumber)?.doubleValue ?? 0)
    }
}
