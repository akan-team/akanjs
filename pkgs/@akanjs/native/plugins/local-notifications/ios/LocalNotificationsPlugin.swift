import UIKit
import UserNotifications

/// UNUserNotificationCenter. The page sends `at` as epoch ms and `every` (schedule.ts), so no date
/// parsing happens here.
/// - Triggers: a one-shot is a UNTimeIntervalNotificationTrigger (an absolute instant, like Android's
///   RTC alarm), none when due. `every` is a repeating UNCalendarNotificationTrigger on the components
///   of `at` (second / minute+second / time of day / weekday+time), so day and week keep the local time
///   across DST. capacitor-plugins/local-notifications/ios/.../LocalNotificationsPlugin.swift:310-324
///   repeats a time-interval trigger whose interval is the time until `at` instead.
/// - The target time is kept in userInfo: UNTimeIntervalNotificationTrigger.nextTriggerDate() counts
///   from the moment it is asked, not from when the request was added (checked on the simulator).
/// - Everything the events need is in userInfo (data as JSON text: userInfo must be a property list,
///   and JSON null is not). tauri-plugins-workspace/plugins/notification/ios/Sources/NotificationHandler.swift:79
///   force-unwraps an in-memory map instead, which is empty after a relaunch.
/// - schedule() waits for every add() before resolving; Capacitor resolves first and may reject
///   afterwards (LocalNotificationsPlugin.swift:100-118).
/// - At most 64 requests stay pending per app; iOS keeps the ones that fire soonest.
///
/// Delegate: UNUserNotificationCenter has one delegate, which the shell owns from launch on
/// (AkanNativeNotifications, plugins.md C5, like Capacitor's NotificationRouter.swift). This plugin
/// registers a handler for the notifications it posted. Taps the page does not listen for yet (a
/// cold start, a window that ended) stay with the shell until it does (plugins.md C2).
///
/// Arguments arrive decoded by the generated LocalNotificationsPluginSpec (PL-10), except schedule's:
/// its `at` is `string | number` in the spec, which the bindings cannot type, so it keeps the AkanNativeCall.
final class LocalNotificationsPlugin: NSObject, LocalNotificationsPluginSpec {
    static let id = "local-notifications"

    nonisolated private static let marker = "akan-native.ln"
    nonisolated private static let dataKey = "akan-native.data"
    nonisolated private static let everyKey = "akan-native.every"
    nonisolated private static let atKey = "akan-native.at"

    private let events: LocalNotificationsEvents
    private var actionListening = false

    private struct Item {
        let id: Int32
        let title: String
        let body: String
        let at: Double
        let every: String?
        let data: String?
    }

    init(context: AkanNativePluginContext) {
        events = LocalNotificationsEvents(context)
        super.init()
        AkanNativeNotifications.shared.register(Self.id, owner: context.owner, AkanNativeNotifications.Handler(
            claims: { Self.isOurs($0) },
            // Foreground delivery: show it like in the background and tell the page.
            willPresent: { [weak self] notification in
                self?.events.received(Self.event(notification.request))
                return [.banner, .list, .sound]
            },
            // Tap on the notification (the default action). Kept by the shell until the page listens.
            didReceive: { [weak self] response in
                guard let self, self.actionListening else { return false }
                if response.actionIdentifier == UNNotificationDefaultActionIdentifier { self.events.action(Self.event(response.notification.request)) }
                return true
            }
        ))
    }

    func cancel(_ args: LocalNotificationsCancelArgs, _ reply: AkanNativeReply<Void>) {
        guard let ids = Self.ids(args.ids, reply) else { return }
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: ids)
        reply.resolve()
    }

    func removeDelivered(_ args: LocalNotificationsRemoveDeliveredArgs, _ reply: AkanNativeReply<Void>) {
        guard let ids = Self.ids(args.ids, reply) else { return }
        UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: ids)
        reply.resolve()
    }

    func getPending(_ reply: AkanNativeReply<LocalNotificationsGetPendingResult>) {
        Task {
            let requests = await UNUserNotificationCenter.current().pendingNotificationRequests()
            let list = requests.filter(Self.isOurs).map(Self.pending).sorted { $0.at < $1.at }
            reply.resolve(LocalNotificationsGetPendingResult(notifications: list))
        }
    }

    func getDelivered(_ reply: AkanNativeReply<LocalNotificationsGetDeliveredResult>) {
        Task {
            let delivered = await UNUserNotificationCenter.current().deliveredNotifications()
            reply.resolve(LocalNotificationsGetDeliveredResult(notifications: delivered.filter { Self.isOurs($0.request) }.map(Self.delivered)))
        }
    }

    func removeAllDelivered(_ reply: AkanNativeReply<Void>) {
        Task {
            let center = UNUserNotificationCenter.current()
            let ours = await center.deliveredNotifications().filter { Self.isOurs($0.request) }
            center.removeDeliveredNotifications(withIdentifiers: ours.map(\.request.identifier))
            reply.resolve()
        }
    }

    func createChannel(_ args: LocalNotificationsChannelOptions, _ reply: AkanNativeReply<Void>) {
        reply.resolve() // Android only
    }

    func checkPermission(_ reply: AkanNativeReply<LocalNotificationsCheckPermissionResult>) {
        Task {
            let status = await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
            reply.resolve(LocalNotificationsCheckPermissionResult(display: Self.state(status)))
        }
    }

    // MARK: schedule

    /// Untyped in the spec (`at: string | number`); the page has already turned `at` into epoch ms.
    func schedule(_ call: AkanNativeCall) {
        guard let list = call.args["notifications"] as? [[String: Any]], !list.isEmpty else {
            return call.reject(.invalidArgs, "schedule: notifications must be a non-empty array")
        }
        var items: [Item] = []
        for (i, raw) in list.enumerated() {
            guard let id = Self.int32(raw["id"]), let title = raw["title"] as? String,
                  let at = (raw["at"] as? NSNumber)?.doubleValue, at.isFinite else {
                return call.reject(.invalidArgs, "notifications[\(i)] needs id, title and at (epoch ms)")
            }
            let every = raw["every"] as? String
            if let every, !["minute", "hour", "day", "week"].contains(every) {
                return call.reject(.invalidArgs, "notifications[\(i)].every must be minute, hour, day or week")
            }
            var data: String?
            if let object = raw["data"] as? [String: Any] {
                guard let text = AkanNativeBridge.encode(object) else { return call.reject(.invalidArgs, "notifications[\(i)].data must be JSON") }
                data = text
            }
            items.append(Item(id: id, title: title, body: raw["body"] as? String ?? "", at: at, every: every, data: data))
        }
        let requests = items.map(Self.request)
        let ids = items.map { Int($0.id) }
        Task {
            let center = UNUserNotificationCenter.current()
            // Checked first so every platform answers the same way without the permission.
            let status = await center.notificationSettings().authorizationStatus
            guard Self.state(status) == .granted else {
                return call.reject(.permissionDenied, "notification permission is not granted (call requestPermission)")
            }
            do {
                for request in requests { try await center.add(request) }
                call.resolve(["ids": ids])
            } catch {
                let code = (error as? UNError)?.code == .notificationsNotAllowed ? AkanNativeErrorCode.permissionDenied : .internalError
                call.reject(code, "scheduling failed: \(error.localizedDescription)")
            }
        }
    }

    private static func request(_ item: Item) -> UNNotificationRequest {
        let content = UNMutableNotificationContent()
        content.title = item.title
        content.body = item.body
        content.sound = .default
        var info: [String: Any] = [marker: 1, atKey: item.at]
        if let data = item.data { info[dataKey] = data }
        if let every = item.every { info[everyKey] = every }
        content.userInfo = info

        let date = Date(timeIntervalSince1970: item.at / 1000)
        let trigger: UNNotificationTrigger?
        if let every = item.every {
            let units: Set<Calendar.Component> = switch every {
            case "minute": [.second]
            case "hour": [.minute, .second]
            case "day": [.hour, .minute, .second]
            default: [.weekday, .hour, .minute, .second]
            }
            trigger = UNCalendarNotificationTrigger(dateMatching: Calendar.current.dateComponents(units, from: date), repeats: true)
        } else {
            let interval = date.timeIntervalSinceNow
            trigger = interval >= 1 ? UNTimeIntervalNotificationTrigger(timeInterval: interval, repeats: false) : nil
        }
        return UNNotificationRequest(identifier: String(item.id), content: content, trigger: trigger)
    }

    // MARK: permission

    /// provisional: quiet delivery granted without a prompt (UNAuthorizationOptions.provisional).
    /// A provisional app may still ask for the full permission, which shows the prompt.
    func requestPermission(_ args: LocalNotificationsRequestPermissionArgs, _ reply: AkanNativeReply<LocalNotificationsRequestPermissionResult>) {
        let provisional = args.provisional ?? false
        Task {
            let center = UNUserNotificationCenter.current()
            let status = await center.notificationSettings().authorizationStatus
            if status == .notDetermined || (status == .provisional && !provisional) {
                do {
                    var options: UNAuthorizationOptions = [.alert, .sound, .badge]
                    if provisional { options.insert(.provisional) }
                    _ = try await center.requestAuthorization(options: options)
                } catch {
                    return reply.reject(.internalError, "requestAuthorization failed: \(error.localizedDescription)")
                }
            }
            reply.resolve(LocalNotificationsRequestPermissionResult(display: Self.state(await center.notificationSettings().authorizationStatus)))
        }
    }

    nonisolated private static func state(_ status: UNAuthorizationStatus) -> LocalNotificationsPermissionState {
        switch status {
        case .authorized, .provisional, .ephemeral: .granted
        case .denied: .denied
        default: .prompt
        }
    }

    // MARK: events

    func startListening(_ event: String) {
        guard event == "action" else { return }
        actionListening = true
        AkanNativeNotifications.shared.replay(Self.id)
    }

    func stopListening(_ event: String) {
        if event == "action" { actionListening = false }
    }

    // MARK: JSON

    nonisolated private static func isOurs(_ request: UNNotificationRequest) -> Bool {
        request.content.userInfo[marker] != nil && Int32(request.identifier) != nil
    }

    nonisolated private static func event(_ request: UNNotificationRequest) -> LocalNotificationsNotificationEvent {
        var event = LocalNotificationsNotificationEvent(id: Double(Int(request.identifier) ?? 0), title: request.content.title, body: request.content.body)
        // Always an object: schedule() stores only data objects.
        if let text = request.content.userInfo[dataKey] as? String, let raw = text.data(using: .utf8),
           let object = try? JSONSerialization.jsonObject(with: raw) as? [String: Any] {
            event.data = object
        }
        return event
    }

    nonisolated private static func pending(_ request: UNNotificationRequest) -> LocalNotificationsPendingNotification {
        let e = event(request)
        let info = request.content.userInfo
        var n = LocalNotificationsPendingNotification(id: e.id, title: e.title, body: e.body, at: (info[atKey] as? NSNumber)?.doubleValue ?? 0, data: e.data)
        if let every = info[everyKey] as? String {
            n.every = LocalNotificationsRepeat(rawValue: every) // always one: schedule() checks it
            // Calendar triggers do know their next date (unlike time-interval ones, see above).
            if let next = (request.trigger as? UNCalendarNotificationTrigger)?.nextTriggerDate() {
                n.at = (next.timeIntervalSince1970 * 1000).rounded()
            }
        }
        return n
    }

    nonisolated private static func delivered(_ notification: UNNotification) -> LocalNotificationsDeliveredNotification {
        let e = event(notification.request)
        return LocalNotificationsDeliveredNotification(id: e.id, title: e.title, body: e.body, at: (notification.date.timeIntervalSince1970 * 1000).rounded(), data: e.data)
    }

    nonisolated private static func int32(_ value: Any?) -> Int32? {
        guard let number = value as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID() else { return nil }
        let double = number.doubleValue
        guard double.rounded() == double, double >= Double(Int32.min), double <= Double(Int32.max) else { return nil }
        return Int32(double)
    }

    /// The ids as request identifiers, or nil (rejected) unless every one is a 32-bit integer.
    private static func ids<T>(_ values: [Double], _ reply: AkanNativeReply<T>) -> [String]? {
        var ids: [String] = []
        for value in values {
            guard let id = Int32(exactly: value) else {
                reply.reject(.invalidArgs, "\(reply.call.method): ids must be an array of 32-bit integers")
                return nil
            }
            ids.append(String(id))
        }
        return ids
    }
}
