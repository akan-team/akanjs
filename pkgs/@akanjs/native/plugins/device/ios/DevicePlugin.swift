import UIKit

/// Device facts from UIDevice, following capacitor-plugins/device/ios/Sources/DevicePlugin/DevicePlugin.swift:
/// - model: in the simulator hw.machine is the Mac's ("arm64"), so the simulated model comes from
///   SIMULATOR_MODEL_IDENTIFIER (:29-34). UIDevice.name is not used: without an entitlement it is
///   the generic "iPhone" since iOS 16.
/// - webViewVersion: WebKit ships with the OS, so it is the OS version (:49).
/// - battery: monitoring is switched on only to read, then restored (Capacitor switches it off,
///   which would break app code that had it on). The simulator reports level -1 / state unknown.
/// - language: Locale.preferredLanguages keeps the user's order. The code is the tag's first
///   subtag; Capacitor's `prefix(2)` (Device.swift:24-26) cuts three-letter codes such as "fil".
/// The result types come from the generated DevicePluginSpec (PL-10).
final class DevicePlugin: DevicePluginSpec {
    static let id = "device"

    init(context: AkanNativePluginContext) {}

    func getInfo(_ reply: AkanNativeReply<DeviceInfo>) {
        let device = UIDevice.current
        reply.resolve(DeviceInfo(
            platform: .ios,
            model: Self.model,
            manufacturer: "Apple",
            osName: device.systemName,
            osVersion: device.systemVersion,
            isVirtual: Self.isSimulator,
            webViewVersion: device.systemVersion
        ))
    }

    func getId(_ reply: AkanNativeReply<DeviceGetIdResult>) {
        // nil after a restart until the device is first unlocked (Apple's documentation).
        guard let id = UIDevice.current.identifierForVendor else {
            return reply.reject(.internalError, "identifierForVendor is not available yet, try again later")
        }
        reply.resolve(DeviceGetIdResult(identifier: id.uuidString))
    }

    func getLanguage(_ reply: AkanNativeReply<DeviceGetLanguageResult>) {
        let tag = (Locale.preferredLanguages.first ?? Locale.current.identifier(.bcp47)).replacingOccurrences(of: "_", with: "-")
        reply.resolve(DeviceGetLanguageResult(tag: tag, code: tag.split(separator: "-").first.map { $0.lowercased() } ?? tag))
    }

    func getBattery(_ reply: AkanNativeReply<DeviceBatteryInfo>) {
        reply.resolve(Self.battery())
    }

    private static var isSimulator: Bool {
        #if targetEnvironment(simulator)
            true
        #else
            false
        #endif
    }

    private static var model: String {
        #if targetEnvironment(simulator)
            return ProcessInfo.processInfo.environment["SIMULATOR_MODEL_IDENTIFIER"] ?? "Simulator"
        #else
            var size = 0
            sysctlbyname("hw.machine", nil, &size, nil, 0)
            var machine = [UInt8](repeating: 0, count: size)
            sysctlbyname("hw.machine", &machine, &size, nil, 0)
            return String(decoding: machine.prefix { $0 != 0 }, as: UTF8.self)
        #endif
    }

    private static func battery() -> DeviceBatteryInfo {
        let device = UIDevice.current
        let wasMonitoring = device.isBatteryMonitoringEnabled
        device.isBatteryMonitoringEnabled = true
        let level = device.batteryLevel
        let state = device.batteryState
        device.isBatteryMonitoringEnabled = wasMonitoring
        return DeviceBatteryInfo(
            level: level < 0 ? nil : (Double(level) * 100).rounded() / 100,
            charging: state == .unknown ? nil : state == .charging || state == .full
        )
    }
}
