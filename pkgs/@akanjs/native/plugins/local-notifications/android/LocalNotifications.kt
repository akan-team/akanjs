package com.akanjs.plugins.localnotifications

import android.app.ActivityManager
import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.util.Log
import java.util.Calendar
import org.json.JSONObject

/**
 * Scheduling shared by the plugin (Activity running) and the receiver (maybe no Activity at all:
 * an alarm or a boot wakes only the process). Everything takes the Context it is given.
 *
 * - Scheduled items live in SharedPreferences, because alarms are gone after a reboot or a force
 *   stop; the receiver re-arms them on BOOT_COMPLETED and the plugin on every app start
 *   (capacitor-plugins/local-notifications/android/.../LocalNotificationRestoreReceiver.java:30-40).
 *   The alarm intent carries only the id and the receiver reads the item from the store, instead of
 *   a parceled Notification in the extras as Capacitor does (TimedNotificationPublisher.java:35):
 *   one source of truth, and a cancelled item cannot fire from a stale intent.
 * - Exact alarms only when canScheduleExactAlarms() (SCHEDULE_EXACT_ALARM is not requested, and is
 *   denied by default for new installs targeting API 33+); otherwise setAndAllowWhileIdle
 *   (LocalNotificationManager.java:374-396 falls back the same way). Its delivery window is 75% of
 *   the lead time, capped at one hour (dumpsys alarm on the API 37 emulator): a reminder set 20 s
 *   ahead came 15 s late, a minute repeat up to 45 s late.
 * - Repeats are chains of one-shot alarms: each delivery arms the next occurrence, so they can be
 *   exact, getPending knows the next time, and day/week keep the local time across DST. Capacitor
 *   and Tauri use setRepeating(RTC, ...), which is always inexact (LocalNotificationManager.java:357).
 * - Framework Notification.Builder (no NotificationCompat). The APK has no resources, so the small
 *   icon is a framework drawable (ic_popup_reminder); Capacitor falls back to ic_dialog_info.
 */
internal object LocalNotifications {
    const val TAG = "AkanNative"
    const val DEFAULT_CHANNEL = "default"
    const val ACTION_FIRE = "com.akanjs.plugins.localnotifications.FIRE"
    const val ACTION_RESTORE = "com.akanjs.plugins.localnotifications.RESTORE"
    const val EXTRA_ID = "akan-native.ln.id"
    /** On the tap intent: the notification as JSON (the "action" event). */
    const val EXTRA_TAP = "akan-native.ln.tap"
    /**
     * On the tap intent: a random token issued when the notification was posted and taken back by
     * the tap. The launcher activity is exported, so any app can send it an intent with EXTRA_TAP;
     * without a token on record that is no tap of ours. Single use: one tap is reported once.
     */
    const val EXTRA_TOKEN = "akan-native.ln.token"
    private const val TOKENS = "akan-native.localNotifications.taps"
    private const val MAX_TOKENS = 64
    /** In the notification extras: marks our notifications and keeps their data. */
    const val EXTRA_MARKER = "akan-native.ln"
    const val EXTRA_DATA = "akan-native.ln.data"
    private const val STORE = "akan-native.localNotifications"

    data class Item(
        val id: Int,
        val title: String,
        val body: String,
        val at: Long,
        val every: String?,
        val channelId: String?,
        /** JSON object text. */
        val data: String?,
    ) {
        fun json(): JSONObject = JSONObject().put("id", id).put("title", title).put("body", body).put("at", at).apply {
            if (every != null) put("every", every)
            if (channelId != null) put("channelId", channelId)
            if (data != null) put("data", JSONObject(data))
        }

        /** The "received" / "action" event. */
        fun event(): JSONObject = JSONObject().put("id", id).put("title", title).put("body", body).apply {
            if (data != null) put("data", JSONObject(data))
        }

        companion object {
            fun from(json: JSONObject): Item = Item(
                id = json.getInt("id"),
                title = json.getString("title"),
                body = json.optString("body", ""),
                at = json.getLong("at"),
                every = json.optString("every").ifEmpty { null },
                channelId = json.optString("channelId").ifEmpty { null },
                data = json.optJSONObject("data")?.toString(),
            )
        }
    }

    private fun store(context: Context) = context.getSharedPreferences(STORE, Context.MODE_PRIVATE)

    fun pending(context: Context): List<Item> = store(context).all.values.mapNotNull { text ->
        runCatching { Item.from(JSONObject(text as String)) }.getOrNull()
    }.sortedBy { it.at }

    private fun save(context: Context, item: Item) = store(context).edit().putString(item.id.toString(), item.json().toString()).apply()

    private fun forget(context: Context, id: Int) = store(context).edit().remove(id.toString()).apply()

    // ------------------------------------------------------------ schedule

    fun schedule(context: Context, items: List<Item>) {
        for (item in items) {
            unarm(context, item.id)
            if (item.every == null && item.at <= System.currentTimeMillis()) {
                forget(context, item.id)
                post(context, item)
            } else {
                save(context, item)
                arm(context, item)
            }
        }
    }

    fun cancel(context: Context, ids: List<Int>) {
        for (id in ids) {
            unarm(context, id)
            forget(context, id)
        }
    }

    /** An alarm went off: show the item and arm its next occurrence. */
    fun fire(context: Context, id: Int) {
        val text = store(context).getString(id.toString(), null) ?: return // cancelled meanwhile
        val item = runCatching { Item.from(JSONObject(text)) }.getOrNull() ?: return forget(context, id)
        val now = System.currentTimeMillis()
        if (item.at > now + 1000) return arm(context, item) // a stale alarm of an item scheduled again for later
        post(context, item)
        if (item.every == null) {
            forget(context, id)
        } else {
            val next = item.copy(at = nextOccurrence(item.at, item.every, now))
            save(context, next)
            arm(context, next)
        }
    }

    /**
     * After a boot, a force stop or an update: arm everything again. One-shots that came due while
     * the alarms were gone are shown now (Capacitor shows them 15 s after boot,
     * LocalNotificationRestoreReceiver.java:33-38); missed repeats are skipped to the next occurrence.
     */
    fun restore(context: Context) {
        val now = System.currentTimeMillis()
        for (item in pending(context)) {
            when {
                item.every != null -> {
                    val next = if (item.at > now) item else item.copy(at = nextOccurrence(item.at, item.every, now)).also { save(context, it) }
                    arm(context, next)
                }
                item.at > now -> arm(context, item)
                else -> {
                    forget(context, item.id)
                    post(context, item)
                }
            }
        }
    }

    private fun alarmIntent(context: Context, id: Int, flags: Int): PendingIntent? =
        PendingIntent.getBroadcast(
            context,
            id,
            Intent(context, LocalNotificationReceiver::class.java).setAction(ACTION_FIRE).putExtra(EXTRA_ID, id),
            flags or PendingIntent.FLAG_IMMUTABLE,
        )

    private fun arm(context: Context, item: Item) {
        val alarms = context.getSystemService(AlarmManager::class.java) ?: return
        val pi = alarmIntent(context, item.id, PendingIntent.FLAG_UPDATE_CURRENT) ?: return
        try {
            // Exact alarms need no permission before API 31 (Capacitor LocalNotificationManager.java:374-397).
            if (Build.VERSION.SDK_INT < 31 || Api31.canScheduleExactAlarms(alarms)) {
                alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, item.at, pi)
                return
            }
        } catch (e: SecurityException) { // revoked between the check and the call
            Log.w(TAG, "local-notifications: exact alarm refused, using an inexact one", e)
        }
        alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, item.at, pi)
    }

    private fun unarm(context: Context, id: Int) {
        val pi = alarmIntent(context, id, PendingIntent.FLAG_NO_CREATE) ?: return
        context.getSystemService(AlarmManager::class.java)?.cancel(pi)
        pi.cancel()
    }

    /** Minute and hour are fixed lengths; day and week keep the local time of day (schedule.ts addInterval). */
    fun nextOccurrence(at: Long, every: String, after: Long): Long {
        if (at > after) return at
        val fixed = when (every) {
            "minute" -> 60_000L
            "hour" -> 3_600_000L
            else -> 0L
        }
        if (fixed > 0) return at + ((after - at) / fixed + 1) * fixed
        val days = if (every == "week") 7 else 1
        val start = Calendar.getInstance().apply { timeInMillis = at }
        var k = maxOf(1L, (after - at) / (days * 86_400_000L)).toInt()
        fun nth(n: Int): Long = (start.clone() as Calendar).apply { add(Calendar.DAY_OF_MONTH, n * days) }.timeInMillis
        while (k > 1 && nth(k - 1) > after) k--
        while (nth(k) <= after) k++
        return nth(k)
    }

    // ------------------------------------------------------------ notifications

    fun ensureDefaultChannel(manager: NotificationManager) {
        if (manager.getNotificationChannel(DEFAULT_CHANNEL) != null) return
        manager.createNotificationChannel(NotificationChannel(DEFAULT_CHANNEL, "Notifications", NotificationManager.IMPORTANCE_DEFAULT))
    }

    @Synchronized
    private fun issueToken(context: Context): String {
        val prefs = context.getSharedPreferences(TOKENS, Context.MODE_PRIVATE)
        val token = java.util.UUID.randomUUID().toString()
        // Oldest first ("<time> <token>"): the notifications behind old tokens are long gone.
        val kept = (prefs.getStringSet("issued", emptySet()) ?: emptySet()).sorted().takeLast(MAX_TOKENS - 1)
        prefs.edit().putStringSet("issued", (kept + "${System.currentTimeMillis()} $token").toSet()).apply()
        return token
    }

    /** Whether [token] was issued for a notification and not taken yet; takes it. */
    @Synchronized
    fun redeemToken(context: Context, token: String): Boolean {
        val prefs = context.getSharedPreferences(TOKENS, Context.MODE_PRIVATE)
        val issued = prefs.getStringSet("issued", emptySet()) ?: emptySet()
        val entry = issued.firstOrNull { it.substringAfter(' ') == token } ?: return false
        prefs.edit().putStringSet("issued", issued - entry).commit()
        return true
    }

    fun post(context: Context, item: Item) {
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        if (!manager.areNotificationsEnabled()) {
            Log.w(TAG, "local-notifications: notifications are off, ${item.id} not shown")
            return
        }
        // A channel deleted since scheduling would drop the notification silently.
        val channel = item.channelId?.takeIf { manager.getNotificationChannel(it) != null } ?: DEFAULT_CHANNEL.also { ensureDefaultChannel(manager) }
        val postedAt = System.currentTimeMillis()

        // Tap: the launcher activity (launchMode singleTask, so a running app gets onNewIntent)
        // with the event in the extras. Immutable: nothing needs to fill it in (Capacitor uses
        // FLAG_MUTABLE only for RemoteInput actions).
        val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
        val tap = launch?.let {
            it.putExtra(EXTRA_TAP, item.event().toString()).putExtra(EXTRA_TOKEN, issueToken(context))
            PendingIntent.getActivity(context, item.id, it, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        }
        val extras = Bundle().apply {
            putBoolean(EXTRA_MARKER, true)
            if (item.data != null) putString(EXTRA_DATA, item.data)
        }
        val notification = Notification.Builder(context, channel)
            .setSmallIcon(android.R.drawable.ic_popup_reminder)
            .setContentTitle(item.title)
            .setContentText(item.body)
            .setStyle(Notification.BigTextStyle().bigText(item.body))
            .setCategory(Notification.CATEGORY_REMINDER)
            .setAutoCancel(true)
            .setWhen(postedAt)
            .setShowWhen(true)
            .addExtras(extras)
            .apply { if (tap != null) setContentIntent(tap) }
            .build()
        manager.notify(item.id, notification)
        LocalNotificationsPlugin.delivered(context, item)
    }

    fun isForeground(): Boolean {
        val info = ActivityManager.RunningAppProcessInfo()
        ActivityManager.getMyMemoryState(info)
        return info.importance == ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND
    }

    private object Api31 {
        fun canScheduleExactAlarms(alarms: AlarmManager): Boolean = alarms.canScheduleExactAlarms()
    }
}
