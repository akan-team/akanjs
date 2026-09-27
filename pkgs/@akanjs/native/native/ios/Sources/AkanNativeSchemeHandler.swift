// app://localhost/* (docs/architecture.md §5). Routes, MIME types and Range requests are the
// kernel's (AkanNativeKernel.swift, checked with the shared vectors).
//
// Stopped tasks: calling didReceive/didFinish on a stopped WKURLSchemeTask aborts the app
// (verified). Live tasks are tracked in a set and every answer is sent on the main thread after
// checking the set; stop also arrives on the main thread, so there is no race.
//
// akan-native dev --hmr (dev builds with shell.json `devServer`): every path outside /__akan_native/* is fetched
// from the dev gateway on 127.0.0.1 (packages/cli/src/lib/hmr.ts) and answered on app://localhost,
// so the bridge, storage and CSP see the usual origin. Without the gateway (akan-native dev ended) the
// bundled files are served.

import UIKit
import WebKit

@MainActor
final class AkanNativeSchemeHandler: NSObject, WKURLSchemeHandler {
    /// The web bundle being served: the app's own, or a downloaded one (UP-2, AkanNativeUpdates).
    var root: URL {
        didSet { root = root.standardizedFileURL }
    }
    /// akan-native dev --hmr: where pages come from instead of `root` (nil: the bundled files).
    let devServer: URL?
    private let initScript: () -> Data
    private var active = Set<ObjectIdentifier>()
    private var devWarned = false
    private lazy var devSession: URLSession = {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        configuration.urlCache = nil
        configuration.timeoutIntervalForRequest = 60 // Bun bundles on the first request
        return URLSession(configuration: configuration)
    }()

    init(root: URL, devServer: URL? = nil, initScript: @escaping () -> Data) {
        self.root = root.standardizedFileURL
        self.devServer = devServer
        self.initScript = initScript
    }

    /// shell.json `devServer` (dev builds only): plain http to the loopback interface, or to a private
    /// LAN address for an iPhone that reaches the Mac over Wi-Fi (O4-3).
    nonisolated static func devServerURL(_ text: String) -> URL? {
        guard let url = URL(string: text), url.scheme == "http", url.port != nil, let host = url.host else { return nil }
        if ["127.0.0.1", "localhost"].contains(host) { return url }
        let octets = host.split(separator: ".").compactMap { UInt8($0) }
        guard octets.count == 4, host.split(separator: ".").count == 4 else { return nil }
        let privateLan = octets[0] == 10 || (octets[0] == 172 && (16...31).contains(octets[1])) || (octets[0] == 192 && octets[1] == 168)
        return privateLan ? url : nil
    }


    func webView(_ webView: WKWebView, start task: any WKURLSchemeTask) {
        let key = ObjectIdentifier(task)
        active.insert(key)
        guard let url = task.request.url else { return respond(task, key, status: 400, mime: "text/plain", body: Data()) }
        if let devServer, !AkanNativeKernel.isHostPath(url.path(percentEncoded: true)) {
            return proxy(task, key, url: url, devServer: devServer)
        }
        serveLocal(task, key, url: url)
    }

    private func serveLocal(_ task: any WKURLSchemeTask, _ key: ObjectIdentifier, url: URL) {
        let range = task.request.value(forHTTPHeaderField: "Range")
        let root = self.root
        let route = AkanNativeKernel.route(url.path(percentEncoded: true)) { relative in
            var isDir: ObjCBool = false
            let path = root.appendingPathComponent(relative).standardizedFileURL.path
            return path.hasPrefix(root.path + "/") && FileManager.default.fileExists(atPath: path, isDirectory: &isDir) && !isDir.boolValue
        }
        switch route {
        case .initScript:
            respond(task, key, status: 200, mime: "text/javascript; charset=utf-8", body: initScript(), headers: ["Cache-Control": "no-store"])
        case .file(let id):
            guard let entry = AkanNativeFiles.shared.lookup(id) else { return notFound(task, key) }
            serve(task, key, file: entry.url, mime: entry.mime, range: range, fileRef: true)
        case .asset(let relative):
            serve(task, key, file: root.appendingPathComponent(relative), mime: AkanNativeKernel.assetMime(relative), range: range)
        case .ipc, .hello, .notFound: // the desktop's and Android's
            notFound(task, key)
        }
    }

    func webView(_ webView: WKWebView, stop task: any WKURLSchemeTask) {
        active.remove(ObjectIdentifier(task))
    }

    // MARK: akan-native dev --hmr

    /// Request headers not passed on: hop-by-hop, the gateway's own host, and validators (the gateway never
    /// answers 304). Everything else goes, Authorization included, so the page's API calls work through it.
    private static let devSkip: Set<String> = ["host", "connection", "keep-alive", "content-length", "accept-encoding", "if-none-match", "if-modified-since"]
    /// Framing headers of the gateway's reply; respond() sets Content-Type and Content-Length itself.
    private static let devDrop: Set<String> = ["connection", "keep-alive", "transfer-encoding", "content-length", "content-encoding", "content-type"]

    private func proxy(_ task: any WKURLSchemeTask, _ key: ObjectIdentifier, url: URL, devServer: URL) {
        var components = URLComponents()
        components.scheme = devServer.scheme
        components.host = devServer.host
        components.port = devServer.port
        let path = url.path(percentEncoded: true)
        components.percentEncodedPath = path.isEmpty ? "/" : path
        components.percentEncodedQuery = url.query(percentEncoded: true)
        guard let target = components.url else { return serveLocal(task, key, url: url) }
        var request = URLRequest(url: target)
        request.httpMethod = task.request.httpMethod ?? "GET"
        request.httpBody = Self.bodyOf(task.request)
        for (name, value) in task.request.allHTTPHeaderFields ?? [:] where !Self.devSkip.contains(name.lowercased()) {
            request.setValue(value, forHTTPHeaderField: name)
        }
        let box = UncheckedBox(task)
        devSession.dataTask(with: request) { data, response, error in
            let result = UncheckedBox((data, response as? HTTPURLResponse, error))
            DispatchQueue.main.async {
                MainActor.assumeIsolated {
                    let (data, http, error) = result.value
                    guard let http, let data else {
                        if !self.devWarned {
                            self.devWarned = true
                            AkanNativeLog.info("dev server \(devServer.absoluteString): \(error?.localizedDescription ?? "no response"); serving the bundled files")
                        }
                        return self.serveLocal(box.value, key, url: url)
                    }
                    var headers: [String: String] = [:]
                    for (name, value) in http.allHeaderFields {
                        guard let name = name as? String, !Self.devDrop.contains(name.lowercased()) else { continue }
                        headers[name] = "\(value)"
                    }
                    let mime = http.value(forHTTPHeaderField: "Content-Type") ?? AkanNativeKernel.assetMime(url.path)
                    self.respond(box.value, key, status: http.statusCode, mime: mime, body: data, headers: headers)
                }
            }
        }.resume()
    }

    /// WebKit hands a Blob or FormData body to the handler as a stream instead of `httpBody`.
    private static func bodyOf(_ request: URLRequest) -> Data? {
        if let body = request.httpBody { return body }
        guard let stream = request.httpBodyStream else { return nil }
        stream.open()
        defer { stream.close() }
        var data = Data()
        var buffer = [UInt8](repeating: 0, count: 64 * 1024)
        while true {
            let read = stream.read(&buffer, maxLength: buffer.count)
            if read <= 0 { break }
            data.append(buffer, count: read)
        }
        return data
    }

    private func notFound(_ task: any WKURLSchemeTask, _ key: ObjectIdentifier) {
        respond(task, key, status: 404, mime: "text/plain; charset=utf-8", body: Data("not found".utf8))
    }

    /// Reads off the main thread, answers on it. Single-range requests get 206 (IN-5), at most
    /// maxRangeBytes (Tauri's 1000 KiB: media elements ask for the rest) of the mapped, not read, file.
    /// `fileRef`: a file a plugin registered, whose content the app does not control. It is never the
    /// app's document: no MIME sniffing, not for other origins, and anything but plain media opens
    /// sandboxed, with an opaque origin the bridge refuses (AkanNativeKernel.fileRefSandboxed; N1).
    private func serve(_ task: any WKURLSchemeTask, _ key: ObjectIdentifier, file: URL, mime: String, range: String?, fileRef: Bool = false) {
        let box = UncheckedBox(task)
        DispatchQueue.global(qos: .userInitiated).async {
            var status = 200
            var body = Data()
            var headers = ["Accept-Ranges": "bytes", "Cache-Control": "no-cache"]
            if fileRef {
                headers["X-Content-Type-Options"] = "nosniff"
                headers["Cross-Origin-Resource-Policy"] = "same-origin"
                if AkanNativeKernel.fileRefSandboxed(mime) { headers["Content-Security-Policy"] = "sandbox" }
            }
            do {
                let data = try Data(contentsOf: file, options: .mappedIfSafe)
                switch AkanNativeKernel.parseRange(range, size: Int64(data.count)) {
                case .whole:
                    body = data
                case .part(let first, let last):
                    status = 206
                    body = data.subdata(in: Int(first)..<Int(last + 1))
                    headers["Content-Range"] = "bytes \(first)-\(last)/\(data.count)"
                case .unsatisfiable:
                    status = 416
                    headers["Content-Range"] = "bytes */\(data.count)"
                }
            } catch {
                status = 404
                body = Data("not found".utf8)
            }
            let result = UncheckedBox((status, body, headers))
            DispatchQueue.main.async {
                MainActor.assumeIsolated {
                    let (status, body, headers) = result.value
                    self.respond(box.value, key, status: status, mime: status == 404 ? "text/plain; charset=utf-8" : mime, body: body, headers: headers)
                }
            }
        }
    }

    private func respond(_ task: any WKURLSchemeTask, _ key: ObjectIdentifier, status: Int, mime: String, body: Data, headers: [String: String] = [:]) {
        guard active.remove(key) != nil, let url = task.request.url else { return } // stopped meanwhile
        var all = headers
        all["Content-Type"] = mime
        all["Content-Length"] = String(body.count)
        let response = HTTPURLResponse(url: url, statusCode: status, httpVersion: "HTTP/1.1", headerFields: all)!
        task.didReceive(response)
        task.didReceive(body)
        task.didFinish()
    }
}
