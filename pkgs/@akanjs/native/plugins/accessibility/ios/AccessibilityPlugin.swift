import UIKit

/// VoiceOver, Reduce Motion and Dynamic Type from UIAccessibility and UIApplication, the values
/// react-native/packages/react-native/React/CoreModules/RCTAccessibilityManager.mm reads (:99-106).
/// - fontScale: the body text size for the content size category / 17 pt (the size at the default
///   "Large"), as capacitor-plugins/text-zoom/ios/Sources/TextZoomPlugin/TextZoom.swift:5-8 computes
///   it. RN keeps a fixed table (RCTAccessibilityManager.mm:261-279) that matches for the standard
///   sizes but not for the accessibility sizes (AX1: RN 1.786, the body font 28 / 17 = 1.647); the
///   font follows Apple's own ramp, which is also what CSS `font: -apple-system-body` gets.
/// - change: the three notifications RN observes (:54-97), only while the page listens, reported
///   when a field really changed (RN filters the same way, :170-181).
/// - announce: UIAccessibility.post(.announcement), RN :323-363 with its queue / priority attributes:
///   "polite" queues behind current speech, "assertive" interrupts with high priority (iOS 17).
///   Posted 0.1 s later, as capacitor-plugins/screen-reader/.../ScreenReaderPlugin.swift:39-43 does:
///   VoiceOver cuts an announcement off when it starts reading the element that was just tapped.
/// Arguments arrive decoded by the generated AccessibilityPluginSpec (PL-10); empty text is checked here.
final class AccessibilityPlugin: AccessibilityPluginSpec {
    static let id = "accessibility"
    private static let baseBodySize: Double = 17

    private let context: AkanNativePluginContext
    private var observers: [any NSObjectProtocol] = []
    private var last: AccessibilityState?

    init(context: AkanNativePluginContext) {
        self.context = context
    }

    func getState(_ reply: AkanNativeReply<AccessibilityState>) {
        reply.resolve(Self.state())
    }

    func announce(_ args: AccessibilityAnnounceArgs, _ reply: AkanNativeReply<Void>) {
        let text = args.text
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return reply.reject(.invalidArgs, "text must not be empty")
        }
        let priority = args.priority ?? .polite
        Task {
            try? await Task.sleep(for: .milliseconds(100))
            var attributes: [NSAttributedString.Key: Any] = [.accessibilitySpeechQueueAnnouncement: priority == .polite]
            // iOS 16 has no announcement priority: an assertive announcement only skips the queue.
            if priority == .assertive, #available(iOS 17.0, *) { attributes[.accessibilitySpeechAnnouncementPriority] = UIAccessibilityPriority.high }
            UIAccessibility.post(notification: .announcement, argument: NSAttributedString(string: text, attributes: attributes))
            reply.resolve()
        }
    }

    func startListening(_ event: String) {
        guard event == "change", observers.isEmpty else { return }
        last = Self.state()
        let names: [Notification.Name] = [
            UIAccessibility.voiceOverStatusDidChangeNotification,
            UIAccessibility.reduceMotionStatusDidChangeNotification,
            UIContentSizeCategory.didChangeNotification,
        ]
        observers = names.map { name in
            NotificationCenter.default.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in
                MainActor.assumeIsolated { self?.report() }
            }
        }
    }

    func stopListening(_ event: String) {
        guard event == "change" else { return }
        for observer in observers { NotificationCenter.default.removeObserver(observer) }
        observers = []
        last = nil
    }

    private func report() {
        guard !observers.isEmpty else { return }
        let next = Self.state()
        if next == last { return }
        last = next
        AccessibilityEvents(context).change(next)
    }

    private static func state() -> AccessibilityState {
        AccessibilityState(
            screenReader: UIAccessibility.isVoiceOverRunning,
            reduceMotion: UIAccessibility.isReduceMotionEnabled,
            fontScale: fontScale(UIApplication.shared.preferredContentSizeCategory)
        )
    }

    private static func fontScale(_ category: UIContentSizeCategory) -> Double {
        let traits = UITraitCollection(preferredContentSizeCategory: category)
        let body = Double(UIFont.preferredFont(forTextStyle: .body, compatibleWith: traits).pointSize)
        return (body / baseBodySize * 1000).rounded() / 1000
    }
}
