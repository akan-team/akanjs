import Foundation

/// UserDefaults in a dedicated suite (Library/Preferences/akan-native.preferences.plist).
/// capacitor-plugins/preferences uses UserDefaults.standard with a key prefix because .standard
/// also holds system keys; a separate suite keeps keys() and clear() exact. The suite name must
/// not be the bundle id (that is the .standard domain).
/// Arguments arrive decoded and checked by the generated PreferencesPluginSpec (PL-10).
final class PreferencesPlugin: PreferencesPluginSpec {
    static let id = "preferences"
    private static let suite = "akan-native.preferences"
    private let defaults = UserDefaults(suiteName: PreferencesPlugin.suite)!

    init(context: AkanNativePluginContext) {}

    func get(_ args: PreferencesGetArgs, _ reply: AkanNativeReply<PreferencesGetResult>) {
        guard Self.valid(args.key, reply) else { return }
        reply.resolve(PreferencesGetResult(value: defaults.string(forKey: args.key)))
    }

    func set(_ args: PreferencesSetArgs, _ reply: AkanNativeReply<Void>) {
        guard Self.valid(args.key, reply) else { return }
        defaults.set(args.value, forKey: args.key)
        reply.resolve()
    }

    func remove(_ args: PreferencesRemoveArgs, _ reply: AkanNativeReply<Void>) {
        guard Self.valid(args.key, reply) else { return }
        defaults.removeObject(forKey: args.key)
        reply.resolve()
    }

    func keys(_ reply: AkanNativeReply<PreferencesKeysResult>) {
        let keys = defaults.persistentDomain(forName: Self.suite).map { Array($0.keys) } ?? []
        reply.resolve(PreferencesKeysResult(keys: keys.sorted()))
    }

    func clear(_ reply: AkanNativeReply<Void>) {
        defaults.removePersistentDomain(forName: Self.suite)
        reply.resolve()
    }

    private static func valid<T>(_ key: String, _ reply: AkanNativeReply<T>) -> Bool {
        if !key.isEmpty { return true }
        reply.reject(.invalidArgs, "key must be a non-empty string")
        return false
    }
}
