package com.akanjs.plugins.updates

import android.os.Handler
import android.os.Looper
import com.akanjs.runtime.AkanNativeErrorCode
import com.akanjs.runtime.AkanNativeKernel
import com.akanjs.runtime.AkanNativePluginContext
import com.akanjs.runtime.AkanNativeReply
import com.akanjs.runtime.AkanNativeUpdateConfig
import com.akanjs.runtime.AkanNativeUpdateDecision
import com.akanjs.runtime.AkanNativeUpdateEntry
import com.akanjs.runtime.AkanNativeUpdateEnvelope
import com.akanjs.runtime.AkanNativeUpdateEvent
import com.akanjs.runtime.AkanNativeUpdateReason
import com.akanjs.runtime.AkanNativeUpdateReports
import com.akanjs.runtime.AkanNativeUpdates
import com.akanjs.runtime.AkanNativeVoidReply
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.FutureTask
import org.json.JSONObject

/**
 * Web bundle updates (UP-2, protocol v2), the Android twin of ios/UpdatesPlugin.swift: the envelope
 * `<url>/android/<channel>/<nativeApi>.json` carries the manifest's bytes, the keyId of the key of `updates.publicKeys`
 * that signed them and the Ed25519 signature (the platform's on API 33+, AkanNativeEd25519 in plain Kotlin below);
 * revocations and the sequence rule are AkanNativeKernel.updateDecision. Files are content-addressed (`<url>/android/files/<sha256>`)
 * and checked against their hash, and files the running bundle already has are copied. Which bundle
 * runs, and the trial / rollback rules, live in the shell (native/android/.../AkanNativeUpdates.kt).
 * Network and file work run on a worker thread; AkanNativeUpdates is only touched on the main thread.
 */
class UpdatesPlugin(private val context: AkanNativePluginContext) : UpdatesPluginSpec {
    private val main = Handler(Looper.getMainLooper())
    private var downloading = false
    /** The running download's call (one at a time); its cancellation stops the read loop. */
    @Volatile private var download: com.akanjs.runtime.AkanNativeCall? = null

    /**
     * [report]: the reason a failed release is reported under (AkanNativeUpdateReports), null when it is not reported;
     * [bundle] and [sequence]: the release it reports, for a refused envelope what its manifest claims, read without
     * trusting it.
     */
    private class Failure(
        val code: String, message: String, val report: AkanNativeUpdateReason? = null, val bundle: String? = null, val sequence: Double? = null,
    ) : Exception(message)

    private class ReleaseFile(val path: String, val sha256: String, val size: Long)

    /** [envelope]: as downloaded, kept next to the bundle for the shell's check at every launch. */
    private class Release(
        val bundle: String, val sequence: Double, val version: String, val nativeApi: String, val files: List<ReleaseFile>,
        val keyId: String, val revokeKeys: List<String>, val resetSequence: Boolean, val envelope: ByteArray,
    )

    /** What the worker needs from the main thread, read once per call. */
    private class Snapshot(
        val config: AkanNativeUpdateConfig, val running: Pair<Double, String>?, val failed: List<String>, val pending: String?,
        val activeRoot: File?, val revoked: List<String>,
    )

    private fun snapshot(config: AkanNativeUpdateConfig): Snapshot {
        val state = AkanNativeUpdates.readState()
        val active = AkanNativeUpdates.active
        return Snapshot(
            config, active?.let { it.sequence to it.keyId }, state.failed.toList(), state.pending?.bundle,
            active?.let { AkanNativeUpdates.bundleDirectory(it.bundle) }, state.revokedKeys.toList(),
        )
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
            val release = fetchRelease(config, snap)
            val (available, revoke) = decide(release, snap)
            // A stale release's revocations bind too: an install whose own bundle is newer only ever checks.
            revoke(revoke)
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
            val release = fetchRelease(config, snap)
            val (available, revoke) = decide(release, snap)
            revoke(revoke)
            if (!available) throw Failure(AkanNativeErrorCode.NOT_FOUND, "no newer release for this app (native API ${config.nativeApi})")
            if (snap.pending != release.bundle) install(release, config, snap)
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
                f.report?.let { reason -> main.post { AkanNativeUpdateReports.record(AkanNativeUpdateEvent.FAILED, f.bundle, f.sequence, reason) } }
                reply.reject(f.code, f.message ?: "update failed")
            } catch (e: Throwable) { // OutOfMemoryError too: never leave the call unanswered
                reply.reject(AkanNativeErrorCode.INTERNAL, "update failed: ${e.message ?: e}")
            } finally {
                main.post(done)
            }
        }.start()
    }

    /**
     * Whether a verified release is newer than what runs (and than the APK's own bundle) and was not rolled back
     * before, and the keys its manifest newly revokes, which bind whether or not it is newer.
     */
    private fun decide(release: Release, snap: Snapshot): Pair<Boolean, List<String>> {
        val decision = AkanNativeKernel.updateDecision(
            ring = snap.config.ring, revoked = snap.revoked, signer = release.keyId, revokeKeys = release.revokeKeys,
            resetSequence = release.resetSequence, sequence = release.sequence, embedded = snap.config.embeddedSequence, running = snap.running,
        )
        // Never untrusted or revoked: the envelope was opened against the same ring and revocations.
        if (decision.kind != AkanNativeUpdateDecision.Kind.TAKE && decision.kind != AkanNativeUpdateDecision.Kind.STALE) {
            val message = "invalid release manifest: key ${release.keyId} may not revoke ${release.revokeKeys.joinToString(", ")}"
            throw Failure(AkanNativeErrorCode.INTERNAL, message, AkanNativeUpdateReason.MANIFEST, release.bundle, release.sequence)
        }
        return (decision.kind == AkanNativeUpdateDecision.Kind.TAKE && release.bundle !in snap.failed) to decision.revoke
    }

    private fun revoke(keyIds: List<String>) {
        if (keyIds.isNotEmpty()) main.post { AkanNativeUpdates.revoke(keyIds) }
    }

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
            // HttpURLConnection asks for text/html first, and a CDN that injects scripts into HTML responses
            // (Cloudflare Web Analytics) changes the signed bytes.
            connection.setRequestProperty("Accept", "*/*")
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

    private fun fetchRelease(config: AkanNativeUpdateConfig, snap: Snapshot): Release {
        val url = AkanNativeKernel.updateManifestUrl(config.url, config.platform, config.channel, config.nativeApi)
        // A 1 MiB manifest is 1.4 MiB in base64.
        val data = fetch(url, 3L shl 19)
        val envelope = AkanNativeUpdateEnvelope.open(data, config, snap.revoked)
            ?: throw refused(data, AkanNativeUpdateReason.SIGNATURE, "the release is not signed by a key of updates.publicKeys this app still trusts")
        return try {
            parse(envelope, data, config)
        } catch (f: Failure) {
            throw refused(data, AkanNativeUpdateReason.MANIFEST, f.message ?: "invalid release manifest")
        }
    }

    /**
     * The failure of a refused envelope, naming the release it claims, read without trusting it and only to say which
     * release failed: a forged name can at worst count against a release the server already published for this app.
     */
    private fun refused(raw: ByteArray, reason: AkanNativeUpdateReason, message: String): Failure {
        val manifest = try {
            AkanNativeKernel.strictBase64(JSONObject(String(raw)).getString("manifest"))?.let { JSONObject(String(it)) }
        } catch (e: Exception) {
            null
        }
        return Failure(AkanNativeErrorCode.INTERNAL, message, reason, manifest?.optString("bundle"), manifest?.optDouble("sequence")?.takeIf { it.isFinite() })
    }

    /** Checks every field of the (signed) manifest before any of it is used. */
    private fun parse(envelope: AkanNativeUpdateEnvelope, raw: ByteArray, config: AkanNativeUpdateConfig): Release {
        fun bad(why: String) = Failure(AkanNativeErrorCode.INTERNAL, "invalid release manifest: $why")
        val o = try {
            JSONObject(String(envelope.manifest))
        } catch (e: Exception) {
            throw bad("not a JSON object")
        }
        if (o.optInt("schema") != 2 || o.optString("kind") != "web") throw bad("schema 2, kind web expected")
        if (o.optString("app") != config.app || o.optString("platform") != config.platform || o.optString("channel") != config.channel ||
            o.optString("nativeApi") != config.nativeApi) {
            throw bad("made for another app, platform, channel or native API")
        }
        val revokeList = if (o.has("revokeKeys")) o.optJSONArray("revokeKeys") ?: throw bad("revokeKeys") else null
        val revokeKeys = List(revokeList?.length() ?: 0) { revokeList?.opt(it) as? String ?: throw bad("revokeKeys") }
        if (revokeKeys.size > AkanNativeKernel.MAX_REVOKE_KEYS || !revokeKeys.all(AkanNativeKernel::isUpdateKeyId)) throw bad("revokeKeys")
        if (o.has("resetSequence") && o.opt("resetSequence") !is Boolean) throw bad("resetSequence")
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
        return Release(
            bundle, sequence, o.optString("version"), o.optString("nativeApi"), files,
            envelope.keyId, revokeKeys, o.optBoolean("resetSequence"), raw,
        )
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

    /**
     * Downloads into bundles/<bundle>.partial, verifies each file, then renames and stages it. A failure names the
     * release, and an IOException outside a download is the disk's.
     */
    private fun install(release: Release, config: AkanNativeUpdateConfig, snap: Snapshot) {
        try {
            place(release, config, snap)
        } catch (f: Failure) {
            throw Failure(f.code, f.message ?: "update failed", f.report, release.bundle, release.sequence)
        } catch (e: IOException) {
            throw Failure(AkanNativeErrorCode.INTERNAL, "update failed: ${e.message ?: e}", AkanNativeUpdateReason.DISK, release.bundle, release.sequence)
        }
    }

    private fun place(release: Release, config: AkanNativeUpdateConfig, snap: Snapshot) {
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
                    try {
                        fetch("${base(config)}/files/${file.sha256}", file.size) { buffer, n ->
                            digest.update(buffer, 0, n)
                            try {
                                out.write(buffer, 0, n)
                            } catch (e: IOException) {
                                throw Failure(AkanNativeErrorCode.INTERNAL, "cannot write ${file.path}: ${e.message ?: e}", AkanNativeUpdateReason.DISK)
                            }
                            size += n
                        }
                    } catch (f: Failure) {
                        throw if (f.report != null || f.code == AkanNativeErrorCode.CANCELLED) f else Failure(f.code, f.message ?: "download failed", AkanNativeUpdateReason.DOWNLOAD)
                    } catch (e: IOException) {
                        throw Failure(AkanNativeErrorCode.INTERNAL, "${file.path}: ${e.message ?: e}", AkanNativeUpdateReason.DOWNLOAD)
                    }
                }
                if (size != file.size || digest.digest().joinToString("") { "%02x".format(it) } != file.sha256) {
                    staging.deleteRecursively()
                    throw Failure(AkanNativeErrorCode.INTERNAL, "${file.path} does not match its hash", AkanNativeUpdateReason.VERIFY)
                }
            }
            received += file.size
            val progress = UpdatesUpdateProgress(received = received.toDouble(), total = total)
            main.post { events.progress(progress) }
        }
        // The shell checks the envelope against the files at every launch (AkanNativeUpdates.verified).
        File(staging, "manifest.signed.json").writeBytes(release.envelope)
        if (release.files.any { File(staging, it.path).length() != it.size }) {
            staging.deleteRecursively()
            throw Failure(AkanNativeErrorCode.INTERNAL, "the downloaded bundle is incomplete", AkanNativeUpdateReason.VERIFY)
        }
        target.deleteRecursively()
        // In one main-thread turn: a confirm() or reset() between the rename and stage() would prune the new folder.
        val staged = FutureTask<Boolean> {
            staging.renameTo(target).also { moved ->
                if (moved) AkanNativeUpdates.stage(AkanNativeUpdateEntry(release.bundle, release.sequence, release.nativeApi, release.keyId))
            }
        }
        main.post(staged)
        if (!staged.get()) throw Failure(AkanNativeErrorCode.INTERNAL, "could not move the downloaded bundle into place", AkanNativeUpdateReason.DISK)
    }
}
