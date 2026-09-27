// WKWebView host (docs/architecture.md §3.4). Settings verified in docs/research/ios.md §2.3.

import UIKit
import WebKit

/// Removes the form accessory bar (^ v ✓) with public API when configured (wry does the same).
final class AkanNativeWebView: WKWebView {
    /// Posted when the view's user interface style changes on iOS 16, which has no trait change
    /// registration (appearance plugin); iOS 17 and later use registerForTraitChanges.
    static let styleDidChange = Notification.Name("AkanNativeWebViewStyleDidChange")

    var hidesFormAccessoryBar = false
    override var inputAccessoryView: UIView? { hidesFormAccessoryBar ? nil : super.inputAccessoryView }

    override func traitCollectionDidChange(_ previous: UITraitCollection?) {
        super.traitCollectionDidChange(previous)
        if #unavailable(iOS 17.0), previous?.userInterfaceStyle != traitCollection.userInterfaceStyle {
            NotificationCenter.default.post(name: Self.styleDidChange, object: self)
        }
    }
}

@MainActor
final class AkanNativeViewController: UIViewController, WKNavigationDelegate, WKUIDelegate {
    let config: AkanNativeShellConfig
    private let bridge = AkanNativeBridge()
    private var webView: AkanNativeWebView!
    private var schemeHandler: AkanNativeSchemeHandler!
    /// Covers the WebView with the launch screen's picture until the page has loaded (SH-6).
    private var splashView: UIView?
    static let origin = URL(string: "app://localhost/")!

    init(config: AkanNativeShellConfig) {
        self.config = config
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError("not used") }

    // S1: the status bar follows the page's light/dark appearance (UIViewControllerBasedStatusBarAppearance).
    override var preferredStatusBarStyle: UIStatusBarStyle { .default }

    /// screen-orientation plugin: the orientations the page locked to (already intersected with
    /// Info.plist, or UIKit throws); nil = the app's default set.
    var orientationLock: UIInterfaceOrientationMask? {
        didSet { setNeedsUpdateOfSupportedInterfaceOrientations() }
    }

    override var supportedInterfaceOrientations: UIInterfaceOrientationMask {
        orientationLock ?? super.supportedInterfaceOrientations
    }

    override func loadView() {
        let app = AkanNativeAppServices.shared
        app.start() // done at launch; kept for a view controller made before it
        app.windows += 1
        schemeHandler = AkanNativeSchemeHandler(root: app.bundleRoot ?? AkanNativeResources.url("app"), devServer: config.devServer) { [weak self] in self?.initScript() ?? Data() }

        let configuration = WKWebViewConfiguration()
        configuration.setURLSchemeHandler(schemeHandler, forURLScheme: "app")
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []
        configuration.dataDetectorTypes = []
        configuration.preferences.isElementFullscreenEnabled = true
        configuration.userContentController.addScriptMessageHandler(AkanNativeScriptHandler(bridge), contentWorld: .page, name: "akanNative")

        let webView = AkanNativeWebView(frame: .zero, configuration: configuration)
        webView.hidesFormAccessoryBar = config.hideFormAccessoryBar
        keyboardResizes = config.keyboardResizes
        // SH-3: with isOpaque = true WebKit paints white before the first frame, even in dark mode (verified).
        webView.isOpaque = false
        webView.backgroundColor = config.backgroundColor
        webView.scrollView.backgroundColor = config.backgroundColor
        webView.underPageBackgroundColor = config.backgroundColor
        // SH-2: pages handle env(safe-area-inset-*) themselves (viewport-fit=cover).
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.allowsLinkPreview = false
        // WV-2. Before iOS 16.4 debug builds (get-task-allow) are inspectable and release builds are not.
        if #available(iOS 16.4, *) { webView.isInspectable = config.devtools }
        webView.navigationDelegate = self
        webView.uiDelegate = self
        self.webView = webView

        bridge.webView = webView
        bridge.viewController = self
        bridge.dev = config.dev
        bridge.register(AkanNativeGeneratedPlugins.all)

        let root = UIView()
        root.backgroundColor = config.backgroundColor
        webView.translatesAutoresizingMaskIntoConstraints = false
        root.addSubview(webView)
        let bottom = webView.bottomAnchor.constraint(equalTo: root.bottomAnchor)
        webViewBottom = bottom
        NSLayoutConstraint.activate([
            webView.leadingAnchor.constraint(equalTo: root.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: root.trailingAnchor),
            webView.topAnchor.constraint(equalTo: root.topAnchor),
            bottom,
        ])
        // Keyboard mode "resize" (O6-1): the web view ends at the keyboard's top, with its animation.
        for name in [UIResponder.keyboardWillChangeFrameNotification, UIResponder.keyboardWillHideNotification] {
            keyboardObservers.append(NotificationCenter.default.addObserver(forName: name, object: nil, queue: .main) { [weak self] note in
                let info = UncheckedBox(note.userInfo ?? [:])
                MainActor.assumeIsolated { self?.keyboardMoved(hiding: name == UIResponder.keyboardWillHideNotification, info.value) }
            })
        }
        addSplash(to: root)
        view = root
    }

    private var webViewBottom: NSLayoutConstraint?
    private var keyboardObservers: [NSObjectProtocol] = []
    private var keyboardOverlap: CGFloat = 0

    /// Keyboard mode (O6-1, keyboard.setResizeMode): true ("resize", the default) shortens the web view
    /// by the keyboard; false ("none") lets the keyboard cover the page.
    var keyboardResizes = true {
        didSet { applyKeyboard(duration: 0, options: []) }
    }

    /// How much of this view the keyboard covers, in points: its end frame converted from the screen
    /// (react-native RCTKeyboardObserver), so floating iPad keyboards count as nothing.
    func keyboardCover(_ info: [AnyHashable: Any], hiding: Bool) -> CGFloat {
        guard !hiding, let window = view.window, let end = (info[UIResponder.keyboardFrameEndUserInfoKey] as? NSValue)?.cgRectValue else { return 0 }
        return max(0, view.bounds.intersection(view.convert(end, from: window.screen.coordinateSpace)).height)
    }

    private func keyboardMoved(hiding: Bool, _ info: [AnyHashable: Any]) {
        keyboardOverlap = keyboardCover(info, hiding: hiding)
        let duration = (info[UIResponder.keyboardAnimationDurationUserInfoKey] as? NSNumber)?.doubleValue ?? 0
        let curve = (info[UIResponder.keyboardAnimationCurveUserInfoKey] as? NSNumber)?.uintValue ?? 7
        applyKeyboard(duration: duration, options: UIView.AnimationOptions(rawValue: curve << 16))
    }

    private func applyKeyboard(duration: TimeInterval, options: UIView.AnimationOptions) {
        let constant = keyboardResizes ? -keyboardOverlap : 0
        guard let bottom = webViewBottom, bottom.constant != constant else { return }
        bottom.constant = constant
        guard duration > 0, view.window != nil else { return view.layoutIfNeeded() }
        UIView.animate(withDuration: duration, delay: 0, options: [options, .beginFromCurrentState]) { self.view.layoutIfNeeded() }
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        if let devServer = config.devServer { AkanNativeLog.info("pages from \(devServer.absoluteString) (akan-native dev --hmr)") }
        webView.load(URLRequest(url: URL(string: config.startPath, relativeTo: Self.origin)?.absoluteURL ?? Self.origin))
        DispatchQueue.main.asyncAfter(deadline: .now() + config.splashTimeout) { [weak self] in
            guard let self, self.splashView != nil else { return }
            // Capacitor SplashScreen.swift warns the same way: the app looks slower than it is.
            AkanNativeLog.info("splash hidden after the \(Int(self.config.splashTimeout * 1000)) ms timeout; call splash.hide() once the UI is ready (or raise splash.timeout)")
            self.hideSplash(fadeOut: 0.2)
        }
    }

    // MARK: Splash (SH-6)

    /// Same picture as UILaunchScreen (color and image from Assets.car, the image centered at its
    /// point size), so the switch from the system launch screen to the app is invisible.
    private func addSplash(to root: UIView) {
        let splash = UIView()
        splash.backgroundColor = UIColor(named: "AkanNativeSplashBackground") ?? config.backgroundColor
        splash.translatesAutoresizingMaskIntoConstraints = false
        root.addSubview(splash)
        var constraints = [
            splash.leadingAnchor.constraint(equalTo: root.leadingAnchor),
            splash.trailingAnchor.constraint(equalTo: root.trailingAnchor),
            splash.topAnchor.constraint(equalTo: root.topAnchor),
            splash.bottomAnchor.constraint(equalTo: root.bottomAnchor),
        ]
        if let image = UIImage(named: "AkanNativeSplash") {
            let imageView = UIImageView(image: image)
            imageView.translatesAutoresizingMaskIntoConstraints = false
            splash.addSubview(imageView)
            constraints += [
                imageView.centerXAnchor.constraint(equalTo: splash.centerXAnchor),
                imageView.centerYAnchor.constraint(equalTo: splash.centerYAnchor),
            ]
        }
        NSLayoutConstraint.activate(constraints)
        splashView = splash
    }

    /// Fades the splash out and removes it. Later calls do nothing.
    // MARK: web bundle updates (UP-2)

    private var readyTimer: Timer?

    /// A bundle on trial must call notifyReady() within updates.readyTimeout of loading.
    private func startReadyTimer() {
        readyTimer?.invalidate()
        #if AKAN_NATIVE_UPDATES
        guard AkanNativeUpdates.onTrial, let timeout = AkanNativeUpdates.config?.readyTimeout else { return }
        readyTimer = Timer.scheduledTimer(withTimeInterval: timeout, repeats: false) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self, AkanNativeUpdates.onTrial else { return }
                self.serveBundle(AkanNativeUpdates.rollback())
            }
        }
        #endif
    }

    /// Serves another web bundle (nil: the app's own) and loads it from the start.
    func serveBundle(_ root: URL?) {
        readyTimer?.invalidate()
        schemeHandler.root = root ?? AkanNativeResources.url("app")
        webView.load(URLRequest(url: Self.origin))
    }

    func hideSplash(fadeOut: TimeInterval) {
        guard let splash = splashView else { return }
        splashView = nil
        UIView.animate(withDuration: max(0, fadeOut), delay: 0, options: [.curveLinear, .beginFromCurrentState]) {
            splash.alpha = 0
        } completion: { _ in
            splash.removeFromSuperview()
        }
    }

    // MARK: /__akan_native/init.js

    private static let initPrefix = "window.__AKAN_NATIVE__=(function(o,b,e){for(var k in b)o[k]=b[k];o.env=e;return o})(window.__AKAN_NATIVE__||{},"
    private static let initSuffix = ");\n"

    /// INIT_PREFIX + boot.json + "," + env.runtime.json + ");" (architecture §3.1). Dev builds take
    /// AKAN_NATIVE_PUBLIC_* from the process environment (`SIMCTL_CHILD_AKAN_NATIVE_PUBLIC_*` with simctl launch).
    private func initScript() -> Data {
        let boot = AkanNativeResources.text("boot.json").trimmingCharacters(in: .whitespacesAndNewlines)
        // A downloaded bundle brings the env it was published with (UP-2).
        #if AKAN_NATIVE_UPDATES
        let envFile = AkanNativeUpdates.active.map { AkanNativeUpdates.bundleDirectory($0.bundle).appendingPathComponent("env.runtime.json") } ?? AkanNativeResources.url("env.runtime.json")
        #else
        let envFile = AkanNativeResources.url("env.runtime.json")
        #endif
        var env = ((try? String(contentsOf: envFile, encoding: .utf8)) ?? "{}").trimmingCharacters(in: .whitespacesAndNewlines)
        if config.dev {
            let overrides = ProcessInfo.processInfo.environment.filter { $0.key.hasPrefix("AKAN_NATIVE_PUBLIC_") }
            if !overrides.isEmpty, var merged = (try? JSONSerialization.jsonObject(with: Data(env.utf8))) as? [String: Any] {
                for (key, value) in overrides { merged[String(key.dropFirst("AKAN_NATIVE_".count))] = value }
                env = AkanNativeBridge.encode(merged) ?? env
            }
        }
        // The shell's origin and engine: one value every origin comparison uses (`__AKAN_NATIVE__.origin`).
        let engine = "window.__AKAN_NATIVE__.origin=\"app://localhost\";window.__AKAN_NATIVE__.engine=\"wkwebview\";window.__AKAN_NATIVE__.engineVersion=\"\(UIDevice.current.systemVersion)\";\n"
        // A new document starts with the current safe area (N14); later changes are pushed.
        return Data((Self.initPrefix + boot + "," + env + Self.initSuffix + engine + Self.cssInsets(cssInsets)).utf8)
    }

    /// The safe area the page's --akan-native-safe-area-* variables hold (N14), in CSS px.
    private var cssInsets = UIEdgeInsets.zero

    /// The same variables as on Android, so a page reads one set of values on both (env() works here too).
    private static func cssInsets(_ i: UIEdgeInsets) -> String {
        let px = { (v: CGFloat) in "\(Double(v.rounded(.toNearestOrAwayFromZero)))px" }
        return "document.documentElement&&(function(s){s.setProperty('--akan-native-safe-area-top','\(px(i.top))');"
            + "s.setProperty('--akan-native-safe-area-right','\(px(i.right))');s.setProperty('--akan-native-safe-area-bottom','\(px(i.bottom))');"
            + "s.setProperty('--akan-native-safe-area-left','\(px(i.left))')})(document.documentElement.style);\n"
    }

    /// The web view's safe area changed (rotation, the keyboard shortening it in "resize" mode): push it.
    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        guard let webView, webView.safeAreaInsets != cssInsets else { return }
        cssInsets = webView.safeAreaInsets
        webView.evaluateJavaScript(Self.cssInsets(cssInsets))
    }

    // MARK: WKNavigationDelegate

    /// SH-4 and L0 (AkanNativeKernel.decideNavigation, the rule every host shares): the WebView never
    /// leaves the app origin. A top-level link of an external scheme opens in the system instead,
    /// only while the app is in front (Capacitor WebViewDelegationHandler does the same) and at most
    /// once a second; frames load web content but open nothing; everything else goes nowhere.
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping @MainActor (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { return decisionHandler(.cancel) }
        let topLevel = action.targetFrame?.isMainFrame ?? true // nil targetFrame = new window
        switch AkanNativeKernel.decideNavigation(url.absoluteString, topLevel: topLevel, origin: "app://localhost", extra: config.externalSchemes) {
        case .load:
            decisionHandler(.allow)
        case .open:
            decisionHandler(.cancel)
            openExternally(url)
        case .drop:
            decisionHandler(.cancel)
            AkanNativeLog.info("blocked a \(url.scheme ?? "?"): navigation (\(topLevel ? "top level" : "a frame"))")
        }
    }

    private func openExternally(_ url: URL) {
        guard view.window?.windowScene?.activationState == .foregroundActive else { return }
        guard AkanNativeExternal.allowed() else { return AkanNativeLog.info("not opening \(url.scheme ?? "?"): link: at most one per second leaves the app") }
        UIApplication.shared.open(url)
    }

    /// The previous document is gone once the new one commits: a provisional navigation can still
    /// fail or turn into a download and leave the page in place.
    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        bridge.endDocument()
    }

    /// The window is going away (the scene disconnected, or $host.recreate): its page's document ends.
    func windowEnded() {
        readyTimer?.invalidate()
        bridge.windowEnded()
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        if config.splashAutoHide { hideSplash(fadeOut: 0.2) }
        startReadyTimer()
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        AkanNativeLog.info("web content process terminated, reloading") // plugins.md S10
        // The page is gone now, not when the reload commits: its calls end and its subscriptions stop,
        // so what arrives meanwhile (a notification tap) waits for the next page instead of going to
        // the dead one (architecture review stage 3: a renderer that ends ends the document). iOS ends
        // background apps' web content processes under memory pressure.
        bridge.endDocument()
        webView.reload()
    }

    // MARK: WKUIDelegate

    /// window.open and target=_blank: external URLs go to the system, as links do. The app's own
    /// pages open nothing: handed to the system, app://localhost/… (path and query included) would
    /// reach whichever installed app claims the generic "app" scheme.
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        guard let url = action.request.url else { return nil }
        switch AkanNativeKernel.decideNavigation(url.absoluteString, topLevel: true, origin: "app://localhost", extra: config.externalSchemes) {
        case .open: openExternally(url)
        case .load: AkanNativeLog.info("window.open(\(url.absoluteString)) opens nothing: the app has one window")
        case .drop: AkanNativeLog.info("window.open of a \(url.scheme ?? "?"): URL opens nothing")
        }
        return nil
    }

    // Without these three, alert/confirm/prompt are silently ignored (plugins.md S7).
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping @MainActor () -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
        presentPanel(alert, otherwise: completionHandler)
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping @MainActor (Bool) -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(false) })
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(true) })
        presentPanel(alert) { completionHandler(false) }
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping @MainActor (String?) -> Void) {
        let alert = UIAlertController(title: nil, message: prompt, preferredStyle: .alert)
        alert.addTextField { $0.text = defaultText }
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(nil) })
        alert.addAction(UIAlertAction(title: "OK", style: .default) { [weak alert] _ in completionHandler(alert?.textFields?.first?.text) })
        presentPanel(alert) { completionHandler(nil) }
    }

    /// Presents a panel, or completes at once when nothing can present (also during a transition
    /// that does not end, AkanNativePresent): a completion handler that is never called hangs the page
    /// (a bug Capacitor has).
    private func presentPanel(_ alert: UIAlertController, otherwise: @escaping @MainActor () -> Void) {
        AkanNativePresent.present(alert, over: self, otherwise: otherwise)
    }

    /// getUserMedia (plugins.md S6): the app origin gets it without WebKit's second prompt.
    /// The OS camera permission (NSCameraUsageDescription) still applies.
    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType, decisionHandler: @escaping @MainActor (WKPermissionDecision) -> Void) {
        decisionHandler(origin.protocol == "app" && origin.host == "localhost" && frame.isMainFrame ? .grant : .deny)
    }
}
