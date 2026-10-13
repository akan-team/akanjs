// What became of each web bundle release, posted to updates.report.url so whoever publishes sees apply and
// rollback rates; a rollback is decided before any page script runs, so only the shell can tell. The Android twin is
// native/android/.../AkanNativeUpdateReports.kt, same file and wire format; the contract (events, reasons, what an
// answer does, Retry-After, the caps) is AkanNativeKernel's, checked against vectors/updates.json `reports`.
//
// akan-native-updates/report.json: { installId, nextId, events: [{ id, event, bundle, sequence, reason, at }], retryAt?,
// seen: [key] }. Beside state.json, so backups skip it, but reset() rewrites state.json only: the installId (random,
// not a device identifier) and the id counter live as long as the install, and an id is never used twice. Read once,
// at the first use, and written whenever it changes.
// Sent when the first window opens and on each return to the foreground: oldest first, a batch to a request, one
// request at a time.
#if AKAN_NATIVE_UPDATES
import Foundation
import UIKit

@MainActor
enum AkanNativeUpdateReports {
    private static var sending = false
    private static var observing = false
    private static var loaded: Report?

    private struct Report {
        var installId: String
        var nextId: Int
        var events: [[String: Any]]
        var retryAt: Double?
        var seen: [String]
    }

    /// Nothing is kept when the build names no report URL.
    @discardableResult
    static func record(_ event: AkanNativeUpdateEvent, bundle: String?, sequence: Double?, reason: AkanNativeUpdateReason? = nil) -> Int? {
        guard AkanNativeUpdates.config?.reportUrl != nil, let bundle, AkanNativeKernel.isBundleId(bundle) else { return nil }
        var report = load()
        let key = AkanNativeKernel.updateReportKey(event, bundle: bundle, reason: reason)
        guard !report.seen.contains(key) else { return nil }
        report.seen = Array((report.seen + [key]).suffix(AkanNativeKernel.updateReportLimit))
        let sequence = sequence.flatMap { $0.isFinite ? $0 : nil }
        let number: Any = sequence.map { $0.rounded() == $0 && abs($0) < 9e15 ? NSNumber(value: Int64($0)) : NSNumber(value: $0) } ?? NSNull()
        let id = report.nextId
        report.events.append([
            "id": id, "event": event.rawValue, "bundle": bundle, "sequence": number, "reason": reason?.rawValue ?? NSNull(),
            "at": AkanNativeKernel.updateReportTime(Int64((Date().timeIntervalSince1970 * 1000).rounded(.down))),
        ])
        report.events = Array(report.events.suffix(AkanNativeKernel.updateReportLimit))
        report.nextId += 1
        save(report)
        return id
    }

    @discardableResult
    static func record(_ event: AkanNativeUpdateEvent, _ entry: AkanNativeUpdateEntry, reason: AkanNativeUpdateReason? = nil) -> Int? {
        record(event, bundle: entry.bundle, sequence: entry.sequence, reason: reason)
    }

    static func amend(_ id: Int, reason: AkanNativeUpdateReason) {
        var report = load()
        guard let index = report.events.firstIndex(where: { ($0["id"] as? NSNumber)?.intValue == id }),
              let event = (report.events[index]["event"] as? String).flatMap(AkanNativeUpdateEvent.init(rawValue:)),
              let bundle = report.events[index]["bundle"] as? String else { return }
        let previous = (report.events[index]["reason"] as? String).flatMap(AkanNativeUpdateReason.init(rawValue:))
        let key = AkanNativeKernel.updateReportKey(event, bundle: bundle, reason: previous)
        report.events[index]["reason"] = reason.rawValue
        report.seen = report.seen.map { $0 == key ? AkanNativeKernel.updateReportKey(event, bundle: bundle, reason: reason) : $0 }
        save(report)
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
        let report = load()
        if AkanNativeKernel.updateReportWaits(report.retryAt, now: Date().timeIntervalSince1970) { return }
        let events = Array(report.events.prefix(AkanNativeKernel.updateReportBatch))
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
        var report = load()
        switch AkanNativeKernel.updateReportOutcome(status) {
        case .kept:
            let retryAt = AkanNativeKernel.updateReportRetryAt(retryAfter, now: Date().timeIntervalSince1970)
            guard retryAt != report.retryAt else { return }
            report.retryAt = retryAt
            save(report)
        case .sent, .dropped:
            report.events.removeAll { ids.contains(($0["id"] as? NSNumber)?.intValue ?? -1) }
            report.retryAt = nil
            save(report)
            flush()
        }
    }

    private static func load() -> Report {
        if let loaded { return loaded }
        let report = read()
        loaded = report
        return report
    }

    private static func read() -> Report {
        let o = AkanNativeUpdates.readJson("report.json") ?? [:]
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

    private static func save(_ report: Report) {
        loaded = report
        var o: [String: Any] = ["installId": report.installId, "nextId": report.nextId, "events": report.events, "seen": report.seen]
        //? JSONSerialization raises on a NaN or an infinity, an exception try? does not catch.
        if let retryAt = report.retryAt, retryAt.isFinite { o["retryAt"] = retryAt }
        AkanNativeUpdates.writeJson("report.json", o)
    }

    private static func newInstallId() -> String {
        (0..<16).map { _ in String(format: "%02x", UInt8.random(in: .min ... .max)) }.joined()
    }
}
#endif
