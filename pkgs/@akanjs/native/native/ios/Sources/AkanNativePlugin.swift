// Plugin API for iOS (docs/architecture.md §6). Plugins are compiled into the app module together
// with the shell. Everything a plugin touches runs on the main actor; resolve/reject may be called
// from any thread (docs/research/ios.md §4.4: Swift 6 mode compiles without warnings this way).

import UIKit
import WebKit

enum AkanNativeErrorCode: String, Sendable {
    case unsupported = "UNSUPPORTED"
    case permissionDenied = "PERMISSION_DENIED"
    case cancelled = "CANCELLED"
    /// The page's time limit ran out (AbortSignal.timeout); CANCELLED is any other abort.
    case timeout = "TIMEOUT"
    case invalidArgs = "INVALID_ARGS"
    case notFound = "NOT_FOUND"
    /// The app's capabilities do not grant this (PL-11). permissionDenied is the OS or the user.
    case notAllowed = "NOT_ALLOWED"
    case internalError = "INTERNAL"
}

/// A native plugin. The shell creates one instance per launch, listed in the generated
/// AkanNativeGeneratedPlugins.swift (no reflection).
@MainActor
protocol AkanNativePlugin: AnyObject {
    static var id: String { get }
    init(context: AkanNativePluginContext)
    func handle(_ call: AkanNativeCall)
    /// First page listener for `event` subscribed ($listen).
    func startListening(_ event: String)
    /// Last page listener for `event` left ($unlisten), or the page reloaded.
    func stopListening(_ event: String)
    /// The page's document (one page load) ended, after its calls, listeners and owned resources
    /// (AkanNativeDocument.own) were closed: for per-page state kept by document id.
    func documentEnded(_ document: String)
}

extension AkanNativePlugin {
    func startListening(_ event: String) {}
    func stopListening(_ event: String) {}
    func documentEnded(_ document: String) {}
}

/// One bridge call. Resolve or reject exactly once, from any thread: WebKit aborts the app if a
/// reply handler runs twice (verified), so later calls are ignored. A call dropped without an
/// answer is rejected with INTERNAL instead of leaving the page's Promise pending.
///
/// The page may give up on a call (its AbortSignal, bridge v1.1 `cancel`), and a call ends with its
/// page: the bridge then answers it (CANCELLED or TIMEOUT) and runs the `onCancel` handlers, where a
/// plugin stops the work (closes a dialog, invalidates an LAContext, stops location updates).
final class AkanNativeCall: @unchecked Sendable {
    let method: String
    let args: [String: Any]
    /// What the app's capabilities allow this call (PL-11); nil = only the plugin's own rules.
    /// Enforce it with `call.scope?.permits([...], pathFields:, urlFields:) ?? true`.
    var scope: AkanNativeScope?
    private let lock = NSLock()
    private var finish: (@MainActor ([String: Any]) -> Void)?
    private var cancelled = false
    private var cancelHandlers: [@MainActor () -> Void] = []
    /// The calling page's document (set by the bridge): `call.document?.own { … }` ties a resource
    /// to the page, closed when it ends. nil for the bridge's own calls.
    @MainActor weak var document: AkanNativeDocument?

    /// True once the page gave up on the call or went away; answers after that are dropped.
    var isCancelled: Bool {
        lock.lock()
        defer { lock.unlock() }
        return cancelled
    }

    /// Runs `handler` on the main actor when the call is cancelled (right away if it already was).
    /// Not after the call was answered.
    @MainActor
    func onCancel(_ handler: @escaping @MainActor () -> Void) {
        lock.lock()
        let now = cancelled
        if !now, finish != nil { cancelHandlers.append(handler) }
        lock.unlock()
        if now { handler() }
    }

    /// The bridge ends the call: the handlers run, then the page gets `code` (it has stopped waiting).
    @MainActor
    func cancel(_ code: AkanNativeErrorCode, _ message: String) {
        lock.lock()
        guard !cancelled, finish != nil else { return lock.unlock() }
        cancelled = true
        let handlers = cancelHandlers
        cancelHandlers = []
        lock.unlock()
        for handler in handlers { handler() }
        reject(code, message)
    }

    init(method: String, args: [String: Any], finish: @escaping @MainActor ([String: Any]) -> Void) {
        self.method = method
        self.args = args
        self.finish = finish
    }

    /// Rejects with NOT_ALLOWED unless `value` is inside the call's scope; true when allowed.
    /// `fold`: the path fields name files on a case-insensitive volume.
    func inScope(_ value: [String: String], pathFields: Set<String> = [], urlFields: Set<String> = [], fold: Bool = false, what: String) -> Bool {
        if scope?.permits(value, pathFields: pathFields, urlFields: urlFields, fold: fold) ?? true { return true }
        reject(.notAllowed, "\(what) is outside the app's capabilities")
        return false
    }

    deinit {
        guard let finish else { return }
        let body = UncheckedBox(["ok": false, "error": ["code": "INTERNAL", "message": "\(method) was dropped without an answer"]] as [String: Any])
        DispatchQueue.main.async { MainActor.assumeIsolated { finish(body.value) } }
    }

    func resolve(_ result: Any? = nil) {
        var body: [String: Any] = ["ok": true]
        if let result { body["result"] = result }
        complete(body)
    }

    /// `data`: details the page can act on (JSON values), e.g. ["reason": "packageManaged"].
    /// `retryable`: the same call may work later.
    func reject(_ code: AkanNativeErrorCode, _ message: String, data: Any? = nil, retryable: Bool = false) {
        var error: [String: Any] = ["code": code.rawValue, "message": message]
        if let data { error["data"] = data }
        if retryable { error["retryable"] = true }
        complete(["ok": false, "error": error])
    }

    private func complete(_ body: [String: Any]) {
        lock.lock()
        let f = finish
        finish = nil
        cancelHandlers = []
        lock.unlock()
        guard let f else { return }
        let box = UncheckedBox(body)
        if Thread.isMainThread {
            MainActor.assumeIsolated { f(box.value) }
        } else {
            DispatchQueue.main.async { MainActor.assumeIsolated { f(box.value) } }
        }
    }

    func string(_ key: String) -> String? { args[key] as? String }
    func bool(_ key: String) -> Bool? { (args[key] as? NSNumber)?.boolValue }
    func int(_ key: String) -> Int? { (args[key] as? NSNumber)?.intValue }
    func double(_ key: String) -> Double? { (args[key] as? NSNumber)?.doubleValue }
}

/// Presenting from the topmost view controller. UIKit refuses to present while a presentation or
/// dismissal is animating (an alert right after the previous one closed, a picker asked for as a
/// sheet goes away) and only logs it; a completion handler or a plugin call waiting for that
/// controller would then wait forever. So a request during a transition waits for it to end (up
/// to three times), and `otherwise` runs when there is no window or the presentation was refused.
@MainActor
enum AkanNativePresent {
    static func present(_ controller: UIViewController, over root: UIViewController?, attempt: Int = 0,
                        completion: (@MainActor () -> Void)? = nil, otherwise: @escaping @MainActor () -> Void)
    {
        guard var top = root, top.viewIfLoaded?.window != nil else { return otherwise() }
        while let next = top.presentedViewController { top = next }
        if top.isBeingPresented || top.isBeingDismissed, attempt < 3, let coordinator = top.transitionCoordinator {
            coordinator.animate(alongsideTransition: nil) { _ in
                present(controller, over: root, attempt: attempt + 1, completion: completion, otherwise: otherwise)
            }
            return
        }
        if top.isBeingDismissed, let below = top.presentingViewController { top = below }
        top.present(controller, animated: true, completion: completion)
        DispatchQueue.main.async {
            MainActor.assumeIsolated {
                if controller.presentingViewController == nil { otherwise() } // refused ("Attempt to present …")
            }
        }
    }
}

/// What the shell offers to a plugin.
@MainActor
final class AkanNativePluginContext {
    let pluginId: String
    private weak var bridge: AkanNativeBridge?

    /// The window: what App services (AkanNativeLinks, AkanNativeNotifications, AkanNativeRemoteNotifications) file
    /// this plugin's listeners under, so they go when the window ends.
    let owner: ObjectIdentifier

    init(pluginId: String, bridge: AkanNativeBridge) {
        self.pluginId = pluginId
        self.bridge = bridge
        owner = ObjectIdentifier(bridge)
    }

    var viewController: UIViewController? { bridge?.viewController }
    /// The view controller to present from (the topmost presented one). Prefer `present`.
    var presenter: UIViewController? {
        var top = bridge?.viewController
        while let next = top?.presentedViewController { top = next }
        return top
    }

    /// Presents `controller` over the app (AkanNativePresent): waits out a running transition, and runs
    /// `otherwise` instead when nothing can present or UIKit refused, so the call can be answered.
    func present(_ controller: UIViewController, completion: (@MainActor () -> Void)? = nil, otherwise: @escaping @MainActor () -> Void) {
        AkanNativePresent.present(controller, over: viewController, completion: completion, otherwise: otherwise)
    }
    var webView: WKWebView? { bridge?.webView }
    var windowScene: UIWindowScene? { bridge?.webView?.window?.windowScene }

    /// Pushes an event of this plugin to the page. Delivered only while the page listens.
    func emit(_ event: String, _ data: Any? = nil) {
        bridge?.emit(plugin: pluginId, event: event, data: data)
    }

    /// Serves a local file at /__akan_native/file/<id> for the rest of the session and returns a FileRef.
    func registerFile(_ url: URL, mime: String) -> [String: Any] {
        let size = (try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
        return ["url": AkanNativeFiles.shared.register(url, mime: mime), "mime": mime, "size": size]
    }

    /// The file behind a FileRef URL ("/__akan_native/file/<id>" or "app://localhost/__akan_native/file/<id>"),
    /// e.g. to hand a photo taken earlier to another API. nil if it is not a file of this session.
    func file(_ ref: String) -> (url: URL, mime: String)? {
        var path = ref
        if path.hasPrefix("app://localhost") { path.removeFirst("app://localhost".count) }
        guard path.hasPrefix("/__akan_native/file/") else { return nil }
        return AkanNativeFiles.shared.lookup(String(path.dropFirst("/__akan_native/file/".count)))
    }

    /// Switches the page to another web bundle (UP-2, AkanNativeUpdates) and reloads it; nil: the app's own.
    func serveBundle(_ root: URL?) {
        (bridge?.viewController as? AkanNativeViewController)?.serveBundle(root)
    }

    /// Fades out the launch screen cover (SH-6); nothing happens once it is gone.
    func hideSplash(fadeOutDuration: TimeInterval) {
        (bridge?.viewController as? AkanNativeViewController)?.hideSplash(fadeOut: fadeOutDuration)
    }

    /// A fresh path in the session's temporary folder (emptied at every launch).
    func temporaryFile(_ ext: String) -> URL {
        AkanNativeFiles.shared.directory.appendingPathComponent("\(UUID().uuidString.lowercased()).\(ext)")
    }
}

final class UncheckedBox<T>: @unchecked Sendable {
    let value: T
    init(_ value: T) { self.value = value }
}
