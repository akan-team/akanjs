// Entry point and the App scope (docs/architecture.md §3.7). Compiled with -parse-as-library, so
// @main provides the main symbol.
//
// Scopes: the process (AkanNativeAppServices: which web bundle runs, links, notification taps), a window
// (a scene: its view controller, bridge and plugin instances) and a document (one page load, in
// AkanNativeBridge). A scene can disconnect and connect again while the process lives (memory pressure),
// so nothing that must happen once per launch belongs to a window.

import UIKit
import UserNotifications

@main
final class AkanNativeAppDelegate: UIResponder, UIApplicationDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        AkanNativeFiles.shared.resetSessionDirectory()
        AkanNativeAppServices.shared.start()
        return true
    }

    // APNs (push plugin, O6-2): the system answers registerForRemoteNotifications here.
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        AkanNativeRemoteNotifications.shared.registered(.success(deviceToken))
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: any Error) {
        AkanNativeRemoteNotifications.shared.registered(.failure(error))
    }

    /// A push with content-available (a silent push, or one the app handles in the background).
    func application(_ application: UIApplication, didReceiveRemoteNotification userInfo: [AnyHashable: Any],
                     fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void) {
        let handled = AkanNativeRemoteNotifications.shared.received(userInfo)
        completionHandler(handled ? .newData : .noData)
    }

    /// The scene delegate is given in code, not by class name in Info.plist (swiftc does not
    /// substitute $(PRODUCT_MODULE_NAME)). name: nil, or UIKit logs a missing plist configuration.
    func application(_ application: UIApplication, configurationForConnecting session: UISceneSession, options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: nil, sessionRole: session.role)
        config.delegateClass = AkanNativeSceneDelegate.self
        return config
    }
}

/// What lives as long as the process, whatever happens to its scenes.
@MainActor
final class AkanNativeAppServices {
    static let shared = AkanNativeAppServices()
    /// Tells processes apart in the self-test ($host.info): a window made again keeps this one.
    let instance = UUID().uuidString
    /// The web bundle to serve (UP-2), nil for the one inside the app. Chosen once per process: a
    /// scene that connects again must not count as a new launch of an unconfirmed bundle and roll it
    /// back. Later it is whatever apply() or a rollback made active.
    var bundleRoot: URL? {
        #if AKAN_NATIVE_UPDATES
        AkanNativeUpdates.active.map { AkanNativeUpdates.bundleDirectory($0.bundle) }
        #else
        nil
        #endif
    }
    private(set) var bundleSelections = 0
    /// Windows (view controllers) made in this process.
    var windows = 0
    private var started = false

    func start() {
        guard !started else { return }
        started = true
        #if AKAN_NATIVE_UPDATES
        _ = AkanNativeUpdates.launch()
        #endif
        bundleSelections += 1
        // Before didFinishLaunching returns, as the SDK asks, so a tap that launched the app arrives (C5).
        UNUserNotificationCenter.current().delegate = AkanNativeNotifications.shared
    }
}

final class AkanNativeSceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        // A cold start by URL delivers it here, not to openURLContexts (react-native RCTReactNativeFactory.mm);
        // a universal link (deepLinks.domains) comes as a browsing-web user activity instead.
        let universal = connectionOptions.userActivities.first { $0.activityType == NSUserActivityTypeBrowsingWeb }?.webpageURL
        AkanNativeLinks.shared.connected(connectionOptions.urlContexts.first?.url ?? universal)
        guard let windowScene = scene as? UIWindowScene else { return }
        show(in: windowScene)
    }

    private func show(in windowScene: UIWindowScene) {
        let config = AkanNativeShellConfig.load()
        let window = UIWindow(windowScene: windowScene)
        window.backgroundColor = config.backgroundColor // SH-3
        window.rootViewController = AkanNativeViewController(config: config)
        window.makeKeyAndVisible()
        self.window = window
    }

    /// The scene is gone (the process may stay): its page's document ends.
    func sceneDidDisconnect(_ scene: UIScene) {
        (window?.rootViewController as? AkanNativeViewController)?.windowEnded()
        window = nil
    }

    /// Dev builds ($host.recreate): a new window in the same process, as when a scene connects again.
    func recreate() {
        guard let windowScene = window?.windowScene else { return }
        (window?.rootViewController as? AkanNativeViewController)?.windowEnded()
        AkanNativeLinks.shared.connected(nil)
        show(in: windowScene)
    }

    /// Deep link while running (scene-based apps never get the AppDelegate open-URL call).
    func scene(_ scene: UIScene, openURLContexts contexts: Set<UIOpenURLContext>) {
        for context in contexts { AkanNativeLinks.shared.open(context.url) }
    }

    /// Universal link while running (O5-2): the system verified the domain against the site's
    /// apple-app-site-association file before handing it to the app.
    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        guard userActivity.activityType == NSUserActivityTypeBrowsingWeb, let url = userActivity.webpageURL else { return }
        AkanNativeLinks.shared.open(url)
    }
}

/// URLs the app was opened with (plugins.md S4, C2). The launch URL is the one the process started
/// with and never changes (getLaunchUrl gives the same answer to every page). Every URL, the
/// launch URL included, is also delivered once as an event: to the listeners, or to the first one
/// that subscribes. Side effects belong there, so a reloaded page does not handle a link twice.
@MainActor
final class AkanNativeLinks {
    static let shared = AkanNativeLinks()
    private(set) var launchURL: URL?
    private var launched = false
    /// Every URL, retained until a listener takes it (AkanNativeRetained, the shared C2 rule).
    private let events = AkanNativeRetained<URL>()

    /// A scene connected, with the URL it was opened by (if any).
    func connected(_ url: URL?) {
        if !launched {
            launched = true
            launchURL = url
        }
        if let url { open(url) }
    }

    private var owners: [String: ObjectIdentifier] = [:]

    /// Subscribes; URLs that arrived with no listener are delivered right away. `owner` is the
    /// window (AkanNativePluginContext.owner): its listeners go when it ends. A listener returns false
    /// when it is gone (a plugin of a window that ended).
    func listen(owner: ObjectIdentifier, _ listener: @escaping (URL) -> Bool) -> UUID {
        let id = UUID()
        owners[id.uuidString] = owner
        events.listen(id.uuidString, listener)
        return id
    }

    func unlisten(_ id: UUID) {
        owners[id.uuidString] = nil
        events.unlisten(id.uuidString)
    }

    /// A window ended: its listeners go (architecture review rule: every page registration has an owner).
    func removeAll(owner: ObjectIdentifier) {
        for (key, o) in owners where o == owner {
            owners[key] = nil
            events.unlisten(key)
        }
    }

    var listenerCount: Int { events.listenerCount }

    func open(_ url: URL) {
        events.emit(url, retain: true)
    }
}

/// What the app delegate hears from APNs, for the push plugin (O6-2): the registration result (kept, so
/// a plugin made later still gets it) and background deliveries.
@MainActor
final class AkanNativeRemoteNotifications {
    static let shared = AkanNativeRemoteNotifications()
    private(set) var lastRegistration: Result<Data, any Error>?
    /// By owner (the window): a window made again replaces its listener instead of adding one.
    private var onRegistration: [ObjectIdentifier: (Result<Data, any Error>) -> Void] = [:]
    /// The window whose plugin takes background deliveries (the latest); returns whether it took one.
    private var receiver: (owner: ObjectIdentifier, take: ([AnyHashable: Any]) -> Bool)?

    func registered(_ result: Result<Data, any Error>) {
        lastRegistration = result
        for listener in Array(onRegistration.values) { listener(result) }
    }

    func listen(owner: ObjectIdentifier, registration: @escaping (Result<Data, any Error>) -> Void, receive: @escaping ([AnyHashable: Any]) -> Bool) {
        onRegistration[owner] = registration
        receiver = (owner, receive)
    }

    func removeAll(owner: ObjectIdentifier) {
        onRegistration[owner] = nil
        if receiver?.owner == owner { receiver = nil }
    }

    var listenerCount: Int { onRegistration.count }

    func received(_ userInfo: [AnyHashable: Any]) -> Bool {
        receiver?.take(userInfo) ?? false
    }
}

/// UNUserNotificationCenter has one delegate: the shell owns it from launch on (plugins.md C5) and
/// routes each notification to the plugin whose handler claims it. Taps no handler took yet (a cold
/// start before the page, or a window that ended) are kept for the next handler that claims them.
/// A notification nobody claims is not presented in the foreground, as without a delegate.
@MainActor
final class AkanNativeNotifications: NSObject, UNUserNotificationCenterDelegate {
    static let shared = AkanNativeNotifications()

    struct Handler {
        /// Whether this plugin posted the notification.
        let claims: @Sendable (UNNotificationRequest) -> Bool
        /// Foreground delivery; returns how to present it.
        let willPresent: @MainActor (UNNotification) -> UNNotificationPresentationOptions
        /// A tap or an action; false to keep it for later (no page listens, or the window ended).
        let didReceive: @MainActor (UNNotificationResponse) -> Bool
    }

    private var handlers: [String: Handler] = [:]
    private var owners: [String: ObjectIdentifier] = [:]
    private var pending: [UNNotificationResponse] = []

    /// Registers (or replaces) a plugin's handler and hands it the taps it claims that were kept.
    /// `owner`: the window (AkanNativePluginContext.owner); the handler goes when it ends.
    func register(_ plugin: String, owner: ObjectIdentifier, _ handler: Handler) {
        handlers[plugin] = handler
        owners[plugin] = owner
        replay(plugin)
    }

    /// A window ended: its plugins' handlers go; their taps wait for the next window's (pending).
    func removeAll(owner: ObjectIdentifier) {
        for (plugin, o) in owners where o == owner {
            owners[plugin] = nil
            handlers[plugin] = nil
        }
    }

    var handlerCount: Int { handlers.count }

    /// Offers the kept taps to a plugin again (its page started listening).
    func replay(_ plugin: String) {
        guard let handler = handlers[plugin] else { return }
        let kept = pending
        pending = kept.filter { !(handler.claims($0.notification.request) && handler.didReceive($0)) }
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                            withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        let box = UncheckedBox((notification, completionHandler))
        Self.onMain {
            let (notification, done) = box.value
            let claimed = self.handlers.first { $0.value.claims(notification.request) }
            AkanNativeLog.info("notification in front: \(notification.request.identifier) → \(claimed?.key ?? "no plugin (not shown)")")
            done(claimed?.value.willPresent(notification) ?? [])
        }
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
                                            withCompletionHandler completionHandler: @escaping () -> Void) {
        let box = UncheckedBox((response, completionHandler))
        Self.onMain {
            let (response, done) = box.value
            let claimed = self.handlers.first { $0.value.claims(response.notification.request) }
            let taken = claimed?.value.didReceive(response) == true
            AkanNativeLog.info("notification \(response.actionIdentifier): \(response.notification.request.identifier) → \(claimed?.key ?? "no plugin"), \(taken ? "delivered" : "kept for the page")")
            if !taken { self.pending = Array((self.pending + [response]).suffix(20)) }
            done()
        }
    }

    nonisolated private static func onMain(_ work: @escaping @MainActor () -> Void) {
        if Thread.isMainThread { MainActor.assumeIsolated(work) } else { DispatchQueue.main.async { MainActor.assumeIsolated(work) } }
    }
}
