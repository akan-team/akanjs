// Web bundle updates (UP-2): which bundle the shell serves, and the trial / confirm / rollback
// state (the Android twin of native/ios/Sources/AkanNativeUpdates.swift, same rules and file format).
// @akanjs/native/plugins/updates downloads and verifies bundles and calls stage/applyPending/confirm; the
// activity picks the bundle at launch and rolls back a trial that never confirms.
//
// Layout: noBackupFilesDir/akan-native-updates/{state.json, bundles/<bundle>/{…, manifest.json,
// manifest.json.sig}}: outside filesDir, which the filesystem plugin's `data` base exposes to the
// page, and out of backups (bundles download again; state.json belongs to this install). A bundle
// is served only while its signed manifest still verifies and its files are all there with their
// sizes (checked at every launch). Main thread only.
package com.akanjs.runtime

import android.content.Context
import android.util.AtomicFile
import android.util.Base64
import android.util.Log
import java.io.File
import java.io.IOException
import java.security.KeyFactory
import java.security.Signature
import java.security.spec.X509EncodedKeySpec
import org.json.JSONArray
import org.json.JSONObject

data class AkanNativeUpdateEntry(val bundle: String, val sequence: Double, val nativeApi: String, val attempts: Int = 0) {
    fun toJson(): JSONObject = JSONObject().put("bundle", bundle).put("sequence", sequence).put("nativeApi", nativeApi).put("attempts", attempts)

    companion object {
        fun from(json: Any?): AkanNativeUpdateEntry? {
            val o = json as? JSONObject ?: return null
            val bundle = o.optString("bundle")
            if (!AkanNativeUpdates.isBundleId(bundle) || !o.has("sequence") || !o.has("nativeApi")) return null
            return AkanNativeUpdateEntry(bundle, o.optDouble("sequence"), o.optString("nativeApi"), o.optInt("attempts"))
        }
    }
}

class AkanNativeUpdateState(
    var current: AkanNativeUpdateEntry? = null,
    var pending: AkanNativeUpdateEntry? = null,
    var trial: AkanNativeUpdateEntry? = null,
    val failed: MutableList<String> = mutableListOf(),
    var rolledBack: String? = null,
) {
    fun toJson(): JSONObject {
        val o = JSONObject().put("failed", JSONArray(failed.takeLast(20)))
        current?.let { o.put("current", it.toJson()) }
        pending?.let { o.put("pending", it.toJson()) }
        trial?.let { o.put("trial", it.toJson()) }
        rolledBack?.let { o.put("rolledBack", it) }
        return o
    }

    companion object {
        fun from(o: JSONObject): AkanNativeUpdateState {
            val failed = o.optJSONArray("failed")
            return AkanNativeUpdateState(
                current = AkanNativeUpdateEntry.from(o.opt("current")),
                pending = AkanNativeUpdateEntry.from(o.opt("pending")),
                trial = AkanNativeUpdateEntry.from(o.opt("trial")),
                failed = MutableList(failed?.length() ?: 0) { failed!!.optString(it) }.filter(AkanNativeUpdates::isBundleId).toMutableList(),
                rolledBack = o.optString("rolledBack").ifEmpty { null },
            )
        }
    }
}

/** updates.json from the build (akan-native.config.ts `updates`), null when the app has no updates. */
class AkanNativeUpdateConfig(
    val app: String,
    val platform: String,
    val nativeApi: String,
    val embeddedSequence: Double,
    val url: String,
    val publicKey: ByteArray,
    val channel: String,
    val readyTimeoutMs: Long,
    val dev: Boolean,
) {
    companion object {
        fun load(context: Context): AkanNativeUpdateConfig? {
            val o = try {
                JSONObject(context.assets.open("akan-native/updates.json").bufferedReader().use { it.readText() })
            } catch (e: Exception) {
                return null
            }
            val key = try {
                Base64.decode(o.optString("publicKey"), Base64.DEFAULT)
            } catch (e: IllegalArgumentException) {
                return null
            }
            if (key.size != 32 || o.optString("url").isEmpty() || o.optString("nativeApi").isEmpty()) return null
            return AkanNativeUpdateConfig(
                app = o.optString("app"),
                platform = o.optString("platform", "android"),
                nativeApi = o.optString("nativeApi"),
                embeddedSequence = o.optDouble("embeddedSequence", 0.0),
                url = o.optString("url"),
                publicKey = key,
                channel = o.optString("channel", "production"),
                readyTimeoutMs = o.optLong("readyTimeout", 10_000),
                dev = o.optBoolean("dev"),
            )
        }
    }
}

object AkanNativeUpdates {
    private const val TAG = "AkanNativeUpdates"

    var config: AkanNativeUpdateConfig? = null
        private set
    private lateinit var directory: File

    /** The bundle served in this session (null: the one inside the APK). */
    var active: AkanNativeUpdateEntry? = null
        private set

    /** The served bundle has not confirmed yet (notifyReady), so the ready timer runs. */
    var onTrial = false
        private set

    fun isBundleId(s: String): Boolean = AkanNativeKernel.isBundleId(s)

    fun init(context: Context) {
        config = AkanNativeUpdateConfig.load(context)
        // Earlier builds kept this in filesDir, where the page could write it: never trusted.
        File(context.filesDir, "akan-native-updates").takeIf { it.exists() }?.deleteRecursively()
        directory = File(context.noBackupFilesDir, "akan-native-updates")
    }

    /**
     * Ed25519 over [data] with the raw 32-byte key of updates.json: the platform's on API 33+, below
     * it AkanNativeEd25519 (RFC 8032 in plain Kotlin; Android 10 to 12 have no Ed25519 provider). Both pass
     * the shared vectors (vectors/ed25519.json).
     */
    fun signed(data: ByteArray, signature: ByteArray, key: ByteArray): Boolean =
        if (android.os.Build.VERSION.SDK_INT >= 33) platformSigned(data, signature, key) else AkanNativeEd25519.verify(data, signature, key)

    private fun platformSigned(data: ByteArray, signature: ByteArray, key: ByteArray): Boolean = try {
        // Raw key → X.509 SubjectPublicKeyInfo for KeyFactory("Ed25519").
        val spki = byteArrayOf(0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00) + key
        Signature.getInstance("Ed25519").run {
            initVerify(KeyFactory.getInstance("Ed25519").generatePublic(X509EncodedKeySpec(spki)))
            update(data)
            verify(signature)
        }
    } catch (e: Exception) {
        false
    }

    /**
     * The bundle's signed manifest (kept next to it by the plugin) verifies, describes this entry,
     * and every file it lists is there with its size. The hashes were checked at the download.
     */
    private fun verified(entry: AkanNativeUpdateEntry, config: AkanNativeUpdateConfig): Boolean {
        val dir = bundleDirectory(entry.bundle)
        return try {
            val manifest = File(dir, "manifest.json").readBytes()
            val signature = Base64.decode(File(dir, "manifest.json.sig").readText().trim(), Base64.DEFAULT)
            if (!signed(manifest, signature, config.publicKey)) return false
            val o = JSONObject(String(manifest))
            val files = o.getJSONArray("files")
            o.optString("bundle") == entry.bundle && o.optDouble("sequence") == entry.sequence && o.optString("nativeApi") == entry.nativeApi &&
                o.optString("app") == config.app && o.optString("platform") == config.platform &&
                (0 until files.length()).all { i ->
                    val f = files.getJSONObject(i)
                    File(dir, f.getString("path")).let { it.isFile && it.length() == f.getLong("size") }
                }
        } catch (e: Exception) {
            false
        }
    }

    fun bundleDirectory(bundle: String): File = File(File(directory, "bundles"), bundle)

    private val stateFile get() = AtomicFile(File(directory, "state.json"))

    fun readState(): AkanNativeUpdateState = try {
        AkanNativeUpdateState.from(JSONObject(String(stateFile.readFully())))
    } catch (e: Exception) {
        AkanNativeUpdateState()
    }

    /**
     * AtomicFile: a new file, synced, then renamed over the old one, so a crash or power loss never
     * leaves half a state file. false: not written (a full disk): a trial that is not on record
     * must not run, since nothing would roll it back.
     */
    fun writeState(state: AkanNativeUpdateState): Boolean {
        directory.mkdirs()
        val file = stateFile
        val out = try {
            file.startWrite()
        } catch (e: IOException) {
            Log.w(TAG, "cannot write state.json: $e")
            return false
        }
        return try {
            out.write(state.toJson().toString().toByteArray())
            file.finishWrite(out)
            true
        } catch (e: IOException) {
            file.failWrite(out)
            Log.w(TAG, "cannot write state.json: $e")
            false
        }
    }

    fun usable(entry: AkanNativeUpdateEntry?, config: AkanNativeUpdateConfig): Boolean =
        entry != null && entry.nativeApi == config.nativeApi && entry.sequence > config.embeddedSequence &&
            File(bundleDirectory(entry.bundle), "index.html").isFile && verified(entry, config)

    /** Picks the bundle for this launch; returns its folder, or null for the APK's own bundle. */
    fun launch(): File? {
        val config = config ?: return null
        val state = readState()
        if (!usable(state.current, config)) state.current = null
        if (!usable(state.pending, config)) state.pending = null
        if (!usable(state.trial, config)) state.trial = null
        state.trial?.let {
            // Launched again without notifyReady(): the trial crashed or hung.
            state.failed.add(it.bundle)
            state.rolledBack = it.bundle
            state.trial = null
            Log.w(TAG, "bundle ${it.bundle} did not confirm; rolled back")
        }
        state.pending?.let {
            if (!state.failed.contains(it.bundle)) {
                state.trial = it.copy(attempts = 1)
                state.pending = null
            }
        }
        // Not on record: the pending bundle waits for a launch that can record it.
        if (!writeState(state)) state.trial = null
        active = state.trial ?: state.current
        onTrial = state.trial != null
        return active?.let { bundleDirectory(it.bundle) }
    }

    /** A verified download (plugin): runs at the next launch, or right away through applyPending(). */
    fun stage(entry: AkanNativeUpdateEntry) {
        val state = readState()
        state.pending = entry
        state.failed.remove(entry.bundle)
        writeState(state)
    }

    /** apply(): makes the pending bundle the trial now; returns its folder for the reload. */
    fun applyPending(): File? {
        val config = config ?: return null
        val state = readState()
        val pending = state.pending?.takeIf { usable(it, config) } ?: return null
        state.trial = pending.copy(attempts = 1)
        state.pending = null
        if (!writeState(state)) return null
        active = pending
        onTrial = true
        return bundleDirectory(pending.bundle)
    }

    /** notifyReady(): the served trial becomes current; bundles nothing refers to are removed. */
    fun confirm() {
        val trial = active
        if (!onTrial || trial == null) return
        val state = readState()
        if (state.trial?.bundle != trial.bundle) return
        state.current = trial.copy(attempts = 0)
        state.trial = null
        state.rolledBack = null
        writeState(state)
        onTrial = false
        prune(listOfNotNull(state.current?.bundle, state.pending?.bundle))
    }

    /** The trial did not confirm in time: back to the previous bundle (null: the APK's own). */
    fun rollback(): File? {
        val trial = active
        if (!onTrial || trial == null) return active?.let { bundleDirectory(it.bundle) }
        val state = readState()
        state.trial = null
        state.failed.add(trial.bundle)
        state.rolledBack = trial.bundle
        writeState(state)
        onTrial = false
        val config = config
        active = if (config != null && usable(state.current, config)) state.current else null
        Log.w(TAG, "bundle ${trial.bundle} did not call notifyReady() in time; rolled back")
        return active?.let { bundleDirectory(it.bundle) }
    }

    /** reset(): the APK's own bundle from the next launch on. */
    fun reset() {
        writeState(AkanNativeUpdateState())
        prune(listOfNotNull(active?.bundle))
    }

    /** A download in progress (bundles/<bundle>.partial) is the plugin's, which removes it. */
    private fun prune(keep: List<String>) {
        val folder = File(directory, "bundles")
        for (dir in folder.listFiles() ?: return) {
            if (dir.name !in keep && dir.name != active?.bundle && !dir.name.endsWith(".partial")) dir.deleteRecursively()
        }
    }
}
