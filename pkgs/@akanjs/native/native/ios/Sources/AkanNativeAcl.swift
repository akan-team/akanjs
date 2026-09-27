// Plugin permission ACL (requirements PL-11, plugins.md C7): the Swift copy of
// packages/core/src/acl.ts. The CLI resolves the app's capabilities into boot.json `acl`; the
// bridge checks every call here before a plugin sees it, and hands the matching scopes to the call.

import Foundation

/// What a call may touch: `allow == nil` means no restriction beyond the plugin's own rules.
struct AkanNativeScope: @unchecked Sendable {
    let allow: [[String: String]]?
    let deny: [[String: String]]

    /// Whether `value` (e.g. ["base": "data", "path": "notes/a.txt"]) is inside the scope.
    /// Fields in `pathFields` match as paths (`*` stays within a segment, `**` crosses "/"), fields
    /// in `urlFields` as URLs (AkanNativeGlob.url). `fold`: the paths are on a case-insensitive volume.
    func permits(_ value: [String: String], pathFields: Set<String> = [], urlFields: Set<String> = [], fold: Bool = false) -> Bool {
        if deny.contains(where: { Self.matches($0, value, pathFields, urlFields, deny: true, fold: fold) }) { return false }
        guard let allow else { return true }
        return allow.contains(where: { Self.matches($0, value, pathFields, urlFields, deny: false, fold: fold) })
    }

    private static func matches(_ entry: [String: String], _ value: [String: String], _ pathFields: Set<String>, _ urlFields: Set<String>, deny: Bool, fold: Bool) -> Bool {
        for (field, pattern) in entry {
            guard let actual = value[field] else { return false }
            let path = pathFields.contains(field)
            let ok = urlFields.contains(field) ? AkanNativeGlob.url(pattern, actual, deny: deny)
                : path && fold ? AkanNativeGlob.match(pattern.lowercased(), actual.lowercased(), path: true, deny: deny)
                : AkanNativeGlob.match(pattern, actual, path: path, deny: deny)
            if !ok { return false }
        }
        return true
    }
}

/// Same rules as globMatch and urlMatch in packages/core/src/acl.ts; the cases in
/// packages/core/vectors/scope.json run here too (scripts/native-vectors.ts).
enum AkanNativeGlob {
    nonisolated(unsafe) private static var cache: [String: NSRegularExpression] = [:]
    private static let lock = NSLock()

    /// Whole-text match of the regex `source`. `\z`, not `$`, which also matches before a final newline.
    private static func test(_ source: String, _ text: String) -> Bool {
        lock.lock()
        var re = cache[source]
        if re == nil {
            re = try? NSRegularExpression(pattern: "^(?:" + source + ")\\z", options: [.dotMatchesLineSeparators])
            cache[source] = re
        }
        lock.unlock()
        guard let re else { return false }
        return re.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)) != nil
    }

    private static func escaped(_ c: Character) -> String {
        "\\^$.|+()[]{}".contains(c) ? "\\" + String(c) : String(c)
    }

    /// acl.ts globMatch: in an allow entry no path wildcard matches a name that starts with "."; a
    /// deny entry (`deny`) covers dot files too.
    static func match(_ pattern: String, _ text: String, path: Bool, deny: Bool = false) -> Bool {
        test(source(pattern, path: path, deny: deny), text)
    }

    static func source(_ pattern: String, path: Bool, deny: Bool = false) -> String {
        let dots = !path || deny
        let guardDot = dots ? "" : "(?!\\.)"
        let segment = guardDot + "[^/]*"
        let across = dots ? ".*" : "(?:[^/]|/(?!\\.))*"
        let chars = Array(pattern)
        var out = ""
        var i = 0
        while i < chars.count {
            let c = chars[i]
            let start = i == 0 || chars[i - 1] == "/"
            if c == "*" {
                if i + 1 < chars.count, chars[i + 1] == "*" {
                    i += 1
                    if !path {
                        out += ".*"
                    } else if i + 1 < chars.count, chars[i + 1] == "/", start {
                        out += "(?:" + segment + "/)*"
                        i += 1
                    } else if i == chars.count - 1, i >= 2, chars[i - 2] == "/" {
                        out.removeLast()
                        out += "(?:/" + segment + ")*"
                    } else {
                        out += (start ? guardDot : "") + across
                    }
                } else {
                    out += path ? (start ? segment : "[^/]*") : ".*"
                }
            } else if c == "?" {
                out += path ? (start ? guardDot + "[^/]" : "[^/]") : "."
            } else {
                out += escaped(c)
            }
            i += 1
        }
        return out
    }

    /// `*` (and `**`) → `star`, `?` → one character, everything else literal.
    private static func wildcard(_ pattern: String, _ text: String, star: String) -> Bool {
        var out = ""
        var afterStar = false
        for c in pattern {
            if c == "*" {
                if !afterStar { out += star }
                afterStar = true
                continue
            }
            afterStar = false
            out += c == "?" ? "." : escaped(c)
        }
        return test(out, text)
    }

    struct UrlParts {
        let scheme: String
        let host: String?
        let port: String
        let rest: String
    }

    /// urlParts in packages/core/src/acl.ts.
    static func urlParts(_ text: String, pattern: Bool = false) -> UrlParts? {
        guard let colon = text.firstIndex(of: ":"), colon != text.startIndex else { return nil }
        let scheme = text[..<colon].lowercased()
        var rest = text[text.index(after: colon)...]
        if !pattern, let query = rest.firstIndex(where: { $0 == "?" || $0 == "#" }) { rest = rest[..<query] }
        guard rest.hasPrefix("//") else { return UrlParts(scheme: scheme, host: nil, port: "", rest: String(rest)) }
        rest = rest.dropFirst(2)
        let end = rest.firstIndex(of: "/")
        var authority = end.map { rest[..<$0] } ?? rest
        if let at = authority.lastIndex(of: "@") { authority = authority[authority.index(after: at)...] } // user info
        var from = authority.startIndex
        if authority.hasPrefix("["), let close = authority.firstIndex(of: "]") { from = authority.index(after: close) } // IPv6
        let portColon = authority[from...].firstIndex(of: ":")
        return UrlParts(
            scheme: scheme,
            host: (portColon.map { authority[..<$0] } ?? authority).lowercased(),
            port: portColon.map { String(authority[authority.index(after: $0)...]) } ?? "",
            rest: end.map { String(rest[$0...]) } ?? ""
        )
    }

    private static let defaultPorts = ["http": "80", "https": "443", "ws": "80", "wss": "443"]

    /// urlMatch in packages/core/src/acl.ts: scheme, host, port and path compared separately. A
    /// pattern without a port matches the default port in an allow entry, every port in a deny entry.
    static func url(_ pattern: String, _ url: String, deny: Bool = false) -> Bool {
        if !pattern.isEmpty && pattern.allSatisfy({ $0 == "*" }) { return true }
        guard let p = urlParts(pattern, pattern: true), let v = urlParts(url), (p.host == nil) == (v.host == nil) else { return false }
        guard wildcard(p.scheme, v.scheme, star: "[a-z0-9+.-]*") else { return false }
        if let host = p.host, let actual = v.host {
            guard wildcard(host, actual, star: ".*") else { return false }
            let port = v.port.isEmpty ? defaultPorts[v.scheme] ?? "" : v.port
            if p.port.isEmpty ? !deny && port != defaultPorts[v.scheme] ?? "" : p.port != "*" && p.port != port { return false }
            if p.rest.isEmpty { return true }
        }
        return wildcard(p.rest, v.rest, star: ".*")
    }
}

struct AkanNativeAcl: @unchecked Sendable {
    private struct Grant {
        let plugin: String
        let windows: [Int]? // nil: every window
        let items: Set<String>? // nil: everything
        let allow: [[String: String]]?
        let deny: [[String: String]]
    }

    private let grants: [Grant]
    private let denied: [String: Set<String>]

    /// What the bridge enforces when boot.json's ACL is broken: nothing is allowed (fail-closed).
    static let denyAll = AkanNativeAcl(grants: [], denied: [:])

    /// boot.json's ACL (acl.ts loadAcl): nil when boot.json has none (everything allowed). One that
    /// is not well formed denies everything, and `problem` says why: a malformed part must not loosen
    /// the rest (one bad grant used to allow everything, one bad denial to drop every denial).
    static func from(_ boot: [String: Any]) -> (acl: AkanNativeAcl?, problem: String?) {
        guard let value = boot["acl"] else { return (nil, nil) }
        if let problem = problem(value) { return (denyAll, problem) }
        let acl = value as! [String: Any]
        let entries = { (value: Any?) in (value as? [[String: Any]])?.map { $0.mapValues { $0 as! String } } }
        let grants = (acl["grants"] as! [[String: Any]]).map { g in
            Grant(
                plugin: g["plugin"] as! String,
                windows: (g["windows"] as? [NSNumber])?.map(\.intValue),
                items: (g["items"] as? [String]).map(Set.init),
                allow: entries(g["allow"]),
                deny: entries(g["deny"]) ?? []
            )
        }
        return (AkanNativeAcl(grants: grants, denied: (acl["denied"] as? [String: [String]] ?? [:]).mapValues(Set.init)), nil)
    }

    /// nil: boot.json has no ACL: everything is allowed. A malformed one denies everything.
    static func load(_ boot: [String: Any]) -> AkanNativeAcl? {
        let (acl, problem) = from(boot)
        if let problem { NSLog("[akan-native] boot.json: the capabilities cannot be read (%@); every plugin call is denied", problem) }
        return acl
    }

    /// acl.ts aclProblem: why a value is not an ACL the bridge can enforce, or nil.
    static func problem(_ value: Any) -> String? {
        func strings(_ v: Any?) -> Bool { (v as? [Any])?.allSatisfy { $0 is String } ?? false }
        func scopes(_ v: Any?) -> Bool {
            guard let v else { return true }
            return (v as? [Any])?.allSatisfy { e in (e as? [String: Any])?.values.allSatisfy { $0 is String } ?? false } ?? false
        }
        func window(_ v: Any) -> Bool {
            guard let n = v as? NSNumber, CFGetTypeID(n) != CFBooleanGetTypeID() else { return false }
            return n.doubleValue == n.doubleValue.rounded() && n.doubleValue >= 1
        }
        guard let acl = value as? [String: Any], let grants = acl["grants"] as? [Any] else { return "acl must be { grants: [...], denied?: {...} }" }
        for (i, item) in grants.enumerated() {
            guard let g = item as? [String: Any], let plugin = g["plugin"] as? String, !plugin.isEmpty else { return "grant \(i) has no plugin" }
            guard g["windows"] as? String == "*" || ((g["windows"] as? [Any])?.allSatisfy(window) ?? false) else { return "grant \(i): bad windows" }
            guard g["items"] as? String == "*" || strings(g["items"]) else { return "grant \(i): bad items" }
            guard scopes(g["allow"]), scopes(g["deny"]) else { return "grant \(i): bad scopes" }
        }
        if let denied = acl["denied"] {
            guard let d = denied as? [String: Any], d.values.allSatisfy({ strings($0) }) else { return "bad denied" }
        }
        return nil
    }

    /// The C7 check: (allowed, scope for the call).
    func check(plugin: String, item: String, window: Int = 1) -> (allowed: Bool, scope: AkanNativeScope?) {
        if denied[plugin]?.contains(item) == true { return (false, nil) }
        let matching = grants.filter { g in
            g.plugin == plugin && (g.items?.contains(item) ?? true) && (g.windows?.contains(window) ?? true)
        }
        if matching.isEmpty { return (false, nil) }
        let allow: [[String: String]]? = matching.contains { $0.allow == nil } ? nil : matching.flatMap { $0.allow ?? [] }
        let deny = matching.flatMap(\.deny)
        return (true, allow == nil && deny.isEmpty ? nil : AkanNativeScope(allow: allow, deny: deny))
    }
}
