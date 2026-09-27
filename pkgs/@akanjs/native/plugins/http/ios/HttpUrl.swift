import Foundation

/// URL and redirect rules of the http plugin, the same as src/common.ts (canonicalUrl, redirected)
/// and android/HttpUrl.kt. Plain Swift, so it can be checked outside the app.
enum HttpUrl {
    /// Path segments that mean "this" or "parent" (WHATWG also reads %2e as ".").
    private static let dotSegments: Set<String> = [".", "..", "%2e", "%2e%2e", ".%2e", "%2e."]

    private static let hexDigits = Array("0123456789ABCDEF".utf8)

    private static func isHex(_ b: UInt8) -> Bool {
        (b >= 0x30 && b <= 0x39) || (b >= 0x41 && b <= 0x46) || (b >= 0x61 && b <= 0x66)
    }

    private static func isAlnum(_ b: UInt8) -> Bool {
        (b >= 0x30 && b <= 0x39) || (b >= 0x41 && b <= 0x5A) || (b >= 0x61 && b <= 0x7A)
    }

    /// RFC 3986 unreserved and sub-delims.
    private static func isUnreservedOrSubDelim(_ b: UInt8) -> Bool {
        isAlnum(b) || "-._~!$&'()*+,;=".utf8.contains(b)
    }

    /// What RFC 3986 allows unescaped in a path and query.
    private static func isPathChar(_ b: UInt8) -> Bool {
        isUnreservedOrSubDelim(b) || b == UInt8(ascii: ":") || b == UInt8(ascii: "@") || b == UInt8(ascii: "/") || b == UInt8(ascii: "?")
    }

    /// The canonical form (src/common.ts canonicalUrl): lowercase scheme and host, no default
    /// port, "/" for an empty path, no fragment, path and query percent-encoded where RFC 3986
    /// needs it. nil for anything that is not an absolute http(s) URL, has credentials, a
    /// malformed host or port, or dot segments.
    static func canonical(_ input: String) -> String? {
        var text = Substring(input)
        if let hash = text.firstIndex(of: "#") { text = text[..<hash] }
        let lower = text.lowercased()
        let scheme: String
        if lower.hasPrefix("http://") { scheme = "http" } else if lower.hasPrefix("https://") { scheme = "https" } else { return nil }
        let rest = text.dropFirst(scheme.count + 3)
        let end = rest.firstIndex { $0 == "/" || $0 == "?" } ?? rest.endIndex
        let authority = rest[..<end]
        guard !authority.isEmpty, !authority.contains("@") else { return nil }

        var host: Substring
        var port: Substring = ""
        if authority.hasPrefix("[") {
            guard let close = authority.firstIndex(of: "]") else { return nil }
            host = authority[...close]
            let after = authority[authority.index(after: close)...]
            if !after.isEmpty {
                guard after.hasPrefix(":") else { return nil }
                port = after.dropFirst()
            }
            let inside = host.dropFirst().dropLast().utf8
            guard !inside.isEmpty, inside.allSatisfy({ isHex($0) || $0 == UInt8(ascii: ":") || $0 == UInt8(ascii: ".") }) else { return nil }
        } else {
            if let colon = authority.lastIndex(of: ":") {
                host = authority[..<colon]
                port = authority[authority.index(after: colon)...]
            } else {
                host = authority
            }
            // No percent escapes in a host: a deny of a host must not be passed by escaping a letter.
            guard !host.isEmpty, host.utf8.allSatisfy(isUnreservedOrSubDelim) else { return nil }
        }
        var portPart = ""
        if !port.isEmpty {
            guard port.count <= 5, port.utf8.allSatisfy({ $0 >= 0x30 && $0 <= 0x39 }), let n = Int(port), n <= 65535 else { return nil }
            if !((scheme == "http" && n == 80) || (scheme == "https" && n == 443)) { portPart = ":\(n)" }
        }

        let bytes = Array(rest[end...].utf8)
        var tail = ""
        var i = 0
        while i < bytes.count {
            let b = bytes[i]
            if b == UInt8(ascii: "%"), i + 2 < bytes.count, isHex(bytes[i + 1]), isHex(bytes[i + 2]) {
                tail += String(decoding: bytes[i...(i + 2)], as: UTF8.self)
                i += 3
                continue
            }
            if b < 0x80, isPathChar(b) {
                tail.unicodeScalars.append(Unicode.Scalar(b))
            } else {
                tail.unicodeScalars.append("%")
                tail.unicodeScalars.append(Unicode.Scalar(hexDigits[Int(b >> 4)]))
                tail.unicodeScalars.append(Unicode.Scalar(hexDigits[Int(b & 0x0F)]))
            }
            i += 1
        }
        let q = tail.firstIndex(of: "?")
        var path = String(q.map { tail[..<$0] } ?? tail[...])
        if path.isEmpty { path = "/" }
        let query = q.map { String(tail[$0...]) } ?? ""
        if path.split(separator: "/", omittingEmptySubsequences: false).contains(where: { dotSegments.contains($0.lowercased()) }) { return nil }
        return "\(scheme)://\(host.lowercased())\(portPart)\(path)\(query)"
    }

    /// The origin of a canonical URL (whose path always starts with "/").
    static func origin(_ url: String) -> String {
        guard let scheme = url.range(of: "://"), let slash = url[scheme.upperBound...].firstIndex(of: "/") else { return url }
        return String(url[..<slash])
    }

    /// RFC 3986 5.2.4 on an absolute path: "." and ".." (also their %2e forms, as WHATWG reads
    /// them) resolved, ".." above the root dropped. Foundation resolves only the literal forms.
    private static func removeDotSegments(_ path: String) -> String {
        let segments = path.split(separator: "/", omittingEmptySubsequences: false).dropFirst()
        var out: [Substring] = []
        for (i, segment) in segments.enumerated() {
            let last = i == segments.count - 1
            switch segment.lowercased() {
            case ".", "%2e":
                if last { out.append("") }
            case "..", "%2e%2e", ".%2e", "%2e.":
                if !out.isEmpty { out.removeLast() }
                if last { out.append("") }
            default:
                out.append(segment)
            }
        }
        return "/" + out.joined(separator: "/")
    }

    /// A redirect target: Location resolved against the current URL (RFC 3986 5.2, Foundation's
    /// URL(string:relativeTo:)), dot segments removed, canonical.
    static func redirectTarget(_ location: String, from current: String) -> String? {
        let resolved: String
        if location.isEmpty {
            resolved = current
        } else {
            guard let base = URL(string: current), let next = URL(string: location, relativeTo: base)?.absoluteURL else { return nil }
            resolved = next.absoluteString
        }
        guard let scheme = resolved.range(of: "://") else { return nil }
        let afterScheme = resolved[scheme.upperBound...]
        let authorityEnd = afterScheme.firstIndex { $0 == "/" || $0 == "?" || $0 == "#" } ?? afterScheme.endIndex
        var rest = resolved[authorityEnd...]
        if let hash = rest.firstIndex(of: "#") { rest = rest[..<hash] }
        let queryStart = rest.firstIndex(of: "?") ?? rest.endIndex
        let path = rest[..<queryStart]
        return canonical(resolved[..<authorityEnd] + removeDotSegments(path.isEmpty ? "/" : String(path)) + rest[queryStart...])
    }

    struct Hop: Sendable {
        var method: String
        var headers: [(name: String, value: String)]
        var body: Data?
    }

    /// The fetch standard's HTTP-redirect fetch (src/common.ts redirected).
    static func redirected(_ status: Int, _ hop: Hop, from: String, to: String) -> Hop {
        var next = hop
        if ((status == 301 || status == 302) && hop.method == "POST") || (status == 303 && hop.method != "GET" && hop.method != "HEAD") {
            next.method = "GET"
            next.body = nil
            let bodyHeaders: Set<String> = ["content-type", "content-encoding", "content-language", "content-location"]
            next.headers.removeAll { bodyHeaders.contains($0.name.lowercased()) }
        }
        if origin(from) != origin(to) {
            let credentials: Set<String> = ["authorization", "cookie", "proxy-authorization"]
            next.headers.removeAll { credentials.contains($0.name.lowercased()) }
        }
        return next
    }
}
