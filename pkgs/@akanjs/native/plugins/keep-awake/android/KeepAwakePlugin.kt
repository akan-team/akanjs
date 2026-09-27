package com.akanjs.plugins.keepawake

import android.view.WindowManager
import com.akanjs.runtime.AkanNativeDocumentScope
import com.akanjs.runtime.AkanNativePluginContext
import com.akanjs.runtime.AkanNativeReply
import com.akanjs.runtime.AkanNativeVoidReply

/**
 * FLAG_KEEP_SCREEN_ON on the activity window (plugins.md §4.1). No WAKE_LOCK permission is needed:
 * the flag only applies while the window is visible, so the system undoes it in the background by
 * itself. The shell handles configuration changes without recreating the activity, so the flag
 * survives rotation and dark mode switches. It belongs to the page that set it (architecture review:
 * document scope, like the web's Wake Lock): a reload or navigation clears it (AkanNativeDocumentScope.own).
 * Entry points run on the main thread, as window flags require.
 * The result types come from the generated KeepAwakePluginSpec (PL-10).
 */
class KeepAwakePlugin(private val context: AkanNativePluginContext) : KeepAwakePluginSpec {
    /** The page holding the flag and its token there. */
    private var holder: AkanNativeDocumentScope? = null
    private var token = 0L

    override fun keepAwake(reply: AkanNativeVoidReply) {
        val window = context.activity.window
        window.addFlags(FLAG)
        val document = reply.call.document
        if (document != null && document !== holder) {
            holder?.disown(token)
            holder = document
            token = document.own { window.clearFlags(FLAG) }
        }
        reply.resolve()
    }

    override fun allowSleep(reply: AkanNativeVoidReply) {
        holder?.disown(token)
        holder = null
        context.activity.window.clearFlags(FLAG)
        reply.resolve()
    }

    override fun isKeptAwake(reply: AkanNativeReply<KeepAwakeIsKeptAwakeResult>) =
        reply.resolve(KeepAwakeIsKeptAwakeResult(value = (context.activity.window.attributes.flags and FLAG) != 0))

    private companion object {
        const val FLAG = WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
    }
}
