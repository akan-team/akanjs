import CryptoKit
import Foundation

/// Web bundle updates (UP-2). The manifest `<url>/ios/<channel>.json` is signed as a whole
/// (`.sig`: base64 Ed25519 over its bytes, key from akan-native.config.ts `updates.publicKey`), so every
/// field below is trusted only after `isValidSignature`. Files are content-addressed
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
        let manifest: Data
        /// The manifest's `.sig` as downloaded (base64), kept next to the bundle.
        let signature: String
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
                let available = isNewer(release, config)
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
                guard isNewer(release, config) else { throw Failure(code: .notFound, message: "no newer release for this app (native API \(config.nativeApi))") }
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

    /// Newer than what runs (and than the app's own bundle), for this binary, not rolled back before.
    private func isNewer(_ release: Release, _ config: AkanNativeUpdateConfig) -> Bool {
        let running = AkanNativeUpdates.active?.sequence ?? config.embeddedSequence
        return release.nativeApi == config.nativeApi && release.sequence > max(running, config.embeddedSequence)
            && !AkanNativeUpdates.readState().failed.contains(release.bundle)
    }

    private static func request(_ url: URL) -> URLRequest {
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalAndRemoteCacheData, timeoutInterval: 30)
        request.setValue("no-cache", forHTTPHeaderField: "Cache-Control")
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
        guard let manifestURL = URL(string: "\(base(config))/\(config.channel).json"), let sigURL = URL(string: "\(base(config))/\(config.channel).json.sig") else {
            throw Failure(code: .internalError, message: "bad updates.url \(config.url)")
        }
        let manifest = try await fetch(manifestURL, limit: 1 << 20)
        let sigText = String(decoding: try await fetch(sigURL, limit: 1024), as: UTF8.self).trimmingCharacters(in: .whitespacesAndNewlines)
        guard let signature = Data(base64Encoded: sigText),
              let key = try? Curve25519.Signing.PublicKey(rawRepresentation: config.publicKey),
              key.isValidSignature(signature, for: manifest) else {
            throw Failure(code: .internalError, message: "the release signature does not match updates.publicKey")
        }
        return try parse(manifest, sigText, config)
    }

    /// Checks every field of the (signed) manifest before any of it is used.
    private static func parse(_ data: Data, _ signature: String, _ config: AkanNativeUpdateConfig) throws -> Release {
        let bad = { (why: String) in Failure(code: .internalError, message: "invalid release manifest: \(why)") }
        guard let o = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw bad("not a JSON object") }
        guard (o["schema"] as? NSNumber)?.intValue == 1, o["kind"] as? String == "web" else { throw bad("schema 1, kind web expected") }
        guard o["app"] as? String == config.app, o["platform"] as? String == config.platform, o["channel"] as? String == config.channel else {
            throw bad("made for another app, platform or channel")
        }
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
        return Release(bundle: bundle, sequence: sequence, version: o["version"] as? String ?? "", nativeApi: nativeApi, files: files, manifest: data, signature: signature)
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

    /// Downloads into bundles/<bundle>.partial, verifies each file, then renames and stages it.
    private func install(_ release: Release, _ config: AkanNativeUpdateConfig) async throws {
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
                let downloaded = try await Self.download(url, size: file.size)
                guard (try? Self.hex(file: downloaded)) == file.sha256 else {
                    try? fm.removeItem(at: downloaded)
                    try? fm.removeItem(at: staging)
                    throw Failure(code: .internalError, message: "\(file.path) does not match its hash")
                }
                try fm.moveItem(at: downloaded, to: destination)
            }
            received += file.size
            events.progress(UpdatesUpdateProgress(received: Double(received), total: Double(total)))
        }
        // The shell checks the signed manifest against the files at every launch (AkanNativeUpdates.verified).
        try release.manifest.write(to: staging.appendingPathComponent("manifest.json"))
        try Data(release.signature.utf8).write(to: staging.appendingPathComponent("manifest.json.sig"))
        let complete = release.files.allSatisfy { file in
            (try? fm.attributesOfItem(atPath: staging.appendingPathComponent(file.path).path)[.size] as? NSNumber)?.intValue == file.size
        }
        guard complete else {
            try? fm.removeItem(at: staging)
            throw Failure(code: .internalError, message: "the downloaded bundle is incomplete")
        }
        if fm.fileExists(atPath: target.path) { try fm.removeItem(at: target) }
        try fm.moveItem(at: staging, to: target)
        AkanNativeUpdates.stage(AkanNativeUpdateEntry(bundle: release.bundle, sequence: release.sequence, nativeApi: release.nativeApi))
    }
}
