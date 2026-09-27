// Bridge over WKScriptMessageHandlerWithReply (docs/architecture.md §4, docs/research/ios.md §4.2).
// Messages are JSON text both ways: WebKit's own object conversion mangles Date, typed arrays and
// undefined (verified), and JSON text behaves the same on every host.
//
// Bridge v1.1: requests name their document (one page load). The bridge keeps the current one; a
// new id or a committed navigation (AkanNativeViewController) ends it, and calls of ended documents are
// refused. Responses and events of the current document are numbered (`seq`) here, on the main
// actor, just before they are sent: the reply and callAsyncJavaScript reach the page in either
// order (an event sent after a reply came first 5961 of 6000 times), and the page sorts them.

import UIKit
import WebKit

@MainActor
final class AkanNativeBridge: NSObject {
    weak var webView: WKWebView?
    weak var viewController: UIViewController?
    private var plugins: [String: AkanNativePlugin] = [:]
    private var listeners: [String: Int] = [:] // "plugin\0event" → count
    /// The app's capabilities (PL-11); nil for builds without an ACL (everything allowed).
    private let acl = AkanNativeAcl.load(AkanNativeResources.json("boot.json"))
    /// boot.json `plugins`: what each plugin declares natively on iOS (the L2 declaration gate).
    private let declarations = AkanNativeResources.json("boot.json")["plugins"] as? [String: Any] ?? [:]
    /// "plugin\0event" of events whose payload is a snapshot (plugins[].coalesce): only the latest of a
    /// burst is sent (architecture review stage 4).
    private lazy var coalescing: Set<String> = {
        var keys: Set<String> = ["$host\u{0}tick"]
        for (plugin, decl) in declarations {
            for event in (decl as? [String: Any])?["coalesce"] as? [String] ?? [] { keys.insert("\(plugin)\u{0}\(event)") }
        }
        return keys
    }()
    /// Dev builds: the self-test's $host methods.
    var dev = false
    /// Dev builds: $host.hang calls still open, and how many were cancelled.
    private var hanging: [AkanNativeCall] = []
    private var hangCancels = 0
    private var document: AkanNativeDocument?
    /// Ended documents, so their late calls are refused.
    private var ended: [String] = []

    func register(_ entries: [(id: String, type: AkanNativePlugin.Type)]) {
        for entry in entries {
            plugins[entry.id] = entry.type.init(context: AkanNativePluginContext(pluginId: entry.id, bridge: self))
        }
    }

    // JS: await webkit.messageHandlers.akanNative.postMessage(JSON.stringify(request)) → JSON text
    func receive(_ message: WKScriptMessage, reply: @escaping @MainActor (Any?, String?) -> Void) {
        // SEC-1: the handler is exposed to every frame (iframes too, verified): accept the app
        // origin's main frame only. The error argument is used for this refusal only.
        let origin = message.frameInfo.securityOrigin
        guard origin.protocol == "app", origin.host == "localhost", origin.port == 0, message.frameInfo.isMainFrame else {
            AkanNativeLog.info("bridge: refused a message from \(origin.protocol)://\(origin.host) mainFrame=\(message.frameInfo.isMainFrame)")
            return reply(nil, "akan-native: forbidden origin")
        }
        guard let text = message.body as? String, let data = text.data(using: .utf8),
              let parsed = try? JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed]) else {
            return reply(Self.encode(["v": 1, "id": -1, "ok": false, "error": ["code": "INVALID_ARGS", "message": "request is not JSON text"]]), nil)
        }
        // SEC-3: the shape of the request, checked like every host does (AkanNativeKernel, shared vectors).
        if let problem = AkanNativeKernel.validateRequest(parsed) {
            let id = ((parsed as? [String: Any])?["id"] as? NSNumber).map { $0.doubleValue == $0.doubleValue.rounded() ? $0.int64Value : 0 } ?? 0
            return reply(Self.encode(["v": 1, "id": id, "ok": false, "error": ["code": "INVALID_ARGS", "message": problem]]), nil)
        }
        let request = parsed as! [String: Any]
        let id = (request["id"] as! NSNumber).int64Value
        let pluginId = request["plugin"] as! String
        let method = request["method"] as! String
        // Bridge v1.1: which document the request belongs to (AkanNativeKernel.admitDocument).
        let docId = request["doc"] as? String
        let doc: AkanNativeDocument
        switch AkanNativeKernel.admitDocument(current: document?.id, ended: ended, requested: docId) {
        case .current:
            doc = document!
        case .new:
            endDocument()
            doc = AkanNativeDocument(id: docId ?? "")
            document = doc
        case .ended:
            return reply(Self.encode(["v": 1, "id": id, "ok": false, "error": ["code": "INTERNAL", "message": "the page that made this call is gone"]]), nil)
        case .noDoc:
            // Its answer would take a number the page runtime never sees, and its id would be spent
            // for the runtime's own request with that id.
            return reply(Self.encode(["v": 1, "id": id, "ok": false, "error": ["code": "INVALID_ARGS", "message": "request has no document id"]]), nil)
        }
        // v1.1 `once`. A repeat is answered under another id: the page's call waits for the first answer.
        guard doc.id.isEmpty || doc.ids.accept(id) else {
            return reply(Self.encode(["v": 1, "id": -1, "ok": false, "error": ["code": "INVALID_ARGS", "message": "request \(id) was already received"]]), nil)
        }
        let args = request["args"] as? [String: Any] ?? [:]
        let call = AkanNativeCall(method: method, args: args) { [weak self] body in
            doc.running[id] = nil
            var response = body
            response["v"] = 1
            response["id"] = id
            self?.flushOutbox(doc) // what waits goes first, so the page sees it in order
            self?.stamp(&response, doc)
            var fallback: [String: Any] = ["v": 1, "id": id, "ok": false, "error": ["code": "INTERNAL", "message": "\(pluginId).\(method) returned a value that is not JSON"]]
            fallback["doc"] = response["doc"]
            fallback["seq"] = response["seq"]
            reply(Self.encode(response) ?? Self.encode(fallback), nil)
        }

        if pluginId == "$bridge" { return bridgeOp(call, args, doc) }
        doc.running[id] = AkanNativeWeakCall(call)
        call.document = doc
        if pluginId == "$console" { // dev builds: page console forwarding (WV-3)
            AkanNativeLog.page(method, args["message"] as? String ?? "")
            return call.resolve()
        }
        if pluginId == "$host" { return host(call, args) }
        guard let plugin = plugins[pluginId] else { return call.reject(.notFound, "plugin \(pluginId) is not registered") }
        // L2: an undeclared method or event never reaches the plugin, whatever its code handles.
        let subscription = method == "$listen" || method == "$unlisten"
        guard AkanNativeKernel.declares(declarations[pluginId], method: method, event: subscription ? args["event"] as? String : nil) else {
            return call.reject(.notFound, subscription ? "event \(pluginId).\(args["event"] as? String ?? "") is not declared" : "method \(pluginId).\(method) is not declared")
        }
        // PL-11 / plugins.md C7: checked before the plugin sees the call. $unlisten always passes.
        if method != "$unlisten", let acl {
            let event = args["event"] as? String ?? ""
            let access = acl.check(plugin: pluginId, item: method == "$listen" ? "listen:\(event)" : method)
            guard access.allowed else {
                let what = method == "$listen" ? "\(event) events" : "\(method)()"
                return call.reject(.notAllowed, "\(pluginId).\(what) is not allowed by the app's capabilities")
            }
            call.scope = access.scope
        }
        if method == "$listen" || method == "$unlisten" {
            guard let event = args["event"] as? String else { return call.reject(.invalidArgs, "\(method) requires args.event") }
            let key = "\(pluginId)\u{0}\(event)"
            let before = listeners[key] ?? 0
            let after = max(0, before + (method == "$listen" ? 1 : -1))
            listeners[key] = after
            if before == 0 && after == 1 { plugin.startListening(event) }
            if before > 0 && after == 0 { plugin.stopListening(event) }
            return call.resolve()
        }
        plugin.handle(call)
    }

    /// JSONSerialization raises an uncatchable ObjC exception for non-JSON values (e.g. Date):
    /// validate first (docs/research/ios.md §1.2 #3).
    static func encode(_ value: [String: Any]) -> String? {
        guard JSONSerialization.isValidJSONObject(value),
              let data = try? JSONSerialization.data(withJSONObject: value, options: [.withoutEscapingSlashes]) else { return nil }
        return String(decoding: data, as: UTF8.self)
    }

    func emit(plugin: String, event: String, data: Any?) {
        guard (listeners["\(plugin)\u{0}\(event)"] ?? 0) > 0 else { return }
        send(plugin: plugin, event: event, data: data)
    }

    /// An event for the current document, numbered once it is known to be JSON.
    private func send(plugin: String, event: String, data: Any?) {
        guard let doc = document else { return }
        var message: [String: Any] = ["v": 1, "plugin": plugin, "event": event]
        if let data { message["data"] = data }
        guard JSONSerialization.isValidJSONObject(message) else {
            return AkanNativeLog.info("emit \(plugin).\(event): data is not JSON, dropped")
        }
        let key = "\(plugin)\u{0}\(event)"
        guard coalescing.contains(key) else {
            flushOutbox(doc)
            return deliver(message, doc)
        }
        // The last waiting entry is replaced when it is the same event; otherwise it queues behind.
        if doc.outbox.last?.key == key { doc.outbox[doc.outbox.count - 1].message = message } else { doc.outbox.append((key, message)) }
        if !doc.outboxScheduled {
            doc.outboxScheduled = true
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { [weak self, weak doc] in
                MainActor.assumeIsolated { if let doc { self?.flushOutbox(doc) } }
            }
        }
    }

    /// Sends the document's waiting coalesced events, in order (numbered now, when they go).
    private func flushOutbox(_ doc: AkanNativeDocument) {
        doc.outboxScheduled = false
        guard !doc.outbox.isEmpty, document === doc else { return doc.outbox.removeAll() }
        let waiting = doc.outbox
        doc.outbox.removeAll()
        for (_, message) in waiting { deliver(message, doc) }
    }

    /// Numbers an event of the current document and hands it to the page.
    private func deliver(_ message: [String: Any], _ doc: AkanNativeDocument) {
        guard let webView else { return }
        var message = message
        let plugin = message["plugin"] as? String ?? "", event = message["event"] as? String ?? ""
        stamp(&message, doc)
        guard let text = Self.encode(message) else {
            return AkanNativeLog.info("emit \(plugin).\(event): data is not JSON, dropped")
        }
        // Arguments go in as values, so no JS string escaping is involved.
        webView.callAsyncJavaScript("window.__AKAN_NATIVE__ && window.__AKAN_NATIVE__.receive(m)", arguments: ["m": text], in: nil, in: .page) { result in
            if case .failure(let error) = result { AkanNativeLog.info("emit \(plugin).\(event) failed: \(error)") }
        }
    }

    // MARK: documents (bridge v1.1)

    /// Numbers a message of `doc` while it is the current document; its later answers carry only its id.
    private func stamp(_ message: inout [String: Any], _ doc: AkanNativeDocument) {
        guard !doc.id.isEmpty else { return }
        message["doc"] = doc.id
        guard document === doc else { return }
        doc.seq += 1
        message["seq"] = doc.seq
    }

    /// $bridge operations (v1.1 `cancel`): follow-ups on what this document's own calls handed out,
    /// so they need no ACL entry. Messages come in order here, so a cancel never overtakes its call.
    private func bridgeOp(_ call: AkanNativeCall, _ args: [String: Any], _ doc: AkanNativeDocument) {
        switch call.method {
        case "cancel":
            let target = (args["id"] as! NSNumber).int64Value
            guard let running = doc.running[target]?.call else { return call.resolve(["cancelled": false]) }
            doc.running[target] = nil
            let timeout = args["reason"] as? String == "timeout"
            running.cancel(timeout ? .timeout : .cancelled, timeout ? "the page's time limit for this call ran out" : "cancelled by the page")
            call.resolve(["cancelled": true])
        default: // release
            var path = args["url"] as! String
            if path.hasPrefix("app://localhost") { path.removeFirst("app://localhost".count) }
            let released = path.hasPrefix("/__akan_native/file/") && AkanNativeFiles.shared.release(String(path.dropFirst("/__akan_native/file/".count)))
            call.resolve(["released": released])
        }
    }

    /// The page's document ended (a navigation committed, another document called, or the window
    /// is gone). In this order, done by the host without asking the page: its calls end (their
    /// plugins' onCancel handlers run), its subscriptions stop, what its calls own is closed (last
    /// first), then the plugins' documentEnded hooks run. Calling it again does nothing.
    func endDocument() {
        guard let doc = document else { return }
        document = nil
        if !doc.id.isEmpty { ended = Array((ended + [doc.id]).suffix(16)) }
        let running = doc.running.values.compactMap(\.call)
        doc.running.removeAll()
        for call in running { call.cancel(.cancelled, "the page that made this call is gone") }
        for (key, count) in listeners where count > 0 {
            let parts = key.split(separator: "\u{0}", maxSplits: 1).map(String.init)
            if parts.count == 2 { plugins[parts[0]]?.stopListening(parts[1]) }
        }
        listeners.removeAll()
        for dispose in doc.end() { dispose() }
        for plugin in plugins.values { plugin.documentEnded(doc.id) }
    }

    /// The window is gone (scene disconnected, $host.recreate): its document ends and the App
    /// services forget its plugins' listeners.
    func windowEnded() {
        endDocument()
        let owner = ObjectIdentifier(self)
        AkanNativeLinks.shared.removeAll(owner: owner)
        AkanNativeNotifications.shared.removeAll(owner: owner)
        AkanNativeRemoteNotifications.shared.removeAll(owner: owner)
    }

    /// Table sizes for the document churn check (K13, dev $host.info).
    private var stats: [String: Int] {
        [
            "documents": document == nil ? 0 : 1,
            "ended": ended.count,
            "subscriptions": listeners.values.reduce(0, +),
            "running": document?.running.count ?? 0,
            "resources": document?.resourceCount ?? 0,
            "files": AkanNativeFiles.shared.count,
            "linkListeners": AkanNativeLinks.shared.listenerCount,
            "notificationHandlers": AkanNativeNotifications.shared.handlerCount,
            "remoteListeners": AkanNativeRemoteNotifications.shared.listenerCount,
        ]
    }

    /// Shell built-ins the page runtime calls. Dev builds only: the self-test's bridge checks.
    private func host(_ call: AkanNativeCall, _ args: [String: Any]) {
        guard dev else { return call.reject(.notFound, "unknown host method \(call.method)") }
        // Compiled into dev builds only (-D AKAN_NATIVE_DEV): release builds have no self-test methods.
        #if AKAN_NATIVE_DEV
        switch call.method {
        case "echo": // answers, then sends an event right after the answer (the order check)
            call.resolve(args)
            send(plugin: "$host", event: "echo", data: args)
        case "info":
            let app = AkanNativeAppServices.shared
            call.resolve(["instance": app.instance, "bundleSelections": app.bundleSelections, "windows": app.windows, "stats": stats, "cancels": hangCancels])
        case "burst": // coalescing $host.tick events, then the answer (the coalesce check)
            let count = (args["count"] as? NSNumber)?.intValue ?? 0
            for n in 0..<max(0, count) { send(plugin: "$host", event: "tick", data: ["n": n]) }
            call.resolve(["sent": count])
        case "hang": // never answers by itself; counts its cancellation (v1.1 cancel check)
            hanging.append(call)
            call.onCancel { [weak self, weak call] in
                self?.hangCancels += 1
                self?.hanging.removeAll { $0 === call }
            }
        case "vectors": // the shared vectors against this device's kernel (AkanNativeVectors)
            let result = AkanNativeVectors.run()
            call.resolve(["passed": result.passed, "expected": AkanNativeVectors.expected, "failures": Array(result.failures.prefix(20))])
        case "recreate": // a new window in this process, as when a scene connects again
            call.resolve()
            let scene = viewController?.view.window?.windowScene
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
                MainActor.assumeIsolated { (scene?.delegate as? AkanNativeSceneDelegate)?.recreate() }
            }
        default:
            call.reject(.notFound, "unknown host method \(call.method)")
        }
        #else
        call.reject(.notFound, "unknown host method \(call.method)")
        #endif
    }
}

/// One page load (bridge v1.1 `doc`): the numbering of what it is sent, and its request ids.
@MainActor
final class AkanNativeDocument {
    let id: String
    var seq = 0
    var ids = AkanNativeCallIds()
    /// Calls not answered yet (v1.1 `cancel`). Weak: a call a plugin drops must still reach its
    /// deinit, which answers it.
    var running: [Int64: AkanNativeWeakCall] = [:]
    /// Coalescing events not sent yet, in order (AkanNativeBridge.send).
    var outbox: [(key: String, message: [String: Any])] = []
    var outboxScheduled = false
    /// Set when it ends: owning a resource then closes it at once.
    private(set) var ended = false
    private var resources: [(token: Int, dispose: @MainActor () -> Void)] = []
    private var nextToken = 0

    /// Ties a resource to this page (architecture §3.7 Document scope): `dispose` runs when the page
    /// ends, the last owned first, or right away if it already has (a call that finished after its
    /// page left). Returns a token for `disown`, when the resource was closed on request.
    @discardableResult
    func own(_ dispose: @escaping @MainActor () -> Void) -> Int {
        guard !ended else {
            dispose()
            return 0
        }
        nextToken += 1
        resources.append((nextToken, dispose))
        return nextToken
    }

    func disown(_ token: Int) {
        resources.removeAll { $0.token == token }
    }

    var resourceCount: Int { resources.count }

    /// Marks it ended and hands over its disposers, last owned first.
    func end() -> [@MainActor () -> Void] {
        ended = true
        let all = resources.reversed().map(\.dispose)
        resources = []
        return all
    }

    init(id: String) {
        self.id = id
    }
}

final class AkanNativeWeakCall {
    weak var call: AkanNativeCall?

    init(_ call: AkanNativeCall) {
        self.call = call
    }
}

/// A document's request ids (v1.1 `once`): each is accepted once. Ids grow within a document;
/// recent ones are kept in a set and older ones covered by a floor (CallIds in @akanjs/native/desktop).
struct AkanNativeCallIds {
    private var floor = Int64.min
    private var seen = Set<Int64>()

    mutating func accept(_ id: Int64) -> Bool {
        if id <= floor || seen.contains(id) { return false }
        seen.insert(id)
        if seen.count > 1024 {
            let oldest = seen.sorted().prefix(512)
            for old in oldest { seen.remove(old) }
            floor = oldest.last ?? floor
        }
        return true
    }
}

/// WKUserContentController retains its handlers; this proxy breaks the cycle with the bridge.
final class AkanNativeScriptHandler: NSObject, WKScriptMessageHandlerWithReply {
    weak var bridge: AkanNativeBridge?

    init(_ bridge: AkanNativeBridge) {
        self.bridge = bridge
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage, replyHandler: @escaping @MainActor (Any?, String?) -> Void) {
        MainActor.assumeIsolated {
            guard let bridge else { return replyHandler(nil, "akan-native: bridge gone") }
            bridge.receive(message, reply: replyHandler)
        }
    }
}
