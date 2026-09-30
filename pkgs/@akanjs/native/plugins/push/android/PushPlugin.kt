package com.akanjs.plugins.push

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging
import com.google.firebase.messaging.RemoteMessage
import com.akanjs.runtime.AkanNativeErrorCode
import com.akanjs.runtime.AkanNativePermission
import com.akanjs.runtime.AkanNativePluginContext
import com.akanjs.runtime.AkanNativeReply
import com.akanjs.runtime.AkanNativeVoidReply
import java.lang.ref.WeakReference

/**
 * Remote notifications through Firebase Cloud Messaging (akanjs readiness O6-2), the opt-in module:
 * its closure (native/android/maven.lock.json) goes only into apps with this plugin, and the app's
 * google-services.json becomes the string resources Firebase initializes from (android.googleServices).
 * - register(): FirebaseMessaging.token; AkanNativeMessagingService.onNewToken reports later changes.
 * - A notification message is shown by Firebase while the app is in the background; its tap starts
 *   the activity with the message in the intent extras (google.message_id), which is an "action"
 *   (capacitor-plugins-next PushNotificationsPlugin.java handleOnNewIntent). The launch tap waits for
 *   the first listener (C2).
 * - In front, onMessageReceived gets every message: "received", and with setForegroundPresentation a
 *   notification of our own whose tap works the same way.
 * - POST_NOTIFICATIONS is asked for on Android 13+; before, notifications are allowed unless turned off.
 */
class PushPlugin(private val context: AkanNativePluginContext) : PushPluginSpec {
    private val app = context.activity.applicationContext
    private val events = PushEvents(context)
    private val manager = app.getSystemService(NotificationManager::class.java)
    private val listening = HashSet<String>()

    /** push.android from the app config (N13), as the build put it into the manifest's meta-data. */
    @Suppress("DEPRECATION") // getApplicationInfo(String, ApplicationInfoFlags) is API 33+
    private val meta: Bundle = try {
        app.packageManager.getApplicationInfo(app.packageName, PackageManager.GET_META_DATA).metaData ?: Bundle()
    } catch (e: PackageManager.NameNotFoundException) {
        Bundle()
    }
    private val channelId: String = meta.getString("com.google.firebase.messaging.default_notification_channel_id") ?: CHANNEL
    private val smallIcon: Int = meta.getInt("com.google.firebase.messaging.default_notification_icon").takeIf { it != 0 }
        ?: app.applicationInfo.icon.takeIf { it != 0 } ?: android.R.drawable.ic_dialog_info
    private val color: Int? = meta.getInt("com.google.firebase.messaging.default_notification_color").takeIf { it != 0 }?.let { runCatching { app.getColor(it) }.getOrNull() }

    init {
        Router.plugin = WeakReference(this)
        tapOf(context.activity.intent)?.let(Router.pendingActions::add)
        createConfiguredChannel()
    }

    /**
     * The app's channel, made at startup: Firebase posts background notifications into the default
     * channel only when it exists (else into its own "Miscellaneous" one). Settings users changed stay.
     */
    private fun createConfiguredChannel() {
        val name = meta.getString("com.akanjs.push.channel_name") ?: return
        val importance = when (meta.getString("com.akanjs.push.channel_importance")) {
            "min" -> NotificationManager.IMPORTANCE_MIN
            "low" -> NotificationManager.IMPORTANCE_LOW
            "high" -> NotificationManager.IMPORTANCE_HIGH
            else -> NotificationManager.IMPORTANCE_DEFAULT
        }
        val channel = NotificationChannel(channelId, name, importance)
        meta.getString("com.akanjs.push.channel_description")?.let { channel.description = it }
        manager.createNotificationChannel(channel) // renames an existing one; its importance stays the user's
    }

    override fun destroy() {
        if (Router.plugin?.get() === this) Router.plugin = null
    }

    // ------------------------------------------------------------ permission

    override fun checkPermission(reply: AkanNativeReply<PushCheckPermissionResult>) = reply.resolve(PushCheckPermissionResult(display = display()))

    override fun requestPermission(reply: AkanNativeReply<PushRequestPermissionResult>) {
        val state = display()
        if (Build.VERSION.SDK_INT < 33 || state == PushPermissionState.GRANTED || state == PushPermissionState.DENIED) {
            return reply.resolve(PushRequestPermissionResult(display = state))
        }
        context.requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS)) { reply.resolve(PushRequestPermissionResult(display = display())) }
    }

    private fun display(): PushPermissionState {
        if (manager.areNotificationsEnabled()) return PushPermissionState.GRANTED
        if (Build.VERSION.SDK_INT < 33) return PushPermissionState.DENIED // turned off in the settings
        val state = context.permissionState(Manifest.permission.POST_NOTIFICATIONS)
        if (state == AkanNativePermission.GRANTED) return PushPermissionState.DENIED
        return PushPermissionState.entries.first { it.json == state }
    }

    // ------------------------------------------------------------ registration

    private fun messaging(reply: AkanNativeReply<*>): FirebaseMessaging? {
        if (FirebaseApp.getApps(app).isEmpty()) {
            reply.reject(AkanNativeErrorCode.UNSUPPORTED, "Firebase is not set up: add the Firebase project's google-services.json as android.googleServices in akan-native.config")
            return null
        }
        return FirebaseMessaging.getInstance()
    }

    override fun register(reply: AkanNativeReply<PushToken>) {
        val messaging = messaging(reply) ?: return
        messaging.isAutoInitEnabled = true
        @Suppress("DEPRECATION") // the Task API; the suspending one is in kotlinx-coroutines-play-services
        messaging.token.addOnCompleteListener { task ->
            // task.result throws when the task failed (an invalid API key is an IllegalArgumentException).
            val token = if (task.isSuccessful) task.result else null
            if (token == null) {
                val error = task.exception
                // A bad google-services.json or a device without Play services cannot register at all;
                // anything else (SERVICE_NOT_AVAILABLE: offline, throttled) may work later.
                val permanent = error is IllegalArgumentException || error?.message?.contains("MISSING_INSTANCEID_SERVICE") == true
                return@addOnCompleteListener reply.reject(if (permanent) AkanNativeErrorCode.UNSUPPORTED else AkanNativeErrorCode.INTERNAL, "FCM registration failed: ${error?.message ?: "no token"}")
            }
            Router.lastToken = token
            reply.resolve(PushToken(token = token, provider = PushProvider.FCM, platform = PushTokenPlatform.ANDROID))
        }
    }

    override fun unregister(reply: AkanNativeVoidReply) {
        val messaging = messaging(reply) ?: return
        messaging.isAutoInitEnabled = false
        @Suppress("DEPRECATION")
        messaging.deleteToken().addOnCompleteListener { task ->
            Router.lastToken = null
            if (task.isSuccessful) reply.resolve() else reply.reject(AkanNativeErrorCode.INTERNAL, task.exception?.message ?: "deleteToken failed")
        }
    }

    override fun setForegroundPresentation(args: PushPresentation, reply: AkanNativeVoidReply) {
        Router.showInFront = args.banner == true || args.list == true
        Router.soundInFront = args.sound == true
        Router.except = args.except
        reply.resolve()
    }

    // ------------------------------------------------------------ events

    override fun onNewIntent(intent: Intent) {
        val action = tapOf(intent) ?: return
        if ("action" in listening) events.action(action) else Router.pendingActions.add(action)
    }

    override fun startListening(event: String) {
        listening.add(event)
        if (event == "action") {
            for (action in Router.pendingActions) events.action(action)
            Router.pendingActions.clear()
        }
        // A token that changed while no page listened goes to the first listener (C2), the latest only.
        if (event == "token") Router.pendingToken?.let { Router.pendingToken = null; tokenChanged(it) }
    }

    override fun stopListening(event: String) {
        listening.remove(event)
    }

    private fun tokenChanged(token: String) {
        if ("token" in listening) events.token(PushToken(token = token, provider = PushProvider.FCM, platform = PushTokenPlatform.ANDROID))
        else Router.pendingToken = token
    }

    private fun received(message: RemoteMessage) {
        val notification = message.notification
        if ("received" in listening) events.received(PushMessage(id = message.messageId, title = notification?.title, body = notification?.body, data = message.data))
        if (notification != null && Router.showInFront && !Router.excepted(message.data)) showInFront(message, notification)
    }

    /** A notification for a message that arrived in front, when the page asked for one; its tap is an "action". */
    private fun showInFront(message: RemoteMessage, notification: RemoteMessage.Notification) {
        val channel = notification.channelId ?: channelId
        if (manager.getNotificationChannel(channel) == null) {
            manager.createNotificationChannel(NotificationChannel(channel, "Notifications", if (Router.soundInFront) NotificationManager.IMPORTANCE_DEFAULT else NotificationManager.IMPORTANCE_LOW))
        }
        val tap = app.packageManager.getLaunchIntentForPackage(app.packageName)?.apply {
            addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
            putExtra(MESSAGE_ID, message.messageId ?: "")
            for ((key, value) in message.data) putExtra(key, value)
            notification.title?.let { putExtra(TITLE, it) }
            notification.body?.let { putExtra(BODY, it) }
        } ?: return
        val pending = PendingIntent.getActivity(app, (message.messageId ?: "").hashCode(), tap, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val builder = android.app.Notification.Builder(app, channel)
            .setContentTitle(notification.title)
            .setContentText(notification.body)
            .setSmallIcon(smallIcon)
            .setAutoCancel(true)
            .setContentIntent(pending)
        color?.let(builder::setColor)
        val built = builder.build()
        try {
            manager.notify((message.messageId ?: System.currentTimeMillis().toString()).hashCode(), built)
        } catch (e: SecurityException) { // POST_NOTIFICATIONS was taken back
            Log.w("AkanNative", "push: cannot show a notification", e)
        }
    }

    /** The message a notification tap carries in the activity's intent, or null. */
    private fun tapOf(intent: Intent?): PushAction? {
        val extras: Bundle = intent?.extras ?: return null
        if (!extras.containsKey(MESSAGE_ID)) return null
        val data = HashMap<String, Any>()
        for (key in extras.keySet()) {
            if (key == MESSAGE_ID || key == TITLE || key == BODY || key.startsWith("google.") || key.startsWith("gcm.") || key == "from" || key == "collapse_key") continue
            @Suppress("DEPRECATION") val value = extras.get(key) ?: continue
            data[key] = value as? String ?: value.toString()
        }
        val message = PushMessage(id = extras.getString(MESSAGE_ID), title = extras.getString(TITLE), body = extras.getString(BODY), data = data)
        intent.removeExtra(MESSAGE_ID) // an activity made again from the same intent brings no second tap
        return PushAction(actionId = "tap", message = message)
    }

    /** What the FCM service and the plugin share: the service runs without an activity. Main thread. */
    object Router {
        var plugin: WeakReference<PushPlugin>? = null
        /** Taps before the page listened (C2), the process's. */
        val pendingActions = ArrayList<PushAction>()
        var lastToken: String? = null
        /** A token change no page heard yet (delivered on the first "token" listener). */
        var pendingToken: String? = null
        var showInFront = false
        var soundInFront = false
        var except: PushPresentationExcept? = null

        fun excepted(data: Map<String, String>): Boolean {
            val rule = except ?: return false
            val value = data[rule.key] ?: return false
            return value in rule.values
        }
        private val main = Handler(Looper.getMainLooper())

        fun token(token: String) {
            main.post {
                if (token != lastToken) plugin?.get()?.tokenChanged(token) ?: run { if (lastToken != null) pendingToken = token }
                lastToken = token
            }
        }

        fun message(context: Context, message: RemoteMessage) {
            main.post {
                val target = plugin?.get()
                if (target != null) target.received(message) else Log.i("AkanNative", "push: message ${message.messageId} arrived without a page")
            }
        }
    }

    private companion object {
        const val MESSAGE_ID = "google.message_id"
        const val TITLE = "akan-native.push.title"
        const val BODY = "akan-native.push.body"
        const val CHANNEL = "akan_native_push"
    }
}
