import UIKit

/// Scene lifecycle → active / inactive / background, filtered to the scene showing our web view.
/// Same mapping as react-native RCTAppState.mm: willEnterForeground still reports background
/// (not visible yet) until didActivate.
/// The result and event types come from the generated AppStatePluginSpec (PL-10).
final class AppStatePlugin: AppStatePluginSpec {
    static let id = "app-state"
    private let context: AkanNativePluginContext
    private var observers: [NSObjectProtocol] = []
    private var memoryObserver: NSObjectProtocol?
    private var last: AppStateValue?

    init(context: AkanNativePluginContext) {
        self.context = context
    }

    private static func state(_ s: UIScene.ActivationState?) -> AppStateValue {
        switch s {
        case .foregroundActive: .active
        case .foregroundInactive: .inactive
        default: .background
        }
    }

    func getState(_ reply: AkanNativeReply<AppStateGetStateResult>) {
        reply.resolve(AppStateGetStateResult(state: Self.state(context.windowScene?.activationState)))
    }

    func startListening(_ event: String) {
        if event == "memoryWarning" {
            guard memoryObserver == nil else { return }
            memoryObserver = NotificationCenter.default.addObserver(
                forName: UIApplication.didReceiveMemoryWarningNotification, object: nil, queue: .main
            ) { [weak self] _ in
                MainActor.assumeIsolated { self?.memoryWarned() }
            }
            return
        }
        guard event == "change", observers.isEmpty else { return }
        last = Self.state(context.windowScene?.activationState)
        let transitions: [(Notification.Name, AppStateValue)] = [
            (UIScene.didActivateNotification, .active),
            (UIScene.willDeactivateNotification, .inactive),
            (UIScene.didEnterBackgroundNotification, .background),
            (UIScene.willEnterForegroundNotification, .background),
        ]
        for (name, state) in transitions {
            observers.append(NotificationCenter.default.addObserver(forName: name, object: nil, queue: .main) { [weak self] note in
                let scene = UncheckedBox(note.object as? UIScene)
                MainActor.assumeIsolated { self?.changed(scene.value, state) }
            })
        }
    }

    func stopListening(_ event: String) {
        if event == "memoryWarning" {
            if let memoryObserver { NotificationCenter.default.removeObserver(memoryObserver) }
            memoryObserver = nil
            return
        }
        guard event == "change" else { return }
        observers.forEach(NotificationCenter.default.removeObserver)
        observers.removeAll()
    }

    private func memoryWarned() {
        AppStateEvents(context).memoryWarning(AppStateMemoryWarningEvent(level: .critical))
    }

    private func changed(_ scene: UIScene?, _ state: AppStateValue) {
        if let mine = context.windowScene, let scene, scene !== mine { return }
        guard state != last else { return }
        last = state
        AppStateEvents(context).change(AppStateChangeEvent(state: state))
    }
}
