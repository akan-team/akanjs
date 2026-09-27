import SafariServices
import UIKit

/// SFSafariViewController, presented full screen from the topmost controller
/// (capacitor-plugins/browser/ios/Sources/BrowserPlugin/Browser.swift and BrowserPlugin.swift).
/// - http/https only (Browser.swift:19): anything else crashes SFSafariViewController.
/// - finished: safariViewControllerDidFinish, sent for Done and the edge swipe. It is not sent
///   for a dismissal the app asks for, so close() never produces it. With .fullScreen there is no
///   swipe-down dismissal that would bypass the delegate.
/// - SFSafariViewController dismisses itself after Done; Capacitor dismisses the presenter again
///   in didFinish (BrowserPlugin.swift:31-39), which can dismiss an unrelated controller. Not here.
/// - toolbarColor is ignored: preferredBarTintColor is deprecated in iOS 26 (bar tinting fights
///   the system's glass background).
/// - SFSafariViewControllerDelegate is not main-actor annotated, but SafariServices calls it on the
///   main thread: an isolated conformance (checked at run time).
/// Arguments arrive decoded and type-checked by the generated BrowserPluginSpec (PL-10).
final class BrowserPlugin: NSObject, BrowserPluginSpec, @MainActor SFSafariViewControllerDelegate {
    static let id = "browser"
    private let context: AkanNativePluginContext
    private weak var safari: SFSafariViewController?

    init(context: AkanNativePluginContext) {
        self.context = context
        super.init()
    }

    func open(_ args: BrowserOpenArgs, _ reply: AkanNativeReply<Void>) {
        guard let parts = URLComponents(string: args.url),
              let scheme = parts.scheme?.lowercased(), scheme == "http" || scheme == "https",
              !(parts.host ?? "").isEmpty, let url = parts.url
        else {
            return reply.reject(.invalidArgs, "url must be an absolute http or https URL")
        }
        if let hex = args.toolbarColor {
            guard hex.count == 7, hex.hasPrefix("#"), UInt32(hex.dropFirst(), radix: 16) != nil else {
                return reply.reject(.invalidArgs, "toolbarColor must look like \"#1a2b3c\"")
            }
        }
        if let safari, safari.presentingViewController != nil {
            return reply.reject(.invalidArgs, "a browser is already open; close() it first")
        }
        let controller = SFSafariViewController(url: url)
        controller.delegate = self
        controller.modalPresentationStyle = .fullScreen
        safari = controller
        context.present(controller, completion: { reply.resolve() }) { [weak self] in
            self?.safari = nil
            reply.reject(.internalError, "nothing to present the browser from")
        }
    }

    func close(_ reply: AkanNativeReply<Void>) {
        guard let safari, safari.presentingViewController != nil else { return reply.resolve() }
        self.safari = nil
        safari.dismiss(animated: true) { reply.resolve() }
    }

    func safariViewControllerDidFinish(_ controller: SFSafariViewController) {
        guard controller === safari else { return }
        safari = nil
        BrowserEvents(context).finished(BrowserFinishedEvent())
    }
}
