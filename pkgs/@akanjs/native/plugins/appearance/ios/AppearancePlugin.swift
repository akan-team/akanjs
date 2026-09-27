import UIKit

/// overrideUserInterfaceStyle on every window of every connected scene, as RN does
/// (react-native/packages/react-native/React/CoreModules/RCTAppearance.mm:112-126): the window
/// carries the style to the WKWebView (prefers-color-scheme), presented controllers, alerts and
/// the status bar. The VC's own override would miss controllers presented by plugins.
/// - The setting is stored in UserDefaults and applied when the plugin starts, which is inside the
///   view controller's loadView: the window exists, nothing is drawn yet (no flash of the other scheme).
/// - mode: the fixed setting, or the scene's style (the system's, unaffected by window overrides).
/// - change: a trait registration on the web view sees both system switches and set(). iOS flips
///   the style of a backgrounded app twice to snapshot both appearances, so changes are only
///   reported while not in the background, and checked again on the way back to the foreground.
/// Arguments arrive decoded and checked by the generated AppearancePluginSpec (PL-10).
final class AppearancePlugin: AppearancePluginSpec {
    static let id = "appearance"
    private static let key = "akan-native.appearance"

    private let context: AkanNativePluginContext
    /// iOS 17+: the trait change registration. iOS 16: the observer of AkanNativeWebView.styleDidChange.
    private var registration: Any?
    private var foreground: (any NSObjectProtocol)?
    private var last: AppearanceState?

    init(context: AkanNativePluginContext) {
        self.context = context
        let setting = Self.setting
        if setting != .system { Self.apply(setting) }
    }

    private static var setting: AppearanceSetting {
        UserDefaults.standard.string(forKey: key).flatMap(AppearanceSetting.init(rawValue:)) ?? .system
    }

    func get(_ reply: AkanNativeReply<AppearanceState>) {
        reply.resolve(state())
    }

    func set(_ args: AppearanceSetArgs, _ reply: AkanNativeReply<Void>) {
        if args.mode == .system {
            UserDefaults.standard.removeObject(forKey: Self.key)
        } else {
            UserDefaults.standard.set(args.mode.rawValue, forKey: Self.key)
        }
        Self.apply(args.mode)
        reply.resolve()
        // A setting change that keeps the drawn scheme (system is dark, set dark) moves no trait.
        report()
    }

    func startListening(_ event: String) {
        guard event == "change", registration == nil, let webView = context.webView else { return }
        last = state()
        if #available(iOS 17.0, *) {
            registration = webView.registerForTraitChanges([UITraitUserInterfaceStyle.self]) { [weak self] (_: UIView, _: UITraitCollection) in
                self?.report()
            }
        } else {
            registration = NotificationCenter.default.addObserver(forName: AkanNativeWebView.styleDidChange, object: webView, queue: .main) { [weak self] _ in
                MainActor.assumeIsolated { self?.report() }
            }
        }
        foreground = NotificationCenter.default.addObserver(forName: UIApplication.willEnterForegroundNotification, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.report() }
        }
    }

    func stopListening(_ event: String) {
        guard event == "change" else { return }
        if #available(iOS 17.0, *), let registration = registration as? any UITraitChangeRegistration {
            context.webView?.unregisterForTraitChanges(registration)
        } else if let registration = registration as? any NSObjectProtocol {
            NotificationCenter.default.removeObserver(registration)
        }
        if let foreground { NotificationCenter.default.removeObserver(foreground) }
        registration = nil
        foreground = nil
        last = nil
    }

    private func report() {
        guard registration != nil, UIApplication.shared.applicationState != .background else { return }
        let next = state()
        if let last, last.mode == next.mode, last.setting == next.setting { return }
        last = next
        AppearanceEvents(context).change(next)
    }

    private func state() -> AppearanceState {
        let setting = Self.setting
        switch setting {
        case .light: return AppearanceState(mode: .light, setting: setting)
        case .dark: return AppearanceState(mode: .dark, setting: setting)
        case .system:
            let style = context.windowScene?.traitCollection.userInterfaceStyle ?? UITraitCollection.current.userInterfaceStyle
            return AppearanceState(mode: style == .dark ? .dark : .light, setting: setting)
        }
    }

    private static func apply(_ setting: AppearanceSetting) {
        let style: UIUserInterfaceStyle = switch setting {
        case .dark: .dark
        case .light: .light
        case .system: .unspecified
        }
        for case let scene as UIWindowScene in UIApplication.shared.connectedScenes {
            for window in scene.windows { window.overrideUserInterfaceStyle = style }
        }
    }
}
