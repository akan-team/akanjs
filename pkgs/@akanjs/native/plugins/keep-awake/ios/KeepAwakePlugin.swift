import UIKit

/// UIApplication.isIdleTimerDisabled (plugins.md §4.1, the flag Expo's keep-awake sets as well).
/// The flag belongs to the page that set it (architecture review: document scope, like the web's
/// Wake Lock): a reload, a navigation or the window going away clears it (AkanNativeDocument.own). The
/// system ignores it while the app is in the background, so nothing needs to be undone on backgrounding.
/// The result types come from the generated KeepAwakePluginSpec (PL-10).
final class KeepAwakePlugin: KeepAwakePluginSpec {
    static let id = "keep-awake"
    /// The page holding the flag and its token there.
    private weak var holder: AkanNativeDocument?
    private var token = 0

    init(context: AkanNativePluginContext) {}

    func keepAwake(_ reply: AkanNativeReply<Void>) {
        UIApplication.shared.isIdleTimerDisabled = true
        if let document = reply.call.document, document !== holder {
            holder?.disown(token)
            holder = document
            token = document.own { UIApplication.shared.isIdleTimerDisabled = false }
        }
        reply.resolve()
    }

    func allowSleep(_ reply: AkanNativeReply<Void>) {
        holder?.disown(token)
        holder = nil
        UIApplication.shared.isIdleTimerDisabled = false
        reply.resolve()
    }

    func isKeptAwake(_ reply: AkanNativeReply<KeepAwakeIsKeptAwakeResult>) {
        reply.resolve(KeepAwakeIsKeptAwakeResult(value: UIApplication.shared.isIdleTimerDisabled))
    }
}
