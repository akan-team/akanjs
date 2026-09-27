package com.akanjs.plugins.toast

import android.widget.Toast
import com.akanjs.runtime.AkanNativeErrorCode
import com.akanjs.runtime.AkanNativePluginContext
import com.akanjs.runtime.AkanNativeVoidReply

/**
 * The system text Toast, like capacitor-plugins/toast/android/.../Toast.java:21-30.
 * - position is not applied: for apps targeting API 30+ Toast.setGravity does nothing on text
 *   toasts (and logs a warning), so Capacitor's setGravity calls (:24-28) have no effect on the
 *   Android versions akan-native supports (minSdk 35). Text toasts always sit at the bottom.
 * - The system queues the app's toasts and shows them one after another; the page's in-page
 *   toast (src/queue.ts) copies that order for the other platforms.
 * - The application context: a toast outlives the call and must not hold the activity.
 * - Toasts need no notification permission (POST_NOTIFICATIONS) and TalkBack reads them.
 * Entry points run on the main thread, where Toast needs its Looper.
 * Arguments arrive decoded and checked by the generated ToastPluginSpec (PL-10).
 */
class ToastPlugin(private val context: AkanNativePluginContext) : ToastPluginSpec {
    override fun show(args: ToastShowOptions, reply: AkanNativeVoidReply) {
        if (args.text.isBlank()) return reply.reject(AkanNativeErrorCode.INVALID_ARGS, "text must not be empty")
        val length = if (args.duration == ToastDuration.LONG) Toast.LENGTH_LONG else Toast.LENGTH_SHORT
        Toast.makeText(context.activity.applicationContext, args.text, length).show()
        reply.resolve()
    }
}
