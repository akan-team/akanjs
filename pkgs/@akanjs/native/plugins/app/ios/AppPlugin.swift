import UIKit

/// App info from the bundle and deep links from the scene (AkanNativeLinks, plugins.md S4).
/// iOS apps must not quit or minimize themselves: exit/minimize are UNSUPPORTED
/// (capacitor-plugins/app does the same).
/// The result and event types come from the generated AppPluginSpec (PL-10).
final class AppPlugin: AppPluginSpec {
    static let id = "app"
    private let context: AkanNativePluginContext
    private var subscription: UUID?

    init(context: AkanNativePluginContext) {
        self.context = context
    }

    func getInfo(_ reply: AkanNativeReply<AppInfoResult>) {
        let info = Bundle.main.infoDictionary ?? [:]
        reply.resolve(AppInfoResult(
            id: Bundle.main.bundleIdentifier ?? "",
            name: info["CFBundleDisplayName"] as? String ?? info["CFBundleName"] as? String ?? "",
            version: info["CFBundleShortVersionString"] as? String ?? "",
            build: Double(Int(info["CFBundleVersion"] as? String ?? "") ?? 1)
        ))
    }

    func getLaunchUrl(_ reply: AkanNativeReply<AppGetLaunchUrlResult>) {
        reply.resolve(AppGetLaunchUrlResult(url: AkanNativeLinks.shared.launchURL?.absoluteString))
    }

    func exit(_ reply: AkanNativeReply<Void>) {
        reply.reject(.unsupported, "iOS apps cannot exit themselves")
    }

    func minimize(_ reply: AkanNativeReply<Void>) {
        reply.reject(.unsupported, "iOS apps cannot minimize themselves")
    }

    func startListening(_ event: String) {
        guard event == "urlOpen", subscription == nil else { return }
        subscription = AkanNativeLinks.shared.listen(owner: context.owner) { [weak self] url in
            guard let self else { return false }
            AppEvents(self.context).urlOpen(AppUrlOpenEvent(url: url.absoluteString))
            return true
        }
    }

    func stopListening(_ event: String) {
        guard event == "urlOpen", let subscription else { return }
        AkanNativeLinks.shared.unlisten(subscription)
        self.subscription = nil
    }
}
