import Foundation
import Security

/// Keychain generic passwords: service "<bundle id>.akan-native.secure-storage", account = key, data = UTF-8.
/// - kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly: readable in the background once the device
///   was unlocked after boot, never synced to iCloud Keychain and never restored onto another
///   device from a backup (expo-secure-store and capacitor secure storage default to WhenUnlocked,
///   which breaks token refresh in background tasks).
/// - Keychain items outlive the app: they are still there after an uninstall and reinstall. Wiping
///   them on "first launch" (a UserDefaults flag) is a known trap, because a prewarmed launch before
///   the first unlock reads UserDefaults as empty; apps that want it call clear() themselves.
/// - SecItem calls block on securityd, so they run on a serial queue (also keeps set/get ordered).
/// - Update first, add on errSecItemNotFound: SecItemAdd on an existing item fails with errSecDuplicateItem.
/// Arguments arrive decoded and type-checked by the generated SecureStoragePluginSpec (PL-10).
final class SecureStoragePlugin: SecureStoragePluginSpec {
    static let id = "secure-storage"
    private let service: String
    private let queue = DispatchQueue(label: "com.akanjs.secure-storage")

    init(context: AkanNativePluginContext) {
        service = "\(Bundle.main.bundleIdentifier ?? "akan-native").akan-native.secure-storage"
    }

    func get(_ args: SecureStorageGetArgs, _ reply: AkanNativeReply<SecureStorageGetResult>) {
        guard Self.valid(args.key, reply) else { return }
        let key = args.key
        let service = self.service
        queue.async { Self.finish(reply) { try SecureStorageGetResult(value: Self.read(service, key)) } }
    }

    func set(_ args: SecureStorageSetArgs, _ reply: AkanNativeReply<Void>) {
        guard Self.valid(args.key, reply) else { return }
        let key = args.key
        let service = self.service
        let value = args.value
        queue.async { Self.finish(reply) { try Self.write(service, key, Data(value.utf8)) } }
    }

    func remove(_ args: SecureStorageRemoveArgs, _ reply: AkanNativeReply<Void>) {
        guard Self.valid(args.key, reply) else { return }
        let key = args.key
        let service = self.service
        queue.async {
            Self.finish(reply) {
                try Self.check(SecItemDelete(Self.query(service, key) as CFDictionary), allowNotFound: true)
            }
        }
    }

    func keys(_ reply: AkanNativeReply<SecureStorageKeysResult>) {
        let service = self.service
        queue.async { Self.finish(reply) { try SecureStorageKeysResult(keys: Self.accounts(service)) } }
    }

    func clear(_ reply: AkanNativeReply<Void>) {
        let service = self.service
        // On iOS SecItemDelete removes every match (on macOS' file-based keychain only the first).
        queue.async {
            Self.finish(reply) {
                try Self.check(SecItemDelete(Self.query(service, nil) as CFDictionary), allowNotFound: true)
            }
        }
    }

    private static func valid<T>(_ key: String, _ reply: AkanNativeReply<T>) -> Bool {
        if !key.isEmpty { return true }
        reply.reject(.invalidArgs, "key must be a non-empty string")
        return false
    }

    // MARK: Keychain (off the main actor)

    private struct KeychainError: Error {
        let status: OSStatus
    }

    nonisolated private static func finish<T>(_ reply: AkanNativeReply<T>, _ body: () throws -> T) {
        do {
            reply.resolve(try body())
        } catch let error as KeychainError {
            let text = SecCopyErrorMessageString(error.status, nil) as String? ?? "OSStatus \(error.status)"
            let hint =
                switch error.status {
                // Before the first unlock after a reboot (prewarmed launch).
                case errSecInteractionNotAllowed: " (the device has not been unlocked since it started)"
                // An ad-hoc signed simulator build without the application-identifier entitlement
                // (Xcode embeds it as simulated entitlements, a __TEXT,__entitlements section).
                case errSecMissingEntitlement: " (the app has no application-identifier entitlement)"
                default: ""
                }
            reply.reject(.internalError, "keychain: \(text)\(hint)")
        } catch {
            reply.reject(.internalError, "\(error)")
        }
    }

    nonisolated private static func query(_ service: String, _ account: String?) -> [String: Any] {
        var query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service]
        if let account { query[kSecAttrAccount as String] = account }
        return query
    }

    nonisolated private static func check(_ status: OSStatus, allowNotFound: Bool = false) throws {
        if status == errSecSuccess || (allowNotFound && status == errSecItemNotFound) { return }
        throw KeychainError(status: status)
    }

    nonisolated private static func read(_ service: String, _ account: String) throws -> String? {
        var query = query(service, account)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        try check(status)
        guard let data = result as? Data else { return nil }
        guard let text = String(data: data, encoding: .utf8) else {
            throw NSError(domain: "akan-native", code: 1, userInfo: [NSLocalizedDescriptionKey: "\(account) does not hold UTF-8 text"])
        }
        return text
    }

    nonisolated private static func write(_ service: String, _ account: String, _ data: Data) throws {
        let attributes: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ]
        let status = SecItemUpdate(query(service, account) as CFDictionary, attributes as CFDictionary)
        if status != errSecItemNotFound { return try check(status) }
        let add = query(service, account).merging(attributes) { $1 }
        try check(SecItemAdd(add as CFDictionary, nil))
    }

    nonisolated private static func accounts(_ service: String) throws -> [String] {
        var query = query(service, nil)
        query[kSecReturnAttributes as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitAll
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { return [] }
        try check(status)
        let items = result as? [[String: Any]] ?? []
        return items.compactMap { $0[kSecAttrAccount as String] as? String }.sorted()
    }
}
