package com.akanjs.plugins.updates

import android.os.Handler
import android.os.Looper
import com.akanjs.runtime.AkanNativeErrorCode
import com.akanjs.runtime.AkanNativePluginContext
import com.akanjs.runtime.AkanNativeReply
import com.akanjs.runtime.AkanNativeUpdateConfig
import com.akanjs.runtime.AkanNativeUpdateEntry
import com.akanjs.runtime.AkanNativeUpdates
import com.akanjs.runtime.AkanNativeVoidReply
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.Base64
import org.json.JSONObject

/**
 * Web bundle updates (UP-2), the Android twin of ios/UpdatesPlugin.swift: the manifest
 * `<url>/android/<channel>.json` is signed as a whole (`.sig`: base64 Ed25519 over its bytes, the
 * platform's on API 33+, AkanNativeEd25519 in plain Kotlin below), files are content-addressed (`<url>/android/files/<sha256>`)
 * and checked against their hash, and files the running bundle already has are copied. Which bundle
 * runs, and the trial / rollback rules, live in the shell (native/android/.../AkanNativeUpdates.kt).
 * Network and file work run on a worker thread; AkanNativeUpdates is only touched on the main thread.
 */
class UpdatesPlugin(private val context: AkanNativePluginContext) : UpdatesPluginSpec {
    private val main = Handler(Looper.getMainLooper())
    private var downloading = false
    /** The running download's call (one at a time); its cancellation stops the read loop. */
    @Volatile private var download: com.akanjs.runtime.AkanNativeCall? = null

    private class Failure(val code: String, message: String) : Exception(message)

    private class ReleaseFile(val path: String, val sha256: String, val size: Long)

    private class Release(val bundle: String, val sequence: Double, val version: String, val nativeApi: String, val files: List<ReleaseFile>, val manifest: ByteArray, val signature: String)

    /** What the worker needs from the main thread, read once per call. */
    private class Snapshot(val config: AkanNativeUpdateConfig, val running: Double, val failed: List<String>, val pending: String?, val activeRoot: File?)

    private fun snapshot(config: AkanNativeUpdateConfig): Snapshot {
        val state = AkanNativeUpdates.readState()
        val active = AkanNativeUpdates.active
        return Snapshot(config, active?.sequence ?: config.embeddedSequence, state.failed.toList(), state.pending?.bundle, active?.let { AkanNativeUpdates.bundleDirectory(it.bundle) })
    }

    private fun <T> configured(reply: AkanNativeReply<T>): AkanNativeUpdateConfig? {
        AkanNativeUpdates.config?.let { return it }
        reply.reject(AkanNativeErrorCode.UNSUPPORTED, "updates are not configured (akan-native.config.ts `updates`)")
        return null
    }

    override fun getState(reply: AkanNativeReply<UpdatesUpdateState>) {
        val config = configured(reply) ?: return
        val state = AkanNativeUpdates.readState()
        reply.resolve(
            UpdatesUpdateState(
                bundle = AkanNativeUpdates.active?.bundle,
                sequence = AkanNativeUpdates.active?.sequence ?: 0.0,
                pending = state.pending?.bundle,
                trial = AkanNativeUpdates.onTrial,
                rolledBack = state.rolledBack,
                channel = config.channel,
                nativeApi = config.nativeApi,
            ),
        )
    }

    override fun check(reply: AkanNativeReply<UpdatesUpdateCheck>) {
        val config = configured(reply) ?: return
        val snap = snapshot(config)
        worker(reply) {
            val release = fetchRelease(config)
            val available = isNewer(release, snap)
            val size = if (available) release.files.filter { localCopy(it, snap) == null }.sumOf { it.size }.toDouble() else null
            reply.resolve(UpdatesUpdateCheck(available = available, bundle = release.bundle, version = release.version, sequence = release.sequence, downloadSize = size))
        }
    }

    override fun download(reply: AkanNativeReply<UpdatesDownloadResult>) {
        val config = configured(reply) ?: return
        if (downloading) return reply.reject(AkanNativeErrorCode.CANCELLED, "a download is already running")
        downloading = true
        // The download stops when its call does (the page gave up on it, or the page is gone): the
        // read loop checks the call between chunks.
        download = reply.call
        val snap = snapshot(config)
        worker(reply, done = { downloading = false; download = null }) {
            val release = fetchRelease(config)
            if (!isNewer(release, snap)) throw Failure(AkanNativeErrorCode.NOT_FOUND, "no newer release for this app (native API ${config.nativeApi})")
            if (snap.pending != release.bundle) {
                install(release, config, snap)
                main.post { AkanNativeUpdates.stage(AkanNativeUpdateEntry(release.bundle, release.sequence, release.nativeApi)) }
            }
            reply.resolve(UpdatesDownloadResult(bundle = release.bundle))
        }
    }

    override fun apply(reply: AkanNativeVoidReply) {
        configured(reply) ?: return
        val root = AkanNativeUpdates.applyPending() ?: return reply.reject(AkanNativeErrorCode.NOT_FOUND, "no downloaded update to apply")
        reply.resolve()
        main.post { context.serveBundle(root) } // answer first: the reload ends this page
    }

    override fun notifyReady(reply: AkanNativeVoidReply) {
        configured(reply) ?: return
        AkanNativeUpdates.confirm()
        reply.resolve()
    }

    override fun reset(reply: AkanNativeVoidReply) {
        configured(reply) ?: return
        AkanNativeUpdates.reset()
        reply.resolve()
    }

    // ---------------------------------------------------------------- releases

    private fun <T> worker(reply: AkanNativeReply<T>, done: () -> Unit = {}, work: () -> Unit) {
        Thread {
            try {
                work()
            } catch (f: Failure) {
                reply.reject(f.code, f.message ?: "update failed")
            } catch (e: Throwable) { // OutOfMemoryError too: never leave the call unanswered
                reply.reject(AkanNativeErrorCode.INTERNAL, "update failed: ${e.message ?: e}")
            } finally {
                main.post(done)
            }
        }.start()
    }

    /** Newer than what runs (and than the APK's own bundle), for this binary, not rolled back before. */
    private fun isNewer(release: Release, snap: Snapshot): Boolean =
        release.nativeApi == snap.config.nativeApi && release.sequence > maxOf(snap.running, snap.config.embeddedSequence) && release.bundle !in snap.failed

    private fun base(config: AkanNativeUpdateConfig) = "${config.url}/${config.platform}"

    /**
     * The body of [url], at most [limit] bytes, into [sink]: the manifest and its signature are read
     * before they are verified, so a bad server could otherwise send anything; a file has its
     * signed size.
     */
    private fun fetch(url: String, limit: Long, sink: (ByteArray, Int) -> Unit) {
        val connection = URL(url).openConnection() as HttpURLConnection
        try {
            connection.connectTimeout = 30_000
            connection.readTimeout = 30_000
            connection.useCaches = false
            connection.setRequestProperty("Cache-Control", "no-cache")
            val status = connection.responseCode
            if (status == 404) throw Failure(AkanNativeErrorCode.NOT_FOUND, "$url not found")
            if (status != 200) throw Failure(AkanNativeErrorCode.INTERNAL, "$url: HTTP $status")
            val tooBig = Failure(AkanNativeErrorCode.INTERNAL, "$url is larger than $limit bytes")
            if (connection.contentLengthLong > limit) throw tooBig
            connection.inputStream.use { input ->
                val buffer = ByteArray(64 * 1024)
                var total = 0L
                while (true) {
                    if (download?.isCancelled == true) throw Failure(AkanNativeErrorCode.CANCELLED, "the download was cancelled")
                    val n = input.read(buffer)
                    if (n < 0) break
                    total += n
                    if (total > limit) throw tooBig
                    sink(buffer, n)
                }
            }
        } finally {
            connection.disconnect()
        }
    }

    private fun fetch(url: String, limit: Long): ByteArray {
        val out = java.io.ByteArrayOutputStream()
        fetch(url, limit) { buffer, n -> out.write(buffer, 0, n) }
        return out.toByteArray()
    }

    private fun fetchRelease(config: AkanNativeUpdateConfig): Release {
        val manifestUrl = "${base(config)}/${config.channel}.json"
        val manifest = fetch(manifestUrl, 1L shl 20)
        val signatureText = String(fetch("$manifestUrl.sig", 1024)).trim()
        val signature = try {
            Base64.getDecoder().decode(signatureText)
        } catch (e: IllegalArgumentException) {
            throw Failure(AkanNativeErrorCode.INTERNAL, "the release signature is not base64")
        }
        if (!AkanNativeUpdates.signed(manifest, signature, config.publicKey)) throw Failure(AkanNativeErrorCode.INTERNAL, "the release signature does not match updates.publicKey")
        return parse(manifest, signatureText, config)
    }

    /** Checks every field of the (signed) manifest before any of it is used. */
    private fun parse(data: ByteArray, signature: String, config: AkanNativeUpdateConfig): Release {
        fun bad(why: String) = Failure(AkanNativeErrorCode.INTERNAL, "invalid release manifest: $why")
        val o = try {
            JSONObject(String(data))
        } catch (e: Exception) {
            throw bad("not a JSON object")
        }
        if (o.optInt("schema") != 1 || o.optString("kind") != "web") throw bad("schema 1, kind web expected")
        if (o.optString("app") != config.app || o.optString("platform") != config.platform || o.optString("channel") != config.channel) {
            throw bad("made for another app, platform or channel")
        }
        val bundle = o.optString("bundle")
        if (!AkanNativeUpdates.isBundleId(bundle)) throw bad("bundle id")
        val sequence = o.optDouble("sequence", -1.0)
        if (!sequence.isFinite() || sequence <= 0) throw bad("sequence")
        val list = o.optJSONArray("files") ?: throw bad("files")
        if (list.length() !in 1..5000 || o.optString("nativeApi").isEmpty()) throw bad("nativeApi or files")
        val files = (0 until list.length()).map { i ->
            val f = list.optJSONObject(i) ?: throw bad("file entry")
            val path = f.optString("path")
            val sha = f.optString("sha256").lowercase()
            val size = f.optLong("size", -1)
            if (!isSafePath(path) || !Regex("[0-9a-f]{64}").matches(sha) || size !in 0..100_000_000) throw bad("file entry")
            ReleaseFile(path, sha, size)
        }
        if (files.sumOf { it.size } > 300_000_000 || files.none { it.path == "index.html" } || files.map { it.path }.toSet().size != files.size) throw bad("files")
        return Release(bundle, sequence, o.optString("version"), o.optString("nativeApi"), files, data, signature)
    }

    /** Relative, "/"-separated, no empty, "." or ".." segments. */
    private fun isSafePath(path: String): Boolean =
        path.isNotEmpty() && path.length < 512 && path.split("/").none { it.isEmpty() || it == "." || it == ".." || it.contains('\\') || it.contains('\u0000') }

    private fun hex(data: ByteArray): String = MessageDigest.getInstance("SHA-256").digest(data).joinToString("") { "%02x".format(it) }

    /** The running bundle's copy of a file with the same content, as bytes (the APK's own is in assets). */
    private fun localCopy(file: ReleaseFile, snap: Snapshot): ByteArray? {
        val data = try {
            if (snap.activeRoot != null) {
                File(snap.activeRoot, file.path).takeIf(File::isFile)?.readBytes()
            } else {
                val asset = if (file.path == "env.runtime.json") "akan-native/env.runtime.json" else "app/${file.path}"
                context.activity.assets.open(asset).use { it.readBytes() }
            }
        } catch (e: IOException) {
            null
        } ?: return null
        return if (data.size.toLong() == file.size && hex(data) == file.sha256) data else null
    }

    /** Downloads into bundles/<bundle>.partial, verifies each file, then renames it into place. */
    private fun install(release: Release, config: AkanNativeUpdateConfig, snap: Snapshot) {
        val target = AkanNativeUpdates.bundleDirectory(release.bundle)
        val staging = File(target.parentFile, "${release.bundle}.partial")
        staging.deleteRecursively()
        staging.mkdirs()
        val total = release.files.sumOf { it.size }.toDouble()
        var received = 0L
        val events = UpdatesEvents(context)
        for (file in release.files) {
            val destination = File(staging, file.path)
            destination.parentFile?.mkdirs()
            val local = localCopy(file, snap)
            if (local != null) destination.writeBytes(local)
            else {
                // Straight to the file, hashed on the way: never the whole file in memory.
                val digest = MessageDigest.getInstance("SHA-256")
                var size = 0L
                destination.outputStream().use { out ->
                    fetch("${base(config)}/files/${file.sha256}", file.size) { buffer, n ->
                        digest.update(buffer, 0, n)
                        out.write(buffer, 0, n)
                        size += n
                    }
                }
                if (size != file.size || digest.digest().joinToString("") { "%02x".format(it) } != file.sha256) {
                    staging.deleteRecursively()
                    throw Failure(AkanNativeErrorCode.INTERNAL, "${file.path} does not match its hash")
                }
            }
            received += file.size
            val progress = UpdatesUpdateProgress(received = received.toDouble(), total = total)
            main.post { events.progress(progress) }
        }
        // The shell checks the signed manifest against the files at every launch (AkanNativeUpdates.verified).
        File(staging, "manifest.json").writeBytes(release.manifest)
        File(staging, "manifest.json.sig").writeText(release.signature)
        if (release.files.any { File(staging, it.path).length() != it.size }) {
            staging.deleteRecursively()
            throw Failure(AkanNativeErrorCode.INTERNAL, "the downloaded bundle is incomplete")
        }
        target.deleteRecursively()
        if (!staging.renameTo(target)) throw Failure(AkanNativeErrorCode.INTERNAL, "could not move the downloaded bundle into place")
    }
}
