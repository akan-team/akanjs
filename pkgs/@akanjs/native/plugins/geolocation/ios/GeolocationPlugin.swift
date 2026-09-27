import CoreLocation
import Foundation

/// CoreLocation, when-in-use authorization only.
/// Compared with tauri-plugins-workspace/plugins/geolocation/ios/Sources/GeolocationPlugin.swift:
/// - Two managers: `single` answers getCurrentPosition with requestLocation(), `watcher` runs
///   startUpdatingLocation() while the page listens. requestLocation() and startUpdatingLocation()
///   on one manager interfere (a running update makes the one-shot request moot, and
///   stopUpdatingLocation() is also how a pending requestLocation() is cancelled).
/// - Instance authorizationStatus / accuracyAuthorization and locationManagerDidChangeAuthorization
///   (iOS 14+); Tauri still uses the deprecated class method (its own TODO).
/// - timeout and maximumAge are honored (Tauri ignores both on iOS); balanced accuracy is 100 m
///   (Tauri: 1 km, which in a city is often just the cell tower).
/// - Invalid CLLocation fields (negative accuracy, course, speed) become null instead of -1, and
///   altitude is ellipsoidalAltitude (iOS 15+) so it means the same as on Android and in W3C.
/// - kCLErrorLocationUnknown during a watch is transient (Apple: "keeps trying"), so it is not
///   reported; for a one-shot request it ends the request with NOT_FOUND.
/// - Asking without NSLocationWhenInUseUsageDescription does nothing (the prompt never appears), so
///   it is checked first. Location services off system-wide reads as .denied.
/// - Reduced accuracy (Precise Location off) is reported as precise: false; asking for temporary
///   full accuracy needs NSLocationTemporaryUsageDescriptionDictionary and is not offered yet.
/// Simulator: `xcrun simctl location <udid> set <lat>,<lon>`, `xcrun simctl privacy <udid> grant location <bundle id>`.
/// Arguments arrive decoded and checked by the generated GeolocationPluginSpec (PL-10); the ranges
/// of timeout and maximumAge are checked here.
final class GeolocationPlugin: NSObject, GeolocationPluginSpec, CLLocationManagerDelegate {
    static let id = "geolocation"

    private final class Request {
        let reply: AkanNativeReply<GeolocationPosition>
        let high: Bool
        let timeout: Double
        let timer: DispatchWorkItem
        var started = false

        init(reply: AkanNativeReply<GeolocationPosition>, high: Bool, timeout: Double, timer: DispatchWorkItem) {
            (self.reply, self.high, self.timeout, self.timer) = (reply, high, timeout, timer)
        }
    }

    private static let watchEvents: Set<String> = ["position", "highAccuracyPosition"]
    private let events: GeolocationEvents
    private let single = CLLocationManager()
    private let watcher = CLLocationManager()
    private var requests: [Int: Request] = [:]
    private var nextRequest = 0
    private var singleRunning = false
    private var singleHigh = false
    private var permissionReplies: [AkanNativeReply<GeolocationLocationPermission>] = []
    private var listening: Set<String> = []
    private var watchRunning = false
    private var reportedDenied = false

    init(context: AkanNativePluginContext) {
        events = GeolocationEvents(context)
        super.init()
        single.delegate = self // created on the main thread: delegate calls arrive on the main run loop
        watcher.delegate = self
    }

    func checkPermission(_ reply: AkanNativeReply<GeolocationLocationPermission>) {
        reply.resolve(permission())
    }

    func requestPermission(_ reply: AkanNativeReply<GeolocationLocationPermission>) {
        guard single.authorizationStatus == .notDetermined else { return reply.resolve(permission()) }
        guard Self.hasUsageDescription else { return reply.reject(.internalError, Self.missingUsage) }
        permissionReplies.append(reply)
        single.requestWhenInUseAuthorization() // answered in locationManagerDidChangeAuthorization
    }

    func startListening(_ event: String) {
        guard Self.watchEvents.contains(event) else { return }
        listening.insert(event)
        updateWatch()
    }

    func stopListening(_ event: String) {
        guard Self.watchEvents.contains(event) else { return }
        listening.remove(event)
        updateWatch()
    }

    // MARK: permission

    private static let missingUsage = "Info.plist has no NSLocationWhenInUseUsageDescription"

    private static var hasUsageDescription: Bool {
        Bundle.main.object(forInfoDictionaryKey: "NSLocationWhenInUseUsageDescription") != nil
    }

    private var authorized: Bool {
        let status = single.authorizationStatus
        return status == .authorizedWhenInUse || status == .authorizedAlways
    }

    private func permission() -> GeolocationLocationPermission {
        let state: GeolocationPermissionState =
            switch single.authorizationStatus {
            case .notDetermined: .prompt
            case .denied, .restricted: .denied
            default: .granted
            }
        return GeolocationLocationPermission(location: state, precise: authorized ? single.accuracyAuthorization == .fullAccuracy : nil)
    }

    private func authorizationChanged() {
        if single.authorizationStatus == .notDetermined { return } // the initial callback, or still asking
        let replies = permissionReplies
        permissionReplies.removeAll()
        let state = permission()
        for reply in replies { reply.resolve(state) }
        if authorized { reportedDenied = false }
        startSingle()
        updateWatch()
    }

    // MARK: getCurrentPosition

    /// A non-negative number of ms, or the fallback when absent. JSON has no Infinity: it arrives as null.
    private static func milliseconds<T>(_ value: Double?, _ name: String, _ fallback: Double, _ reply: AkanNativeReply<T>) -> Double? {
        guard let value else { return fallback }
        guard value >= 0 else {
            reply.reject(.invalidArgs, "\(name) must be a number of ms >= 0")
            return nil
        }
        return value
    }

    func getCurrentPosition(_ args: GeolocationPositionOptions, _ reply: AkanNativeReply<GeolocationPosition>) {
        guard let timeout = Self.milliseconds(args.timeout, "timeout", 30_000, reply),
              let maximumAge = Self.milliseconds(args.maximumAge, "maximumAge", 0, reply) else { return }
        let high = args.enableHighAccuracy ?? false
        if maximumAge > 0, authorized, let cached = watcher.location ?? single.location,
            cached.horizontalAccuracy >= 0, -cached.timestamp.timeIntervalSinceNow * 1000 <= maximumAge
        {
            return reply.resolve(GeolocationPosition(cached))
        }
        let id = nextRequest
        nextRequest += 1
        let timer = DispatchWorkItem { [weak self] in MainActor.assumeIsolated { self?.timedOut(id) } }
        requests[id] = Request(reply: reply, high: high, timeout: timeout, timer: timer)
        startSingle()
    }

    private func startSingle() {
        guard !requests.isEmpty else { return stopSingle() }
        switch single.authorizationStatus {
        case .notDetermined:
            guard Self.hasUsageDescription else { return finishAll(.internalError, Self.missingUsage) }
            single.requestWhenInUseAuthorization() // continues in authorizationChanged
        case .denied, .restricted:
            finishAll(.permissionDenied, "location access was denied")
        default:
            // Like W3C, the timeout runs from here: time spent on the permission prompt does not count.
            for request in requests.values where !request.started {
                request.started = true
                DispatchQueue.main.asyncAfter(deadline: .now() + min(request.timeout, 86_400_000) / 1000, execute: request.timer)
            }
            let high = requests.values.contains { $0.high }
            if singleRunning, singleHigh || !high { return } // the running request is good enough
            if singleRunning { single.stopUpdatingLocation() } // restart with the better accuracy
            single.desiredAccuracy = high ? kCLLocationAccuracyBest : kCLLocationAccuracyHundredMeters
            singleHigh = high
            singleRunning = true
            single.requestLocation()
        }
    }

    private func stopSingle() {
        if singleRunning { single.stopUpdatingLocation() } // also cancels a pending requestLocation()
        singleRunning = false
    }

    private func timedOut(_ id: Int) {
        guard let request = requests.removeValue(forKey: id) else { return }
        request.reply.reject(.notFound, "no position within \(Int(request.timeout)) ms")
        if requests.isEmpty { stopSingle() }
    }

    private func finishAll(_ code: AkanNativeErrorCode?, _ message: String, fix: GeolocationPosition? = nil) {
        let pending = requests.values
        requests.removeAll()
        singleRunning = false
        for request in pending {
            request.timer.cancel()
            if let fix { request.reply.resolve(fix) } else if let code { request.reply.reject(code, message) }
        }
    }

    // MARK: watch

    private func updateWatch() {
        guard !listening.isEmpty else {
            if watchRunning { watcher.stopUpdatingLocation() }
            watchRunning = false
            reportedDenied = false
            return
        }
        switch watcher.authorizationStatus {
        case .notDetermined:
            guard Self.hasUsageDescription else { return reportOnce(.internal, Self.missingUsage) }
            watcher.requestWhenInUseAuthorization()
        case .denied, .restricted:
            if watchRunning { watcher.stopUpdatingLocation() }
            watchRunning = false
            reportOnce(.permissionDenied, "location access was denied")
        default:
            // Changing desiredAccuracy on a running manager applies right away.
            watcher.desiredAccuracy = listening.contains("highAccuracyPosition") ? kCLLocationAccuracyBest : kCLLocationAccuracyHundredMeters
            if !watchRunning { watcher.startUpdatingLocation() }
            watchRunning = true
        }
    }

    private func reportOnce(_ code: GeolocationErrorCode, _ message: String) {
        guard !reportedDenied else { return }
        reportedDenied = true
        events.error(GeolocationError(code: code, message: message))
    }

    // MARK: CLLocationManagerDelegate (main thread, see init)

    private func received(_ fix: GeolocationPosition, from manager: ObjectIdentifier) {
        if manager == ObjectIdentifier(single) {
            finishAll(nil, "", fix: fix)
        } else if watchRunning {
            for event in listening {
                if event == "highAccuracyPosition" { events.highAccuracyPosition(fix) } else { events.position(fix) }
            }
        }
    }

    private func failed(_ code: Int, _ message: String, from manager: ObjectIdentifier) {
        let denied = code == CLError.Code.denied.rawValue
        if manager == ObjectIdentifier(single) {
            finishAll(denied ? .permissionDenied : .notFound, denied ? "location access was denied" : "no position: \(message)")
        } else if denied {
            if watchRunning { watcher.stopUpdatingLocation() }
            watchRunning = false
            reportOnce(.permissionDenied, "location access was denied")
        } else if code != CLError.Code.locationUnknown.rawValue {
            events.error(GeolocationError(code: .notFound, message: "no position: \(message)"))
        }
    }

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let id = ObjectIdentifier(manager)
        MainActor.assumeIsolated {
            if id == ObjectIdentifier(single) { authorizationChanged() } // both managers report the same app-wide change
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        // The last one is the newest (Tauri's comment on capacitor using .first).
        guard let location = locations.last, location.horizontalAccuracy >= 0 else { return }
        let fix = GeolocationPosition(location)
        let id = ObjectIdentifier(manager)
        MainActor.assumeIsolated { received(fix, from: id) }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: any Error) {
        let code = (error as? CLError)?.code.rawValue ?? -1
        let message = error.localizedDescription
        let id = ObjectIdentifier(manager)
        MainActor.assumeIsolated { failed(code, message, from: id) }
    }
}

private extension GeolocationPosition {
    /// A CLLocation reduced to Sendable values where the delegate call arrives.
    init(_ location: CLLocation) {
        let vertical = location.verticalAccuracy > 0
        self.init(
            latitude: location.coordinate.latitude,
            longitude: location.coordinate.longitude,
            accuracy: location.horizontalAccuracy,
            altitude: vertical ? location.ellipsoidalAltitude : nil,
            altitudeAccuracy: vertical ? location.verticalAccuracy : nil,
            heading: location.course >= 0 ? location.course : nil,
            speed: location.speed >= 0 ? location.speed : nil,
            timestamp: (location.timestamp.timeIntervalSince1970 * 1000).rounded()
        )
    }
}
