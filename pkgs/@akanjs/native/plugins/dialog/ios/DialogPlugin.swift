import UIKit

/// alert / confirm / prompt / actionSheet with UIAlertController (docs/plugins.md §4.2).
/// Argument rules are the ones of src/options.ts: the generated DialogPluginSpec (PL-10) decodes and
/// type-checks the arguments, the rules beyond the types keep src/options.ts's messages.
/// - Presented from the topmost view controller of the app's own window, so dark mode follows the
///   app by itself. react-native copies the window's overrideUserInterfaceStyle only because it
///   presents from a window of its own (react-native/…/RCTAlertController.mm:42-48).
/// - Default button titles are UIKit's own localized "OK"/"Cancel"
///   (react-native/…/RCTUtils.mm:1301-1305 RCTUIKitLocalizedString).
/// - When nothing can present, the call answers as cancelled: a call that never answers hangs the
///   page's await (the rule of AkanNativeViewController.presentPanel).
/// - A dialog belongs to its call: when the page gives up on it (AbortSignal) or goes away (reload,
///   navigation), it is dismissed, so no dialog of a gone page stays on screen and blocks the next.
final class DialogPlugin: DialogPluginSpec {
    static let id = "dialog"
    private let context: AkanNativePluginContext

    init(context: AkanNativePluginContext) {
        self.context = context
    }

    // MARK: Methods

    func alert(_ args: DialogAlertOptions, _ reply: AkanNativeReply<Void>) {
        guard let text = Self.heading(args.title, args.message, reply) else { return }
        let alert = UIAlertController(title: text.title, message: text.message, preferredStyle: .alert)
        let ok = UIAlertAction(title: Self.label(args.buttonTitle, Self.uikit("OK")), style: .default) { _ in reply.resolve() }
        alert.addAction(ok)
        alert.preferredAction = ok
        present(alert, for: reply.call) { reply.resolve() }
    }

    func confirm(_ args: DialogConfirmOptions, _ reply: AkanNativeReply<DialogConfirmResult>) {
        guard let text = Self.heading(args.title, args.message, reply) else { return }
        let alert = UIAlertController(title: text.title, message: text.message, preferredStyle: .alert)
        // .cancel (Capacitor uses .default for both) puts Cancel where iOS users expect it and lets a
        // hardware keyboard's Escape pick it; preferredAction makes OK the bold, Return-key button
        // (react-native/…/RCTAlertManager.mm:152-156, 186-188).
        alert.addAction(UIAlertAction(title: Self.label(args.cancelButtonTitle, Self.uikit("Cancel")), style: .cancel) { _ in
            reply.resolve(DialogConfirmResult(value: false))
        })
        let ok = UIAlertAction(title: Self.label(args.okButtonTitle, Self.uikit("OK")), style: .default) { _ in
            reply.resolve(DialogConfirmResult(value: true))
        }
        alert.addAction(ok)
        alert.preferredAction = ok
        present(alert, for: reply.call) { reply.resolve(DialogConfirmResult(value: false)) }
    }

    func prompt(_ args: DialogPromptOptions, _ reply: AkanNativeReply<DialogPromptResult>) {
        guard let text = Self.heading(args.title, args.message, reply) else { return }
        let placeholder = args.inputPlaceholder
        let initial = args.inputText
        let cancelled = DialogPromptResult(value: "", cancelled: true)
        let alert = UIAlertController(title: text.title, message: text.message, preferredStyle: .alert)
        alert.addTextField { field in
            field.placeholder = placeholder
            field.text = initial
        }
        alert.addAction(UIAlertAction(title: Self.label(args.cancelButtonTitle, Self.uikit("Cancel")), style: .cancel) { _ in
            reply.resolve(cancelled)
        })
        // Not trimmed: Capacitor trims on Android only (capacitor-plugins/dialog/…/Dialog.java:143).
        let ok = UIAlertAction(title: Self.label(args.okButtonTitle, Self.uikit("OK")), style: .default) { [weak alert] _ in
            reply.resolve(DialogPromptResult(value: alert?.textFields?.first?.text ?? "", cancelled: false))
        }
        alert.addAction(ok)
        alert.preferredAction = ok
        present(alert, for: reply.call) { reply.resolve(cancelled) }
    }

    func actionSheet(_ args: DialogActionSheetOptions, _ reply: AkanNativeReply<DialogActionSheetResult>) {
        guard let options = Self.sheetOptions(args.options, reply) else { return }
        let sheet = UIAlertController(title: Self.nonEmpty(args.title), message: Self.nonEmpty(args.message), preferredStyle: .actionSheet)
        let responder = SheetResponder(reply) // retained by the actions below
        for (index, option) in options.enumerated() {
            // iOS 26 does not show a .cancel action (verified in the iPad popover; iPhone per
            // capacitor-plugins/action-sheet/README.md:121) and runs it on a tap outside instead,
            // so choosing it counts as a dismissal.
            sheet.addAction(UIAlertAction(title: option.title, style: option.style) { _ in
                responder.answer(option.style == .cancel ? nil : index)
            })
        }
        // iPad (and Mac): the sheet is a popover and UIKit throws without an anchor. Centered with no
        // arrow like Capacitor's setCenteredPopover (capacitor/ios/Capacitor/Capacitor/CAPPlugin.m:149-155).
        // Not on iPhone: since iOS 26 an anchor turns the sheet into a popover there too and leaves the
        // page behind it interactive (react-native/…/RCTActionSheetManager.mm:64-74).
        if UIDevice.current.userInterfaceIdiom != .phone, let popover = sheet.popoverPresentationController,
            let anchor = context.webView ?? context.viewController?.view
        {
            popover.sourceView = anchor
            popover.sourceRect = CGRect(x: anchor.bounds.midX, y: anchor.bounds.midY, width: 0, height: 0)
            popover.permittedArrowDirections = []
        }
        present(sheet, for: reply.call, presented: {
            // Without a cancel action a tap outside dismisses the sheet with no action at all; the
            // delegate hears it. Only on action sheets: an alert-style controller's presentation
            // controller must not get a delegate (capacitor-plugins/action-sheet/…/ActionSheetPlugin.swift:57-73).
            sheet.presentationController?.delegate = responder
        }, otherwise: { responder.answer(nil) })
    }

    // MARK: Presenting

    /// AkanNativePresent: waits out a running transition; `otherwise` answers the call when nothing can
    /// present. The controller goes away with its call (cancelled, or its page ended).
    private func present(_ controller: UIViewController, for call: AkanNativeCall, presented: (@MainActor () -> Void)? = nil, otherwise: @escaping @MainActor () -> Void) {
        call.onCancel { [weak controller] in
            guard let controller, controller.presentingViewController != nil else { return }
            controller.dismiss(animated: true)
        }
        context.present(controller, completion: presented, otherwise: otherwise)
    }

    // MARK: Arguments (src/options.ts)

    /// The rules the types cannot express. The generated DialogPluginSpec has already checked the
    /// types (PL-10); these keep src/options.ts's "<method>: …" messages.
    private static func invalid<T>(_ reply: AkanNativeReply<T>, _ message: String) {
        reply.reject(.invalidArgs, "\(reply.call.method): \(message)")
    }

    /// Title and message for the controller, nil when empty. Rejects when both are empty.
    private static func heading<T>(_ title: String?, _ message: String, _ reply: AkanNativeReply<T>) -> (title: String?, message: String?)? {
        let title = nonEmpty(title), message = nonEmpty(message)
        if title == nil && message == nil {
            invalid(reply, "title or message must not be empty")
            return nil
        }
        return (title, message)
    }

    /// "" means the default, not an invisible button (react-native/…/Alert/Alert.js:145-148).
    private static func label(_ text: String?, _ fallback: String) -> String {
        nonEmpty(text) ?? fallback
    }

    private static func sheetOptions(_ raw: [DialogActionSheetOption], _ reply: AkanNativeReply<DialogActionSheetResult>) -> [(title: String, style: UIAlertAction.Style)]? {
        guard !raw.isEmpty else {
            invalid(reply, "options must be a non-empty array")
            return nil
        }
        var options: [(title: String, style: UIAlertAction.Style)] = []
        for (i, option) in raw.enumerated() {
            guard !option.title.isEmpty else {
                invalid(reply, "options[\(i)].title must be a non-empty string")
                return nil
            }
            let style: UIAlertAction.Style =
                switch option.style ?? .default {
                case .default: .default
                case .destructive: .destructive
                case .cancel: .cancel
                }
            options.append((option.title, style))
        }
        // UIAlertController raises NSInternalInconsistencyException for a second .cancel action.
        if options.count(where: { $0.style == .cancel }) > 1 {
            invalid(reply, "only one option may have the cancel style")
            return nil
        }
        return options
    }

    private static func nonEmpty(_ text: String?) -> String? {
        text?.isEmpty == false ? text : nil
    }

    private static func uikit(_ key: String) -> String {
        Bundle(for: UIApplication.self).localizedString(forKey: key, value: key, table: nil)
    }

    /// Answers an action sheet once: an option, the cancel option, or a dismissal without an action.
    /// The sheet's actions retain it, so it lives exactly as long as the sheet (the presentation
    /// controller's delegate is weak). If the sheet goes away unanswered, the call is released and
    /// AkanNativeCall rejects it instead of leaving the page waiting.
    private final class SheetResponder: NSObject, UIAdaptivePresentationControllerDelegate {
        private let reply: AkanNativeReply<DialogActionSheetResult>

        init(_ reply: AkanNativeReply<DialogActionSheetResult>) {
            self.reply = reply
        }

        func answer(_ index: Int?) {
            if let index {
                reply.resolve(DialogActionSheetResult(index: Double(index), cancelled: false))
            } else {
                reply.resolve(DialogActionSheetResult(index: -1, cancelled: true))
            }
        }

        func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
            answer(nil)
        }
    }
}

