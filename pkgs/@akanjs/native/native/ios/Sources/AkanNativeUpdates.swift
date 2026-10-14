// Web bundle updates (UP-2, protocol v2): which bundle the shell serves, and the trial / confirm / rollback
// state. @akanjs/native/plugins/updates downloads and verifies bundles and calls stage/apply/confirm; the
// shell picks the bundle at launch (`launch`) and rolls back a trial that never confirms.
//
// Layout: Library/Application Support/akan-native-updates/{state.json, bundles/<bundle>/{…, manifest.signed.json}}
// (the filesystem plugin's `data` is Application Support/files). A bundle is served only while its envelope still
// verifies under a key of updates.publicKeys that is not revoked, and its files are all there with their sizes
// (checked at every launch).
// state.json: { current?, pending?, trial?, failed: [bundle], rolledBack?, revokedKeys: [keyId] } with entries
// { bundle, sequence, nativeApi, keyId, attempts? }. revokedKeys outlive reset(): a revocation is for good.
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
    /// The key whose envelope the bundle came in.
    var keyId: String
    var attempts: Int = 0

    init(bundle: String, sequence: Double, nativeApi: String, keyId: String, attempts: Int = 0) {
        self.bundle = bundle
        self.sequence = sequence
        self.nativeApi = nativeApi
        self.keyId = keyId
        self.attempts = attempts
    }

    init?(_ json: Any?) {
        guard let o = json as? [String: Any], let bundle = o["bundle"] as? String, AkanNativeUpdates.isBundleId(bundle),
              let sequence = (o["sequence"] as? NSNumber)?.doubleValue, let nativeApi = o["nativeApi"] as? String,
              let keyId = o["keyId"] as? String, AkanNativeKernel.isUpdateKeyId(keyId) else { return nil }
        self.init(bundle: bundle, sequence: sequence, nativeApi: nativeApi, keyId: keyId, attempts: (o["attempts"] as? NSNumber)?.intValue ?? 0)
    }

    var json: [String: Any] { ["bundle": bundle, "sequence": sequence, "nativeApi": nativeApi, "keyId": keyId, "attempts": attempts] }
}

struct AkanNativeUpdateState: Sendable {
    var current: AkanNativeUpdateEntry?
    var pending: AkanNativeUpdateEntry?
    var trial: AkanNativeUpdateEntry?
    var failed: [String] = []
    var rolledBack: String?
    var revokedKeys: [String] = []

    init(revokedKeys: [String] = []) {
        self.revokedKeys = revokedKeys
    }

    init(_ o: [String: Any]) {
        current = AkanNativeUpdateEntry(o["current"])
        pending = AkanNativeUpdateEntry(o["pending"])
        trial = AkanNativeUpdateEntry(o["trial"])
        failed = (o["failed"] as? [String] ?? []).filter(AkanNativeUpdates.isBundleId)
        rolledBack = o["rolledBack"] as? String
        revokedKeys = (o["revokedKeys"] as? [String] ?? []).filter(AkanNativeKernel.isUpdateKeyId)
    }

    var json: [String: Any] {
        var o: [String: Any] = ["failed": Array(failed.suffix(20)), "revokedKeys": revokedKeys]
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
    let version: String
    let platform: String
    let nativeApi: String
    let embeddedSequence: Double
    let url: String
    /// updates.publicKeys in order: the order decides which key may revoke which (AkanNativeKernel.updateDecision).
    let keys: [(keyId: String, key: Data)]
    let channel: String
    let readyTimeout: TimeInterval
    let dev: Bool
    /// updates.report.url: where AkanNativeUpdateReports posts what became of each release; nil sends nothing.
    let reportUrl: String?

    var ring: [String] { keys.map(\.keyId) }

    func key(_ keyId: String) -> Data? { keys.first { $0.keyId == keyId }?.key }

    static func load() -> AkanNativeUpdateConfig? {
        let o = AkanNativeResources.json("updates.json")
        let encoded = o["publicKeys"] as? [String] ?? (o["publicKey"] as? String).map { [$0] } ?? []
        let raw = encoded.compactMap { Data(base64Encoded: $0) }.filter { $0.count == 32 }
        guard let app = o["app"] as? String, let url = o["url"] as? String, !raw.isEmpty, raw.count == encoded.count,
              let nativeApi = o["nativeApi"] as? String else { return nil }
        return AkanNativeUpdateConfig(
            app: app,
            version: o["version"] as? String ?? "",
            platform: o["platform"] as? String ?? "ios",
            nativeApi: nativeApi,
            embeddedSequence: (o["embeddedSequence"] as? NSNumber)?.doubleValue ?? 0,
            url: url,
            keys: raw.map { (keyId: AkanNativeKernel.updateKeyId($0), key: $0) },
            channel: o["channel"] as? String ?? "production",
            readyTimeout: ((o["readyTimeout"] as? NSNumber)?.doubleValue ?? 10_000) / 1000,
            dev: o["dev"] as? Bool ?? false,
            reportUrl: o["reportUrl"] as? String
        )
    }
}

/// A `<channel>/<nativeApi>.json` envelope, checked as far as its signature: what the manifest says is read after.
struct AkanNativeUpdateEnvelope {
    let manifest: Data
    let keyId: String

    /// nil: not an envelope, or one AkanNativeKernel.checkUpdateEnvelope refuses.
    static func open(_ data: Data, _ config: AkanNativeUpdateConfig, revoked: [String]) -> AkanNativeUpdateEnvelope? {
        guard let o = try? JSONSerialization.jsonObject(with: data) as? [String: Any], let manifest = o["manifest"] as? String,
              let keyId = o["keyId"] as? String, let signature = o["signature"] as? String else { return nil }
        let checked = AkanNativeKernel.checkUpdateEnvelope(
            manifest: manifest, keyId: keyId, signature: signature, ring: config.ring, revoked: revoked
        ) { manifest, signature, keyId in
            guard let raw = config.key(keyId), let key = try? Curve25519.Signing.PublicKey(rawRepresentation: raw) else { return false }
            return key.isValidSignature(signature, for: manifest)
        }
        return checked.manifest.map { AkanNativeUpdateEnvelope(manifest: $0, keyId: keyId) }
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
        AkanNativeUpdateState(readJson("state.json") ?? [:])
    }

    /// false: not written (a full disk): a trial that is not on record must not run, since nothing would roll it back.
    @discardableResult
    static func writeState(_ state: AkanNativeUpdateState) -> Bool {
        writeJson("state.json", state.json)
    }

    static func readJson(_ name: String) -> [String: Any]? {
        guard let data = try? Data(contentsOf: directory.appendingPathComponent(name)) else { return nil }
        return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
    }

    /// Atomic replace (write + rename) of a file of the updates folder, so a crash never leaves half of it. false: not
    /// written.
    @discardableResult
    static func writeJson(_ name: String, _ object: [String: Any]) -> Bool {
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        var url = directory
        var values = URLResourceValues()
        values.isExcludedFromBackup = true // downloadable again; not the user's data
        try? url.setResourceValues(values)
        guard let data = try? JSONSerialization.data(withJSONObject: object, options: [.sortedKeys]) else { return false }
        do {
            try data.write(to: directory.appendingPathComponent(name), options: .atomic)
            return true
        } catch {
            NSLog("[akan-native] updates: cannot write %@: %@", name, error.localizedDescription)
            return false
        }
    }

    static func usable(_ entry: AkanNativeUpdateEntry?, _ config: AkanNativeUpdateConfig, revoked: [String]) -> Bool {
        guard let entry else { return false }
        return takes(entry, config, revoked: revoked) && intact(entry, config, revoked: revoked)
    }

    /// Built for its native API, newer than its own bundle, and signed by a key it trusts and has not revoked: a bundle
    /// a new binary or a revocation left behind is dropped as expected, not reported as a failure.
    private static func takes(_ entry: AkanNativeUpdateEntry, _ config: AkanNativeUpdateConfig, revoked: [String]) -> Bool {
        entry.nativeApi == config.nativeApi && entry.sequence > config.embeddedSequence
            && config.ring.contains(entry.keyId) && !revoked.contains(entry.keyId)
    }

    private static func intact(_ entry: AkanNativeUpdateEntry, _ config: AkanNativeUpdateConfig, revoked: [String]) -> Bool {
        FileManager.default.fileExists(atPath: bundleDirectory(entry.bundle).appendingPathComponent("index.html").path)
            && verified(entry, config, revoked: revoked)
    }

    /// Drops an entry this launch cannot serve, reporting `event` (reason verify) when its files were the reason.
    private static func drop(_ entry: AkanNativeUpdateEntry?, _ config: AkanNativeUpdateConfig, revoked: [String], _ event: AkanNativeUpdateEvent) -> AkanNativeUpdateEntry? {
        guard let entry else { return nil }
        guard takes(entry, config, revoked: revoked) else { return nil }
        if intact(entry, config, revoked: revoked) { return entry }
        AkanNativeUpdateReports.record(event, entry, reason: .verify)
        return nil
    }

    /// The bundle's envelope (kept next to it by the plugin) verifies, describes this entry,
    /// and every file it lists is there with its size. The hashes were checked at the download.
    private static func verified(_ entry: AkanNativeUpdateEntry, _ config: AkanNativeUpdateConfig, revoked: [String]) -> Bool {
        let dir = bundleDirectory(entry.bundle)
        guard let data = try? Data(contentsOf: dir.appendingPathComponent("manifest.signed.json")),
              let envelope = AkanNativeUpdateEnvelope.open(data, config, revoked: revoked), envelope.keyId == entry.keyId,
              let o = try? JSONSerialization.jsonObject(with: envelope.manifest) as? [String: Any],
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
        state.current = drop(state.current, config, revoked: state.revokedKeys, .rolledBack)
        state.pending = drop(state.pending, config, revoked: state.revokedKeys, .failed)
        state.trial = drop(state.trial, config, revoked: state.revokedKeys, .rolledBack)
        if let trial = state.trial {
            // Launched again without notifyReady(): the trial crashed or hung.
            state.failed.append(trial.bundle)
            state.rolledBack = trial.bundle
            state.trial = nil
            NSLog("[akan-native] updates: bundle %@ did not confirm; rolled back", trial.bundle)
            AkanNativeUpdateReports.record(.rolledBack, trial, reason: .relaunch)
        }
        if var pending = state.pending, !state.failed.contains(pending.bundle) {
            pending.attempts = 1
            state.trial = pending
            state.pending = nil
        }
        if !writeState(state), state.trial != nil {
            state.trial = nil // not on record: the pending bundle waits for a launch that can record it
        }
        if let trial = state.trial { AkanNativeUpdateReports.record(.applied, trial) }
        active = state.trial ?? state.current
        onTrial = state.trial != nil
        AkanNativeUpdateReports.start()
        return active.map { bundleDirectory($0.bundle) }
    }

    /// A verified download (plugin): runs at the next launch, or right away through apply().
    static func stage(_ entry: AkanNativeUpdateEntry) {
        var state = readState()
        state.pending = entry
        state.failed.removeAll { $0 == entry.bundle }
        if writeState(state) { AkanNativeUpdateReports.record(.downloaded, entry) }
    }

    /// apply(): makes the pending bundle the trial now; returns its folder for the reload.
    static func applyPending() -> URL? {
        guard let config else { return nil }
        var state = readState()
        guard var pending = state.pending, usable(pending, config, revoked: state.revokedKeys) else { return nil }
        pending.attempts = 1
        state.trial = pending
        state.pending = nil
        guard writeState(state) else { return nil }
        active = pending
        onTrial = true
        AkanNativeUpdateReports.record(.applied, pending)
        return bundleDirectory(pending.bundle)
    }

    /// notifyReady(): the served trial becomes current; bundles nothing refers to are removed.
    static func confirm() {
        guard onTrial, let trial = active else { return }
        var state = readState()
        guard state.trial?.bundle == trial.bundle else { return }
        state.current = AkanNativeUpdateEntry(bundle: trial.bundle, sequence: trial.sequence, nativeApi: trial.nativeApi, keyId: trial.keyId)
        state.trial = nil
        state.rolledBack = nil
        writeState(state)
        onTrial = false
        AkanNativeUpdateReports.record(.confirmed, trial)
        prune(keep: [state.current?.bundle, state.pending?.bundle].compactMap { $0 })
    }

    /// The trial did not confirm in time: back to the previous bundle. Returns its folder (nil: the app's own) and the
    /// id of the rollback's report, a timeout until the renderer probe finds the page hung.
    static func rollback() -> (root: URL?, report: Int?) {
        guard onTrial, let trial = active else { return (active.map { bundleDirectory($0.bundle) }, nil) }
        var state = readState()
        state.trial = nil
        state.failed.append(trial.bundle)
        state.rolledBack = trial.bundle
        writeState(state)
        let report = AkanNativeUpdateReports.record(.rolledBack, trial, reason: .timeout)
        onTrial = false
        active = config.flatMap { usable(state.current, $0, revoked: state.revokedKeys) ? state.current : nil }
        NSLog("[akan-native] updates: bundle %@ did not call notifyReady() in time; rolled back", trial.bundle)
        return (active.map { bundleDirectory($0.bundle) }, report)
    }

    /// reset(): the app's own bundle from the next launch on. Revocations stay.
    static func reset() {
        writeState(AkanNativeUpdateState(revokedKeys: readState().revokedKeys))
        prune(keep: active.map { [$0.bundle] } ?? [])
    }

    /// Keys a verified manifest revoked: no bundle they signed is served again, from the next launch on.
    static func revoke(_ keyIds: [String]) {
        guard !keyIds.isEmpty else { return }
        var state = readState()
        let added = keyIds.filter { !state.revokedKeys.contains($0) }
        guard !added.isEmpty else { return }
        state.revokedKeys += added
        writeState(state)
        NSLog("[akan-native] updates: revoked keys %@", added.joined(separator: ", "))
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
