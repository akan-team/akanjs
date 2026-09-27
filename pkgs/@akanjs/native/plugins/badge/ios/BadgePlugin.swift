import UserNotifications

/// The app icon badge through UNUserNotificationCenter.setBadgeCount (iOS 16), plugins.md §4.6.
/// - Not UIApplication.applicationIconBadgeNumber, which tao/src/platform_impl/ios/badge.rs:8-15 and
///   capacitor-plugins/local-notifications/.../LocalNotificationsPlugin.swift:635 set: it is
///   deprecated since iOS 17 and has no replacement getter, which is why there is no get().
/// - Badges belong to the notification permission. tao sets the number without looking and the
///   badge silently never appears; here set() checks the settings first and rejects
///   PERMISSION_DENIED, the way plugins/local-notifications answers schedule() without permission.
///   "granted" needs an authorization that shows badges: provisional authorization delivers quietly
///   without badges, so it counts as "prompt" (requestPermission asks for the full one).
/// - requestPermission asks for alerts, sounds and badges together, the set of
///   plugins/local-notifications and capacitor-plugins/push-notifications/.../PushNotificationsHandler.swift:9.
///   iOS prompts once per app, and the options of that first request are what the user grants, so a
///   badge-only request would leave a later notifications prompt without alerts.
/// - clear() resolves without the permission: no badge can be showing then.
/// Arguments arrive decoded by the generated BadgePluginSpec (PL-10); the range is checked here.
final class BadgePlugin: BadgePluginSpec {
    static let id = "badge"
    private static let maxCount = 2_147_483_647.0

    init(context: AkanNativePluginContext) {}

    func set(_ args: BadgeSetArgs, _ reply: AkanNativeReply<Void>) {
        let value = args.count
        guard value.rounded() == value, value >= 0, value <= Self.maxCount else {
            return reply.reject(.invalidArgs, "count must be an integer from 0 to 2147483647")
        }
        let count = Int(value)
        Task {
            let center = UNUserNotificationCenter.current()
            guard Self.state(await center.notificationSettings()) == .granted else {
                return reply.reject(.permissionDenied, "badge permission is not granted (call requestPermission)")
            }
            do {
                try await center.setBadgeCount(count)
                reply.resolve()
            } catch {
                reply.reject(Self.code(error), "setting the badge failed: \(error.localizedDescription)")
            }
        }
    }

    func clear(_ reply: AkanNativeReply<Void>) {
        Task {
            let center = UNUserNotificationCenter.current()
            guard Self.state(await center.notificationSettings()) == .granted else { return reply.resolve() }
            do {
                try await center.setBadgeCount(0)
                reply.resolve()
            } catch {
                reply.reject(Self.code(error), "clearing the badge failed: \(error.localizedDescription)")
            }
        }
    }

    func checkPermission(_ reply: AkanNativeReply<BadgeCheckPermissionResult>) {
        Task {
            reply.resolve(BadgeCheckPermissionResult(badge: Self.state(await UNUserNotificationCenter.current().notificationSettings())))
        }
    }

    func requestPermission(_ reply: AkanNativeReply<BadgeRequestPermissionResult>) {
        Task {
            let center = UNUserNotificationCenter.current()
            let status = await center.notificationSettings().authorizationStatus
            if status == .notDetermined || status == .provisional {
                do {
                    _ = try await center.requestAuthorization(options: [.alert, .sound, .badge])
                } catch {
                    return reply.reject(.internalError, "requestAuthorization failed: \(error.localizedDescription)")
                }
            }
            reply.resolve(BadgeRequestPermissionResult(badge: Self.state(await center.notificationSettings())))
        }
    }

    nonisolated private static func state(_ settings: UNNotificationSettings) -> BadgePermissionState {
        switch settings.authorizationStatus {
        case .notDetermined, .provisional:
            return settings.badgeSetting == .enabled ? .granted : .prompt
        case .denied:
            return .denied
        default: // authorized, ephemeral
            return settings.badgeSetting == .enabled ? .granted : .denied // badges switched off in Settings
        }
    }

    nonisolated private static func code(_ error: any Error) -> AkanNativeErrorCode {
        (error as? UNError)?.code == .notificationsNotAllowed ? .permissionDenied : .internalError
    }
}
