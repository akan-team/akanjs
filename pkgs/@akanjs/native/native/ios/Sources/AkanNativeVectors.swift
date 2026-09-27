// Runs the shared vectors (packages/core/vectors) against this host's kernel (AkanNativeKernel,
// AkanNativeGlob): on the Mac through scripts/native-vectors.ts, on the device through the dev-only
// $host.vectors of the self-test. AkanNativeVectorData is generated per build, empty in release builds.

// Dev builds only (-D AKAN_NATIVE_DEV): the self-test's $host.vectors and scripts/native-vectors.ts.
#if AKAN_NATIVE_DEV
import CryptoKit
import Foundation

enum AkanNativeVectors {
    /// How many cases passed, and a line for each that did not.
    static func run() -> (passed: Int, failures: [String]) {
        var passed = 0
        var failures: [String] = []
        var ran: [String: Int] = [:]
        var current = ""
        func check(_ ok: Bool, _ what: @autoclosure () -> String) {
            ran[current, default: 0] += 1
            if ok { passed += 1 } else { failures.append(what()) }
        }
        func load(_ name: String) -> [String: Any] {
            current = name
            guard let text = AkanNativeVectorData.files[name], let o = try? JSONSerialization.jsonObject(with: Data(text.utf8)) as? [String: Any] else { return [:] }
            return o
        }
        func rows(_ o: [String: Any], _ key: String) -> [[Any]] { o[key] as? [[Any]] ?? [] }
        func str(_ v: Any) -> String? { v as? String }

        let scope = load("scope")
        for c in rows(scope, "glob") {
            let mode = c[2] as? String
            check(AkanNativeGlob.match(c[0] as! String, c[1] as! String, path: mode != "plain", deny: mode == "path-deny") == c[3] as? Bool, "glob \(c)")
        }
        for c in rows(scope, "permits") {
            let s = c[0] as! [String: Any]
            let entries = { (v: Any?) in (v as? [[String: String]]) }
            let scope = AkanNativeScope(allow: entries(s["allow"]), deny: entries(s["deny"]) ?? [])
            let ok = scope.permits(c[1] as! [String: String], pathFields: Set(c[2] as! [String]), urlFields: Set(c[3] as! [String]), fold: c[4] as! Bool)
            check(ok == c[5] as? Bool, "permits \(c)")
        }
        for c in rows(scope, "url") {
            check(AkanNativeGlob.url(c[0] as! String, c[1] as! String, deny: c[2] as? String == "deny") == c[3] as? Bool, "url \(c)")
        }

        let routes = load("routes")
        let files = Set(routes["files"] as? [String] ?? [])
        for c in rows(routes, "cases") {
            let all = c[1] as? String == "all"
            let got: (String, String?) = switch AkanNativeKernel.route(c[0] as! String, exists: { all || files.contains($0) }) {
            case .initScript: ("init", nil)
            case .ipc: ("ipc", nil)
            case .hello: ("hello", nil)
            case .file(let id): ("file", id)
            case .asset(let path): ("asset", path)
            case .notFound: ("not-found", nil)
            }
            check(got.0 == c[2] as? String && got.1 == str(c[3]), "route \(c): \(got)")
        }
        for c in rows(routes, "hostPaths") {
            check(AkanNativeKernel.isHostPath(c[0] as! String) == c[1] as? Bool, "host path \(c)")
        }

        for c in rows(load("ranges"), "cases") {
            let expected = (c[2] as? [NSNumber] ?? []).map(\.int64Value)
            let got: [Int64] = switch AkanNativeKernel.parseRange(str(c[0]), size: (c[1] as! NSNumber).int64Value) {
            case .whole: [200]
            case .part(let a, let b): [206, a, b]
            case .unsatisfiable: [416]
            }
            check(got == expected, "range \(c): \(got)")
        }

        let ids = load("ids")
        let specs = ["fileRef": AkanNativeContract.idFileRef, "bundle": AkanNativeContract.idBundle, "document": AkanNativeContract.idDocument, "name": AkanNativeContract.idName]
        for c in rows(ids, "cases") {
            check(AkanNativeKernel.idValid(specs[c[0] as! String]!, c[1] as! String) == c[2] as? Bool, "id \(c)")
        }
        for c in rows(ids["mime"] as? [String: Any] ?? [:], "cases") {
            let path = c[0] as! String
            check(AkanNativeKernel.assetMime(path) == c[1] as? String && AkanNativeKernel.fileMime(path) == c[2] as? String, "mime \(c): \(AkanNativeKernel.assetMime(path))")
        }

        let bridge = load("bridge")
        for c in rows(bridge, "requests") {
            let request: Any? = c[0] is NSNull ? nil : c[0]
            let got = AkanNativeKernel.validateRequest(request)
            check(got == str(c[1]), "request \(c): \(got ?? "nil")")
        }
        for c in rows(bridge, "declarations") {
            let decl: Any? = c[0] is NSNull ? nil : c[0]
            check(AkanNativeKernel.declares(decl, method: c[1] as! String, event: str(c[2])) == c[3] as? Bool, "declaration \(c)")
        }
        for c in rows(bridge, "documents") {
            let got = AkanNativeKernel.admitDocument(current: str(c[0]), ended: c[1] as? [String] ?? [], requested: str(c[2]))
            check(got.rawValue == c[3] as? String, "document \(c): \(got.rawValue)")
        }

        for (i, item) in ((load("acl")["cases"] as? [[String: Any]]) ?? []).enumerated() {
            let (acl, problem) = AkanNativeAcl.from(item)
            check((problem != nil) == item["problem"] as? Bool, "acl case \(i): problem \(problem ?? "none")")
            for c in (item["checks"] as? [[Any]] ?? []) {
                let (allowed, scope) = acl?.check(plugin: c[0] as! String, item: c[1] as! String, window: (c[2] as! NSNumber).intValue) ?? (true, nil)
                let expected = c[4] as? [String: Any]
                let scopeOk = scope == nil ? expected == nil
                    : (expected?["allow"] is NSNull ? scope!.allow == nil : (scope!.allow.map { $0 as NSArray } == expected?["allow"] as? NSArray))
                        && (scope!.deny as NSArray) == (expected?["deny"] as? NSArray)
                check(allowed == c[3] as? Bool && scopeOk, "acl case \(i) \(c): \(allowed) \(String(describing: scope?.allow)) \(String(describing: scope?.deny))")
            }
        }

        let navigation = load("navigation")
        for c in rows(navigation, "cases") {
            let got = AkanNativeKernel.decideNavigation(c[0] as! String, topLevel: c[1] as! Bool, origin: "app://localhost", extra: c[2] as? [String] ?? [])
            check(got.rawValue == c[3] as? String, "navigation \(c): \(got.rawValue)")
        }
        for c in rows(navigation, "fileRefSandbox") {
            check(AkanNativeKernel.fileRefSandboxed(c[0] as! String) == c[1] as? Bool, "sandbox \(c)")
        }
        for item in (load("retained")["cases"] as? [[String: Any]]) ?? [] {
            let events = AkanNativeRetained<String>()
            var log: [String] = []
            for op in item["ops"] as? [[Any]] ?? [] {
                let name = op[1] as! String
                switch op[0] as! String {
                case "listen":
                    let accepts = op[2] as! Bool
                    events.listen(name) { value in
                        if accepts { log.append("\(name):\(value)") }
                        return accepts
                    }
                case "unlisten": events.unlisten(name)
                default: events.emit(name, retain: op[2] as! Bool)
                }
            }
            check(log == item["log"] as? [String], "retained \(item["name"] ?? ""): \(log)")
        }
        // Ed25519 as web bundle updates verify it on iOS (CryptoKit).
        for c in rows(load("ed25519"), "cases") {
            let bytes = { (hex: String) -> Data in Data(stride(from: 0, to: hex.count, by: 2).map { UInt8(hex.dropFirst($0).prefix(2), radix: 16)! }) }
            let valid = (try? Curve25519.Signing.PublicKey(rawRepresentation: bytes(c[0] as! String)))?.isValidSignature(bytes(c[2] as! String), for: bytes(c[1] as! String)) ?? false
            check(valid == c[3] as? Bool, "ed25519 \(c[4])")
        }

        // A missing or truncated file must not pass as fewer checks.
        for (name, count) in AkanNativeVectorData.counts where ran[name, default: 0] != count {
            failures.append("\(name): \(ran[name, default: 0]) of \(count) checks ran")
        }
        if AkanNativeVectorData.counts.isEmpty { failures.append("no vectors in this build") }
        return (passed, failures)
    }

    /// The checks all files hold.
    static var expected: Int { AkanNativeVectorData.counts.values.reduce(0, +) }
}
#endif
