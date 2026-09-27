import AudioToolbox
import CoreHaptics
import UIKit

/// impact / notification / selection: UIKit feedback generators. They follow the user's System Haptics
/// setting and do nothing without a Taptic Engine (simulator, iPad), so calls always resolve.
/// - Generators are created once per kind with init(style:view:) / init(view:) (iOS 17.5; init() and
///   init(style:) are marked API_TO_BE_DEPRECATED in the iOS 26 SDK, and are what iOS 16 to 17.4
///   get). They attach to the web view, so one per call would pile up there.
/// - prepare() right after firing keeps the Taptic Engine ready for the next call (a picker scrolled
///   with selection()). tauri-plugins-workspace/plugins/haptics/ios/Sources/HapticsPlugin.swift:102-127
///   makes a new generator and prepares it immediately before firing, which hides no latency.
/// vibrate: react-native RCTVibration.mm:23-31 ignores the duration (kSystemSoundID_Vibrate is a fixed
/// ~400 ms buzz). Tauri (HapticsPlugin.swift:64-100) plays a continuous CHHapticEvent of the duration,
/// but creates an engine per call whose resetHandler captures it, so every call leaks one. Here one
/// engine is kept, and the system sound is the fallback without Core Haptics hardware.
/// Arguments arrive decoded and checked by the generated HapticsPluginSpec (PL-10).
final class HapticsPlugin: HapticsPluginSpec {
    static let id = "haptics"
    private let context: AkanNativePluginContext
    private var impacts: [HapticsImpactStyle: UIImpactFeedbackGenerator] = [:]
    private var notifier: UINotificationFeedbackGenerator?
    private var selector: UISelectionFeedbackGenerator?
    private var engine: CHHapticEngine?
    private var player: CHHapticPatternPlayer?

    init(context: AkanNativePluginContext) {
        self.context = context
    }

    func impact(_ args: HapticsImpactArgs, _ reply: AkanNativeReply<Void>) {
        let name = args.style ?? .medium
        guard let view = context.webView else { return reply.reject(.internalError, "no web view") }
        let style: UIImpactFeedbackGenerator.FeedbackStyle = switch name {
        case .light: .light
        case .medium: .medium
        case .heavy: .heavy
        case .soft: .soft
        case .rigid: .rigid
        }
        let generator = impacts[name] ?? Self.impactGenerator(style, view)
        impacts[name] = generator
        generator.impactOccurred()
        generator.prepare()
        reply.resolve()
    }

    func notification(_ args: HapticsNotificationArgs, _ reply: AkanNativeReply<Void>) {
        guard let view = context.webView else { return reply.reject(.internalError, "no web view") }
        let type: UINotificationFeedbackGenerator.FeedbackType = switch args.type ?? .success {
        case .success: .success
        case .warning: .warning
        case .error: .error
        }
        let generator = notifier ?? Self.notificationGenerator(view)
        notifier = generator
        generator.notificationOccurred(type)
        generator.prepare()
        reply.resolve()
    }

    func selection(_ reply: AkanNativeReply<Void>) {
        guard let view = context.webView else { return reply.reject(.internalError, "no web view") }
        let generator = selector ?? Self.selectionGenerator(view)
        selector = generator
        generator.selectionChanged()
        generator.prepare()
        reply.resolve()
    }

    func vibrate(_ args: HapticsVibrateArgs, _ reply: AkanNativeReply<Void>) {
        let value = args.duration ?? 300
        guard value >= 1, value <= 10000 else {
            return reply.reject(.invalidArgs, "duration must be a number of milliseconds between 1 and 10000")
        }
        let milliseconds = value.rounded()
        if !CHHapticEngine.capabilitiesForHardware().supportsHaptics || !playContinuous(seconds: milliseconds / 1000) {
            AudioServicesPlaySystemSound(kSystemSoundID_Vibrate) // fixed length; a no-op without a motor
        }
        reply.resolve()
    }

    private func playContinuous(seconds: Double) -> Bool {
        do {
            let engine = try self.engine ?? makeEngine()
            try engine.start() // restarts it after auto shutdown, a reset or an interruption
            let event = CHHapticEvent(
                eventType: .hapticContinuous,
                parameters: [
                    CHHapticEventParameter(parameterID: .hapticIntensity, value: 1),
                    CHHapticEventParameter(parameterID: .hapticSharpness, value: 1),
                ],
                relativeTime: 0,
                duration: seconds
            )
            let next = try engine.makePlayer(with: CHHapticPattern(events: [event], parameters: []))
            try? player?.stop(atTime: CHHapticTimeImmediate) // a new vibration replaces a running one
            try next.start(atTime: CHHapticTimeImmediate)
            player = next
            return true
        } catch {
            engine = nil // recreated on the next call
            player = nil
            return false
        }
    }

    private static func impactGenerator(_ style: UIImpactFeedbackGenerator.FeedbackStyle, _ view: UIView) -> UIImpactFeedbackGenerator {
        if #available(iOS 17.5, *) { UIImpactFeedbackGenerator(style: style, view: view) } else { UIImpactFeedbackGenerator(style: style) }
    }

    private static func notificationGenerator(_ view: UIView) -> UINotificationFeedbackGenerator {
        if #available(iOS 17.5, *) { UINotificationFeedbackGenerator(view: view) } else { UINotificationFeedbackGenerator() }
    }

    private static func selectionGenerator(_ view: UIView) -> UISelectionFeedbackGenerator {
        if #available(iOS 17.5, *) { UISelectionFeedbackGenerator(view: view) } else { UISelectionFeedbackGenerator() }
    }

    private func makeEngine() throws -> CHHapticEngine {
        let engine = try CHHapticEngine()
        engine.playsHapticsOnly = true // no audio session needed
        engine.isAutoShutdownEnabled = true // powers the hardware down while idle
        self.engine = engine
        return engine
    }
}
