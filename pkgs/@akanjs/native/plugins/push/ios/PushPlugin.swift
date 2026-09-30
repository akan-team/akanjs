import UIKit
import UserNotifications

/// Remote notifications through APNs directly (akanjs readiness O6-2), no Firebase SDK.
/// - register(): UIApplication.registerForRemoteNotifications; the app delegate hands the result to
///   AkanNativeRemoteNotifications, and the device token goes to the page as hex (what APNs senders take,
///   capacitor-plugins-next PushNotificationsPlugin.swift). A later, different token is a "token" event.
/// - Taps and foreground deliveries come through the shell's notification router (AkanNativeNotifications,
///   plugins.md C5): a remote notification is one whose trigger is UNPushNotificationTrigger, so the
///   local-notifications plugin keeps its own. The tap that launched the app waits in the router until
///   the page listens for "action" (C2).
/// - Foreground presentation follows setForegroundPresentation (default: not shown, like iOS without a
///   delegate); the page always gets "received".
/// - Silent pushes (content-available) reach the page as "received" while it listens.
/// - aps-environment comes from the manifest ("development"); an iPhone build takes the provisioning
///   profile's value (ios.ts), so App Store builds say "production".
final class PushPlugin: PushPluginSpec {
    static let id = "push"
    private let context: AkanNativePluginContext
    private lazy var events = PushEvents(context)
    private var presentation: UNNotificationPresentationOptions = []
    private var except: PushPresentationExcept?
    private var waiting: [AkanNativeReply<PushToken>] = []
    private var lastToken: String?
    /// A token change no page heard yet: delivered to the first "token" listener (C2), the latest only.
    private var pendingToken: PushToken?
    private var listening: Set<String> = []

    init(context: AkanNativePluginContext) {
        self.context = context
        if case .success(let data) = AkanNativeRemoteNotifications.shared.lastRegistration { lastToken = Self.hex(data) }
        AkanNativeRemoteNotifications.shared.listen(owner: context.owner, registration: { [weak self] result in self?.registered(result) }) { [weak self] userInfo in
            guard let self, self.listening.contains("received") else { return false }
            self.events.received(PushMessage(id: nil, title: nil, body: nil, data: Self.data(userInfo)))
            return true
        }
        AkanNativeNotifications.shared.register(Self.id, owner: context.owner, AkanNativeNotifications.Handler(
            claims: { $0.trigger is UNPushNotificationTrigger },
            willPresent: { [weak self] notification in
                guard let self else { return [] }
                self.events.received(Self.message(notification.request))
                if let except = self.except, let value = notification.request.content.userInfo[except.key] as? String,
                   except.values.contains(value) { return [] }
                return self.presentation
            },
            didReceive: { [weak self] response in
                guard let self, self.listening.contains("action") else { return false }
                let id = response.actionIdentifier
                let actionId = id == UNNotificationDefaultActionIdentifier ? "tap" : id == UNNotificationDismissActionIdentifier ? "dismiss" : id
                self.events.action(PushAction(actionId: actionId, message: Self.message(response.notification.request)))
                return true
            }
        ))
    }

    // MARK: permission

    func checkPermission(_ reply: AkanNativeReply<PushCheckPermissionResult>) {
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            let state = Self.state(settings.authorizationStatus)
            DispatchQueue.main.async { reply.resolve(PushCheckPermissionResult(display: state)) }
        }
    }

    func requestPermission(_ reply: AkanNativeReply<PushRequestPermissionResult>) {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { _, error in
            UNUserNotificationCenter.current().getNotificationSettings { settings in
                let state = Self.state(settings.authorizationStatus)
                DispatchQueue.main.async {
                    if let error, state != .granted { return reply.reject(.internalError, error.localizedDescription) }
                    reply.resolve(PushRequestPermissionResult(display: state))
                }
            }
        }
    }

    nonisolated private static func state(_ status: UNAuthorizationStatus) -> PushPermissionState {
        switch status {
        case .authorized, .provisional, .ephemeral: .granted
        case .denied: .denied
        default: .prompt
        }
    }

    // MARK: registration

    func register(_ reply: AkanNativeReply<PushToken>) {
        waiting.append(reply)
        // Every call asks again: iOS answers with the current token (and a new one after a restore).
        UIApplication.shared.registerForRemoteNotifications()
    }

    func unregister(_ reply: AkanNativeReply<Void>) {
        UIApplication.shared.unregisterForRemoteNotifications()
        lastToken = nil
        reply.resolve()
    }

    private func registered(_ result: Result<Data, any Error>) {
        let replies = waiting
        waiting = []
        switch result {
        case .success(let data):
            let token = PushToken(token: Self.hex(data), provider: .apns, platform: .ios)
            for reply in replies { reply.resolve(token) }
            if let previous = lastToken, previous != token.token {
                if listening.contains("token") { events.token(token) } else { pendingToken = token }
            }
            lastToken = token.token
        case .failure(let error):
            // The simulator and a missing aps-environment entitlement end here.
            for reply in replies { reply.reject(.unsupported, "APNs registration failed: \(error.localizedDescription)") }
        }
    }

    func setForegroundPresentation(_ args: PushPresentation, _ reply: AkanNativeReply<Void>) {
        var options: UNNotificationPresentationOptions = []
        if args.banner == true { options.insert(.banner) }
        if args.list == true { options.insert(.list) }
        if args.sound == true { options.insert(.sound) }
        if args.badge == true { options.insert(.badge) }
        presentation = options
        except = args.except
        reply.resolve()
    }

    // MARK: events

    func startListening(_ event: String) {
        listening.insert(event)
        if event == "action" { AkanNativeNotifications.shared.replay(Self.id) }
        if event == "token", let token = pendingToken {
            pendingToken = nil
            events.token(token)
        }
    }

    func stopListening(_ event: String) {
        listening.remove(event)
    }

    // MARK: JSON

    nonisolated private static func hex(_ data: Data) -> String {
        data.map { String(format: "%02x", $0) }.joined()
    }

    private static func message(_ request: UNNotificationRequest) -> PushMessage {
        let content = request.content
        return PushMessage(id: request.identifier, title: content.title.isEmpty ? nil : content.title, body: content.body.isEmpty ? nil : content.body, data: data(content.userInfo))
    }

    /// The payload's own keys (not "aps"), as JSON values.
    private static func data(_ userInfo: [AnyHashable: Any]) -> [String: Any] {
        var out: [String: Any] = [:]
        for (key, value) in userInfo {
            guard let key = key as? String, key != "aps" else { continue }
            out[key] = json(value)
        }
        return out
    }

    private static func json(_ value: Any) -> Any {
        switch value {
        case let v as String: v
        case let v as NSNumber: v
        case let v as [Any]: v.map(json)
        case let v as [AnyHashable: Any]: Dictionary(uniqueKeysWithValues: v.compactMap { k, x in (k as? String).map { ($0, json(x)) } })
        case is NSNull: NSNull()
        default: String(describing: value)
        }
    }
}
