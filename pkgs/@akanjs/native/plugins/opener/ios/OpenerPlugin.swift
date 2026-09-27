import UIKit

/// UIApplication.open for http, https, mailto and tel (the default set of
/// tauri-plugins-workspace/plugins/opener/permissions/allow-default-urls.toml; src/url.ts checks the same).
/// - Opens only while the scene is foregroundActive, like the shell's external links (SH-4,
///   capacitor/ios/Capacitor/Capacitor/WebViewDelegationHandler.swift:67-125).
/// - The completion reports whether an app took the URL: false (tel: on a simulator or iPad) is NOT_FOUND.
/// - canOpenURL answers false for schemes missing from LSApplicationQueriesSchemes
///   (capacitor-plugins/app-launcher/src/definitions.ts). That list is for other apps' custom
///   schemes, which this plugin refuses anyway; http(s)/mailto/tel are expected to work without an
///   entry (not yet confirmed on the simulator: see the self-test).
/// Arguments arrive decoded by the generated OpenerPluginSpec (PL-10); the URL checks stay here.
final class OpenerPlugin: OpenerPluginSpec {
    static let id = "opener"
    /// The shell's external list: http, https, mailto, tel and security.shell.externalSchemes (L0).
    private static var schemes: [String] { AkanNativeExternal.schemes }
    private let context: AkanNativePluginContext

    init(context: AkanNativePluginContext) {
        self.context = context
    }

    func openUrl(_ args: OpenerOpenUrlArgs, _ reply: AkanNativeReply<Void>) {
        guard let url = url(args.url, reply) else { return }
        // PL-11 scopes { url }: matched on the URL normalized like the JS URL class does.
        guard reply.call.inScope(["url": Self.normalized(url)], urlFields: ["url"], what: url.absoluteString) else { return }
        open(url, reply)
    }

    func canOpenUrl(_ args: OpenerCanOpenUrlArgs, _ reply: AkanNativeReply<OpenerCanOpenUrlResult>) {
        guard let url = url(args.url, reply) else { return }
        reply.resolve(OpenerCanOpenUrlResult(value: UIApplication.shared.canOpenURL(url)))
    }

    func openSettings(_ reply: AkanNativeReply<Void>) {
        open(URL(string: UIApplication.openSettingsURLString)!, reply)
    }

    private func open(_ url: URL, _ reply: AkanNativeReply<Void>) {
        guard context.windowScene?.activationState == .foregroundActive else {
            return reply.reject(.permissionDenied, "URLs can be opened only while the app is in the foreground")
        }
        guard AkanNativeExternal.allowed() else { return reply.reject(.notAllowed, "at most one URL per second leaves the app; try again later") }
        UIApplication.shared.open(url, options: [:]) { opened in
            if opened {
                reply.resolve()
            } else {
                reply.reject(.notFound, "no app can open \(url.absoluteString)")
            }
        }
    }

    /// Lowercase scheme and host, "/" as the path of a bare http(s) host: the same text `new URL(u).href` gives.
    static func normalized(_ url: URL) -> String {
        guard var parts = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return url.absoluteString }
        parts.scheme = parts.scheme?.lowercased()
        parts.host = parts.host?.lowercased()
        if parts.scheme?.hasPrefix("http") == true, parts.path.isEmpty { parts.path = "/" }
        return parts.string ?? url.absoluteString
    }

    /// The checked URL with a lowercase scheme, or nil after rejecting the call.
    private func url<T>(_ text: String, _ reply: AkanNativeReply<T>) -> URL? {
        guard !text.isEmpty, var parts = URLComponents(string: text), let scheme = parts.scheme?.lowercased() else {
            reply.reject(.invalidArgs, "url must be an absolute URL")
            return nil
        }
        guard Self.schemes.contains(scheme) else {
            reply.reject(.invalidArgs, "only \(Self.schemes.joined(separator: ", ")) URLs can be opened (got \(scheme):)")
            return nil
        }
        if scheme.hasPrefix("http"), parts.host?.isEmpty ?? true {
            reply.reject(.invalidArgs, "\(text) has no host")
            return nil
        }
        parts.scheme = scheme
        guard let url = parts.url else {
            reply.reject(.invalidArgs, "url must be an absolute URL")
            return nil
        }
        return url
    }
}
