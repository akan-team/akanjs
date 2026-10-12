// What became of each web bundle release (F-S2), posted to updates.report.url: the Android twin of
// native/ios/Sources/AkanNativeUpdateReports.swift, same file and wire format.
//
// noBackupFilesDir/akan-native-updates/report.json: { installId, nextId, events: [{ id, event, bundle, sequence, reason,
// at }], retryAt?, seen: [key] }. reset() rewrites state.json only, so the installId (random, not a device identifier)
// and the id counter live as long as the install, and an id is never used twice.
// Sent from the activity's onResume, so at launch and on each return to the foreground: oldest first, 20 to a request,
// one request at a time. A 2xx removes the batch; a 4xx other than 408 and 429 drops it, since the same body would be
// refused forever; a 408 (a body slower than the server waits for), a 429, a 5xx or no answer keeps it for the next time
// (after Retry-After). At most 100 wait, the oldest dropped first. Main thread only; the request runs on a worker thread.
package com.akanjs.runtime

import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.AtomicFile
import android.util.Log
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.security.SecureRandom
import java.time.Instant
import java.time.temporal.ChronoUnit
import org.json.JSONArray
import org.json.JSONObject

object AkanNativeUpdateReports {
    private const val TAG = "AkanNativeUpdates"
    private const val LIMIT = 100
    private const val BATCH = 20
    private val main = Handler(Looper.getMainLooper())
    private var sending = false

    private class Report(
        val installId: String,
        var nextId: Long,
        val events: MutableList<JSONObject>,
        var retryAt: Double?,
        val seen: MutableList<String>,
    )

    private val file get() = AtomicFile(File(AkanNativeUpdates.directory, "report.json"))

    /**
     * downloaded, applied, confirmed, rolledBack (timeout, relaunch, hang, verify) or failed (download, verify, disk,
     * signature, manifest). Nothing is kept when the build names no report URL.
     */
    fun record(event: String, bundle: String?, sequence: Double?, reason: String? = null) {
        if (AkanNativeUpdates.config?.reportUrl == null || bundle == null || !AkanNativeKernel.isBundleId(bundle)) return
        val report = read()
        // A check runs at every launch: the same failure of the same release is one event, not one per launch.
        val key = "$event|$bundle|${reason ?: ""}"
        if (key in report.seen) return
        report.seen.add(key)
        while (report.seen.size > LIMIT) report.seen.removeAt(0)
        val number: Any = sequence?.let { if (it == Math.rint(it) && Math.abs(it) < 9e15) it.toLong() else it } ?: JSONObject.NULL
        report.events.add(
            JSONObject().put("id", report.nextId).put("event", event).put("bundle", bundle).put("sequence", number)
                .put("reason", reason ?: JSONObject.NULL).put("at", Instant.now().truncatedTo(ChronoUnit.MILLIS).toString()),
        )
        while (report.events.size > LIMIT) report.events.removeAt(0)
        report.nextId++
        write(report)
    }

    fun record(event: String, entry: AkanNativeUpdateEntry, reason: String? = null) = record(event, entry.bundle, entry.sequence, reason)

    fun flush() {
        val config = AkanNativeUpdates.config ?: return
        val address = config.reportUrl ?: return
        if (sending) return
        val report = read()
        val now = System.currentTimeMillis() / 1000.0
        // A Retry-After more than a day out is a clock that moved, not the server's wish.
        report.retryAt?.let { if (it > now && it < now + 86_400) return }
        val events = report.events.take(BATCH)
        if (events.isEmpty()) return
        val body = JSONObject()
            .put("app", config.app).put("platform", config.platform).put("channel", config.channel).put("installId", report.installId)
            .put("nativeApi", config.nativeApi).put("appVersion", config.version).put("os", "Android ${Build.VERSION.RELEASE}")
            .put("events", JSONArray(events))
            .toString().toByteArray()
        val ids = events.map { it.optLong("id") }.toSet()
        sending = true
        Thread {
            var status = 0
            var retryAfter: String? = null
            try {
                val connection = URL(address).openConnection() as HttpURLConnection
                try {
                    connection.requestMethod = "POST"
                    connection.doOutput = true
                    connection.connectTimeout = 30_000
                    connection.readTimeout = 30_000
                    connection.useCaches = false
                    connection.setRequestProperty("Content-Type", "application/json")
                    connection.setFixedLengthStreamingMode(body.size)
                    connection.outputStream.use { it.write(body) }
                    status = connection.responseCode
                    retryAfter = connection.getHeaderField("Retry-After")
                } finally {
                    connection.disconnect()
                }
            } catch (e: Exception) {
                Log.w(TAG, "cannot post update reports: $e")
            }
            main.post {
                sending = false
                settle(ids, status, retryAfter)
            }
        }.start()
    }

    private fun settle(ids: Set<Long>, status: Int, retryAfter: String?) {
        val report = read()
        if (status !in 200..299 && (status !in 400..499 || status == 408 || status == 429)) {
            report.retryAt = retryAfter?.trim()?.toDoubleOrNull()?.let { System.currentTimeMillis() / 1000.0 + it }
            write(report)
            return
        }
        report.events.removeAll { it.optLong("id") in ids }
        report.retryAt = null
        write(report)
        flush()
    }

    private fun read(): Report {
        val o = try {
            JSONObject(String(file.readFully()))
        } catch (e: Exception) {
            JSONObject()
        }
        val installId = o.optString("installId")
        if (!Regex("[0-9a-fA-F]{32}").matches(installId)) return Report(newInstallId(), 0, mutableListOf(), null, mutableListOf())
        val events = o.optJSONArray("events")
        val seen = o.optJSONArray("seen")
        return Report(
            installId,
            o.optLong("nextId"),
            MutableList(events?.length() ?: 0) { events?.optJSONObject(it) }.filterNotNull().toMutableList(),
            if (o.has("retryAt")) o.optDouble("retryAt") else null,
            MutableList(seen?.length() ?: 0) { seen?.optString(it).orEmpty() }.filter { it.isNotEmpty() }.toMutableList(),
        )
    }

    private fun write(report: Report) {
        AkanNativeUpdates.directory.mkdirs()
        val o = JSONObject().put("installId", report.installId).put("nextId", report.nextId).put("events", JSONArray(report.events))
            .put("seen", JSONArray(report.seen))
        report.retryAt?.let { o.put("retryAt", it) }
        val target = file
        val out = try {
            target.startWrite()
        } catch (e: IOException) {
            Log.w(TAG, "cannot write report.json: $e")
            return
        }
        try {
            out.write(o.toString().toByteArray())
            target.finishWrite(out)
        } catch (e: IOException) {
            target.failWrite(out)
            Log.w(TAG, "cannot write report.json: $e")
        }
    }

    private fun newInstallId(): String = ByteArray(16).also { SecureRandom().nextBytes(it) }.joinToString("") { "%02x".format(it) }
}
