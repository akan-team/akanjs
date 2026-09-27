// Decisions every akan-native host makes the same way (docs/architecture.md §5): a port of
// packages/core/src/kernel.ts and protocol.ts validateRequest. Foundation only, so
// scripts/native-vectors.ts compiles it on the Mac with swiftc, and the self-test runs the same
// vectors on the device (AkanNativeVectors.swift, dev builds). Tables come from AkanNativeContract.swift.

import Foundation

enum AkanNativeRoute: Equatable {
    case initScript
    case ipc
    case hello
    case file(String)
    case asset(String)
    case notFound
}

enum AkanNativeRangeAnswer: Equatable {
    case whole
    /// First and last byte, inclusive.
    case part(Int64, Int64)
    case unsatisfiable
}

enum AkanNativeAdmission: String {
    case current, new, ended, noDoc = "no-doc"
}

enum AkanNativeNavigation: String {
    case load, open, drop
}

/// kernel.ts RetainedEvents: events that can come before the page listens (links, taps; C2). A live
/// event goes to every listener; one that no listener accepted is kept when `retain` (at most
/// maxRetainedEvents) and replayed, in order, to the next listener, once. A listener returns false
/// when it is gone: it is dropped and the event counts as not delivered.
final class AkanNativeRetained<T> {
    private var listeners: [(key: String, fn: (T) -> Bool)] = []
    private var queue: [T] = []

    func listen(_ key: String, _ fn: @escaping (T) -> Bool) {
        if let i = listeners.firstIndex(where: { $0.key == key }) { listeners[i].fn = fn } else { listeners.append((key, fn)) }
        while let first = queue.first {
            if !fn(first) { return unlisten(key) }
            queue.removeFirst()
        }
    }

    func unlisten(_ key: String) {
        listeners.removeAll { $0.key == key }
    }

    /// Listeners registered (K13).
    var listenerCount: Int { listeners.count }

    func emit(_ event: T, retain: Bool) {
        var delivered = false
        for listener in listeners {
            if listener.fn(event) { delivered = true } else { unlisten(listener.key) }
        }
        guard !delivered, retain else { return }
        queue.append(event)
        if queue.count > AkanNativeContract.maxRetainedEvents { queue.removeFirst() }
    }
}

enum AkanNativeKernel {
    // MARK: ids

    /// Whether `s` follows an id grammar: its characters and length, and an optional ".ext" after the first dot.
    static func idValid(_ spec: AkanNativeIdSpec, _ s: String) -> Bool {
        let scalars = Array(s.unicodeScalars)
        func run(_ part: ArraySlice<Unicode.Scalar>, _ chars: String, _ min: Int, _ max: Int) -> Bool {
            (min...max).contains(part.count) && part.allSatisfy { chars.unicodeScalars.contains($0) }
        }
        if spec.extMax > 0 {
            guard let dot = scalars.firstIndex(of: ".") else { return run(scalars[...], spec.chars, spec.min, spec.max) }
            return run(scalars[..<dot], spec.chars, spec.min, spec.max) && run(scalars[(dot + 1)...], spec.extChars, 1, spec.extMax)
        }
        guard let first = scalars.first, (spec.min...spec.max).contains(scalars.count) else { return false }
        let firstSet = spec.first.isEmpty ? spec.chars : spec.first
        return firstSet.unicodeScalars.contains(first) && !spec.notFirst.unicodeScalars.contains(first)
            && scalars.dropFirst().allSatisfy { spec.chars.unicodeScalars.contains($0) }
    }

    static func isFileRefId(_ s: String) -> Bool { idValid(AkanNativeContract.idFileRef, s) }
    static func isBundleId(_ s: String) -> Bool { idValid(AkanNativeContract.idBundle, s) }
    static func isDocumentId(_ s: String) -> Bool { idValid(AkanNativeContract.idDocument, s) }
    static func isName(_ s: String) -> Bool { idValid(AkanNativeContract.idName, s) }

    // MARK: paths and routes

    /// Strict percent-decoding: "%" and two hex digits, and the result must be UTF-8; otherwise nil.
    /// (removingPercentEncoding is not used: what it accepts is not specified.)
    static func decodePath(_ s: String) -> String? {
        let input = Array(s.utf8)
        var bytes: [UInt8] = []
        bytes.reserveCapacity(input.count)
        var i = 0
        while i < input.count {
            if input[i] == UInt8(ascii: "%") {
                guard i + 2 < input.count, let hi = hex(input[i + 1]), let lo = hex(input[i + 2]) else { return nil }
                bytes.append(hi << 4 | lo)
                i += 3
            } else {
                bytes.append(input[i])
                i += 1
            }
        }
        var scalars = String.UnicodeScalarView()
        var codec = UTF8()
        var iterator = bytes.makeIterator()
        while true {
            switch codec.decode(&iterator) {
            case .scalarValue(let scalar): scalars.append(scalar)
            case .emptyInput: return String(scalars)
            case .error: return nil
            }
        }
    }

    private static func hex(_ c: UInt8) -> UInt8? {
        switch c {
        case UInt8(ascii: "0")...UInt8(ascii: "9"): c - UInt8(ascii: "0")
        case UInt8(ascii: "a")...UInt8(ascii: "f"): c - UInt8(ascii: "a") + 10
        case UInt8(ascii: "A")...UInt8(ascii: "F"): c - UInt8(ascii: "A") + 10
        default: nil
        }
    }

    /// Maps a URL path (still percent-encoded) to a route (kernel.ts route): the host's own paths,
    /// an existing file, index.html for an SPA route, or 404. `exists` tells whether a relative asset
    /// path exists.
    static func route(_ pathname: String, exists: (String) -> Bool) -> AkanNativeRoute {
        guard let decoded = decodePath(pathname) else { return .notFound }
        let segments = decoded.split(separator: "/", omittingEmptySubsequences: true).map(String.init)
        if segments.contains(where: { $0 == ".." || $0 == "." || $0.contains("\\") || $0.contains("\0") }) { return .notFound }
        if segments.first == AkanNativeContract.routeRoot {
            if segments.count == 2 && segments[1] == AkanNativeContract.routeInit { return .initScript }
            if segments.count == 2 && segments[1] == AkanNativeContract.routeIpc { return .ipc }
            if segments.count == 2 && segments[1] == AkanNativeContract.routeHello { return .hello }
            if segments.count == 3 && segments[1] == AkanNativeContract.routeFile && isFileRefId(segments[2]) { return .file(segments[2]) }
            return .notFound
        }
        let relative = segments.joined(separator: "/")
        if relative.isEmpty || relative == "index.html" { return .asset("index.html") }
        // ":" never reaches the filesystem (kernel.ts); the path can still be an SPA route.
        if !relative.contains(":") && exists(relative) { return .asset(relative) }
        return segments.last!.contains(".") ? .notFound : .asset("index.html")
    }

    /// Paths the shell answers itself even with a dev server: /__akan_native/*, and paths that do not decode.
    static func isHostPath(_ pathname: String) -> Bool {
        guard let decoded = decodePath(pathname) else { return true }
        return decoded.split(separator: "/", omittingEmptySubsequences: true).first.map(String.init) == AkanNativeContract.routeRoot
    }

    // MARK: MIME

    /// The MIME type for a file name (FileRefs): application/octet-stream when unknown.
    static func fileMime(_ path: String) -> String {
        let base = path.split(separator: "/", omittingEmptySubsequences: false).last.map(String.init) ?? path
        guard let dot = base.lastIndex(of: "."), dot != base.startIndex else { return "application/octet-stream" }
        return AkanNativeContract.mime[base[base.index(after: dot)...].lowercased()] ?? "application/octet-stream"
    }

    /// The Content-Type an asset is served with: text types carry charset=utf-8.
    static func assetMime(_ path: String) -> String {
        let mime = fileMime(path)
        return mime.hasPrefix("text/") || AkanNativeContract.mimeUtf8.contains(mime) ? "\(mime); charset=utf-8" : mime
    }

    /// kernel.ts fileRefSandboxed: every FileRef but images other than SVG, audio, video, fonts and
    /// PDF is served with `Content-Security-Policy: sandbox` (an opaque origin: no bridge, no page).
    /// macOS WebKit draws nothing for a sandboxed PDF.
    static func fileRefSandboxed(_ mime: String) -> Bool {
        let kind = (mime.split(separator: ";", omittingEmptySubsequences: false).first.map(String.init) ?? "").trimmingCharacters(in: .whitespaces).lowercased()
        return kind == "image/svg+xml" || !(["image/", "audio/", "video/", "font/"].contains { kind.hasPrefix($0) } || kind == "application/pdf")
    }

    // MARK: Range

    /// A Range header (IN-5, RFC 9110 §14) for a file of `size` bytes (kernel.ts parseRange): one
    /// "bytes=" range; anything else is ignored (the whole file); a valid range the file cannot
    /// satisfy is 416; at most maxRangeBytes from the start.
    static func parseRange(_ header: String?, size: Int64) -> AkanNativeRangeAnswer {
        guard let header, header.hasPrefix("bytes=") else { return .whole }
        let spec = header.dropFirst("bytes=".count)
        guard let dash = spec.firstIndex(of: "-") else { return .whole }
        func number(_ s: Substring) -> Int64?? {
            guard s.utf8.count <= 18, s.utf8.allSatisfy({ $0 >= UInt8(ascii: "0") && $0 <= UInt8(ascii: "9") }) else { return nil }
            return .some(s.isEmpty ? nil : Int64(s))
        }
        guard let a = number(spec[..<dash]), let b = number(spec[spec.index(after: dash)...]) else { return .whole }
        let start: Int64
        let end: Int64
        switch (a, b) {
        case (nil, nil):
            return .whole
        case (nil, let suffix?):
            if suffix == 0 || size == 0 { return .unsatisfiable }
            start = Swift.max(0, size - suffix)
            end = size - 1
        case (let first?, let last):
            if let last, last < first { return .whole }
            if first >= size { return .unsatisfiable }
            start = first
            end = Swift.min(last ?? Int64.max, size - 1)
        }
        return .part(start, Swift.min(end, start + Int64(AkanNativeContract.maxRangeBytes) - 1))
    }

    // MARK: bridge requests (protocol.ts validateRequest, the same messages)

    static func validateRequest(_ value: Any?) -> String? {
        guard let o = value as? [String: Any] else { return "request must be an object" }
        guard let v = number(o["v"]), v == 1 else { return "unsupported protocol version: \(jsString(o["v"]))" }
        guard let id = number(o["id"]), id == id.rounded(), abs(id) <= 9_007_199_254_740_991 else { return "id must be an integer" }
        guard let plugin = o["plugin"] as? String, isName(plugin) else { return "invalid plugin name" }
        guard let method = o["method"] as? String, isName(method) else { return "invalid method name" }
        if let doc = o["doc"], !((doc as? String).map(isDocumentId) ?? false) { return "invalid document id" }
        if method == "$listen" || method == "$unlisten", !((o["args"] as? [String: Any])?["event"] is String) {
            return "\(method) requires args.event"
        }
        if plugin == "$bridge" {
            let args = o["args"] as? [String: Any] ?? [:]
            switch method {
            case "cancel":
                guard let id = number(args["id"]), id == id.rounded(), abs(id) <= 9_007_199_254_740_991 else { return "$bridge.cancel requires args.id" }
                if args.keys.contains("reason"), !["abort", "timeout"].contains(args["reason"] as? String ?? "") { return "$bridge.cancel: reason must be abort or timeout" }
            case "release":
                guard args["url"] is String else { return "$bridge.release requires args.url" }
            default:
                return "unknown bridge operation $bridge.\(method)"
            }
        }
        return nil
    }

    /// A JSON number that is not a boolean, as a Double.
    private static func number(_ value: Any?) -> Double? {
        guard let n = value as? NSNumber, !(value is String), CFGetTypeID(n) != CFBooleanGetTypeID() else { return nil }
        return n.doubleValue
    }

    /// What JavaScript's String(value) gives for a JSON value (the version message names it).
    private static func jsString(_ value: Any?) -> String {
        switch value {
        case nil: return "undefined"
        case is NSNull: return "null"
        case let s as String: return s
        case let n as NSNumber where CFGetTypeID(n) == CFBooleanGetTypeID(): return n.boolValue ? "true" : "false"
        case let n as NSNumber:
            let d = n.doubleValue
            return d == d.rounded() && abs(d) < 1e21 ? String(Int64(d)) : "\(d)"
        case let a as [Any]: return a.map { $0 is NSNull ? "" : jsString($0) }.joined(separator: ",")
        default: return "[object Object]"
        }
    }

    // MARK: documents (bridge v1.1)

    /// kernel.ts admitDocument: join the current document, start a new one, refuse an ended one, or
    /// refuse a request without an id while the current document has one.
    static func admitDocument(current: String?, ended: [String], requested: String?) -> AkanNativeAdmission {
        guard let requested else { return current == nil ? .new : current == "" ? .current : .noDoc }
        if requested == current { return .current }
        return ended.contains(requested) ? .ended : .new
    }

    // MARK: declarations (L2)

    /// kernel.ts declares: whether a plugin's boot.json declaration (its native methods and events on
    /// this platform) lets a call through; undeclared ones are NOT_FOUND before the ACL and the plugin.
    static func declares(_ decl: Any?, method: String, event: String?) -> Bool {
        guard let decl = decl as? [String: Any] else { return false }
        let subscription = method == "$listen" || method == "$unlisten"
        guard let name = subscription ? event : method else { return false }
        return ((decl[subscription ? "events" : "methods"] ?? [Any]()) as? [Any])?.contains { $0 as? String == name } ?? false
    }

    // MARK: navigation (SH-4, L0)

    /// The lowercase scheme of a URL, or nil when it has none.
    static func schemeOf(_ url: String) -> String? {
        guard let colon = url.firstIndex(of: ":") else { return nil }
        let s = url[..<colon]
        guard let first = s.unicodeScalars.first, first.isASCII, CharacterSet.letters.contains(first),
              s.unicodeScalars.allSatisfy({ $0.isASCII && (CharacterSet.alphanumerics.contains($0) || "+.-".unicodeScalars.contains($0)) }) else { return nil }
        return s.lowercased()
    }

    /// The schemes the shell hands to the OS: the contract's, and what the app added (never the forbidden ones).
    static func externalSchemes(_ extra: [String]) -> [String] {
        AkanNativeContract.externalSchemes + extra.map { $0.lowercased() }.filter { !AkanNativeContract.neverExternalSchemes.contains($0) && !AkanNativeContract.externalSchemes.contains($0) }
    }

    /// kernel.ts decideNavigation: the app's own pages (and about:) load; a top-level navigation
    /// opens in the OS when its scheme is external and is dropped otherwise; a frame loads web content only.
    static func decideNavigation(_ url: String, topLevel: Bool, origin: String, extra: [String]) -> AkanNativeNavigation {
        let scheme = schemeOf(url)
        let inApp = url == origin || (url.hasPrefix(origin) && "/?#".contains(url[url.index(url.startIndex, offsetBy: origin.count)]))
        if inApp {
            // The app's /__akan_native/* paths never become a document of its origin; a frame may show a
            // FileRef, which is served sandboxed (kernel.ts).
            let rest = url.dropFirst(origin.count)
            let head = String(rest.prefix { $0 != "?" && $0 != "#" })
            let path = head.isEmpty ? "/" : head
            if !isHostPath(path) { return .load }
            if case .file = route(path, exists: { _ in false }), !topLevel { return .load }
            return .drop
        }
        if scheme == "about" { return .load }
        guard let scheme else { return .drop }
        if !topLevel { return AkanNativeContract.frameSchemes.contains(scheme) ? .load : .drop }
        return externalSchemes(extra).contains(scheme) ? .open : .drop
    }
}
