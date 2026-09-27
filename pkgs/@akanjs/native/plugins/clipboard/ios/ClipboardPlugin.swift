import UIKit

/// Plain text on UIPasteboard.general.
/// - iOS 16+ shows "Allow Paste?" when the app reads text another app copied, and `string` is nil
///   after "Don't Allow". `hasStrings`/`hasURLs` never show the prompt, so "has text, but reading
///   gave nil" is reported as PERMISSION_DENIED instead of an empty clipboard.
/// - The read runs off the main thread so the web view keeps drawing while the prompt waits for
///   an answer. Capacitor reads on its background "bridge" queue too
///   (capacitor/ios/Capacitor/Capacitor/CapacitorBridge.swift:127, :525). UIPasteboard is
///   NS_SWIFT_SENDABLE.
/// - A pasteboard with only a URL (Safari's address bar) reads as the URL string, like
///   capacitor-plugins/clipboard/ios/Sources/ClipboardPlugin/Clipboard.swift:47-62.
/// Arguments arrive decoded and checked by the generated ClipboardPluginSpec (PL-10).
final class ClipboardPlugin: ClipboardPluginSpec {
    static let id = "clipboard"

    init(context: AkanNativePluginContext) {}

    func writeText(_ args: ClipboardWriteTextArgs, _ reply: AkanNativeReply<Void>) {
        UIPasteboard.general.string = args.text
        reply.resolve()
    }

    func readText(_ reply: AkanNativeReply<ClipboardReadTextResult>) {
        let pasteboard = UIPasteboard.general
        guard pasteboard.hasStrings || pasteboard.hasURLs else { return reply.resolve(ClipboardReadTextResult(text: "")) }
        DispatchQueue.global(qos: .userInitiated).async {
            if let text = pasteboard.string ?? pasteboard.url?.absoluteString {
                reply.resolve(ClipboardReadTextResult(text: text))
            } else {
                reply.reject(.permissionDenied, "pasting from another app was not allowed")
            }
        }
    }
}
