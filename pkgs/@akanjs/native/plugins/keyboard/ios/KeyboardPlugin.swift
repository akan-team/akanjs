import UIKit

/// Soft keyboard: the part of the web view the keyboard covers, in points (== CSS px).
/// Measured from keyboardWillChangeFrame converted from screen to web view coordinates, so
/// floating/undocked iPad keyboards and other apps' keyboards come out right
/// (react-native RCTKeyboardObserver converts the same way).
/// The result and event types come from the generated KeyboardPluginSpec (PL-10).
final class KeyboardPlugin: KeyboardPluginSpec {
    static let id = "keyboard"
    private let context: AkanNativePluginContext
    private var observers: [NSObjectProtocol] = []
    private var state: (visible: Bool, height: Int) = (false, 0)
    private lazy var events = KeyboardEvents(context)

    init(context: AkanNativePluginContext) {
        self.context = context
        // Tracked from launch so getState() is right before anyone listens. The plugin lives as long as
        // the app, so the observers are never removed.
        for name in [UIResponder.keyboardWillChangeFrameNotification, UIResponder.keyboardWillHideNotification] {
            observers.append(NotificationCenter.default.addObserver(forName: name, object: nil, queue: .main) { [weak self] note in
                let info = UncheckedBox(note.userInfo ?? [:])
                MainActor.assumeIsolated { self?.update(name, info.value) }
            })
        }
        // O6-1: the transitions, before and after the keyboard's animation.
        let phases: [(Notification.Name, String)] = [
            (UIResponder.keyboardWillShowNotification, "willShow"), (UIResponder.keyboardDidShowNotification, "didShow"),
            (UIResponder.keyboardWillHideNotification, "willHide"), (UIResponder.keyboardDidHideNotification, "didHide"),
        ]
        for (name, phase) in phases {
            observers.append(NotificationCenter.default.addObserver(forName: name, object: nil, queue: .main) { [weak self] note in
                let info = UncheckedBox(note.userInfo ?? [:])
                MainActor.assumeIsolated { self?.transition(phase, info.value) }
            })
        }
    }

    /// The covered height, measured against the shell's root view: in "resize" mode the web view itself
    /// ends at the keyboard, so it is never covered.
    private func cover(_ info: [AnyHashable: Any], hiding: Bool) -> CGFloat {
        if let shell = context.viewController as? AkanNativeViewController { return shell.keyboardCover(info, hiding: hiding) }
        guard !hiding, let webView = context.webView, let window = webView.window,
              let end = (info[UIResponder.keyboardFrameEndUserInfoKey] as? NSValue)?.cgRectValue else { return 0 }
        return max(0, webView.bounds.intersection(webView.convert(end, from: window.screen.coordinateSpace)).height)
    }

    private func update(_ name: Notification.Name, _ info: [AnyHashable: Any]) {
        let covered = cover(info, hiding: name == UIResponder.keyboardWillHideNotification)
        let next = (visible: covered > 0, height: Int(covered.rounded()))
        guard next.visible != state.visible || next.height != state.height else { return } // hide sends two notifications
        state = next
        let duration = (info[UIResponder.keyboardAnimationDurationUserInfoKey] as? NSNumber)?.doubleValue ?? 0
        // The event carries the animation duration too, which KeyboardEvents.change (KeyboardState) has no field for.
        var data = current.akanNativeJSON
        data["duration"] = duration
        context.emit("change", data)
    }

    private func transition(_ phase: String, _ info: [AnyHashable: Any]) {
        let hiding = phase == "willHide" || phase == "didHide"
        let height = Double(Int(cover(info, hiding: hiding).rounded()))
        let duration = ((info[UIResponder.keyboardAnimationDurationUserInfoKey] as? NSNumber)?.doubleValue ?? 0) * 1000
        // A floating iPad keyboard covers nothing: no show or hide for the page.
        if !hiding && height == 0 { return }
        let data = KeyboardTransition(height: height, duration: duration.rounded())
        switch phase {
        case "willShow": events.willShow(data)
        case "didShow": events.didShow(data)
        case "willHide": events.willHide(data)
        default: events.didHide(data)
        }
    }

    private var current: KeyboardState {
        KeyboardState(visible: state.visible, height: Double(state.height))
    }

    func getState(_ reply: AkanNativeReply<KeyboardState>) {
        reply.resolve(current)
    }

    func hide(_ reply: AkanNativeReply<Void>) {
        // endEditing hides the keyboard but keeps DOM focus on the input (verified): blur too.
        context.webView?.evaluateJavaScript("document.activeElement && document.activeElement.blur && document.activeElement.blur()")
        context.webView?.endEditing(true)
        reply.resolve()
    }

    func setResizeMode(_ args: KeyboardSetResizeModeArgs, _ reply: AkanNativeReply<Void>) {
        (context.viewController as? AkanNativeViewController)?.keyboardResizes = args.mode == .resize
        reply.resolve()
    }
}
