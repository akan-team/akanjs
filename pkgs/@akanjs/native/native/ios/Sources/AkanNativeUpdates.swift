// Web bundle updates (UP-2): which bundle the shell serves, and the trial / confirm / rollback
// state. @akanjs/native/plugins/updates downloads and verifies bundles and calls stage/apply/confirm; the
// shell picks the bundle at launch (`launch`) and rolls back a trial that never confirms.
//
// Layout: Library/Application Support/akan-native-updates/{state.json, bundles/<bundle>/{…, manifest.json,
// manifest.json.sig}} (the filesystem plugin's `data` is Application Support/files). A bundle is
// served only while its signed manifest still verifies and its files are all there with their
// sizes (checked at every launch).
// state.json: { current?, pending?, trial?, failed: [bundle], rolledBack? } with entries
// { bundle, sequence, nativeApi, attempts? }.
// - A downloaded bundle is `pending`. At the next launch (or apply()) it becomes `trial` with one
//   attempt. notifyReady() makes the trial `current`. A trial that is launched again without
//   having confirmed (it crashed or hung) is marked failed and the previous bundle serves.
// - Anything built for another native API (UP-3) or older than the binary's own bundle
//   (embeddedSequence in updates.json) is dropped: Capacitor's "new binary resets the live
//   update" rule (CAPBridgeViewController.swift:18-29, 327-339), keyed on the fingerprint.
// - Nothing is deleted before the new bundle confirmed (Electrobun removes .previous as soon as
//   the new app launched, electrobun/package/src/extractor/main.zig:7811-7818).

// Compiled only when the app has updates (a config or the plugin): akan-native passes -D AKAN_NATIVE_UPDATES
// (architecture review stage 6, optional features are compiled only when used).
#if AKAN_NATIVE_UPDATES
import CryptoKit
import Foundation

struct AkanNativeUpdateEntry: Equatable, Sendable {
    var bundle: String
    var sequence: Double
    var nativeApi: String
    var attempts: Int = 0

    init(bundle: String, sequence: Double, nativeApi: String, attempts: Int = 0) {
        self.bundle = bundle
        self.sequence = sequence
        self.nativeApi = nativeApi
        self.attempts = attempts
    }

    init?(_ json: Any?) {
        guard let o = json as? [String: Any], let bundle = o["bundle"] as? String, AkanNativeUpdates.isBundleId(bundle),
              let sequence = (o["sequence"] as? NSNumber)?.doubleValue, let nativeApi = o["nativeApi"] as? String else { return nil }
        self.init(bundle: bundle, sequence: sequence, nativeApi: nativeApi, attempts: (o["attempts"] as? NSNumber)?.intValue ?? 0)
    }

    var json: [String: Any] { ["bundle": bundle, "sequence": sequence, "nativeApi": nativeApi, "attempts": attempts] }
}

struct AkanNativeUpdateState: Sendable {
    var current: AkanNativeUpdateEntry?
    var pending: AkanNativeUpdateEntry?
    var trial: AkanNativeUpdateEntry?
    var failed: [String] = []
    var rolledBack: String?

    init() {}

    init(_ o: [String: Any]) {
        current = AkanNativeUpdateEntry(o["current"])
        pending = AkanNativeUpdateEntry(o["pending"])
        trial = AkanNativeUpdateEntry(o["trial"])
        failed = (o["failed"] as? [String] ?? []).filter(AkanNativeUpdates.isBundleId)
        rolledBack = o["rolledBack"] as? String
    }

    var json: [String: Any] {
        var o: [String: Any] = ["failed": Array(failed.suffix(20))]
        if let current { o["current"] = current.json }
        if let pending { o["pending"] = pending.json }
        if let trial { o["trial"] = trial.json }
        if let rolledBack { o["rolledBack"] = rolledBack }
        return o
    }
}

/// updates.json from the build (akan-native.config.ts `updates`), nil when the app has no updates.
struct AkanNativeUpdateConfig: Sendable {
    let app: String
    let platform: String
    let nativeApi: String
    let embeddedSequence: Double
    let url: String
    let publicKey: Data
    let channel: String
    let readyTimeout: TimeInterval
    let dev: Bool

    static func load() -> AkanNativeUpdateConfig? {
        let o = AkanNativeResources.json("updates.json")
        guard let app = o["app"] as? String, let url = o["url"] as? String, let key = (o["publicKey"] as? String).flatMap({ Data(base64Encoded: $0) }), key.count == 32,
              let nativeApi = o["nativeApi"] as? String else { return nil }
        return AkanNativeUpdateConfig(
            app: app,
            platform: o["platform"] as? String ?? "ios",
            nativeApi: nativeApi,
            embeddedSequence: (o["embeddedSequence"] as? NSNumber)?.doubleValue ?? 0,
            url: url,
            publicKey: key,
            channel: o["channel"] as? String ?? "production",
            readyTimeout: ((o["readyTimeout"] as? NSNumber)?.doubleValue ?? 10_000) / 1000,
            dev: o["dev"] as? Bool ?? false
        )
    }
}

@MainActor
enum AkanNativeUpdates {
    static let config = AkanNativeUpdateConfig.load()
    /// The bundle served in this session (nil: the one inside the app).
    private(set) static var active: AkanNativeUpdateEntry?
    /// The served bundle has not confirmed yet (notifyReady), so the ready timer runs.
    private(set) static var onTrial = false

    nonisolated static func isBundleId(_ s: String) -> Bool { AkanNativeKernel.isBundleId(s) }

    nonisolated static var directory: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return base.appendingPathComponent("akan-native-updates", isDirectory: true)
    }

    nonisolated static func bundleDirectory(_ bundle: String) -> URL {
        directory.appendingPathComponent("bundles", isDirectory: true).appendingPathComponent(bundle, isDirectory: true)
    }

    static func readState() -> AkanNativeUpdateState {
        guard let data = try? Data(contentsOf: directory.appendingPathComponent("state.json")),
              let o = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return AkanNativeUpdateState() }
        return AkanNativeUpdateState(o)
    }

    /// Atomic replace (write + rename), so a crash never leaves half a state file. false: not
    /// written (a full disk): a trial that is not on record must not run, since nothing would roll
    /// it back.
    @discardableResult
    static func writeState(_ state: AkanNativeUpdateState) -> Bool {
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        var url = directory
        var values = URLResourceValues()
        values.isExcludedFromBackup = true // downloadable again; not the user's data
        try? url.setResourceValues(values)
        guard let data = try? JSONSerialization.data(withJSONObject: state.json, options: [.sortedKeys]) else { return false }
        do {
            try data.write(to: directory.appendingPathComponent("state.json"), options: .atomic)
            return true
        } catch {
            NSLog("[akan-native] updates: cannot write state.json: %@", error.localizedDescription)
            return false
        }
    }

    /// Whether a bundle may run in this binary.
    static func usable(_ entry: AkanNativeUpdateEntry?, _ config: AkanNativeUpdateConfig) -> Bool {
        guard let entry else { return false }
        return entry.nativeApi == config.nativeApi && entry.sequence > config.embeddedSequence
            && FileManager.default.fileExists(atPath: bundleDirectory(entry.bundle).appendingPathComponent("index.html").path)
            && verified(entry, config)
    }

    /// The bundle's signed manifest (kept next to it by the plugin) verifies, describes this entry,
    /// and every file it lists is there with its size. The hashes were checked at the download.
    private static func verified(_ entry: AkanNativeUpdateEntry, _ config: AkanNativeUpdateConfig) -> Bool {
        let dir = bundleDirectory(entry.bundle)
        guard let manifest = try? Data(contentsOf: dir.appendingPathComponent("manifest.json")),
              let sigText = try? String(contentsOf: dir.appendingPathComponent("manifest.json.sig"), encoding: .utf8),
              let signature = Data(base64Encoded: sigText.trimmingCharacters(in: .whitespacesAndNewlines)),
              let key = try? Curve25519.Signing.PublicKey(rawRepresentation: config.publicKey),
              key.isValidSignature(signature, for: manifest),
              let o = try? JSONSerialization.jsonObject(with: manifest) as? [String: Any],
              o["bundle"] as? String == entry.bundle, (o["sequence"] as? NSNumber)?.doubleValue == entry.sequence,
              o["nativeApi"] as? String == entry.nativeApi, o["app"] as? String == config.app, o["platform"] as? String == config.platform,
              let files = o["files"] as? [[String: Any]] else { return false }
        return files.allSatisfy { f in
            guard let path = f["path"] as? String, let size = (f["size"] as? NSNumber)?.intValue,
                  let attributes = try? FileManager.default.attributesOfItem(atPath: dir.appendingPathComponent(path).path) else { return false }
            return attributes[.type] as? FileAttributeType == .typeRegular && (attributes[.size] as? NSNumber)?.intValue == size
        }
    }

    /// Picks the bundle for this launch (called once, before the web view loads) and returns its
    /// folder, or nil for the bundle inside the app.
    static func launch() -> URL? {
        guard let config else { return nil }
        var state = readState()
        if !usable(state.current, config) { state.current = nil }
        if !usable(state.pending, config) { state.pending = nil }
        if !usable(state.trial, config) { state.trial = nil }
        if let trial = state.trial {
            // Launched again without notifyReady(): the trial crashed or hung.
            state.failed.append(trial.bundle)
            state.rolledBack = trial.bundle
            state.trial = nil
            NSLog("[akan-native] updates: bundle %@ did not confirm; rolled back", trial.bundle)
        }
        if var pending = state.pending, !state.failed.contains(pending.bundle) {
            pending.attempts = 1
            state.trial = pending
            state.pending = nil
        }
        if !writeState(state), state.trial != nil {
            state.trial = nil // not on record: the pending bundle waits for a launch that can record it
        }
        active = state.trial ?? state.current
        onTrial = state.trial != nil
        return active.map { bundleDirectory($0.bundle) }
    }

    /// A verified download (plugin): runs at the next launch, or right away through apply().
    static func stage(_ entry: AkanNativeUpdateEntry) {
        var state = readState()
        state.pending = entry
        state.failed.removeAll { $0 == entry.bundle }
        writeState(state)
    }

    /// apply(): makes the pending bundle the trial now; returns its folder for the reload.
    static func applyPending() -> URL? {
        guard let config else { return nil }
        var state = readState()
        guard var pending = state.pending, usable(pending, config) else { return nil }
        pending.attempts = 1
        state.trial = pending
        state.pending = nil
        guard writeState(state) else { return nil }
        active = pending
        onTrial = true
        return bundleDirectory(pending.bundle)
    }

    /// notifyReady(): the served trial becomes current; bundles nothing refers to are removed.
    static func confirm() {
        guard onTrial, let trial = active else { return }
        var state = readState()
        guard state.trial?.bundle == trial.bundle else { return }
        state.current = AkanNativeUpdateEntry(bundle: trial.bundle, sequence: trial.sequence, nativeApi: trial.nativeApi)
        state.trial = nil
        state.rolledBack = nil
        writeState(state)
        onTrial = false
        prune(keep: [state.current?.bundle, state.pending?.bundle].compactMap { $0 })
    }

    /// The trial did not confirm in time: back to the previous bundle. Returns its folder (nil: the app's own).
    static func rollback() -> URL? {
        guard onTrial, let trial = active else { return active.map { bundleDirectory($0.bundle) } }
        var state = readState()
        state.trial = nil
        state.failed.append(trial.bundle)
        state.rolledBack = trial.bundle
        writeState(state)
        onTrial = false
        active = config.flatMap { usable(state.current, $0) ? state.current : nil }
        NSLog("[akan-native] updates: bundle %@ did not call notifyReady() in time; rolled back", trial.bundle)
        return active.map { bundleDirectory($0.bundle) }
    }

    /// reset(): the app's own bundle from the next launch on.
    static func reset() {
        writeState(AkanNativeUpdateState())
        prune(keep: active.map { [$0.bundle] } ?? [])
    }

    /// A download in progress (bundles/<bundle>.partial) is the plugin's, which removes it.
    private static func prune(keep: [String]) {
        let folder = directory.appendingPathComponent("bundles", isDirectory: true)
        guard let names = try? FileManager.default.contentsOfDirectory(atPath: folder.path) else { return }
        for name in names where !keep.contains(name) && name != active?.bundle && !name.hasSuffix(".partial") {
            try? FileManager.default.removeItem(at: folder.appendingPathComponent(name))
        }
    }
}
#endif
