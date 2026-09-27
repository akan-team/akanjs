import Foundation

/// Native HTTP (WV-5) with URLSession: requests leave from the app, not the WebView, so CORS does
/// not apply. Capacitor's CapacitorHttp does the same (capacitor/ios/Capacitor/Capacitor/Plugins/
/// HttpRequestHandler.swift); what akan-native does differently:
/// - One ephemeral session without cookie storage or URL cache, so nothing is stored or reused
///   between requests (as on Android and desktop).
/// - Redirects are refused by the session delegate (returning nil hands back the 3xx, as
///   CapacitorUrlRequest.swift:235-237 does for disableRedirects) and followed here, so every hop
///   is checked against the app's scope with fetch's method and credential rules (HttpUrl.swift).
/// - One deadline for the whole request, hops and body included: URLRequest.timeoutInterval is
///   only the idle time between packets (Capacitor sets that alone, HttpRequestHandler.swift:203-205).
/// - Bodies are checked before anything is sent: Capacitor force-unwraps Data(base64Encoded:)
///   (CapacitorUrlRequest.swift:158) and force-casts the response to HTTPURLResponse
///   (HttpRequestHandler.swift:228), both crash on bad input.
/// - http:// to a host App Transport Security does not exempt fails with -1022: PERMISSION_DENIED.
/// Arguments arrive decoded by the generated HttpPluginSpec (PL-10); src/common.ts has the same rules.
final class HttpPlugin: HttpPluginSpec {
    static let id = "http"
    private let session: URLSession

    init(context: AkanNativePluginContext) {
        let config = URLSessionConfiguration.ephemeral
        config.urlCache = nil
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        config.httpCookieStorage = nil
        config.httpShouldSetCookies = false
        config.httpCookieAcceptPolicy = .never
        config.timeoutIntervalForResource = 24 * 3600 // the plan's own deadline ends requests
        session = URLSession(configuration: config, delegate: HttpRedirectRefusal(), delegateQueue: nil)
    }

    func request(_ args: HttpNativeRequest, _ reply: AkanNativeReply<HttpNativeResponse>) {
        let plan: HttpPlan
        do {
            plan = try HttpPlan(args)
        } catch {
            return HttpTransfer.reject(reply, error, url: args.url, timeout: 0)
        }
        // PL-11 scopes { url }, on the canonical URL; redirects are checked in HttpTransfer.
        guard reply.call.inScope(["url": plan.url], urlFields: ["url"], what: "request to \(plan.url)") else { return }
        let scope = reply.call.scope
        let session = session
        let task = Task.detached {
            do {
                reply.resolve(try await HttpTransfer.run(plan, session, scope))
            } catch {
                HttpTransfer.reject(reply, error, url: plan.url, timeout: plan.timeout)
            }
        }
        // The page gave up on the request (AbortSignal) or is gone: URLSession stops with the task.
        reply.onCancel { task.cancel() }
    }
}

struct HttpFailure: Error {
    let code: AkanNativeErrorCode
    let message: String

    init(_ code: AkanNativeErrorCode, _ message: String) {
        self.code = code
        self.message = message
    }
}

/// Hands every redirect back to HttpTransfer instead of following it.
final class HttpRedirectRefusal: NSObject, URLSessionTaskDelegate, Sendable {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest) async -> URLRequest? {
        nil
    }
}

/// A checked request (src/common.ts prepare).
struct HttpPlan: Sendable {
    static let reserved: Set<String> = ["host", "content-length", "transfer-encoding", "connection", "keep-alive", "upgrade", "te", "trailer", "expect", "accept-encoding"]
    static let maxTimeout: Double = 2_147_483_647

    let url: String
    let first: HttpUrl.Hop
    let base64Response: Bool
    /// Milliseconds.
    let timeout: Double

    init(_ args: HttpNativeRequest) throws {
        guard let url = HttpUrl.canonical(args.url) else {
            throw HttpFailure(.invalidArgs, "\(args.url) is not an http or https URL akan-native can request")
        }
        self.url = url
        let method = args.method?.rawValue ?? "GET"
        var headers: [(name: String, value: String)] = []
        var seen = Set<String>()
        for (name, value) in (args.headers ?? [:]).sorted(by: { $0.key < $1.key }) {
            guard !name.isEmpty, name.utf8.allSatisfy(Self.isToken) else { throw HttpFailure(.invalidArgs, "header name \"\(name)\" is not valid") }
            let lower = name.lowercased()
            guard !Self.reserved.contains(lower) else { throw HttpFailure(.invalidArgs, "header \(name) is set by the HTTP stack") }
            guard seen.insert(lower).inserted else { throw HttpFailure(.invalidArgs, "header \(name) is given twice") }
            guard !value.utf8.contains(where: { $0 == 0x0D || $0 == 0x0A || $0 == 0 }) else {
                throw HttpFailure(.invalidArgs, "headers.\(name) must not contain CR, LF or NUL")
            }
            headers.append((name, value.trimmingCharacters(in: CharacterSet(charactersIn: " \t"))))
        }
        var body: Data?
        if let text = args.body {
            guard method != "GET", method != "HEAD" else { throw HttpFailure(.invalidArgs, "a \(method) request cannot have a body") }
            let base64 = args.bodyEncoding == .base64
            guard let data = base64 ? Self.decodeBase64(text) : Data(text.utf8) else { throw HttpFailure(.invalidArgs, "body is not valid base64") }
            body = data
            if !seen.contains("content-type") {
                headers.append(("Content-Type", base64 ? "application/octet-stream" : "text/plain;charset=UTF-8"))
            }
        }
        first = HttpUrl.Hop(method: method, headers: headers, body: body)
        base64Response = args.responseType == .base64
        let timeout = args.timeout ?? 60_000
        guard timeout > 0, timeout <= Self.maxTimeout else {
            throw HttpFailure(.invalidArgs, "timeout must be a number of milliseconds between 1 and 2147483647")
        }
        self.timeout = timeout
    }

    /// An RFC 9110 token character.
    private static func isToken(_ b: UInt8) -> Bool {
        (b >= 0x30 && b <= 0x39) || (b >= 0x41 && b <= 0x5A) || (b >= 0x61 && b <= 0x7A) || "!#$%&'*+-.^_`|~".utf8.contains(b)
    }

    /// Standard alphabet, padding optional, no whitespace (src/common.ts base64ToBytes).
    private static func decodeBase64(_ text: String) -> Data? {
        let bytes = Array(text.utf8)
        let padding = bytes.reversed().prefix { $0 == UInt8(ascii: "=") }.count
        let isAlphabet = { (b: UInt8) in
            (b >= 0x41 && b <= 0x5A) || (b >= 0x61 && b <= 0x7A) || (b >= 0x30 && b <= 0x39) || b == UInt8(ascii: "+") || b == UInt8(ascii: "/")
        }
        guard padding <= 2, bytes.count % 4 != 1, padding == 0 || bytes.count % 4 == 0, bytes.dropLast(padding).allSatisfy(isAlphabet) else { return nil }
        return Data(base64Encoded: text + String(repeating: "=", count: (4 - bytes.count % 4) % 4))
    }
}

enum HttpTransfer {
    static let redirects: Set<Int> = [301, 302, 303, 307, 308]
    static let maxRedirects = 20

    /// The request under its deadline: whichever finishes first, the transfer or the timer.
    static func run(_ plan: HttpPlan, _ session: URLSession, _ scope: AkanNativeScope?) async throws -> HttpNativeResponse {
        try await withThrowingTaskGroup(of: HttpNativeResponse.self) { group in
            group.addTask { try await follow(plan, session, scope) }
            group.addTask {
                try await Task.sleep(nanoseconds: UInt64(plan.timeout) * 1_000_000)
                throw HttpFailure(.internalError, "request to \(plan.url) timed out after \(Int(plan.timeout)) ms")
            }
            defer { group.cancelAll() }
            guard let response = try await group.next() else { throw HttpFailure(.internalError, "request to \(plan.url) failed") }
            return response
        }
    }

    private static func follow(_ plan: HttpPlan, _ session: URLSession, _ scope: AkanNativeScope?) async throws -> HttpNativeResponse {
        var url = plan.url
        var hop = plan.first
        var count = 0
        while true {
            guard let target = URL(string: url) else { throw HttpFailure(.invalidArgs, "\(url) is not an http or https URL akan-native can request") }
            var request = URLRequest(url: target, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: plan.timeout / 1000)
            request.httpMethod = hop.method
            for header in hop.headers { request.setValue(header.value, forHTTPHeaderField: header.name) }
            // POST/PUT/PATCH without a body still send one, empty (Content-Length: 0), as desktop and Android
            request.httpBody = hop.body ?? (["POST", "PUT", "PATCH"].contains(hop.method) ? Data() : nil)

            let (data, response) = try await session.data(for: request)
            guard let http = response as? HTTPURLResponse else { throw HttpFailure(.internalError, "\(url) did not answer with HTTP") }
            if redirects.contains(http.statusCode), let location = http.value(forHTTPHeaderField: "Location") {
                guard count < maxRedirects else { throw HttpFailure(.internalError, "\(plan.url) redirected more than \(maxRedirects) times") }
                count += 1
                guard let next = HttpUrl.redirectTarget(location, from: url) else {
                    throw HttpFailure(.internalError, "cannot follow the redirect from \(url) to \(location)")
                }
                if let scope, !scope.permits(["url": next], urlFields: ["url"]) {
                    throw HttpFailure(.notAllowed, "redirect to \(next) is outside the app's capabilities")
                }
                hop = HttpUrl.redirected(http.statusCode, hop, from: url, to: next)
                url = next
                continue
            }
            return HttpNativeResponse(
                status: Double(http.statusCode),
                headers: headers(http),
                data: plan.base64Response ? data.base64EncodedString() : text(data),
                url: url
            )
        }
    }

    /// Lowercase names, repeated headers joined with ", " (allHeaderFields already joins them);
    /// Content-Encoding and Content-Length go when URLSession decoded a compressed body.
    private static func headers(_ http: HTTPURLResponse) -> [String: String] {
        var out: [String: String] = [:]
        for (key, value) in http.allHeaderFields {
            guard let name = (key as? String)?.lowercased() else { continue }
            let text = value as? String ?? "\(value)"
            out[name] = out[name].map { "\($0), \(text)" } ?? text
        }
        if let encoding = out["content-encoding"], encoding.lowercased() != "identity" {
            out["content-encoding"] = nil
            out["content-length"] = nil
        }
        return out
    }

    /// UTF-8 with invalid bytes as U+FFFD and without a byte order mark, as fetch's text().
    private static func text(_ data: Data) -> String {
        let text = String(decoding: data, as: UTF8.self)
        return text.hasPrefix("\u{FEFF}") ? String(text.dropFirst()) : text
    }

    static func reject<T>(_ reply: AkanNativeReply<T>, _ error: Error, url: String, timeout: Double) {
        if let failure = error as? HttpFailure { return reply.reject(failure.code, failure.message) }
        if let error = error as? URLError {
            switch error.code {
            case .appTransportSecurityRequiresSecureConnection:
                return reply.reject(.permissionDenied, "App Transport Security blocks \(url): use https, or allow the host in the app's Info.plist (NSAppTransportSecurity)")
            case .timedOut:
                return reply.reject(.internalError, "request to \(url) timed out after \(Int(timeout)) ms")
            default:
                return reply.reject(.internalError, "request to \(url) failed: \(error.localizedDescription)")
            }
        }
        reply.reject(.internalError, "request to \(url) failed: \(error.localizedDescription)")
    }
}
