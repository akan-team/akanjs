import CryptoKit
import Foundation

/// Web bundle updates (UP-2, protocol v2). The envelope `<url>/ios/<channel>/<nativeApi>.json` holds the manifest's
/// bytes, the keyId of the key that signed them (one of akan-native.config.ts `updates.publicKeys`) and the Ed25519
/// signature, so every field below is trusted only after `AkanNativeUpdateEnvelope.open`. Revocations and the
/// sequence rule are AkanNativeKernel.updateDecision, shared with Android and kernel.ts. Files are content-addressed
/// (`<url>/ios/files/<sha256>`) and each one is checked against its hash; files the running
/// bundle already has are copied instead of downloaded. Which bundle runs, and the trial /
/// rollback rules, live in the shell (native/ios/Sources/AkanNativeUpdates.swift).
/// Unlike Electrobun (hash as an identity label, trust in HTTPS: electrobun/package/src/sdks/main/
/// core/Updater.ts:1426-1460) and Tauri (signed artifact, unsigned manifest: tauri-plugins-workspace/
/// plugins/updater/src/updater.rs:1661-1708), nothing unsigned decides what gets served.
final class UpdatesPlugin: UpdatesPluginSpec {
    static let id = "updates"
    private let context: AkanNativePluginContext
    private var downloading = false
    /// sha256 of files of the running bundle, by path (computed on demand, once).
    private var localHashes: [String: String] = [:]

    init(context: AkanNativePluginContext) {
        self.context = context
    }

    struct Failure: Error {
        let code: AkanNativeErrorCode
        let message: String
        /// The reason a failed download is reported under (AkanNativeUpdateReports), nil when it is not reported.
        var report: String? = nil
    }

    struct ReleaseFile: Sendable {
        let path: String
        let sha256: String
        let size: Int
    }

    struct Release: Sendable {
        let bundle: String
        let sequence: Double
        let version: String
        let nativeApi: String
        let files: [ReleaseFile]
        let keyId: String
        let revokeKeys: [String]
        let resetSequence: Bool
        /// The envelope as downloaded, kept next to the bundle for the shell's check at every launch.
        let envelope: Data
    }

    private func configured<T>(_ reply: AkanNativeReply<T>) -> AkanNativeUpdateConfig? {
        if let config = AkanNativeUpdates.config { return config }
        reply.reject(.unsupported, "updates are not configured (akan-native.config.ts `updates`)")
        return nil
    }

    func getState(_ reply: AkanNativeReply<UpdatesUpdateState>) {
        guard let config = configured(reply) else { return }
        let state = AkanNativeUpdates.readState()
        reply.resolve(UpdatesUpdateState(
            bundle: AkanNativeUpdates.active?.bundle,
            sequence: AkanNativeUpdates.active?.sequence ?? 0,
            pending: state.pending?.bundle,
            trial: AkanNativeUpdates.onTrial,
            rolledBack: state.rolledBack,
            channel: config.channel,
            nativeApi: config.nativeApi
        ))
    }

    func check(_ reply: AkanNativeReply<UpdatesUpdateCheck>) {
        guard let config = configured(reply) else { return }
        Task {
            do {
                let release = try await Self.fetchRelease(config)
                let available = try isNewer(release, config)
                reply.resolve(UpdatesUpdateCheck(
                    available: available,
                    bundle: release.bundle,
                    version: release.version,
                    sequence: release.sequence,
                    downloadSize: available ? Double(release.files.filter { localCopy($0) == nil }.reduce(0) { $0 + $1.size }) : nil
                ))
            } catch let f as Failure {
                reply.reject(f.code, f.message)
            } catch {
                reply.reject(.internalError, "update check failed: \(error.localizedDescription)")
            }
        }
    }

    func download(_ reply: AkanNativeReply<UpdatesDownloadResult>) {
        guard let config = configured(reply) else { return }
        guard !downloading else { return reply.reject(.cancelled, "a download is already running") }
        downloading = true
        // The download stops when its call does (the page gave up on it, or the page is gone):
        // URLSession's async calls end with the task's cancellation.
        let task = Task {
            defer { downloading = false }
            do {
                let release = try await Self.fetchRelease(config)
                guard try isNewer(release, config) else { throw Failure(code: .notFound, message: "no newer release for this app (native API \(config.nativeApi))") }
                if AkanNativeUpdates.readState().pending?.bundle != release.bundle { try await install(release, config) }
                reply.resolve(UpdatesDownloadResult(bundle: release.bundle))
            } catch let f as Failure {
                reply.reject(f.code, f.message)
            } catch {
                reply.reject(.internalError, "update download failed: \(error.localizedDescription)")
            }
        }
        reply.onCancel { task.cancel() }
    }

    func apply(_ reply: AkanNativeReply<Void>) {
        guard configured(reply) != nil else { return }
        guard let root = AkanNativeUpdates.applyPending() else { return reply.reject(.notFound, "no downloaded update to apply") }
        reply.resolve()
        // Answer first: the reload ends this page.
        DispatchQueue.main.async { [context] in context.serveBundle(root) }
    }

    func notifyReady(_ reply: AkanNativeReply<Void>) {
        guard configured(reply) != nil else { return }
        AkanNativeUpdates.confirm()
        reply.resolve()
    }

    func reset(_ reply: AkanNativeReply<Void>) {
        guard configured(reply) != nil else { return }
        AkanNativeUpdates.reset()
        reply.resolve()
    }

    // MARK: releases

    /// Newer than what runs (and than the app's own bundle), not rolled back before. A manifest's revocations are
    /// recorded whether or not its release is newer: the key behind a bad release must stop counting either way.
    private func isNewer(_ release: Release, _ config: AkanNativeUpdateConfig) throws -> Bool {
        let state = AkanNativeUpdates.readState()
        let decision = AkanNativeKernel.updateDecision(
            ring: config.ring, revoked: state.revokedKeys, signer: release.keyId, revokeKeys: release.revokeKeys,
            resetSequence: release.resetSequence, sequence: release.sequence, embedded: config.embeddedSequence,
            running: AkanNativeUpdates.active.map { (sequence: $0.sequence, keyId: $0.keyId) }
        )
        switch decision.kind {
        case .take, .stale:
            if !decision.revoke.isEmpty { AkanNativeUpdates.revoke(decision.revoke) }
            return decision.kind == .take && !state.failed.contains(release.bundle)
        case .untrusted, .revoked:
            AkanNativeUpdateReports.record("failed", bundle: release.bundle, sequence: release.sequence, reason: "signature")
            throw Failure(code: .internalError, message: "the release is signed by key \(release.keyId), which this app does not trust")
        case .selfRevoke, .revokeLater:
            AkanNativeUpdateReports.record("failed", bundle: release.bundle, sequence: release.sequence, reason: "manifest")
            throw Failure(code: .internalError, message: "invalid release manifest: key \(release.keyId) may not revoke \(release.revokeKeys.joined(separator: ", "))")
        }
    }

    private static func request(_ url: URL) -> URLRequest {
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalAndRemoteCacheData, timeoutInterval: 30)
        request.setValue("no-cache", forHTTPHeaderField: "Cache-Control")
        //? Not text/html: a CDN that injects scripts into HTML responses (Cloudflare Web Analytics) would change signed bytes.
        request.setValue("*/*", forHTTPHeaderField: "Accept")
        return request
    }

    private static func check(_ response: URLResponse, _ url: URL, limit: Int) throws {
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        if status == 404 { throw Failure(code: .notFound, message: "\(url.absoluteString) not found") }
        guard status == 200 else { throw Failure(code: .internalError, message: "\(url.absoluteString): HTTP \(status)") }
        if response.expectedContentLength > limit { throw Failure(code: .internalError, message: "\(url.absoluteString) is larger than \(limit) bytes") }
    }

    /// At most `limit` bytes into memory: the manifest and its signature are read before they are
    /// verified, so a bad server could otherwise send anything.
    private static func fetch(_ url: URL, limit: Int) async throws -> Data {
        let (bytes, response) = try await URLSession.shared.bytes(for: request(url))
        try check(response, url, limit: limit)
        var data = Data()
        for try await byte in bytes {
            data.append(byte)
            if data.count > limit { throw Failure(code: .internalError, message: "\(url.absoluteString) is larger than \(limit) bytes") }
        }
        return data
    }

    /// A release file into a temporary file (not memory), which must have the manifest's size.
    private static func download(_ url: URL, size: Int) async throws -> URL {
        let (file, response) = try await URLSession.shared.download(for: request(url))
        do {
            try check(response, url, limit: size)
            let actual = (try FileManager.default.attributesOfItem(atPath: file.path)[.size] as? NSNumber)?.intValue
            guard actual == size else { throw Failure(code: .internalError, message: "\(url.absoluteString) is not \(size) bytes") }
            return file
        } catch {
            try? FileManager.default.removeItem(at: file)
            throw error
        }
    }

    /// SHA-256 of a file, read in pieces.
    private static func hex(file: URL) throws -> String {
        let handle = try FileHandle(forReadingFrom: file)
        defer { try? handle.close() }
        var hash = SHA256()
        while let chunk = try handle.read(upToCount: 1 << 20), !chunk.isEmpty { hash.update(data: chunk) }
        return hash.finalize().map { String(format: "%02x", $0) }.joined()
    }

    private static func base(_ config: AkanNativeUpdateConfig) -> String { "\(config.url)/\(config.platform)" }

    private static func fetchRelease(_ config: AkanNativeUpdateConfig) async throws -> Release {
        let address = AkanNativeKernel.updateManifestURL(config.url, platform: config.platform, channel: config.channel, nativeApi: config.nativeApi)
        guard let url = URL(string: address) else { throw Failure(code: .internalError, message: "bad updates.url \(config.url)") }
        //? A 1 MiB manifest is 1.4 MiB in base64.
        let data = try await fetch(url, limit: 3 << 19)
        guard let envelope = AkanNativeUpdateEnvelope.open(data, config, revoked: AkanNativeUpdates.readState().revokedKeys) else {
            reportRefused(data, "signature")
            throw Failure(code: .internalError, message: "the release is not signed by a key of updates.publicKeys this app still trusts")
        }
        do {
            return try parse(envelope, data, config)
        } catch {
            reportRefused(data, "manifest")
            throw error
        }
    }

    /// The release a refused envelope names, read without trusting it and only to say which release failed: a forged
    /// name can at worst count against a release the server already published for this app.
    private static func reportRefused(_ raw: Data, _ reason: String) {
        let envelope = (try? JSONSerialization.jsonObject(with: raw)) as? [String: Any]
        let manifest = (envelope?["manifest"] as? String).flatMap { Data(base64Encoded: $0) }
            .flatMap { (try? JSONSerialization.jsonObject(with: $0)) as? [String: Any] }
        AkanNativeUpdateReports.record(
            "failed", bundle: manifest?["bundle"] as? String, sequence: (manifest?["sequence"] as? NSNumber)?.doubleValue, reason: reason
        )
    }

    /// Checks every field of the (signed) manifest before any of it is used.
    private static func parse(_ envelope: AkanNativeUpdateEnvelope, _ raw: Data, _ config: AkanNativeUpdateConfig) throws -> Release {
        let bad = { (why: String) in Failure(code: .internalError, message: "invalid release manifest: \(why)") }
        guard let o = try? JSONSerialization.jsonObject(with: envelope.manifest) as? [String: Any] else { throw bad("not a JSON object") }
        guard (o["schema"] as? NSNumber)?.intValue == 2, o["kind"] as? String == "web" else { throw bad("schema 2, kind web expected") }
        guard o["app"] as? String == config.app, o["platform"] as? String == config.platform, o["channel"] as? String == config.channel,
              o["nativeApi"] as? String == config.nativeApi else {
            throw bad("made for another app, platform, channel or native API")
        }
        let revokeKeys = o["revokeKeys"] as? [String] ?? []
        guard o["revokeKeys"] == nil || o["revokeKeys"] is [String], revokeKeys.count <= 16, revokeKeys.allSatisfy(AkanNativeKernel.isUpdateKeyId),
              o["resetSequence"] == nil || o["resetSequence"] is Bool else { throw bad("revokeKeys or resetSequence") }
        guard let bundle = o["bundle"] as? String, AkanNativeUpdates.isBundleId(bundle) else { throw bad("bundle id") }
        guard let sequence = (o["sequence"] as? NSNumber)?.doubleValue, sequence.isFinite, sequence > 0 else { throw bad("sequence") }
        guard let nativeApi = o["nativeApi"] as? String, let list = o["files"] as? [[String: Any]], (1...5000).contains(list.count) else { throw bad("nativeApi or files") }
        var files: [ReleaseFile] = []
        var total = 0
        for f in list {
            guard let path = f["path"] as? String, isSafePath(path), let sha = f["sha256"] as? String, sha.count == 64, sha.allSatisfy(\.isHexDigit),
                  let size = (f["size"] as? NSNumber)?.intValue, (0...100_000_000).contains(size) else { throw bad("file entry") }
            total += size
            files.append(ReleaseFile(path: path, sha256: sha.lowercased(), size: size))
        }
        guard total <= 300_000_000, files.contains(where: { $0.path == "index.html" }), Set(files.map(\.path)).count == files.count else { throw bad("files") }
        return Release(
            bundle: bundle, sequence: sequence, version: o["version"] as? String ?? "", nativeApi: nativeApi, files: files,
            keyId: envelope.keyId, revokeKeys: revokeKeys, resetSequence: o["resetSequence"] as? Bool ?? false, envelope: raw
        )
    }

    /// Relative, "/"-separated, no empty, "." or ".." segments.
    nonisolated static func isSafePath(_ path: String) -> Bool {
        let segments = path.split(separator: "/", omittingEmptySubsequences: false)
        return !path.isEmpty && path.count < 512 && !segments.contains { $0.isEmpty || $0 == "." || $0 == ".." || $0.contains("\\") || $0.contains("\0") }
    }

    private static func hex(_ data: Data) -> String { SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined() }

    /// The running bundle's copy of a file with the same content, if any.
    private func localCopy(_ file: ReleaseFile) -> URL? {
        let candidate: URL
        if let active = AkanNativeUpdates.active {
            candidate = AkanNativeUpdates.bundleDirectory(active.bundle).appendingPathComponent(file.path)
        } else {
            candidate = file.path == "env.runtime.json" ? AkanNativeResources.url("env.runtime.json") : AkanNativeResources.url("app").appendingPathComponent(file.path)
        }
        let key = candidate.path
        if localHashes[key] == nil {
            guard let data = try? Data(contentsOf: candidate) else { return nil }
            localHashes[key] = Self.hex(data)
        }
        return localHashes[key] == file.sha256 ? candidate : nil
    }

    /// Downloads into bundles/<bundle>.partial, verifies each file, then renames and stages it. A failure is reported
    /// under its reason, and an error that is neither a download's nor a cancellation is the disk's.
    private func install(_ release: Release, _ config: AkanNativeUpdateConfig) async throws {
        do {
            try await place(release, config)
        } catch {
            let reason = (error as? Failure).map(\.report) ?? (Self.cancelled(error) ? nil : "disk")
            if let reason { AkanNativeUpdateReports.record("failed", bundle: release.bundle, sequence: release.sequence, reason: reason) }
            throw error
        }
    }

    private static func cancelled(_ error: Error) -> Bool {
        error is CancellationError || (error as? URLError)?.code == .cancelled
    }

    private func place(_ release: Release, _ config: AkanNativeUpdateConfig) async throws {
        let fm = FileManager.default
        let target = AkanNativeUpdates.bundleDirectory(release.bundle)
        let staging = target.deletingLastPathComponent().appendingPathComponent("\(release.bundle).partial", isDirectory: true)
        try? fm.removeItem(at: staging)
        try fm.createDirectory(at: staging, withIntermediateDirectories: true)
        let total = release.files.reduce(0) { $0 + $1.size }
        var received = 0
        let events = UpdatesEvents(context)
        for file in release.files {
            let destination = staging.appendingPathComponent(file.path)
            try fm.createDirectory(at: destination.deletingLastPathComponent(), withIntermediateDirectories: true)
            if let local = localCopy(file) {
                try fm.copyItem(at: local, to: destination)
            } else {
                guard let url = URL(string: "\(Self.base(config))/files/\(file.sha256)") else { throw Failure(code: .internalError, message: "bad file URL") }
                let downloaded: URL
                do {
                    downloaded = try await Self.download(url, size: file.size)
                } catch let failure as Failure {
                    throw Failure(code: failure.code, message: failure.message, report: "download")
                } catch {
                    if Self.cancelled(error) { throw error }
                    throw Failure(code: .internalError, message: "\(file.path): \(error.localizedDescription)", report: "download")
                }
                guard (try? Self.hex(file: downloaded)) == file.sha256 else {
                    try? fm.removeItem(at: downloaded)
                    try? fm.removeItem(at: staging)
                    throw Failure(code: .internalError, message: "\(file.path) does not match its hash", report: "verify")
                }
                try fm.moveItem(at: downloaded, to: destination)
            }
            received += file.size
            events.progress(UpdatesUpdateProgress(received: Double(received), total: Double(total)))
        }
        // The shell checks the envelope against the files at every launch (AkanNativeUpdates.verified).
        try release.envelope.write(to: staging.appendingPathComponent("manifest.signed.json"))
        let complete = release.files.allSatisfy { file in
            (try? fm.attributesOfItem(atPath: staging.appendingPathComponent(file.path).path)[.size] as? NSNumber)?.intValue == file.size
        }
        guard complete else {
            try? fm.removeItem(at: staging)
            throw Failure(code: .internalError, message: "the downloaded bundle is incomplete", report: "verify")
        }
        if fm.fileExists(atPath: target.path) { try fm.removeItem(at: target) }
        try fm.moveItem(at: staging, to: target)
        AkanNativeUpdates.stage(AkanNativeUpdateEntry(bundle: release.bundle, sequence: release.sequence, nativeApi: release.nativeApi, keyId: release.keyId))
    }
}
