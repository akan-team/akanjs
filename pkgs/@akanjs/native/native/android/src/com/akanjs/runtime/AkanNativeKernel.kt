package com.akanjs.runtime

import java.nio.ByteBuffer
import java.nio.charset.CharacterCodingException
import java.nio.charset.CodingErrorAction
import java.security.MessageDigest
import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Base64
import java.util.Locale

/*
 * Decisions every akan-native host makes the same way (docs/architecture.md §5): a port of
 * packages/core/src/kernel.ts and protocol.ts validateRequest. Plain Kotlin (no Android API, no
 * org.json), so scripts/native-vectors.ts runs it on the JVM with the pinned kotlinc, and the
 * self-test runs the same vectors on the device (AkanNativeVectors.kt, debug builds): Android's ICU-backed
 * libraries differ from the JVM's. Tables come from AkanNativeContract.kt.
 */

sealed class AkanNativeRoute {
    object Init : AkanNativeRoute()
    object Ipc : AkanNativeRoute()
    object Hello : AkanNativeRoute()
    data class File(val id: String) : AkanNativeRoute()
    data class Asset(val path: String) : AkanNativeRoute()
    object NotFound : AkanNativeRoute()
}

/** kernel.ts UpdateDecision: what a verified web bundle manifest means to this binary (updates protocol v2). */
data class AkanNativeUpdateDecision(val kind: Kind, val baseline: Double = 0.0, val revoke: List<String> = emptyList()) {
    enum class Kind(val wire: String) { UNTRUSTED("untrusted"), REVOKED("revoked"), SELF_REVOKE("self-revoke"), REVOKE_LATER("revoke-later"), TAKE("take"), STALE("stale") }

    val wire: String get() = if (kind == Kind.TAKE || kind == Kind.STALE) "${kind.wire}:${baseline.toLong()}:${revoke.joinToString(",")}" else kind.wire
}

/** kernel.ts EnvelopeVerdict: whether a phone takes an envelope's manifest, or why not. */
enum class AkanNativeEnvelopeVerdict(val wire: String) {
    OPEN("open"), UNTRUSTED("untrusted"), REVOKED("revoked"), ENCODING("encoding"), TOO_LARGE("too-large"), SIGNATURE("signature")
}

/** An envelope's verdict, and its manifest bytes when it is [AkanNativeEnvelopeVerdict.OPEN]. */
class AkanNativeEnvelopeCheck(val verdict: AkanNativeEnvelopeVerdict, val manifest: ByteArray? = null)

/** kernel.ts UpdateReportEvent: what became of a release on a phone (updates.report.url). */
enum class AkanNativeUpdateEvent(val wire: String) {
    DOWNLOADED("downloaded"), APPLIED("applied"), CONFIRMED("confirmed"), ROLLED_BACK("rolledBack"), FAILED("failed");

    companion object {
        fun of(wire: Any?): AkanNativeUpdateEvent? = entries.firstOrNull { it.wire == wire }
    }
}

/** kernel.ts UpdateReportReason. */
enum class AkanNativeUpdateReason(val wire: String) {
    TIMEOUT("timeout"), RELAUNCH("relaunch"), HANG("hang"), VERIFY("verify"), DOWNLOAD("download"), DISK("disk"), SIGNATURE("signature"), MANIFEST("manifest");

    companion object {
        fun of(wire: Any?): AkanNativeUpdateReason? = entries.firstOrNull { it.wire == wire }
    }
}

/** kernel.ts UpdateReportOutcome: what the answer to a report request does to its batch. */
enum class AkanNativeReportOutcome(val wire: String) { SENT("sent"), DROPPED("dropped"), KEPT("kept") }

sealed class AkanNativeRangeAnswer {
    object Whole : AkanNativeRangeAnswer()
    /** First and last byte, inclusive. */
    data class Part(val first: Long, val last: Long) : AkanNativeRangeAnswer()
    object Unsatisfiable : AkanNativeRangeAnswer()
}

enum class AkanNativeAdmission(val wire: String) { CURRENT("current"), NEW("new"), ENDED("ended"), NO_DOC("no-doc") }

enum class AkanNativeNavigation(val wire: String) { LOAD("load"), OPEN("open"), DROP("drop") }

/**
 * kernel.ts RetainedEvents: events that can come before the page listens (links, taps; C2). A live
 * event goes to every listener; one that no listener accepted is kept when [retain] (at most
 * MAX_RETAINED_EVENTS) and replayed, in order, to the next listener, once. A listener returns false
 * when it is gone: it is dropped and the event counts as not delivered. Not thread-safe (main thread).
 */
class AkanNativeRetained<T> {
    private val listeners = LinkedHashMap<Any, (T) -> Boolean>()
    private val queue = ArrayDeque<T>()

    fun listen(key: Any, listener: (T) -> Boolean) {
        listeners[key] = listener
        while (queue.isNotEmpty()) {
            if (!listener(queue.first())) return unlisten(key)
            queue.removeFirst()
        }
    }

    /** Listeners registered (K13). */
    val listenerCount: Int get() = listeners.size

    fun unlisten(key: Any) {
        listeners.remove(key)
    }

    fun emit(event: T, retain: Boolean) {
        var delivered = false
        for ((key, listener) in listeners.entries.toList()) {
            if (listener(event)) delivered = true else listeners.remove(key)
        }
        if (!delivered && retain) {
            queue.addLast(event)
            if (queue.size > AkanNativeContract.MAX_RETAINED_EVENTS) queue.removeFirst()
        }
    }
}

object AkanNativeKernel {
    // ---------------------------------------------------------------- ids

    /** Whether [s] follows an id grammar: its characters and length, and an optional ".ext" after the first dot. */
    fun idValid(spec: AkanNativeIdSpec, s: String): Boolean {
        fun run(part: String, chars: String, min: Int, max: Int) = part.length in min..max && part.all { it in chars }
        if (spec.extMax > 0) {
            val dot = s.indexOf('.')
            return if (dot < 0) run(s, spec.chars, spec.min, spec.max)
            else run(s.substring(0, dot), spec.chars, spec.min, spec.max) && run(s.substring(dot + 1), spec.extChars, 1, spec.extMax)
        }
        if (s.length !in spec.min..spec.max) return false
        val first = s[0]
        return first in spec.first.ifEmpty { spec.chars } && first !in spec.notFirst && s.drop(1).all { it in spec.chars }
    }

    fun isFileRefId(s: String) = idValid(AkanNativeContract.ID_FILE_REF, s)
    fun isBundleId(s: String) = idValid(AkanNativeContract.ID_BUNDLE, s)
    fun isDocumentId(s: String) = idValid(AkanNativeContract.ID_DOCUMENT, s)
    fun isName(s: String) = idValid(AkanNativeContract.ID_NAME, s)

    // ---------------------------------------------------------------- paths and routes

    /**
     * Strict percent-decoding: "%" and two hex digits, and the result must be UTF-8; otherwise
     * null. ("%+1" is refused: toIntOrNull(16) would take the sign.)
     */
    fun decodePath(s: String): String? {
        val out = java.io.ByteArrayOutputStream(s.length)
        var i = 0
        while (i < s.length) {
            val c = s[i]
            if (c == '%') {
                if (i + 2 >= s.length) return null
                val hi = hex(s[i + 1]) ?: return null
                val lo = hex(s[i + 2]) ?: return null
                out.write(hi * 16 + lo)
                i += 3
            } else {
                val cp = s.codePointAt(i)
                out.write(String(Character.toChars(cp)).toByteArray(Charsets.UTF_8))
                i += Character.charCount(cp)
            }
        }
        return try {
            Charsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT)
                .decode(ByteBuffer.wrap(out.toByteArray())).toString()
        } catch (e: CharacterCodingException) {
            null
        }
    }

    private fun hex(c: Char): Int? = when (c) {
        in '0'..'9' -> c - '0'
        in 'a'..'f' -> c - 'a' + 10
        in 'A'..'F' -> c - 'A' + 10
        else -> null
    }

    /**
     * Maps a URL path (still percent-encoded) to a route (kernel.ts route): the host's own paths, an
     * existing file, index.html for an SPA route, or 404. [exists] tells whether a relative asset
     * path exists.
     */
    fun route(pathname: String, exists: (String) -> Boolean): AkanNativeRoute {
        val decoded = decodePath(pathname) ?: return AkanNativeRoute.NotFound
        val segments = decoded.split('/').filter { it.isNotEmpty() }
        if (segments.any { it == ".." || it == "." || it.contains('\\') || it.contains('\u0000') }) return AkanNativeRoute.NotFound
        if (segments.firstOrNull() == AkanNativeContract.ROUTE_ROOT) {
            return when {
                segments.size == 2 && segments[1] == AkanNativeContract.ROUTE_INIT -> AkanNativeRoute.Init
                segments.size == 2 && segments[1] == AkanNativeContract.ROUTE_IPC -> AkanNativeRoute.Ipc
                segments.size == 2 && segments[1] == AkanNativeContract.ROUTE_HELLO -> AkanNativeRoute.Hello
                segments.size == 3 && segments[1] == AkanNativeContract.ROUTE_FILE && isFileRefId(segments[2]) -> AkanNativeRoute.File(segments[2])
                else -> AkanNativeRoute.NotFound
            }
        }
        val relative = segments.joinToString("/")
        if (relative.isEmpty() || relative == "index.html") return AkanNativeRoute.Asset("index.html")
        // ":" never reaches the filesystem (kernel.ts); the path can still be an SPA route.
        if (!relative.contains(':') && exists(relative)) return AkanNativeRoute.Asset(relative)
        return if (segments.last().contains('.')) AkanNativeRoute.NotFound else AkanNativeRoute.Asset("index.html")
    }

    /** Paths the shell answers itself even with a dev server: /__akan_native/…, and paths that do not decode. */
    fun isHostPath(pathname: String): Boolean {
        val decoded = decodePath(pathname) ?: return true
        return decoded.split('/').firstOrNull { it.isNotEmpty() } == AkanNativeContract.ROUTE_ROOT
    }

    // ---------------------------------------------------------------- MIME

    /** The MIME type for a file name (FileRefs): application/octet-stream when unknown. */
    fun fileMime(path: String): String {
        val base = path.substringAfterLast('/')
        val dot = base.lastIndexOf('.')
        if (dot <= 0) return "application/octet-stream" // no extension, or a dot file such as .env
        return AkanNativeContract.MIME[base.substring(dot + 1).lowercase()] ?: "application/octet-stream"
    }

    /** The Content-Type an asset is served with: text types carry charset=utf-8. */
    fun assetMime(path: String): String {
        val mime = fileMime(path)
        return if (mime.startsWith("text/") || mime in AkanNativeContract.MIME_UTF8) "$mime; charset=utf-8" else mime
    }

    /**
     * kernel.ts fileRefSandboxed: every FileRef but images other than SVG, audio, video, fonts and
     * PDF is served with `Content-Security-Policy: sandbox` (an opaque origin: no bridge, no page).
     * macOS WebKit draws nothing for a sandboxed PDF.
     */
    fun fileRefSandboxed(mime: String): Boolean {
        val kind = mime.substringBefore(';').trim().lowercase()
        return kind == "image/svg+xml" || !(listOf("image/", "audio/", "video/", "font/").any { kind.startsWith(it) } || kind == "application/pdf")
    }

    // ---------------------------------------------------------------- Range

    /**
     * A Range header (IN-5, RFC 9110 §14) for a file of [size] bytes (kernel.ts parseRange): one
     * "bytes=" range; anything else is ignored (the whole file); a valid range the file cannot
     * satisfy is 416; at most MAX_RANGE_BYTES from the start.
     */
    fun parseRange(header: String?, size: Long): AkanNativeRangeAnswer {
        val spec = header?.takeIf { it.startsWith("bytes=") }?.substring(6) ?: return AkanNativeRangeAnswer.Whole
        val dash = spec.indexOf('-').takeIf { it >= 0 } ?: return AkanNativeRangeAnswer.Whole
        val a = spec.substring(0, dash)
        val b = spec.substring(dash + 1)
        val digits = { s: String -> s.length <= 18 && s.all { it in '0'..'9' } }
        if (!digits(a) || !digits(b) || (a.isEmpty() && b.isEmpty())) return AkanNativeRangeAnswer.Whole
        val start: Long
        val end: Long
        if (a.isEmpty()) {
            val suffix = b.toLong()
            if (suffix == 0L || size == 0L) return AkanNativeRangeAnswer.Unsatisfiable
            start = maxOf(0L, size - suffix)
            end = size - 1
        } else {
            start = a.toLong()
            val last = if (b.isEmpty()) Long.MAX_VALUE else b.toLong()
            if (last < start) return AkanNativeRangeAnswer.Whole
            if (start >= size) return AkanNativeRangeAnswer.Unsatisfiable
            end = minOf(last, size - 1)
        }
        return AkanNativeRangeAnswer.Part(start, minOf(end, start + AkanNativeContract.MAX_RANGE_BYTES - 1))
    }

    // ---------------------------------------------------------------- bridge requests (protocol.ts, the same messages)

    /** [value]: a parsed JSON value (Map, List, String, Number, Boolean, or null). */
    fun validateRequest(value: Any?): String? {
        val o = value as? Map<*, *> ?: return "request must be an object"
        if (number(o["v"]) != 1.0) return "unsupported protocol version: ${if (o.containsKey("v")) jsString(o["v"]) else "undefined"}"
        val id = number(o["id"])
        if (id == null || id != Math.floor(id) || Math.abs(id) > 9_007_199_254_740_991.0) return "id must be an integer"
        val plugin = o["plugin"]
        if (plugin !is String || !isName(plugin)) return "invalid plugin name"
        val method = o["method"]
        if (method !is String || !isName(method)) return "invalid method name"
        if (o.containsKey("doc")) {
            val doc = o["doc"]
            if (doc !is String || !isDocumentId(doc)) return "invalid document id"
        }
        if ((method == "\$listen" || method == "\$unlisten") && (o["args"] as? Map<*, *>)?.get("event") !is String) return "$method requires args.event"
        if (plugin == "\$bridge") {
            val args = o["args"] as? Map<*, *> ?: emptyMap<String, Any?>()
            when (method) {
                "cancel" -> {
                    val target = number(args["id"])
                    if (target == null || target != Math.floor(target) || Math.abs(target) > 9_007_199_254_740_991.0) return "\$bridge.cancel requires args.id"
                    if (args.containsKey("reason") && args["reason"] != "abort" && args["reason"] != "timeout") return "\$bridge.cancel: reason must be abort or timeout"
                }
                "release" -> if (args["url"] !is String) return "\$bridge.release requires args.url"
                else -> return "unknown bridge operation \$bridge.$method"
            }
        }
        return null
    }

    private fun number(value: Any?): Double? = (value as? Number)?.toDouble()?.takeIf { it.isFinite() }

    /** What JavaScript's String(value) gives for a JSON value (the version message names it). */
    private fun jsString(value: Any?): String = when (value) {
        null -> "null"
        is String -> value
        is Boolean -> value.toString()
        is Number -> value.toDouble().let { d -> if (d == Math.floor(d) && Math.abs(d) < 1e21) d.toLong().toString() else d.toString() }
        is List<*> -> value.joinToString(",") { if (it == null) "" else jsString(it) }
        else -> "[object Object]"
    }

    // ---------------------------------------------------------------- documents (bridge v1.1)

    /**
     * kernel.ts admitDocument: join the current document, start a new one, refuse an ended one, or
     * refuse a request without an id while the current document has one.
     */
    fun admitDocument(current: String?, ended: Collection<String>, requested: String?): AkanNativeAdmission = when {
        requested == null -> if (current == null) AkanNativeAdmission.NEW else if (current == "") AkanNativeAdmission.CURRENT else AkanNativeAdmission.NO_DOC
        requested == current -> AkanNativeAdmission.CURRENT
        requested in ended -> AkanNativeAdmission.ENDED
        else -> AkanNativeAdmission.NEW
    }

    // ---------------------------------------------------------------- declarations (L2)

    /**
     * kernel.ts declares: whether a plugin's boot.json declaration (its native methods and events on
     * this platform) lets a call through; undeclared ones are NOT_FOUND before the ACL and the plugin.
     */
    fun declares(decl: Any?, method: String, event: String?): Boolean {
        val d = decl as? Map<*, *> ?: return false
        val subscription = method == "\$listen" || method == "\$unlisten"
        val name = (if (subscription) event else method) ?: return false
        val list = d[if (subscription) "events" else "methods"] ?: emptyList<Any?>()
        return list is List<*> && name in list
    }

    // ---------------------------------------------------------------- navigation (SH-4, L0)

    /** The lowercase scheme of a URL, or null when it has none. */
    fun schemeOf(url: String): String? {
        val colon = url.indexOf(':').takeIf { it > 0 } ?: return null
        val s = url.substring(0, colon)
        val ascii = { c: Char -> c in 'a'..'z' || c in 'A'..'Z' }
        if (!ascii(s[0]) || !s.all { ascii(it) || it in '0'..'9' || it in "+.-" }) return null
        return s.lowercase()
    }

    /** The schemes the shell hands to the OS: the contract's, and what the app added (never the forbidden ones). */
    fun externalSchemes(extra: Collection<String>): List<String> =
        AkanNativeContract.EXTERNAL_SCHEMES + extra.map { it.lowercase() }.filter { it !in AkanNativeContract.NEVER_EXTERNAL_SCHEMES && it !in AkanNativeContract.EXTERNAL_SCHEMES }

    /**
     * kernel.ts decideNavigation: the app's own pages (and about:) load; a top-level navigation opens
     * in the OS when its scheme is external and is dropped otherwise; a frame loads web content only.
     */
    fun decideNavigation(url: String, topLevel: Boolean, origin: String, extra: Collection<String>): AkanNativeNavigation {
        val scheme = schemeOf(url)
        val inApp = url == origin || (url.startsWith(origin) && url[origin.length] in "/?#")
        if (inApp) {
            // The app's /__akan_native/… paths never become a document of its origin; a frame may show a
            // FileRef, which is served sandboxed (kernel.ts).
            val path = url.substring(origin.length).split('?', '#').first().ifEmpty { "/" }
            if (!isHostPath(path)) return AkanNativeNavigation.LOAD
            return if (!topLevel && route(path) { false } is AkanNativeRoute.File) AkanNativeNavigation.LOAD else AkanNativeNavigation.DROP
        }
        if (scheme == "about") return AkanNativeNavigation.LOAD
        if (scheme == null) return AkanNativeNavigation.DROP
        if (!topLevel) return if (scheme in AkanNativeContract.FRAME_SCHEMES) AkanNativeNavigation.LOAD else AkanNativeNavigation.DROP
        return if (scheme in externalSchemes(extra)) AkanNativeNavigation.OPEN else AkanNativeNavigation.DROP
    }

    /**
     * kernel.ts updateDecision: a key revokes only keys listed before it (a leaked online key, listed first, cannot
     * revoke the spares that recover from it), and resetSequence counts only when it newly revokes a key.
     */
    fun updateDecision(
        ring: List<String>, revoked: List<String>, signer: String, revokeKeys: List<String>, resetSequence: Boolean,
        sequence: Double, embedded: Double, running: Pair<Double, String>?,
    ): AkanNativeUpdateDecision {
        val index = ring.indexOf(signer)
        if (index < 0) return AkanNativeUpdateDecision(AkanNativeUpdateDecision.Kind.UNTRUSTED)
        if (signer in revoked) return AkanNativeUpdateDecision(AkanNativeUpdateDecision.Kind.REVOKED)
        if (signer in revokeKeys) return AkanNativeUpdateDecision(AkanNativeUpdateDecision.Kind.SELF_REVOKE)
        if (revokeKeys.any { ring.indexOf(it) > index }) return AkanNativeUpdateDecision(AkanNativeUpdateDecision.Kind.REVOKE_LATER)
        val revoke = ring.filter { it in revokeKeys && it !in revoked }
        val bar = running?.takeIf { it.second !in revoked && it.second !in revoke }?.first ?: 0.0
        val baseline = if (resetSequence && revoke.isNotEmpty()) embedded else maxOf(embedded, bar)
        val kind = if (sequence > baseline) AkanNativeUpdateDecision.Kind.TAKE else AkanNativeUpdateDecision.Kind.STALE
        return AkanNativeUpdateDecision(kind, baseline, revoke)
    }

    /** kernel.ts updateManifestUrl: one envelope per channel and native API. */
    fun updateManifestUrl(url: String, platform: String, channel: String, nativeApi: String): String = "$url/$platform/$channel/$nativeApi.json"

    /** The first 8 bytes of the raw public key's SHA-256, in hex: what an envelope names its signer by. */
    fun updateKeyId(publicKey: ByteArray): String =
        MessageDigest.getInstance("SHA-256").digest(publicKey).take(8).joinToString("") { "%02x".format(it) }

    fun isUpdateKeyId(s: String): Boolean = s.length == 16 && s.all { it in '0'..'9' || it in 'a'..'f' }

    /** kernel.ts MAX_REVOKE_KEYS: the most keys a manifest may revoke. */
    const val MAX_REVOKE_KEYS = 16

    /** kernel.ts MAX_UPDATE_MANIFEST: the largest manifest an envelope may carry, in bytes. */
    const val MAX_UPDATE_MANIFEST = 1 shl 20

    /**
     * kernel.ts isStrictBase64: the standard alphabet, padded, no whitespace. android.util.Base64 also takes line
     * breaks and java.util.Base64 a missing padding, which iOS refuses.
     */
    fun isStrictBase64(s: String): Boolean {
        if (s.length % 4 != 0) return false
        val pad = if (s.endsWith("==")) 2 else if (s.endsWith("=")) 1 else 0
        for (i in 0 until s.length - pad) {
            val c = s[i]
            if (c !in 'A'..'Z' && c !in 'a'..'z' && c !in '0'..'9' && c != '+' && c != '/') return false
        }
        return true
    }

    /** The bytes of strict base64, null for anything else. */
    fun strictBase64(s: String): ByteArray? = if (isStrictBase64(s)) Base64.getDecoder().decode(s) else null

    /**
     * kernel.ts checkUpdateEnvelope: in this order, a signer of [ring] not [revoked], both fields in strict base64, a
     * manifest of at most MAX_UPDATE_MANIFEST bytes, and [verify] (Ed25519 by the signer's key) over the decoded bytes.
     */
    fun checkUpdateEnvelope(
        manifest: String, keyId: String, signature: String, ring: List<String>, revoked: List<String>,
        verify: (manifest: ByteArray, signature: ByteArray, keyId: String) -> Boolean,
    ): AkanNativeEnvelopeCheck {
        if (keyId !in ring) return AkanNativeEnvelopeCheck(AkanNativeEnvelopeVerdict.UNTRUSTED)
        if (keyId in revoked) return AkanNativeEnvelopeCheck(AkanNativeEnvelopeVerdict.REVOKED)
        if (!isStrictBase64(manifest) || !isStrictBase64(signature)) return AkanNativeEnvelopeCheck(AkanNativeEnvelopeVerdict.ENCODING)
        val pad = if (manifest.endsWith("==")) 2 else if (manifest.endsWith("=")) 1 else 0
        if (manifest.length / 4 * 3 - pad > MAX_UPDATE_MANIFEST) return AkanNativeEnvelopeCheck(AkanNativeEnvelopeVerdict.TOO_LARGE)
        val bytes = Base64.getDecoder().decode(manifest)
        return if (verify(bytes, Base64.getDecoder().decode(signature), keyId)) AkanNativeEnvelopeCheck(AkanNativeEnvelopeVerdict.OPEN, bytes)
        else AkanNativeEnvelopeCheck(AkanNativeEnvelopeVerdict.SIGNATURE)
    }

    /** kernel.ts UPDATE_REPORT_LIMIT and UPDATE_REPORT_BATCH: the events kept waiting, and those one request carries. */
    const val UPDATE_REPORT_LIMIT = 100
    const val UPDATE_REPORT_BATCH = 20

    /** kernel.ts updateReportKey: an event is kept once per release and reason. */
    fun updateReportKey(event: AkanNativeUpdateEvent, bundle: String, reason: AkanNativeUpdateReason?): String = "${event.wire}|$bundle|${reason?.wire ?: ""}"

    /** kernel.ts updateReportOutcome: a 2xx sends the batch, a 400, 413 or 422 drops it, anything else keeps it. */
    fun updateReportOutcome(status: Int): AkanNativeReportOutcome = when (status) {
        in 200..299 -> AkanNativeReportOutcome.SENT
        400, 413, 422 -> AkanNativeReportOutcome.DROPPED
        else -> AkanNativeReportOutcome.KEPT
    }

    /** kernel.ts updateReportRetryAt: [now] plus a Retry-After of delay-seconds (digits only), else null. */
    fun updateReportRetryAt(retryAfter: String?, now: Double): Double? {
        val value = retryAfter?.trim(' ', '\t') ?: return null
        if (value.isEmpty() || !value.all { it in '0'..'9' }) return null
        return value.toDouble().takeIf { it.isFinite() }?.let { now + it }
    }

    /** kernel.ts updateReportWaits: a wait of more than a day is a clock that moved, so it ends. */
    fun updateReportWaits(retryAt: Double?, now: Double): Boolean = retryAt != null && retryAt > now && retryAt < now + 86_400

    private val reportTime = DateTimeFormatter.ofPattern("uuuu-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.ROOT).withZone(ZoneOffset.UTC)

    /** kernel.ts updateReportTime: UTC, always three fraction digits (Instant.toString() leaves out a fraction of zero). */
    fun updateReportTime(ms: Long): String = reportTime.format(Instant.ofEpochMilli(ms))
}
