package com.akanjs.runtime

import android.content.res.AssetManager
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import java.io.ByteArrayInputStream
import java.io.FileInputStream
import java.io.FilterInputStream
import java.io.IOException
import java.io.InputStream

/**
 * Serves https://app.localhost/ from APK assets/app/ (docs/architecture.md §5).
 * The route decision is a port of packages/cli/src/lib/routes.ts. Called on Chromium
 * background threads, possibly concurrently.
 *
 * akan-native dev --hmr (debuggable builds with shell.json `devServer`): every path outside /__akan_native/ is
 * fetched from the dev gateway (packages/cli/src/lib/hmr.ts; the CLI runs `adb reverse`, and the
 * dev network security config allows cleartext to 127.0.0.1) and answered on https://app.localhost,
 * so the bridge, storage and CSP see the usual origin. Without the gateway the bundled files are served.
 * A request with a body never arrives here (WebResourceRequest has none): the dev page sends those to
 * the gateway itself (devShim relayBodies).
 */
class AkanNativeAssetServer(
    private val assets: AssetManager,
    private val bridge: AkanNativeBridge,
    private val initScript: () -> String,
) {
    /** A downloaded web bundle to serve instead of the APK's assets/app (UP-2, AkanNativeUpdates). */
    @Volatile
    var root: java.io.File? = null

    /** akan-native dev --hmr: e.g. "http://127.0.0.1:52011", where pages come from (null: the bundled files). */
    @Volatile
    var devServer: String? = null

    @Volatile
    private var devWarned = false

    companion object {
        const val HOST = "app.localhost"
        const val ORIGIN = "https://$HOST"
        private val NONCE = Regex("[0-9a-f]{16,64}")
        private const val ROOT = "app"

        // WebResourceResponse rejects an empty reason phrase and 3xx codes (verified).
        private val REASON = mapOf(
            200 to "OK", 204 to "No Content", 206 to "Partial Content", 400 to "Bad Request",
            403 to "Forbidden", 404 to "Not Found", 405 to "Method Not Allowed",
            416 to "Range Not Satisfiable", 500 to "Internal Server Error", 502 to "Bad Gateway",
        )

        private val DEV_SERVER = Regex("http://(127\\.0\\.0\\.1|localhost):[0-9]{1,5}")
        /**
         * Request headers not passed to the gateway: hop-by-hop, its own host, validators (it never answers 304,
         * which WebResourceResponse rejects) and Accept-Encoding (HttpURLConnection only unpacks what it asked
         * for). Everything else goes, Authorization included, so the page's API calls work through it.
         */
        private val DEV_SKIP = setOf("host", "connection", "keep-alive", "content-length", "accept-encoding", "if-none-match", "if-modified-since")
        /** Framing headers of the gateway's reply; the stream is handed over as it is. */
        private val DEV_DROP = setOf("connection", "keep-alive", "transfer-encoding", "content-length", "content-encoding", "content-type")

        /** shell.json `devServer`: plain http to the loopback interface only. */
        fun devServerOrNull(text: String?): String? = text?.trimEnd('/')?.takeIf { DEV_SERVER.matches(it) }

        /** The charset a response of this type carries (text types: UTF-8, AkanNativeKernel.assetMime). */
        fun encodingOf(mime: String): String? = if (mime.startsWith("text/") || mime in AkanNativeContract.MIME_UTF8) "utf-8" else null
    }

    private fun exists(relative: String): Boolean {
        root?.let { return java.io.File(it, relative).isFile }
        return try {
            assets.open("$ROOT/$relative", AssetManager.ACCESS_STREAMING).close()
            true
        } catch (e: IOException) {
            false
        }
    }

    fun intercept(request: WebResourceRequest): WebResourceResponse? {
        val url = request.url
        if (url.scheme != "https" || url.host != HOST) return null // real network
        if (request.method != "GET" && request.method != "HEAD") return error(405)
        val dev = devServer
        // The app's /__akan_native/* paths are never its top-level document (a FileRef holding HTML would run
        // with the bridge, N1). shouldOverrideUrlLoading does not see every navigation (loadUrl,
        // history), so the server refuses them too. Frames and fetches have isForMainFrame false.
        if (request.isForMainFrame && AkanNativeKernel.isHostPath(url.encodedPath ?: "/")) return error(403)
        if (dev != null && !AkanNativeKernel.isHostPath(url.encodedPath ?: "/")) proxy(dev, request)?.let { return it }
        // Routes, MIME types and ranges are the kernel's (AkanNativeKernel.kt, checked with the shared vectors).
        return when (val r = AkanNativeKernel.route(url.encodedPath ?: "/", ::exists)) {
            AkanNativeRoute.Init -> text(200, "text/javascript", initScript())
            AkanNativeRoute.Hello -> {
                // Doorbell: the port goes only to the app-origin main frame (postWebMessage targetOrigin).
                // Only our own documents may ring: a ring replaces the page's port, so a foreign
                // iframe ringing would otherwise cut the page off.
                val referer = request.requestHeaders.entries.firstOrNull { it.key.equals("Referer", ignoreCase = true) }?.value ?: ""
                if (!referer.startsWith("$ORIGIN/")) return error(403)
                // The page's per-document nonce: the shell posts the port with it (SEC-4, AkanNativeBridge.offerPort).
                val nonce = request.url.getQueryParameter("n") ?: ""
                if (!NONCE.matches(nonce)) return error(400)
                bridge.offerPort(nonce)
                WebResourceResponse("text/plain", "utf-8", 204, REASON.getValue(204), headers(), ByteArrayInputStream(ByteArray(0)))
            }
            is AkanNativeRoute.File -> {
                val (file, mime) = bridge.file(r.id) ?: return error(404)
                try {
                    serve(FileInputStream(file), mime, request, file.length(), fileRef = true)
                } catch (e: IOException) {
                    error(404)
                }
            }
            is AkanNativeRoute.Asset -> {
                val bundle = root
                if (bundle != null) {
                    val file = java.io.File(bundle, r.path)
                    return try {
                        serve(FileInputStream(file), AkanNativeKernel.fileMime(r.path), request, file.length())
                    } catch (e: IOException) {
                        error(404)
                    }
                }
                val stream = try {
                    assets.open("$ROOT/${r.path}", AssetManager.ACCESS_STREAMING)
                } catch (e: IOException) {
                    return error(404)
                }
                serve(stream, AkanNativeKernel.fileMime(r.path), request)
            }
            AkanNativeRoute.Ipc, AkanNativeRoute.NotFound -> error(404)
        }
    }

    /**
     * 200, or 206 for one "bytes=" range (IN-5, AkanNativeKernel.parseRange: at most MAX_RANGE_BYTES; a
     * header that is not one supported range is ignored). Do not skip to the range start: WebView
     * skips the stream itself when the request has a Range header (verified). Only cap it at last+1.
     */
    private fun serve(stream: InputStream, mime: String, request: WebResourceRequest, knownLength: Long = -1, fileRef: Boolean = false): WebResourceResponse {
        val encoding = encodingOf(mime)
        val range = request.requestHeaders.entries.firstOrNull { it.key.equals("Range", ignoreCase = true) }?.value
        // A FileRef (a file a plugin registered) is never the app's document: no MIME sniffing, not for
        // other origins, and anything but plain media opens sandboxed (AkanNativeKernel.fileRefSandboxed; N1).
        val refHeaders: Map<String, String> = if (!fileRef) emptyMap() else buildMap {
            put("X-Content-Type-Options", "nosniff")
            put("Cross-Origin-Resource-Policy", "same-origin")
            if (AkanNativeKernel.fileRefSandboxed(mime)) put("Content-Security-Policy", "sandbox")
        }
        val whole = { WebResourceResponse(mime, encoding, 200, "OK", (headers() + refHeaders) + ("Accept-Ranges" to "bytes"), stream) }
        if (range == null) return whole()
        val total = if (knownLength >= 0) knownLength else stream.available().toLong()
        return when (val answer = AkanNativeKernel.parseRange(range, total)) {
            AkanNativeRangeAnswer.Whole -> whole()
            AkanNativeRangeAnswer.Unsatisfiable -> {
                stream.close()
                WebResourceResponse(mime, encoding, 416, REASON.getValue(416), (headers() + refHeaders) + ("Content-Range" to "bytes */$total"), ByteArrayInputStream(ByteArray(0)))
            }
            is AkanNativeRangeAnswer.Part -> {
                val extra = mapOf(
                    "Accept-Ranges" to "bytes",
                    "Content-Range" to "bytes ${answer.first}-${answer.last}/$total",
                    "Content-Length" to (answer.last - answer.first + 1).toString(),
                )
                WebResourceResponse(mime, encoding, 206, REASON.getValue(206), (headers() + refHeaders) + extra, Limited(stream, answer.last + 1))
            }
        }
    }

    /** Caps a stream; skip() counts against the cap because WebView skips through it. */
    private class Limited(source: InputStream, private var left: Long) : FilterInputStream(source) {
        override fun read(): Int = if (left <= 0) -1 else super.read().also { if (it >= 0) left-- }

        override fun read(b: ByteArray, off: Int, len: Int): Int {
            if (left <= 0) return -1
            val n = super.read(b, off, minOf(len.toLong(), left).toInt())
            if (n > 0) left -= n
            return n
        }

        override fun available(): Int = minOf(super.available().toLong(), left).toInt()

        override fun skip(n: Long): Long = super.skip(minOf(n, left)).also { if (it > 0) left -= it }
    }

    /** The gateway's answer, or null when it cannot be reached (then the bundled files are served). */
    private fun proxy(base: String, request: WebResourceRequest): WebResourceResponse? {
        val url = request.url
        val target = java.net.URL(base + (url.encodedPath ?: "/") + (url.encodedQuery?.let { "?$it" } ?: ""))
        val connection = target.openConnection() as java.net.HttpURLConnection
        return try {
            connection.requestMethod = request.method
            connection.connectTimeout = 2000
            connection.readTimeout = 60_000 // Bun bundles on the first request
            connection.useCaches = false
            connection.instanceFollowRedirects = true
            for ((name, value) in request.requestHeaders) if (name.lowercase() !in DEV_SKIP) connection.setRequestProperty(name, value)
            val status = connection.responseCode // connects; IOException when nothing listens
            val type = connection.contentType ?: AkanNativeKernel.assetMime(url.path ?: "")
            val charset = Regex("charset=\"?([^;\"]+)", RegexOption.IGNORE_CASE).find(type)?.groupValues?.get(1)?.trim()
            val headers = HashMap<String, String>()
            for ((name, values) in connection.headerFields) {
                if (name != null && name.lowercase() !in DEV_DROP) headers[name] = values.joinToString(", ")
            }
            val body = (if (status >= 400) connection.errorStream else connection.inputStream) ?: ByteArrayInputStream(ByteArray(0))
            // WebResourceResponse refuses 3xx codes and an empty reason phrase.
            val code = if (status in 300..399) 502 else status
            val reason = connection.responseMessage?.takeIf { it.isNotBlank() && code == status } ?: REASON[code] ?: "OK"
            WebResourceResponse(type.substringBefore(';').trim(), charset, code, reason, headers, body)
        } catch (e: IOException) {
            connection.disconnect()
            if (!devWarned) {
                devWarned = true
                android.util.Log.w(TAG, "dev server $base: ${e.message}; serving the bundled files")
            }
            null
        }
    }

    private fun headers(): Map<String, String> = mapOf("Cache-Control" to "no-cache")

    private fun text(status: Int, mime: String, body: String) =
        WebResourceResponse(mime, "utf-8", status, REASON[status] ?: "OK", headers(), ByteArrayInputStream(body.toByteArray(Charsets.UTF_8)))

    private fun error(status: Int) = text(status, "text/plain", "$status ${REASON[status]}")
}
