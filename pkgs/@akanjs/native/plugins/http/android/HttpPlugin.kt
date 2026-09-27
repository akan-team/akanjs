package com.akanjs.plugins.http

import android.security.NetworkSecurityPolicy
import com.akanjs.runtime.AkanNativeErrorCode
import com.akanjs.runtime.AkanNativePluginContext
import com.akanjs.runtime.AkanNativeReply
import com.akanjs.runtime.AkanNativeScope
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.SocketTimeoutException
import java.net.URI
import java.util.Base64
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference

/**
 * Native HTTP (WV-5) with the framework's HttpURLConnection (no OkHttp library, no AndroidX): the
 * request leaves from the app, not the WebView, so CORS does not apply. Capacitor's CapacitorHttp
 * does the same (capacitor/android/capacitor/src/main/java/com/getcapacitor/plugin/); what akan-native
 * does differently:
 * - Redirects are followed here (instanceFollowRedirects off): every hop is checked against the
 *   app's scope, with fetch's method and credential rules (HttpUrl.kt), and http ↔ https hops
 *   work, which HttpURLConnection never follows by itself. Capacitor only toggles
 *   setInstanceFollowRedirects (util/CapacitorHttpUrlConnection.java:145-147).
 * - One deadline for the whole request: connect and read timeouts are the time left, and a timer
 *   disconnects the connection when it runs out (a read timeout alone restarts with every packet).
 *   Capacitor leaves both unset, i.e. no timeout (util/HttpRequestHandler.java:112-113).
 * - Error statuses read getErrorStream(), which is null for an empty error body (Capacitor then
 *   calls getInputStream(), which throws: util/HttpRequestHandler.java:241-254).
 * - The body is read as bytes: UTF-8 text (Capacitor's readLine() rewrites line endings,
 *   util/HttpRequestHandler.java:362-375) or base64 with NO_WRAP semantics (java.util.Base64;
 *   Capacitor's Base64.DEFAULT inserts line breaks, :352).
 * - A body is never sent with GET/HEAD: HttpURLConnection turns a GET with output into a POST.
 * - Android adds X-Android-* bookkeeping headers to responses; they are left out.
 * - No cookie handling: CookieHandler.getDefault() is null in an app (Capacitor installs one,
 *   CapacitorCookies.java:20-27). No cache (useCaches = false).
 * - http:// needs the app's cleartext permission (android:usesCleartextTraffic or a network
 *   security config); without it the request is refused up front with PERMISSION_DENIED.
 * Requests run on a cached thread pool, as Capacitor's (CapacitorHttp.java:28).
 * Arguments arrive decoded by the generated HttpPluginSpec (PL-10); src/common.ts has the same rules.
 */
class HttpPlugin(context: AkanNativePluginContext) : HttpPluginSpec {
    private val pool = Executors.newCachedThreadPool { Thread(it, "akan-native-http").apply { isDaemon = true } }
    private val timer = Executors.newSingleThreadScheduledExecutor { Thread(it, "akan-native-http-timeout").apply { isDaemon = true } }

    private class Failure(val code: String, message: String) : Exception(message)

    private class Plan(val url: String, val first: HttpUrl.Hop, val base64: Boolean, val timeout: Long)

    override fun request(args: HttpNativeRequest, reply: AkanNativeReply<HttpNativeResponse>) {
        val plan = try {
            plan(args)
        } catch (e: Failure) {
            return reply.reject(e.code, e.message ?: "invalid request")
        }
        // PL-11 scopes { url }, on the canonical URL; redirects are checked in follow().
        if (!reply.call.inScope(mapOf("url" to plan.url), urlFields = setOf("url"), what = "request to ${plan.url}")) return
        val scope = reply.call.scope
        val current = AtomicReference<HttpURLConnection?>()
        // The page gave up on the request (AbortSignal) or is gone: the connection is closed.
        reply.onCancel { pool.execute { current.get()?.disconnect() } }
        pool.execute {
            val timedOut = AtomicBoolean(false)
            val alarm = timer.schedule(Runnable {
                timedOut.set(true)
                current.get()?.disconnect()
            }, plan.timeout, TimeUnit.MILLISECONDS)
            try {
                reply.resolve(follow(plan, scope, current, timedOut))
            } catch (e: Failure) {
                reply.reject(e.code, e.message ?: "request failed")
            } catch (e: Exception) {
                if (timedOut.get() || e is SocketTimeoutException) {
                    reply.reject(AkanNativeErrorCode.INTERNAL, "request to ${plan.url} timed out after ${plan.timeout} ms")
                } else {
                    reply.reject(AkanNativeErrorCode.INTERNAL, "request to ${plan.url} failed: ${e.message ?: e.toString()}")
                }
            } finally {
                alarm.cancel(false)
                current.get()?.disconnect()
            }
        }
    }

    override fun destroy() {
        pool.shutdownNow()
        timer.shutdownNow()
    }

    private fun plan(args: HttpNativeRequest): Plan {
        val url = HttpUrl.canonical(args.url) ?: throw Failure(AkanNativeErrorCode.INVALID_ARGS, "${args.url} is not an http or https URL akan-native can request")
        val method = args.method?.json ?: "GET"
        val headers = ArrayList<Pair<String, String>>()
        val seen = HashSet<String>()
        for ((name, value) in (args.headers ?: emptyMap()).entries.sortedBy { it.key }) {
            if (name.isEmpty() || !name.all { it.code < 0x80 && (it.isLetterOrDigit() || it in TOKEN_EXTRA) }) {
                throw Failure(AkanNativeErrorCode.INVALID_ARGS, "header name \"$name\" is not valid")
            }
            val lower = name.lowercase()
            if (lower in RESERVED) throw Failure(AkanNativeErrorCode.INVALID_ARGS, "header $name is set by the HTTP stack")
            if (!seen.add(lower)) throw Failure(AkanNativeErrorCode.INVALID_ARGS, "header $name is given twice")
            if (value.any { it == '\r' || it == '\n' || it == '\u0000' }) throw Failure(AkanNativeErrorCode.INVALID_ARGS, "headers.$name must not contain CR, LF or NUL")
            headers.add(name to value.trim(' ', '\t'))
        }
        var body: ByteArray? = null
        args.body?.let { text ->
            if (method == "GET" || method == "HEAD") throw Failure(AkanNativeErrorCode.INVALID_ARGS, "a $method request cannot have a body")
            val base64 = args.bodyEncoding == HttpBodyEncoding.BASE64
            body = if (base64) decodeBase64(text) else text.toByteArray(Charsets.UTF_8)
            if ("content-type" !in seen) headers.add("Content-Type" to if (base64) "application/octet-stream" else "text/plain;charset=UTF-8")
        }
        val timeout = args.timeout ?: 60_000.0
        if (!(timeout > 0 && timeout <= Int.MAX_VALUE)) throw Failure(AkanNativeErrorCode.INVALID_ARGS, "timeout must be a number of milliseconds between 1 and 2147483647")
        return Plan(url, HttpUrl.Hop(method, headers, body), args.responseType == HttpNativeResponseType.BASE64, Math.ceil(timeout).toLong())
    }

    /** Standard alphabet, padding optional, no whitespace (src/common.ts base64ToBytes); java.util.Base64 is strict. */
    private fun decodeBase64(text: String): ByteArray {
        if (!BASE64.matches(text) || text.length % 4 == 1 || (text.contains('=') && text.length % 4 != 0)) {
            throw Failure(AkanNativeErrorCode.INVALID_ARGS, "body is not valid base64")
        }
        return Base64.getDecoder().decode(text)
    }

    private fun follow(plan: Plan, scope: AkanNativeScope?, current: AtomicReference<HttpURLConnection?>, timedOut: AtomicBoolean): HttpNativeResponse {
        val deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(plan.timeout)
        var url = plan.url
        var hop = plan.first
        var count = 0
        while (true) {
            val target = URI(url).toURL()
            if (target.protocol == "http" && !NetworkSecurityPolicy.getInstance().isCleartextTrafficPermitted(target.host)) {
                throw Failure(
                    AkanNativeErrorCode.PERMISSION_DENIED,
                    "cleartext HTTP to ${target.host} is blocked by Android's network security policy: use https, or allow cleartext for the app (android:usesCleartextTraffic)",
                )
            }
            val left = TimeUnit.NANOSECONDS.toMillis(deadline - System.nanoTime())
            if (left <= 0 || timedOut.get()) throw SocketTimeoutException()
            val connection = target.openConnection() as HttpURLConnection
            current.getAndSet(connection)?.disconnect()
            if (timedOut.get()) throw SocketTimeoutException()
            connection.instanceFollowRedirects = false
            connection.useCaches = false
            connection.connectTimeout = left.toInt()
            connection.readTimeout = left.toInt()
            connection.requestMethod = hop.method
            for ((name, value) in hop.headers) connection.setRequestProperty(name, value)
            val payload = hop.body ?: if (hop.method in BODY_METHODS) ByteArray(0) else null
            if (payload != null) {
                connection.doOutput = true
                connection.setFixedLengthStreamingMode(payload.size)
                connection.outputStream.use { it.write(payload) }
            }
            val status = connection.responseCode
            if (status < 0) throw Failure(AkanNativeErrorCode.INTERNAL, "$url did not answer with valid HTTP")
            val location = if (status in REDIRECTS) connection.getHeaderField("Location") else null
            if (location != null) {
                connection.disconnect()
                if (count == MAX_REDIRECTS) throw Failure(AkanNativeErrorCode.INTERNAL, "${plan.url} redirected more than $MAX_REDIRECTS times")
                count++
                val next = HttpUrl.redirectTarget(location, url) ?: throw Failure(AkanNativeErrorCode.INTERNAL, "cannot follow the redirect from $url to $location")
                if (scope != null && !scope.permits(mapOf("url" to next), urlFields = setOf("url"))) throw Failure(AkanNativeErrorCode.NOT_ALLOWED, "redirect to $next is outside the app's capabilities")
                hop = HttpUrl.redirected(status, hop, url, next)
                url = next
                continue
            }
            val bytes = if (hop.method == "HEAD" || status == 204 || status == 304) ByteArray(0) else read(connection, status)
            val headers = headers(connection)
            return HttpNativeResponse(
                status = status.toDouble(),
                headers = headers,
                data = if (plan.base64) Base64.getEncoder().encodeToString(bytes) else text(bytes),
                url = url,
            )
        }
    }

    private fun read(connection: HttpURLConnection, status: Int): ByteArray {
        val stream: InputStream? = if (status >= 400) {
            connection.errorStream
        } else {
            try {
                connection.inputStream
            } catch (e: IOException) {
                connection.errorStream ?: throw e
            }
        }
        if (stream == null) return ByteArray(0)
        return stream.use { input ->
            val out = ByteArrayOutputStream()
            val buffer = ByteArray(64 * 1024)
            while (true) {
                val n = input.read(buffer)
                if (n < 0) break
                out.write(buffer, 0, n)
            }
            out.toByteArray()
        }
    }

    /** Lowercase names, repeated headers joined with ", ", no X-Android-* bookkeeping; see src/common.ts responseHeaders. */
    private fun headers(connection: HttpURLConnection): Map<String, String> {
        val out = LinkedHashMap<String, String>()
        for ((key, values) in connection.headerFields) {
            val name = key?.lowercase() ?: continue // null: the status line
            if (name.startsWith("x-android-")) continue
            val value = values.joinToString(", ")
            out[name] = out[name]?.let { "$it, $value" } ?: value
        }
        val encoding = out["content-encoding"]
        if (encoding != null && !encoding.equals("identity", ignoreCase = true)) {
            out.remove("content-encoding")
            out.remove("content-length")
        }
        return out
    }

    /** UTF-8 with invalid bytes as U+FFFD and without a byte order mark, as fetch's text(). */
    private fun text(bytes: ByteArray): String = String(bytes, Charsets.UTF_8).removePrefix("﻿")

    private companion object {
        const val MAX_REDIRECTS = 20
        val REDIRECTS = setOf(301, 302, 303, 307, 308)
        val BODY_METHODS = setOf("POST", "PUT", "PATCH")
        val RESERVED = setOf("host", "content-length", "transfer-encoding", "connection", "keep-alive", "upgrade", "te", "trailer", "expect", "accept-encoding")
        const val TOKEN_EXTRA = "!#$%&'*+-.^_`|~"
        val BASE64 = Regex("^[A-Za-z0-9+/]*={0,2}$")
    }
}
