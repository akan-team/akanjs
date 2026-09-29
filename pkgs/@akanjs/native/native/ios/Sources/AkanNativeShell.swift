// Shell configuration, logging and the session file registry.

import UIKit
import os

enum AkanNativeLog {
    private static let logger = Logger(subsystem: "com.akanjs", category: "shell")

    /// stdout reaches `simctl launch --console-pty` (akan-native run ios); os_log reaches `log stream`.
    static func info(_ text: String) {
        print("[akan-native] \(text)")
        fflush(stdout)
        logger.info("\(text, privacy: .public)")
    }

    /// One `[page<+> <level>]` tag per line, the desktop host's grammar, which the akan CLI reads the level back from;
    /// os_log takes the page's level too, so `log stream` and Console.app filter on it.
    static func page(_ level: String, _ text: String) {
        let lines = text.replacingOccurrences(of: "\\n+$", with: "", options: .regularExpression)
            .components(separatedBy: "\n")
        print(lines.enumerated().map { "[page\($0.offset == 0 ? "" : "+") \(level)] \($0.element)" }.joined(separator: "\n"))
        fflush(stdout)
        let message = lines.joined(separator: "\n")
        switch level {
        case "error": logger.error("\(message, privacy: .public)")
        case "warn": logger.warning("\(message, privacy: .public)")
        case "trace", "verbose", "debug": logger.debug("\(message, privacy: .public)")
        default: logger.info("\(message, privacy: .public)")
        }
    }
}

/// Files written by `akan-native build` next to the executable: boot.json, env.runtime.json, shell.json.
struct AkanNativeShellConfig {
    var backgroundColor: UIColor
    var devtools: Bool
    var hideFormAccessoryBar: Bool
    /// keyboard.resize (O6-1): the keyboard mode from the first frame, until keyboard.setResizeMode.
    var keyboardResizes: Bool
    var dev: Bool
    /** Launch screen cover (SH-6): hide after the first page load, and at the latest after the timeout. */
    var splashAutoHide: Bool
    var splashTimeout: TimeInterval
    /// akan-native dev --hmr (dev builds only): the dev gateway pages are fetched from (AkanNativeSchemeHandler).
    var devServer: URL?
    /// Dev builds only (O4-5): the first page's path and query on the app's origin.
    var startPath: String
    /// security.shell.externalSchemes (L0): schemes links and the opener may also hand to the system.
    var externalSchemes: [String]

    /// A path on the app's origin, never one of akan-native's own (/__akan_native/*); anything else is "/".
    static func startPath(_ text: String?) -> String {
        guard let text, text.hasPrefix("/"), !text.hasPrefix("//"), !text.hasPrefix("/__akan_native"), !text.contains(where: \.isWhitespace) else { return "/" }
        return text
    }

    static func load() -> AkanNativeShellConfig {
        let shell = AkanNativeResources.json("shell.json")
        let light = UIColor(hex: shell["backgroundColor"] as? String ?? "") ?? .systemBackground
        let dark = UIColor(hex: shell["backgroundColorDark"] as? String ?? "") ?? light
        let boot = AkanNativeResources.json("boot.json")
        let splash = shell["splash"] as? [String: Any] ?? [:]
        let dev = boot["dev"] as? Bool ?? false
        return AkanNativeShellConfig(
            backgroundColor: UIColor { $0.userInterfaceStyle == .dark ? dark : light },
            devtools: shell["devtools"] as? Bool ?? false,
            hideFormAccessoryBar: shell["hideFormAccessoryBar"] as? Bool ?? false,
            keyboardResizes: shell["keyboardResize"] as? String != "none",
            dev: dev,
            splashAutoHide: splash["autoHide"] as? Bool ?? true,
            splashTimeout: (splash["timeout"] as? Double ?? 10_000) / 1000,
            devServer: dev ? (shell["devServer"] as? String).flatMap(AkanNativeSchemeHandler.devServerURL) : nil,
            startPath: dev ? AkanNativeShellConfig.startPath(shell["startPath"] as? String) : "/",
            externalSchemes: shell["externalSchemes"] as? [String] ?? []
        )
    }
}

/// What the shell hands to the system (L0) and how often: the page's links and window.open, and the
/// opener, share one limit of externalOpensPerSecond, so a page cannot flood the device with other apps.
@MainActor
enum AkanNativeExternal {
    /// http, https, mailto, tel and security.shell.externalSchemes (never the forbidden ones).
    static let schemes: [String] = AkanNativeKernel.externalSchemes(AkanNativeShellConfig.load().externalSchemes)
    private static var last = Date.distantPast

    /// Whether an open may happen now; counts it when it may.
    static func allowed() -> Bool {
        let now = Date()
        guard now.timeIntervalSince(last) >= 1 / Double(AkanNativeContract.externalOpensPerSecond) else { return false }
        last = now
        return true
    }
}

enum AkanNativeResources {
    static func url(_ name: String) -> URL { Bundle.main.bundleURL.appendingPathComponent(name) }

    static func text(_ name: String) -> String {
        (try? String(contentsOf: url(name), encoding: .utf8)) ?? "{}"
    }

    static func json(_ name: String) -> [String: Any] {
        guard let data = try? Data(contentsOf: url(name)),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return [:] }
        return object
    }
}

extension UIColor {
    convenience init?(hex: String) {
        var s = hex.trimmingCharacters(in: .whitespaces)
        if s.hasPrefix("#") { s.removeFirst() }
        guard s.count == 6 || s.count == 8, let v = UInt64(s, radix: 16) else { return nil }
        let (r, g, b, a) = s.count == 6
            ? ((v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff, UInt64(0xff))
            : ((v >> 24) & 0xff, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff)
        self.init(red: CGFloat(r) / 255, green: CGFloat(g) / 255, blue: CGFloat(b) / 255, alpha: CGFloat(a) / 255)
    }
}

/// Files served at /__akan_native/file/<id> for the app session (PL-7).
final class AkanNativeFiles: @unchecked Sendable {
    static let shared = AkanNativeFiles()
    private let lock = NSLock()
    private var files: [String: (url: URL, mime: String)] = [:]

    let directory = FileManager.default.temporaryDirectory.appendingPathComponent("akan-native-files", isDirectory: true)

    /// Called at launch: files of an earlier session are no longer reachable anyway.
    func resetSessionDirectory() {
        try? FileManager.default.removeItem(at: directory)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    }

    func register(_ url: URL, mime: String) -> String {
        // ASCII letters and digits only: the route accepts no other id (AkanNativeKernel.isFileRefId).
        let ext = url.pathExtension.lowercased().filter { AkanNativeContract.idFileRef.extChars.contains($0) }.prefix(AkanNativeContract.idFileRef.extMax)
        let id = UUID().uuidString.lowercased() + (ext.isEmpty ? "" : ".\(ext)")
        lock.lock()
        files[id] = (url, mime)
        lock.unlock()
        return "/__akan_native/file/\(id)"
    }

    func lookup(_ id: String) -> (url: URL, mime: String)? {
        lock.lock()
        defer { lock.unlock() }
        return files[id]
    }

    /// Stops serving a FileRef ($bridge.release). A file in the session folder is akan-native's own copy
    /// (a photo, a download) and is deleted; other files belong to the user and stay.
    func release(_ id: String) -> Bool {
        lock.lock()
        let entry = files.removeValue(forKey: id)
        lock.unlock()
        guard let entry else { return false }
        if entry.url.standardizedFileURL.path.hasPrefix(directory.standardizedFileURL.path + "/") {
            try? FileManager.default.removeItem(at: entry.url)
        }
        return true
    }

    /// How many FileRefs are served (K13).
    var count: Int {
        lock.lock()
        defer { lock.unlock() }
        return files.count
    }
}
