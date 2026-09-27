import Foundation
import LocalAuthentication

/// LAContext (tauri-plugins-workspace/plugins/biometric/ios/Sources/BiometricPlugin.swift, with changes):
/// - A fresh LAContext per call. Tauri computes the status once at load, which goes stale when the
///   user enrolls or turns Face ID off for the app while it runs.
/// - biometryType is valid after canEvaluatePolicy whatever it returns, so the sensor kind is known
///   even when nothing is enrolled.
/// - Face ID without NSFaceIDUsageDescription must not be evaluated (Tauri reports it as
///   unavailable too); the manifest adds the text.
/// - Biometrics only: localizedFallbackTitle = "" hides the "Enter Password" button that iOS shows
///   after a failed match (tapping it ends with LAError.userFallback). allowDeviceCredential uses
///   .deviceOwnerAuthentication, where the system handles the passcode itself.
/// - The prompt belongs to its call: cancelled (AbortSignal) or with its page gone, the context is
///   invalidated and the prompt goes away (LAError.appCancel, already answered).
/// - Simulator: Features > Face ID > Enrolled / Matching Face / Non-matching Face. There is no simctl
///   command; `xcrun simctl spawn <udid> notifyutil -s com.apple.BiometricKit.enrollmentChanged 1` +
///   `notifyutil -p com.apple.BiometricKit.enrollmentChanged` toggles enrollment and
///   `notifyutil -p com.apple.BiometricKit_Sim.pearl.match` (or .nomatch) answers a prompt.
/// Arguments arrive decoded and type-checked by the generated BiometricPluginSpec (PL-10).
final class BiometricPlugin: BiometricPluginSpec {
    static let id = "biometric"
    private var current: LAContext?

    init(context: AkanNativePluginContext) {}

    func isAvailable(_ reply: AkanNativeReply<BiometricStatus>) {
        reply.resolve(Self.status())
    }

    private static var hasFaceIDUsageDescription: Bool {
        Bundle.main.object(forInfoDictionaryKey: "NSFaceIDUsageDescription") != nil
    }

    nonisolated private static func name(_ type: LABiometryType) -> BiometricBiometryType {
        switch type {
        case .faceID: .face
        case .touchID: .fingerprint
        case .opticID: .iris
        default: .none_
        }
    }

    private static func status() -> BiometricStatus {
        let context = LAContext()
        var error: NSError?
        let ok = context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error)
        let type = context.biometryType
        var result = BiometricStatus(
            available: false,
            type: name(type),
            deviceCredential: LAContext().canEvaluatePolicy(.deviceOwnerAuthentication, error: nil)
        )
        if ok, type == .faceID, !hasFaceIDUsageDescription {
            result.reason = .notConfigured
        } else if ok {
            result.available = true
        } else {
            result.reason = reason(error.map { LAError.Code(rawValue: $0.code) } ?? nil, type)
        }
        return result
    }

    nonisolated private static func reason(_ code: LAError.Code?, _ type: LABiometryType) -> BiometricUnavailableReason {
        switch code {
        case .biometryNotEnrolled?, .passcodeNotSet?: .notEnrolled
        case .biometryLockout?: .lockedOut
        // With a sensor present this is the per-app Face ID switch in Settings.
        case .biometryNotAvailable?: type == .none ? .noHardware : .denied
        default: .unavailable
        }
    }

    func authenticate(_ args: BiometricAuthenticateOptions, _ reply: AkanNativeReply<Void>) {
        let reason = args.reason
        guard !reason.isEmpty else { return reply.reject(.invalidArgs, "reason must be a non-empty string") }
        guard current == nil else { return reply.reject(.cancelled, "another authentication is in progress") }
        let allowCredential = args.allowDeviceCredential ?? false
        let policy: LAPolicy = allowCredential ? .deviceOwnerAuthentication : .deviceOwnerAuthenticationWithBiometrics
        let context = LAContext()
        var error: NSError?
        guard context.canEvaluatePolicy(policy, error: &error) else {
            let (code, message) = Self.failure(error, context.biometryType)
            return reply.reject(code, message)
        }
        if context.biometryType == .faceID, !Self.hasFaceIDUsageDescription {
            return reply.reject(.internalError, "Info.plist has no NSFaceIDUsageDescription")
        }
        if let cancel = args.cancelTitle, !cancel.isEmpty { context.localizedCancelTitle = cancel }
        if !allowCredential { context.localizedFallbackTitle = "" }
        let type = context.biometryType
        current = context
        reply.onCancel { [weak self] in
            context.invalidate()
            if self?.current === context { self?.current = nil }
        }
        let key = ObjectIdentifier(context) // Sendable, unlike LAContext
        context.evaluatePolicy(policy, localizedReason: reason) { [weak self] success, error in
            if success {
                reply.resolve()
            } else {
                let (code, message) = Self.failure(error, type)
                reply.reject(code, message)
            }
            DispatchQueue.main.async {
                MainActor.assumeIsolated {
                    if let current = self?.current, ObjectIdentifier(current) == key { self?.current = nil }
                }
            }
        }
    }

    nonisolated private static func failure(_ error: (any Error)?, _ type: LABiometryType) -> (AkanNativeErrorCode, String) {
        let message = error?.localizedDescription ?? "authentication failed"
        guard let code = (error as? LAError)?.code else { return (.internalError, message) }
        switch code {
        case .userCancel, .systemCancel, .appCancel, .userFallback, .notInteractive:
            return (.cancelled, message)
        case .authenticationFailed, .biometryLockout, .biometryNotEnrolled, .passcodeNotSet:
            return (.permissionDenied, message)
        case .biometryNotAvailable:
            return (type == .none ? .unsupported : .permissionDenied, message)
        case .biometryDisconnected, .biometryNotPaired, .companionNotAvailable:
            return (.unsupported, message)
        default:
            return (.internalError, message)
        }
    }
}
