// What became of each web bundle release (F-S2), posted to updates.report.url so whoever publishes sees apply and
// rollback rates; a rollback is decided before any page script runs, so only the shell can tell. The Android twin is
// native/android/.../AkanNativeUpdateReports.kt, same file and wire format.
//
// akan-native-updates/report.json: { installId, nextId, events: [{ id, event, bundle, sequence, reason, at }], retryAt?,
// seen: [key] }. Beside state.json, so backups skip it, but reset() rewrites state.json only: the installId (random,
// not a device identifier) and the id counter live as long as the install, and an id is never used twice.
// Sent at launch and on each return to the foreground: oldest first, 20 to a request, one request at a time. A 2xx
// removes the batch; a 4xx other than 408 and 429 drops it, since the same body would be refused forever; a 408 (a body
// slower than the server waits for), a 429, a 5xx or no answer keeps it for the next time (after Retry-After). At most
// 100 wait, the oldest dropped first.
#if AKAN_NATIVE_UPDATES
import Foundation
import UIKit

@MainActor
enum AkanNativeUpdateReports {
    private static let limit = 100
    private static let batch = 20
    private static var sending = false
    private static var observing = false
    private static let timestamp: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    private struct Report {
        var installId: String
        var nextId: Int
        var events: [[String: Any]]
        var retryAt: Double?
        var seen: [String]
    }

    private static var file: URL { AkanNativeUpdates.directory.appendingPathComponent("report.json") }

    /// downloaded, applied, confirmed, rolledBack (timeout, relaunch, hang, verify) or failed (download, verify, disk,
    /// signature, manifest). Nothing is kept when the build names no report URL.
    static func record(_ event: String, bundle: String?, sequence: Double?, reason: String? = nil) {
        guard AkanNativeUpdates.config?.reportUrl != nil, let bundle, AkanNativeKernel.isBundleId(bundle) else { return }
        var report = read()
        //? A check runs at every launch: the same failure of the same release is one event, not one per launch.
        let key = "\(event)|\(bundle)|\(reason ?? "")"
        guard !report.seen.contains(key) else { return }
        report.seen = Array((report.seen + [key]).suffix(limit))
        let number: Any = sequence.map { $0.rounded() == $0 && abs($0) < 9e15 ? NSNumber(value: Int64($0)) : NSNumber(value: $0) } ?? NSNull()
        report.events.append([
            "id": report.nextId, "event": event, "bundle": bundle, "sequence": number, "reason": reason ?? NSNull(),
            "at": timestamp.string(from: Date()),
        ])
        report.events = Array(report.events.suffix(limit))
        report.nextId += 1
        write(report)
    }

    static func record(_ event: String, _ entry: AkanNativeUpdateEntry, reason: String? = nil) {
        record(event, bundle: entry.bundle, sequence: entry.sequence, reason: reason)
    }

    static func start() {
        if !observing {
            observing = true
            NotificationCenter.default.addObserver(forName: UIApplication.willEnterForegroundNotification, object: nil, queue: .main) { _ in
                MainActor.assumeIsolated { flush() }
            }
        }
        flush()
    }

    static func flush() {
        guard !sending, let config = AkanNativeUpdates.config, let address = config.reportUrl, let url = URL(string: address) else { return }
        let report = read()
        let now = Date().timeIntervalSince1970
        //? A Retry-After more than a day out is a clock that moved, not the server's wish.
        if let retryAt = report.retryAt, retryAt > now, retryAt < now + 86_400 { return }
        let events = Array(report.events.prefix(batch))
        guard !events.isEmpty else { return }
        let body: [String: Any] = [
            "app": config.app, "platform": config.platform, "channel": config.channel, "installId": report.installId,
            "nativeApi": config.nativeApi, "appVersion": config.version, "os": "iOS \(UIDevice.current.systemVersion)",
            "events": events,
        ]
        guard let data = try? JSONSerialization.data(withJSONObject: body) else { return }
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalAndRemoteCacheData, timeoutInterval: 30)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = data
        let ids = Set(events.compactMap { ($0["id"] as? NSNumber)?.intValue })
        sending = true
        Task {
            let response = (try? await URLSession.shared.data(for: request))?.1 as? HTTPURLResponse
            sending = false
            settle(ids, status: response?.statusCode ?? 0, retryAfter: response?.value(forHTTPHeaderField: "Retry-After"))
        }
    }

    private static func settle(_ ids: Set<Int>, status: Int, retryAfter: String?) {
        var report = read()
        guard (200..<300).contains(status) || ((400..<500).contains(status) && status != 408 && status != 429) else {
            report.retryAt = retryAfter.flatMap(Double.init).map { Date().timeIntervalSince1970 + $0 }
            write(report)
            return
        }
        report.events.removeAll { ids.contains(($0["id"] as? NSNumber)?.intValue ?? -1) }
        report.retryAt = nil
        write(report)
        flush()
    }

    private static func read() -> Report {
        let o = (try? Data(contentsOf: file)).flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] } ?? [:]
        guard let installId = o["installId"] as? String, installId.count == 32, installId.allSatisfy(\.isHexDigit) else {
            return Report(installId: newInstallId(), nextId: 0, events: [], retryAt: nil, seen: [])
        }
        return Report(
            installId: installId,
            nextId: (o["nextId"] as? NSNumber)?.intValue ?? 0,
            events: o["events"] as? [[String: Any]] ?? [],
            retryAt: (o["retryAt"] as? NSNumber)?.doubleValue,
            seen: o["seen"] as? [String] ?? []
        )
    }

    private static func write(_ report: Report) {
        var o: [String: Any] = ["installId": report.installId, "nextId": report.nextId, "events": report.events, "seen": report.seen]
        if let retryAt = report.retryAt { o["retryAt"] = retryAt }
        guard let data = try? JSONSerialization.data(withJSONObject: o, options: [.sortedKeys]) else { return }
        try? FileManager.default.createDirectory(at: AkanNativeUpdates.directory, withIntermediateDirectories: true)
        var directory = AkanNativeUpdates.directory
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try? directory.setResourceValues(values)
        do {
            try data.write(to: file, options: .atomic)
        } catch {
            NSLog("[akan-native] updates: cannot write report.json: %@", error.localizedDescription)
        }
    }

    private static func newInstallId() -> String {
        (0..<16).map { _ in String(format: "%02x", UInt8.random(in: .min ... .max)) }.joined()
    }
}
#endif
