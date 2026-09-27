package com.akanjs.plugins.clipboard

import android.content.ClipData
import android.content.ClipboardManager
import android.util.Log
import com.akanjs.runtime.AkanNativeErrorCode
import com.akanjs.runtime.AkanNativePluginContext
import com.akanjs.runtime.AkanNativeReply
import com.akanjs.runtime.AkanNativeVoidReply

/**
 * Plain text on the framework ClipboardManager.
 * - Android 10+ hands out the clip only while the app has window focus. Without focus
 *   getPrimaryClip() returns null, which looks like an empty clipboard, so check focus first and
 *   report PERMISSION_DENIED.
 * - Android 13+ shows its own "copied" confirmation: the page should not add a toast.
 * - Clips that are not plain text (HTML, a content URI) are coerced to text as
 *   capacitor-plugins/clipboard/…/Clipboard.java:56-66 does, off the main thread because
 *   coerceToText may read the URI's content.
 * - No clip label, as react-native ClipboardModule.kt:44.
 * Arguments arrive decoded and checked by the generated ClipboardPluginSpec (PL-10).
 */
class ClipboardPlugin(private val context: AkanNativePluginContext) : ClipboardPluginSpec {
    private val manager: ClipboardManager? get() = context.activity.getSystemService(ClipboardManager::class.java)

    override fun writeText(args: ClipboardWriteTextArgs, reply: AkanNativeVoidReply) {
        val manager = manager ?: return reply.reject(AkanNativeErrorCode.UNSUPPORTED, "no clipboard service")
        manager.setPrimaryClip(ClipData.newPlainText(null, args.text))
        reply.resolve()
    }

    override fun readText(reply: AkanNativeReply<ClipboardReadTextResult>) {
        val manager = manager ?: return reply.reject(AkanNativeErrorCode.UNSUPPORTED, "no clipboard service")
        if (!context.activity.hasWindowFocus()) {
            return reply.reject(AkanNativeErrorCode.PERMISSION_DENIED, "the clipboard can be read only while the app has focus")
        }
        val clip = manager.primaryClip
        val item = if (clip != null && clip.itemCount > 0) clip.getItemAt(0) else null
        val plain = item?.text
        if (item == null || plain != null) return reply.resolve(ClipboardReadTextResult(text = plain?.toString() ?: ""))
        Thread {
            val text = try {
                item.coerceToText(context.activity)?.toString() ?: ""
            } catch (e: Exception) {
                Log.w("AkanNative", "clipboard: coercing the clip to text failed", e)
                ""
            }
            reply.resolve(ClipboardReadTextResult(text = text))
        }.start()
    }
}
