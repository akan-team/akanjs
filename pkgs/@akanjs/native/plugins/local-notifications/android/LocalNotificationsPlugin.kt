package com.akanjs.plugins.localnotifications

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.os.Build
import com.akanjs.runtime.AkanNativeCall
import com.akanjs.runtime.AkanNativeErrorCode
import com.akanjs.runtime.AkanNativePermission
import com.akanjs.runtime.AkanNativePluginContext
import com.akanjs.runtime.AkanNativeReply
import com.akanjs.runtime.AkanNativeVoidReply
import java.lang.ref.WeakReference
import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject

/**
 * Local notifications: NotificationManager + AlarmManager (LocalNotifications.kt), a manifest
 * receiver for alarms and boots (LocalNotificationReceiver.kt). The page sends `at` as epoch ms.
 * - POST_NOTIFICATIONS is a runtime permission (API 33+). schedule() rejects PERMISSION_DENIED
 *   without it, like iOS; Capacitor rejects when areNotificationsEnabled() is false
 *   (capacitor-plugins/local-notifications/android/.../LocalNotificationManager.java:132-137).
 * - Tap: a PendingIntent to the launcher activity. A cold start brings it in the creating intent,
 *   a running app through onNewIntent (launchMode singleTask), plugins.md C3. It is kept until the
 *   page listens for "action" (C2), like capacitor-plugins/app keeps deep links.
 * - "received" is sent when a notification is shown while the app is in the foreground (iOS
 *   willPresent is foreground-only too); Capacitor also sends it from the background.
 * Arguments arrive decoded by the generated LocalNotificationsPluginSpec (PL-10), except schedule's:
 * its `at` is `string | number` in the spec, which the bindings cannot type, so it keeps the AkanNativeCall.
 */
class LocalNotificationsPlugin(private val context: AkanNativePluginContext) : LocalNotificationsPluginSpec {
    private val app: Context = context.activity.applicationContext
    private val manager: NotificationManager = app.getSystemService(NotificationManager::class.java)
    private val events = LocalNotificationsEvents(context)
    private var actionListening = false
    private var receivedListening = false

    init {
        instance = WeakReference(this)
        // What a boot would do: alarms are gone after a force stop, and due items were missed.
        // Created reflectively, as the system creates it: R8 then keeps the no-argument constructor.
        // The release build's R8 does not read the manifest, and a plain LocalNotificationReceiver()
        // call got the constructor inlined and removed ("Unable to instantiate receiver", verified).
        LocalNotificationReceiver::class.java.getDeclaredConstructor().newInstance()
            .onReceive(app, Intent(LocalNotifications.ACTION_RESTORE))
        tapOf(context.activity.intent)?.let(pendingActions::add)
    }

    override fun cancel(args: LocalNotificationsCancelArgs, reply: AkanNativeVoidReply) {
        val ids = ids(args.ids, reply) ?: return
        LocalNotifications.cancel(app, ids)
        reply.resolve()
    }

    override fun getPending(reply: AkanNativeReply<LocalNotificationsGetPendingResult>) =
        reply.resolve(LocalNotificationsGetPendingResult(notifications = LocalNotifications.pending(app).map(::pending)))

    override fun getDelivered(reply: AkanNativeReply<LocalNotificationsGetDeliveredResult>) =
        reply.resolve(LocalNotificationsGetDeliveredResult(notifications = delivered()))

    override fun removeDelivered(args: LocalNotificationsRemoveDeliveredArgs, reply: AkanNativeVoidReply) {
        val ids = ids(args.ids, reply) ?: return
        for (id in ids) manager.cancel(id)
        reply.resolve()
    }

    override fun removeAllDelivered(reply: AkanNativeVoidReply) {
        for (sbn in manager.activeNotifications) if (sbn.notification.extras.getBoolean(LocalNotifications.EXTRA_MARKER)) manager.cancel(sbn.tag, sbn.id)
        reply.resolve()
    }

    override fun checkPermission(reply: AkanNativeReply<LocalNotificationsCheckPermissionResult>) =
        reply.resolve(LocalNotificationsCheckPermissionResult(display = display()))

    override fun requestPermission(args: LocalNotificationsRequestPermissionArgs, reply: AkanNativeReply<LocalNotificationsRequestPermissionResult>) {
        val state = display()
        // "denied" is permanent (C1): the system would not show the prompt again. Below API 33 there is
        // no runtime permission to ask for: asking would be refused at once without a dialog, and the
        // refusal would stay in the permission history after an upgrade to 13.
        if (Build.VERSION.SDK_INT < 33 || state == LocalNotificationsPermissionState.GRANTED || state == LocalNotificationsPermissionState.DENIED) {
            return reply.resolve(LocalNotificationsRequestPermissionResult(display = state))
        }
        context.requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS)) {
            reply.resolve(LocalNotificationsRequestPermissionResult(display = display()))
        }
    }

    /** granted | denied | prompt | prompt-with-rationale. Also "denied" when blocked in the settings. */
    private fun display(): LocalNotificationsPermissionState {
        if (manager.areNotificationsEnabled()) return LocalNotificationsPermissionState.GRANTED
        if (Build.VERSION.SDK_INT < 33) return LocalNotificationsPermissionState.DENIED // turned off in the settings
        val state = context.permissionState(Manifest.permission.POST_NOTIFICATIONS)
        if (state == AkanNativePermission.GRANTED) return LocalNotificationsPermissionState.DENIED
        return LocalNotificationsPermissionState.entries.first { it.json == state } // one of the four AkanNativePermission values
    }

    /** Untyped in the spec (`at: string | number`); the page has already turned `at` into epoch ms. */
    override fun schedule(call: AkanNativeCall) {
        val list = call.args.optJSONArray("notifications")
        if (list == null || list.length() == 0) return call.reject(AkanNativeErrorCode.INVALID_ARGS, "schedule: notifications must be a non-empty array")
        val items = ArrayList<LocalNotifications.Item>()
        for (i in 0 until list.length()) {
            val raw = list.optJSONObject(i) ?: return call.reject(AkanNativeErrorCode.INVALID_ARGS, "notifications[$i] must be an object")
            val id = int32(raw.opt("id"))
            val title = raw.opt("title") as? String
            val at = (raw.opt("at") as? Number)?.toLong()
            if (id == null || title == null || at == null) return call.reject(AkanNativeErrorCode.INVALID_ARGS, "notifications[$i] needs id, title and at (epoch ms)")
            val every = raw.opt("every") as? String
            if (every != null && every !in listOf("minute", "hour", "day", "week")) return call.reject(AkanNativeErrorCode.INVALID_ARGS, "notifications[$i].every must be minute, hour, day or week")
            val channelId = raw.opt("channelId") as? String
            if (channelId != null && manager.getNotificationChannel(channelId) == null) {
                return call.reject(AkanNativeErrorCode.INVALID_ARGS, "notifications[$i]: no channel \"$channelId\" (createChannel first)")
            }
            items.add(LocalNotifications.Item(id, title, raw.opt("body") as? String ?: "", at, every, channelId, raw.optJSONObject("data")?.toString()))
        }
        if (!manager.areNotificationsEnabled()) return call.reject(AkanNativeErrorCode.PERMISSION_DENIED, "notification permission is not granted (call requestPermission)")
        LocalNotifications.schedule(app, items)
        call.resolve(JSONObject().put("ids", JSONArray(items.map { it.id })))
    }

    private fun pending(item: LocalNotifications.Item) = LocalNotificationsPendingNotification(
        id = item.id.toDouble(),
        title = item.title,
        body = item.body,
        at = item.at.toDouble(),
        every = item.every?.let { every -> LocalNotificationsRepeat.entries.firstOrNull { it.json == every } }, // always one: schedule() checks it
        channelId = item.channelId,
        data = item.data?.let { dataOf(JSONObject(it)) },
    )

    private fun delivered(): List<LocalNotificationsDeliveredNotification> {
        val out = ArrayList<LocalNotificationsDeliveredNotification>()
        for (sbn in manager.activeNotifications) {
            val extras = sbn.notification.extras
            if (!extras.getBoolean(LocalNotifications.EXTRA_MARKER)) continue
            out.add(
                LocalNotificationsDeliveredNotification(
                    id = sbn.id.toDouble(),
                    title = extras.getCharSequence(android.app.Notification.EXTRA_TITLE)?.toString() ?: "",
                    body = extras.getCharSequence(android.app.Notification.EXTRA_TEXT)?.toString() ?: "",
                    at = sbn.postTime.toDouble(),
                    data = extras.getString(LocalNotifications.EXTRA_DATA)?.let { text -> runCatching { dataOf(JSONObject(text)) }.getOrNull() },
                ),
            )
        }
        return out
    }

    override fun createChannel(args: LocalNotificationsChannelOptions, reply: AkanNativeVoidReply) {
        if (args.id.isEmpty() || args.name.isEmpty()) return reply.reject(AkanNativeErrorCode.INVALID_ARGS, "createChannel: id and name are required")
        val importance = when (args.importance ?: LocalNotificationsImportance.DEFAULT) {
            LocalNotificationsImportance.MIN -> NotificationManager.IMPORTANCE_MIN
            LocalNotificationsImportance.LOW -> NotificationManager.IMPORTANCE_LOW
            LocalNotificationsImportance.DEFAULT -> NotificationManager.IMPORTANCE_DEFAULT
            LocalNotificationsImportance.HIGH -> NotificationManager.IMPORTANCE_HIGH
        }
        // Creating an existing channel only updates its name and description: the user owns the rest.
        manager.createNotificationChannel(NotificationChannel(args.id, args.name, importance).apply { description = args.description })
        reply.resolve()
    }

    // ------------------------------------------------------------ events

    override fun onNewIntent(intent: Intent) {
        val event = tapOf(intent) ?: return
        if (actionListening) events.action(event) else pendingActions.add(event)
    }

    override fun startListening(event: String) {
        when (event) {
            "action" -> {
                actionListening = true
                for (data in pendingActions) events.action(data)
                pendingActions.clear()
            }
            "received" -> receivedListening = true
        }
    }

    override fun stopListening(event: String) {
        when (event) {
            "action" -> actionListening = false
            "received" -> receivedListening = false
        }
    }

    override fun destroy() {
        if (instance?.get() === this) instance = null
    }

    /** The "action" event of a notification tap intent, once per delivery. */
    private fun tapOf(intent: Intent?): LocalNotificationsNotificationEvent? {
        val text = intent?.getStringExtra(LocalNotifications.EXTRA_TAP) ?: return null
        // Reopening from Recents after the process died replays the intent that started the task.
        if (intent.flags and Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY != 0) return null
        // Only a tap of a notification this app posted, once (LocalNotifications.EXTRA_TOKEN).
        val token = intent.getStringExtra(LocalNotifications.EXTRA_TOKEN) ?: return null
        if (!LocalNotifications.redeemToken(context.activity, token)) return null
        return try {
            notificationEvent(JSONObject(text))
        } catch (e: JSONException) {
            null
        }
    }

    /** The ids as notification ids, or null (rejected) unless every one is a 32-bit integer. */
    private fun ids(values: List<Double>, reply: AkanNativeReply<*>): List<Int>? {
        val ids = values.map { int32(it) }
        if (ids.any { it == null }) {
            reply.reject(AkanNativeErrorCode.INVALID_ARGS, "${reply.call.method}: ids must be an array of 32-bit integers")
            return null
        }
        return ids.filterNotNull()
    }

    private fun int32(value: Any?): Int? {
        if (value !is Number) return null
        val d = value.toDouble()
        return if (d == Math.rint(d) && d >= Int.MIN_VALUE && d <= Int.MAX_VALUE) d.toInt() else null
    }

    companion object {
        /** Taps before the page listened (C2), the process's: an activity made again keeps them. Main thread only. */
        private val pendingActions = ArrayList<LocalNotificationsNotificationEvent>()

        private var instance: WeakReference<LocalNotificationsPlugin>? = null

        /** Called on the main thread after a notification was posted, from the plugin or the receiver. */
        internal fun delivered(context: Context, item: LocalNotifications.Item) {
            val plugin = instance?.get() ?: return
            if (plugin.receivedListening && LocalNotifications.isForeground()) plugin.events.received(notificationEvent(item.event()))
        }

        /** The JSON of LocalNotifications.Item.event() (also the tap intent's), typed. */
        private fun notificationEvent(json: JSONObject) = LocalNotificationsNotificationEvent(
            id = json.getDouble("id"),
            title = json.getString("title"),
            body = json.getString("body"),
            data = json.optJSONObject("data")?.let(::dataOf),
        )

        /** A data object as the generated Map; values stay org.json values (JSONObject.NULL for null), written back as they are. */
        private fun dataOf(json: JSONObject): Map<String, Any> = json.keys().asSequence().associateWith { json.get(it) }
    }
}
