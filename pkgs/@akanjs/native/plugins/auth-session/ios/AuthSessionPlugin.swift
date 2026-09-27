import AuthenticationServices
import UIKit

/// ASWebAuthenticationSession (plugins.md §4.5). The session catches the redirect to the callback
/// scheme itself, so the scheme needs no CFBundleURLTypes entry on iOS and the app's urlOpen
/// listeners do not see it.
/// - init(url:callback:completionHandler:) with .customScheme (iOS 17.4); the scheme-string
///   initializer is deprecated.
/// - The presentation anchor is the web view's window at start(), held by a small provider object
///   (the session keeps its provider weakly). Without one start() fails with presentationContextNotProvided.
/// - One session at a time: a new start() cancels the running one, whose call rejects CANCELLED.
/// - The completion handler runs on the main queue in practice; it hops there anyway.
/// Arguments arrive decoded and type-checked by the generated AuthSessionPluginSpec (PL-10).
final class AuthSessionPlugin: AuthSessionPluginSpec {
    static let id = "auth-session"
    private static let reserved: Set<String> = ["http", "https", "file", "app", "javascript", "data", "about", "blob"]

    private let context: AkanNativePluginContext
    private var session: ASWebAuthenticationSession?
    private var anchor: Anchor?
    private var token: UUID?
    private var pending: AkanNativeReply<AuthSessionStartResult>?

    init(context: AkanNativePluginContext) {
        self.context = context
    }

    func start(_ args: AuthSessionStartArgs, _ reply: AkanNativeReply<AuthSessionStartResult>) {
        guard let parts = URLComponents(string: args.url),
              let scheme = parts.scheme?.lowercased(), scheme == "http" || scheme == "https",
              !(parts.host ?? "").isEmpty, let url = parts.url
        else {
            return reply.reject(.invalidArgs, "the sign-in page must be an http or https URL")
        }
        let callbackScheme = args.callbackScheme
        guard Self.valid(callbackScheme) else {
            return reply.reject(.invalidArgs, "callbackScheme must be a lowercase custom scheme such as \"myapp\"")
        }
        guard let window = context.webView?.window else {
            return reply.reject(.internalError, "no window to present the sign-in page from")
        }

        if let running = session {
            let replaced = pending
            clear()
            replaced?.reject(.cancelled, "replaced by a newer start()")
            running.cancel()
        }

        let id = UUID()
        let completion: ASWebAuthenticationSession.CompletionHandler = { [weak self] callbackURL, error in
            let result = UncheckedBox((callbackURL, error))
            DispatchQueue.main.async {
                MainActor.assumeIsolated { self?.finish(id, result.value.0, result.value.1) }
            }
        }
        // The same custom-scheme callback; `callback:` (iOS 17.4) is only needed for https callbacks.
        let next = if #available(iOS 17.4, *) {
            ASWebAuthenticationSession(url: url, callback: .customScheme(callbackScheme), completionHandler: completion)
        } else {
            ASWebAuthenticationSession(url: url, callbackURLScheme: callbackScheme, completionHandler: completion)
        }
        let provider = Anchor(window)
        next.presentationContextProvider = provider
        next.prefersEphemeralWebBrowserSession = args.ephemeral ?? false
        session = next
        anchor = provider
        token = id
        pending = reply
        guard next.start() else {
            clear()
            return reply.reject(.internalError, "the sign-in session could not start")
        }
    }

    private func clear() {
        session = nil
        anchor = nil
        token = nil
        pending = nil
    }

    private func finish(_ id: UUID, _ callbackURL: URL?, _ error: (any Error)?) {
        guard id == token, let reply = pending else { return } // replaced meanwhile
        clear()
        if let callbackURL {
            return reply.resolve(AuthSessionStartResult(url: callbackURL.absoluteString))
        }
        let nsError = error as NSError?
        if nsError?.domain == ASWebAuthenticationSessionErrorDomain,
           nsError?.code == ASWebAuthenticationSessionError.canceledLogin.rawValue {
            return reply.reject(.cancelled, "the user closed the sign-in page")
        }
        reply.reject(.internalError, "sign-in failed: \(nsError?.localizedDescription ?? "no callback URL")")
    }

    private static func valid(_ scheme: String) -> Bool {
        guard let first = scheme.unicodeScalars.first, ("a"..."z").contains(first), !reserved.contains(scheme) else { return false }
        return scheme.unicodeScalars.allSatisfy { ("a"..."z").contains($0) || ("0"..."9").contains($0) || $0 == "+" || $0 == "-" || $0 == "." }
    }
}

@MainActor
private final class Anchor: NSObject, ASWebAuthenticationPresentationContextProviding {
    private let window: UIWindow

    init(_ window: UIWindow) {
        self.window = window
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor { window }
}
