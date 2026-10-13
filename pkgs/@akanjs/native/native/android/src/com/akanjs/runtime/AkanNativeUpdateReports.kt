// What became of each web bundle release, posted to updates.report.url: the Android twin of
// native/ios/Sources/AkanNativeUpdateReports.swift, same file and wire format; the contract (events, reasons, what an
// answer does, Retry-After, the caps) is AkanNativeKernel's, checked against vectors/updates.json `reports`.
//
// noBackupFilesDir/akan-native-updates/report.json: { installId, nextId, events: [{ id, event, bundle, sequence, reason,
// at }], retryAt?, seen: [key] }. reset() rewrites state.json only, so the installId (random, not a device identifier)
// and the id counter live as long as the install, and an id is never used twice. Read once, at the first use, and
// written whenever it changes.
// Sent from the activity's onResume, so at launch and on each return to the foreground: oldest first, a batch to a
// request, one request at a time. Main thread only; the request runs on a worker thread.
package com.akanjs.runtime

import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import java.net.HttpURLConnection
import java.net.URL
import java.security.SecureRandom
import org.json.JSONArray
import org.json.JSONObject

object AkanNativeUpdateReports {
    private const val TAG = "AkanNativeUpdates"
    private val main = Handler(Looper.getMainLooper())
    private var sending = false
    private var loaded: Report? = null

    private class Report(
        val installId: String,
        var nextId: Long,
        val events: MutableList<JSONObject>,
        var retryAt: Double?,
        val seen: MutableList<String>,
    )

    /** Nothing is kept when the build names no report URL. */
    fun record(event: AkanNativeUpdateEvent, bundle: String?, sequence: Double?, reason: AkanNativeUpdateReason? = null): Long? {
        if (AkanNativeUpdates.config?.reportUrl == null || bundle == null || !AkanNativeKernel.isBundleId(bundle)) return null
        val report = load()
        val key = AkanNativeKernel.updateReportKey(event, bundle, reason)
        if (key in report.seen) return null
        report.seen.add(key)
        while (report.seen.size > AkanNativeKernel.UPDATE_REPORT_LIMIT) report.seen.removeAt(0)
        // JSONObject.put throws on a NaN or an infinity, which a damaged state.json entry can hold.
        val number: Any = sequence?.takeIf { it.isFinite() }?.let { if (it == Math.rint(it) && Math.abs(it) < 9e15) it.toLong() else it } ?: JSONObject.NULL
        val id = report.nextId
        report.events.add(
            JSONObject().put("id", id).put("event", event.wire).put("bundle", bundle).put("sequence", number)
                .put("reason", reason?.wire ?: JSONObject.NULL).put("at", AkanNativeKernel.updateReportTime(System.currentTimeMillis())),
        )
        while (report.events.size > AkanNativeKernel.UPDATE_REPORT_LIMIT) report.events.removeAt(0)
        report.nextId++
        save(report)
        return id
    }

    fun record(event: AkanNativeUpdateEvent, entry: AkanNativeUpdateEntry, reason: AkanNativeUpdateReason? = null) =
        record(event, entry.bundle, entry.sequence, reason)

    fun amend(id: Long, reason: AkanNativeUpdateReason) {
        val report = load()
        val entry = report.events.firstOrNull { it.optLong("id", -1) == id } ?: return
        val event = AkanNativeUpdateEvent.of(entry.optString("event")) ?: return
        val bundle = entry.optString("bundle")
        val index = report.seen.indexOf(AkanNativeKernel.updateReportKey(event, bundle, AkanNativeUpdateReason.of(entry.opt("reason"))))
        entry.put("reason", reason.wire)
        if (index >= 0) report.seen[index] = AkanNativeKernel.updateReportKey(event, bundle, reason)
        save(report)
    }

    fun flush() {
        val config = AkanNativeUpdates.config ?: return
        val address = config.reportUrl ?: return
        if (sending) return
        val report = load()
        if (AkanNativeKernel.updateReportWaits(report.retryAt, System.currentTimeMillis() / 1000.0)) return
        val events = report.events.take(AkanNativeKernel.UPDATE_REPORT_BATCH)
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
        val report = load()
        when (AkanNativeKernel.updateReportOutcome(status)) {
            AkanNativeReportOutcome.KEPT -> {
                val retryAt = AkanNativeKernel.updateReportRetryAt(retryAfter, System.currentTimeMillis() / 1000.0)
                if (retryAt == report.retryAt) return
                report.retryAt = retryAt
                save(report)
            }
            AkanNativeReportOutcome.SENT, AkanNativeReportOutcome.DROPPED -> {
                report.events.removeAll { it.optLong("id") in ids }
                report.retryAt = null
                save(report)
                flush()
            }
        }
    }

    private fun load(): Report = loaded ?: read().also { loaded = it }

    private fun read(): Report {
        val o = AkanNativeUpdates.readJson("report.json") ?: JSONObject()
        val installId = o.optString("installId")
        if (!Regex("[0-9a-fA-F]{32}").matches(installId)) return Report(newInstallId(), 0, mutableListOf(), null, mutableListOf())
        val events = o.optJSONArray("events")
        val seen = o.optJSONArray("seen")
        return Report(
            installId,
            o.optLong("nextId"),
            MutableList(events?.length() ?: 0) { events?.optJSONObject(it) }.filterNotNull().toMutableList(),
            if (o.has("retryAt")) o.optDouble("retryAt").takeIf { it.isFinite() } else null,
            MutableList(seen?.length() ?: 0) { seen?.optString(it).orEmpty() }.filter { it.isNotEmpty() }.toMutableList(),
        )
    }

    private fun save(report: Report) {
        loaded = report
        val o = JSONObject().put("installId", report.installId).put("nextId", report.nextId).put("events", JSONArray(report.events))
            .put("seen", JSONArray(report.seen))
        report.retryAt?.takeIf { it.isFinite() }?.let { o.put("retryAt", it) }
        AkanNativeUpdates.writeJson("report.json", o)
    }

    private fun newInstallId(): String = ByteArray(16).also { SecureRandom().nextBytes(it) }.joinToString("") { "%02x".format(it) }
}
