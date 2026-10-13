// Web bundle updates (UP-2, protocol v2): which bundle the shell serves, and the trial / confirm / rollback
// state (the Android twin of native/ios/Sources/AkanNativeUpdates.swift, same rules and file format).
// @akanjs/native/plugins/updates downloads and verifies bundles and calls stage/applyPending/confirm; the
// activity picks the bundle at launch and rolls back a trial that never confirms.
//
// Layout: noBackupFilesDir/akan-native-updates/{state.json, bundles/<bundle>/{…, manifest.signed.json}}: outside
// filesDir, which the filesystem plugin's `data` base exposes to the page, and out of backups (bundles download again;
// state.json belongs to this install). A bundle is served only while its envelope still verifies under a key of
// updates.publicKeys that is not revoked, and its files are all there with their sizes (checked at every launch).
// state.json's revokedKeys outlive reset(): a revocation is for good. Main thread only.
package com.akanjs.runtime

import android.content.Context
import android.util.AtomicFile
import android.util.Log
import java.io.File
import java.io.IOException
import java.security.KeyFactory
import java.security.Signature
import java.security.spec.X509EncodedKeySpec
import org.json.JSONArray
import org.json.JSONObject

/** [keyId]: the key whose envelope the bundle came in. */
data class AkanNativeUpdateEntry(val bundle: String, val sequence: Double, val nativeApi: String, val keyId: String, val attempts: Int = 0) {
    fun toJson(): JSONObject =
        JSONObject().put("bundle", bundle).put("sequence", sequence).put("nativeApi", nativeApi).put("keyId", keyId).put("attempts", attempts)

    companion object {
        fun from(json: Any?): AkanNativeUpdateEntry? {
            val o = json as? JSONObject ?: return null
            val bundle = o.optString("bundle")
            val keyId = o.optString("keyId")
            if (!AkanNativeUpdates.isBundleId(bundle) || !o.has("sequence") || !o.has("nativeApi") || !AkanNativeKernel.isUpdateKeyId(keyId)) return null
            return AkanNativeUpdateEntry(bundle, o.optDouble("sequence"), o.optString("nativeApi"), keyId, o.optInt("attempts"))
        }
    }
}

class AkanNativeUpdateState(
    var current: AkanNativeUpdateEntry? = null,
    var pending: AkanNativeUpdateEntry? = null,
    var trial: AkanNativeUpdateEntry? = null,
    val failed: MutableList<String> = mutableListOf(),
    var rolledBack: String? = null,
    val revokedKeys: MutableList<String> = mutableListOf(),
) {
    fun toJson(): JSONObject {
        val o = JSONObject().put("failed", JSONArray(failed.takeLast(20))).put("revokedKeys", JSONArray(revokedKeys))
        current?.let { o.put("current", it.toJson()) }
        pending?.let { o.put("pending", it.toJson()) }
        trial?.let { o.put("trial", it.toJson()) }
        rolledBack?.let { o.put("rolledBack", it) }
        return o
    }

    companion object {
        fun from(o: JSONObject): AkanNativeUpdateState {
            val failed = o.optJSONArray("failed")
            val revoked = o.optJSONArray("revokedKeys")
            return AkanNativeUpdateState(
                current = AkanNativeUpdateEntry.from(o.opt("current")),
                pending = AkanNativeUpdateEntry.from(o.opt("pending")),
                trial = AkanNativeUpdateEntry.from(o.opt("trial")),
                failed = MutableList(failed?.length() ?: 0) { failed?.optString(it).orEmpty() }.filter(AkanNativeUpdates::isBundleId).toMutableList(),
                rolledBack = o.optString("rolledBack").ifEmpty { null },
                revokedKeys = MutableList(revoked?.length() ?: 0) { revoked?.optString(it).orEmpty() }.filter(AkanNativeKernel::isUpdateKeyId).toMutableList(),
            )
        }
    }
}

/** updates.json from the build (akan-native.config.ts `updates`), null when the app has no updates. */
class AkanNativeUpdateConfig(
    val app: String,
    val version: String,
    val platform: String,
    val nativeApi: String,
    val embeddedSequence: Double,
    val url: String,
    /** updates.publicKeys in order: the order decides which key may revoke which (AkanNativeKernel.updateDecision). */
    val keys: List<Pair<String, ByteArray>>,
    val channel: String,
    val readyTimeoutMs: Long,
    val dev: Boolean,
    /** updates.report.url: where AkanNativeUpdateReports posts what became of each release; null sends nothing. */
    val reportUrl: String?,
) {
    val ring: List<String> get() = keys.map { it.first }

    fun key(keyId: String): ByteArray? = keys.firstOrNull { it.first == keyId }?.second

    companion object {
        fun load(context: Context): AkanNativeUpdateConfig? {
            val o = try {
                JSONObject(context.assets.open("akan-native/updates.json").bufferedReader().use { it.readText() })
            } catch (e: Exception) {
                return null
            }
            val listed = o.optJSONArray("publicKeys")
            val encoded = if (listed != null) List(listed.length()) { listed.optString(it) } else listOfNotNull(o.optString("publicKey").ifEmpty { null })
            val raw = encoded.map { AkanNativeKernel.strictBase64(it) ?: return null }
            if (raw.isEmpty() || raw.any { it.size != 32 } || o.optString("url").isEmpty() || o.optString("nativeApi").isEmpty()) return null
            return AkanNativeUpdateConfig(
                app = o.optString("app"),
                version = o.optString("version"),
                platform = o.optString("platform", "android"),
                nativeApi = o.optString("nativeApi"),
                embeddedSequence = o.optDouble("embeddedSequence", 0.0),
                url = o.optString("url"),
                keys = raw.map { AkanNativeKernel.updateKeyId(it) to it },
                channel = o.optString("channel", "production"),
                readyTimeoutMs = o.optLong("readyTimeout", 10_000),
                dev = o.optBoolean("dev"),
                reportUrl = o.optString("reportUrl").ifEmpty { null },
            )
        }
    }
}

/** A `<channel>/<nativeApi>.json` envelope, checked as far as its signature: what the manifest says is read after. */
class AkanNativeUpdateEnvelope(val manifest: ByteArray, val keyId: String) {
    companion object {
        /** null: not an envelope, or one AkanNativeKernel.checkUpdateEnvelope refuses. */
        fun open(data: ByteArray, config: AkanNativeUpdateConfig, revoked: List<String>): AkanNativeUpdateEnvelope? = try {
            val o = JSONObject(String(data))
            val keyId = o.getString("keyId")
            val checked = AkanNativeKernel.checkUpdateEnvelope(
                manifest = o.getString("manifest"), keyId = keyId, signature = o.getString("signature"), ring = config.ring, revoked = revoked,
            ) { manifest, signature, signer -> config.key(signer)?.let { AkanNativeUpdates.signed(manifest, signature, it) } ?: false }
            checked.manifest?.let { AkanNativeUpdateEnvelope(it, keyId) }
        } catch (e: Exception) {
            null
        }
    }
}

object AkanNativeUpdates {
    private const val TAG = "AkanNativeUpdates"

    var config: AkanNativeUpdateConfig? = null
        private set
    internal lateinit var directory: File
        private set

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
     * The bundle's envelope (kept next to it by the plugin) verifies, describes this entry,
     * and every file it lists is there with its size. The hashes were checked at the download.
     */
    private fun verified(entry: AkanNativeUpdateEntry, config: AkanNativeUpdateConfig, revoked: List<String>): Boolean {
        val dir = bundleDirectory(entry.bundle)
        return try {
            val envelope = AkanNativeUpdateEnvelope.open(File(dir, "manifest.signed.json").readBytes(), config, revoked) ?: return false
            if (envelope.keyId != entry.keyId) return false
            val o = JSONObject(String(envelope.manifest))
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

    fun readState(): AkanNativeUpdateState = readJson("state.json")?.let(AkanNativeUpdateState::from) ?: AkanNativeUpdateState()

    /** false: not written (a full disk): a trial that is not on record must not run, since nothing would roll it back. */
    fun writeState(state: AkanNativeUpdateState): Boolean = writeJson("state.json", state.toJson())

    fun readJson(name: String): JSONObject? = try {
        JSONObject(String(AtomicFile(File(directory, name)).readFully()))
    } catch (e: Exception) {
        null
    }

    /**
     * AtomicFile: a new file, synced, then renamed over the old one, so a crash or power loss never leaves half a file
     * of the updates folder. false: not written.
     */
    fun writeJson(name: String, o: JSONObject): Boolean {
        directory.mkdirs()
        val file = AtomicFile(File(directory, name))
        val out = try {
            file.startWrite()
        } catch (e: IOException) {
            Log.w(TAG, "cannot write $name: $e")
            return false
        }
        return try {
            out.write(o.toString().toByteArray())
            file.finishWrite(out)
            true
        } catch (e: IOException) {
            file.failWrite(out)
            Log.w(TAG, "cannot write $name: $e")
            false
        }
    }

    fun usable(entry: AkanNativeUpdateEntry?, config: AkanNativeUpdateConfig, revoked: List<String>): Boolean =
        entry != null && takes(entry, config, revoked) && intact(entry, config, revoked)

    /**
     * Built for this native API, newer than the APK's own bundle, and signed by a key it trusts and has not revoked: a
     * bundle a new binary or a revocation left behind is dropped as expected, not reported as a failure.
     */
    private fun takes(entry: AkanNativeUpdateEntry, config: AkanNativeUpdateConfig, revoked: List<String>): Boolean =
        entry.nativeApi == config.nativeApi && entry.sequence > config.embeddedSequence && entry.keyId in config.ring && entry.keyId !in revoked

    private fun intact(entry: AkanNativeUpdateEntry, config: AkanNativeUpdateConfig, revoked: List<String>): Boolean =
        File(bundleDirectory(entry.bundle), "index.html").isFile && verified(entry, config, revoked)

    /** Drops an entry this launch cannot serve, reporting [event] (reason verify) when its files were the reason. */
    private fun drop(entry: AkanNativeUpdateEntry?, config: AkanNativeUpdateConfig, revoked: List<String>, event: AkanNativeUpdateEvent): AkanNativeUpdateEntry? {
        if (entry == null || !takes(entry, config, revoked)) return null
        if (intact(entry, config, revoked)) return entry
        AkanNativeUpdateReports.record(event, entry, AkanNativeUpdateReason.VERIFY)
        return null
    }

    /** Picks the bundle for this launch; returns its folder, or null for the APK's own bundle. */
    fun launch(): File? {
        val config = config ?: return null
        val state = readState()
        state.current = drop(state.current, config, state.revokedKeys, AkanNativeUpdateEvent.ROLLED_BACK)
        state.pending = drop(state.pending, config, state.revokedKeys, AkanNativeUpdateEvent.FAILED)
        state.trial = drop(state.trial, config, state.revokedKeys, AkanNativeUpdateEvent.ROLLED_BACK)
        state.trial?.let {
            // Launched again without notifyReady(): the trial crashed or hung.
            state.failed.add(it.bundle)
            state.rolledBack = it.bundle
            state.trial = null
            Log.w(TAG, "bundle ${it.bundle} did not confirm; rolled back")
            AkanNativeUpdateReports.record(AkanNativeUpdateEvent.ROLLED_BACK, it, AkanNativeUpdateReason.RELAUNCH)
        }
        state.pending?.let {
            if (!state.failed.contains(it.bundle)) {
                state.trial = it.copy(attempts = 1)
                state.pending = null
            }
        }
        // Not on record: the pending bundle waits for a launch that can record it.
        if (!writeState(state)) state.trial = null
        state.trial?.let { AkanNativeUpdateReports.record(AkanNativeUpdateEvent.APPLIED, it) }
        active = state.trial ?: state.current
        onTrial = state.trial != null
        return active?.let { bundleDirectory(it.bundle) }
    }

    /** A verified download (plugin): runs at the next launch, or right away through applyPending(). */
    fun stage(entry: AkanNativeUpdateEntry) {
        val state = readState()
        state.pending = entry
        state.failed.remove(entry.bundle)
        if (writeState(state)) AkanNativeUpdateReports.record(AkanNativeUpdateEvent.DOWNLOADED, entry)
    }

    /** apply(): makes the pending bundle the trial now; returns its folder for the reload. */
    fun applyPending(): File? {
        val config = config ?: return null
        val state = readState()
        val pending = state.pending?.takeIf { usable(it, config, state.revokedKeys) } ?: return null
        state.trial = pending.copy(attempts = 1)
        state.pending = null
        if (!writeState(state)) return null
        active = pending
        onTrial = true
        AkanNativeUpdateReports.record(AkanNativeUpdateEvent.APPLIED, pending)
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
        AkanNativeUpdateReports.record(AkanNativeUpdateEvent.CONFIRMED, trial)
        prune(listOfNotNull(state.current?.bundle, state.pending?.bundle))
    }

    /**
     * The trial did not confirm in time: back to the previous bundle. Returns its folder (null: the APK's own) and the
     * id of the rollback's report, a timeout until the renderer probe finds the page hung.
     */
    fun rollback(): Pair<File?, Long?> {
        val trial = active
        if (!onTrial || trial == null) return active?.let { bundleDirectory(it.bundle) } to null
        val state = readState()
        state.trial = null
        state.failed.add(trial.bundle)
        state.rolledBack = trial.bundle
        writeState(state)
        val report = AkanNativeUpdateReports.record(AkanNativeUpdateEvent.ROLLED_BACK, trial, AkanNativeUpdateReason.TIMEOUT)
        onTrial = false
        val config = config
        active = if (config != null && usable(state.current, config, state.revokedKeys)) state.current else null
        Log.w(TAG, "bundle ${trial.bundle} did not call notifyReady() in time; rolled back")
        return active?.let { bundleDirectory(it.bundle) } to report
    }

    /** reset(): the APK's own bundle from the next launch on. Revocations stay. */
    fun reset() {
        writeState(AkanNativeUpdateState(revokedKeys = readState().revokedKeys))
        prune(listOfNotNull(active?.bundle))
    }

    /** Keys a verified manifest revoked: no bundle they signed is served again, from the next launch on. */
    fun revoke(keyIds: List<String>) {
        if (keyIds.isEmpty()) return
        val state = readState()
        val added = keyIds.filter { it !in state.revokedKeys }
        if (added.isEmpty()) return
        state.revokedKeys.addAll(added)
        writeState(state)
        Log.w(TAG, "revoked keys ${added.joinToString(", ")}")
    }

    /** A download in progress (bundles/<bundle>.partial) is the plugin's, which removes it. */
    private fun prune(keep: List<String>) {
        val folder = File(directory, "bundles")
        for (dir in folder.listFiles() ?: return) {
            if (dir.name !in keep && dir.name != active?.bundle && !dir.name.endsWith(".partial")) dir.deleteRecursively()
        }
    }
}
