import Network

/// NWPathMonitor (capacitor-plugins/network/ios still bundles a SCNetworkReachability copy, Reachability.swift).
/// The monitor runs only while needed: from the first $listen to the last $unlisten, or for a getStatus()
/// until the first path arrives. A new monitor delivers its first path asynchronously (currentPath is
/// not ready right after start), so getStatus waits for it instead of reading currentPath.
/// connected = .satisfied. Unlike Android, iOS does not validate internet access, so a captive portal
/// Wi-Fi counts as connected. In the simulator the path is the Mac's.
/// The result and event types come from the generated NetworkPluginSpec (PL-10).
final class NetworkPlugin: NetworkPluginSpec {
    static let id = "network"

    private let context: AkanNativePluginContext
    private var monitor: NWPathMonitor?
    private var status: NetworkStatus?
    private var waiting: [AkanNativeReply<NetworkStatus>] = []
    private var listening = false

    init(context: AkanNativePluginContext) {
        self.context = context
    }

    func getStatus(_ reply: AkanNativeReply<NetworkStatus>) {
        if let status { return reply.resolve(status) }
        waiting.append(reply)
        startMonitor()
    }

    func startListening(_ event: String) {
        guard event == "change" else { return }
        listening = true
        startMonitor()
    }

    func stopListening(_ event: String) {
        guard event == "change" else { return }
        listening = false
        stopIfIdle()
    }

    private func startMonitor() {
        guard monitor == nil else { return }
        let monitor = NWPathMonitor()
        monitor.pathUpdateHandler = { [weak self] path in
            let next = NetworkPlugin.status(of: path)
            MainActor.assumeIsolated { self?.update(next) } // started on the main queue
        }
        monitor.start(queue: .main)
        self.monitor = monitor
    }

    private func update(_ next: NetworkStatus) {
        let previous = status
        status = next
        let replies = waiting
        waiting.removeAll()
        for reply in replies { reply.resolve(next) }
        // The first path of a monitor is the starting point, not a change.
        if listening, let previous, previous.connected != next.connected || previous.type != next.type {
            NetworkEvents(context).change(next)
        }
        stopIfIdle()
    }

    private func stopIfIdle() {
        guard !listening, waiting.isEmpty, let monitor else { return }
        monitor.cancel()
        self.monitor = nil
        status = nil // stale once nothing watches
    }

    nonisolated private static func status(of path: NWPath) -> NetworkStatus {
        let connected = path.status == .satisfied
        let type: NetworkConnectionType =
            if path.usesInterfaceType(.wifi) { .wifi }
            else if path.usesInterfaceType(.cellular) { .cellular }
            else if path.usesInterfaceType(.wiredEthernet) { .ethernet }
            else if connected { .unknown } // loopback or a tunnel (.other)
            else { .none_ }
        return NetworkStatus(connected: connected, type: type)
    }
}
