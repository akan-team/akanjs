import UIKit

/// Interface orientation of the window scene, and a lock through the shell's view controller.
/// - Lock: UIKit asks the root view controller's supportedInterfaceOrientations, so the shell's
///   AkanNativeViewController returns `orientationLock` when set (shell hook). After changing it,
///   setNeedsUpdateOfSupportedInterfaceOrientations + requestGeometryUpdate rotate the scene
///   (capacitor-plugins/screen-orientation/ios/Sources/ScreenOrientationPlugin/ScreenOrientation.swift:29-47,
///   which uses the deprecated UIDevice "orientation" key before iOS 16; not needed here).
/// - The lock is intersected with the app's orientations first: a mask with none in common makes
///   UIKit raise an exception. The iPhone Info.plist omits portrait upside down.
/// - get/change read the scene's effectiveGeometry.interfaceOrientation (what the page is drawn in).
///   Capacitor reads UIDevice.orientation, the physical device, which differs while locked and is
///   "face up" on a table. effectiveGeometry is key-value observable and changes for 180° turns too.
/// - landscape-primary is UIInterfaceOrientation.landscapeRight: the interface turns the opposite
///   way from the device (ScreenOrientation.swift:83-120, Safari's screen.orientation agrees).
/// Arguments arrive decoded and checked by the generated ScreenOrientationPluginSpec (PL-10).
final class ScreenOrientationPlugin: ScreenOrientationPluginSpec {
    static let id = "screen-orientation"
    private static let lockWait: TimeInterval = 1.5

    private static func mask(_ lock: ScreenOrientationOrientationLock) -> UIInterfaceOrientationMask {
        switch lock {
        case .any: .all
        case .portrait: [.portrait, .portraitUpsideDown]
        case .landscape: .landscape
        case .portraitPrimary: .portrait
        case .portraitSecondary: .portraitUpsideDown
        case .landscapePrimary: .landscapeRight
        case .landscapeSecondary: .landscapeLeft
        }
    }

    private let context: AkanNativePluginContext
    private var observation: NSKeyValueObservation?
    private var observedScene: UIWindowScene?
    private var listening = false
    private var last: ScreenOrientationOrientationType?
    /// lock() calls waiting for the scene to reach an allowed orientation.
    private var waiting: [(reply: AkanNativeReply<Void>, mask: UIInterfaceOrientationMask)] = []

    init(context: AkanNativePluginContext) {
        self.context = context
    }

    func get(_ reply: AkanNativeReply<ScreenOrientationOrientationState>) {
        reply.resolve(ScreenOrientationOrientationState(type: type()))
    }

    func lock(_ args: ScreenOrientationLockArgs, _ reply: AkanNativeReply<Void>) {
        let name = args.orientation.rawValue
        guard let controller = context.viewController as? AkanNativeViewController, let scene = context.windowScene else {
            return reply.reject(.internalError, "no window to lock")
        }
        let supported = UIApplication.shared.supportedInterfaceOrientations(for: controller.view.window)
        let mask = Self.mask(args.orientation).intersection(supported)
        if mask.isEmpty {
            return reply.reject(.unsupported, "\(name) is not one of the app's orientations on this device")
        }
        controller.orientationLock = mask
        controller.setNeedsUpdateOfSupportedInterfaceOrientations()
        if Self.contains(mask, scene.effectiveGeometry.interfaceOrientation) { return reply.resolve() }

        waiting.append((reply, mask))
        observe(scene)
        scene.requestGeometryUpdate(.iOS(interfaceOrientations: mask)) { error in
            // iPad multitasking, or a presented controller that does not allow the orientation.
            let message = error.localizedDescription
            reply.reject(.unsupported, "the system refused \(name): \(message)")
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.lockWait) { [weak self] in
            // The lock is in place; the rotation may still be under way or come with the next device turn.
            reply.resolve()
            self?.waiting.removeAll { $0.reply === reply }
            self?.stopObservingIfIdle()
        }
    }

    func unlock(_ reply: AkanNativeReply<Void>) {
        (context.viewController as? AkanNativeViewController)?.orientationLock = nil
        context.viewController?.setNeedsUpdateOfSupportedInterfaceOrientations()
        reply.resolve()
    }

    func startListening(_ event: String) {
        guard event == "change" else { return }
        listening = true
        last = type()
        if let scene = context.windowScene { observe(scene) }
    }

    func stopListening(_ event: String) {
        guard event == "change" else { return }
        listening = false
        last = nil
        stopObservingIfIdle()
    }

    private func observe(_ scene: UIWindowScene) {
        guard observation == nil || observedScene !== scene else { return }
        observedScene = scene
        observation = scene.observe(\.effectiveGeometry, options: [.new]) { [weak self] scene, _ in
            MainActor.assumeIsolated { self?.geometryChanged(scene.effectiveGeometry.interfaceOrientation) }
        }
    }

    private func stopObservingIfIdle() {
        guard !listening, waiting.isEmpty else { return }
        observation?.invalidate()
        observation = nil
        observedScene = nil
    }

    private func geometryChanged(_ orientation: UIInterfaceOrientation) {
        let reached = waiting.filter { Self.contains($0.mask, orientation) }
        waiting.removeAll { Self.contains($0.mask, orientation) }
        for entry in reached { entry.reply.resolve() }
        if listening, let next = Self.type(orientation), next != last {
            last = next
            ScreenOrientationEvents(context).change(ScreenOrientationOrientationState(type: next))
        }
        stopObservingIfIdle()
    }

    private func type() -> ScreenOrientationOrientationType {
        if let scene = context.windowScene, let type = Self.type(scene.effectiveGeometry.interfaceOrientation) { return type }
        // No window yet: guess from the screen's shape.
        let bounds = context.webView?.bounds.size ?? .zero
        return bounds.width > bounds.height ? .landscapePrimary : .portraitPrimary
    }

    private static func type(_ orientation: UIInterfaceOrientation) -> ScreenOrientationOrientationType? {
        switch orientation {
        case .portrait: .portraitPrimary
        case .portraitUpsideDown: .portraitSecondary
        case .landscapeRight: .landscapePrimary
        case .landscapeLeft: .landscapeSecondary
        default: nil
        }
    }

    private static func contains(_ mask: UIInterfaceOrientationMask, _ orientation: UIInterfaceOrientation) -> Bool {
        switch orientation {
        case .portrait: mask.contains(.portrait)
        case .portraitUpsideDown: mask.contains(.portraitUpsideDown)
        case .landscapeLeft: mask.contains(.landscapeLeft)
        case .landscapeRight: mask.contains(.landscapeRight)
        default: false
        }
    }
}
