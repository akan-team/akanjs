package com.akanjs.plugins.keyboard

import android.app.Activity
import android.os.Build
import android.view.WindowInsets
import android.view.inputmethod.InputMethodManager
import com.akanjs.runtime.AkanNativeInsets
import com.akanjs.runtime.AkanNativePluginContext
import com.akanjs.runtime.AkanNativeReply
import com.akanjs.runtime.AkanNativeVoidReply

/**
 * Soft keyboard from the IME window insets the shell tracks. height = ime.bottom − systemBars.bottom
 * in dp (react-native ReactRootView uses the same definition). The shell pads the WebView by the
 * IME, so the page itself is not covered.
 * The result and event types come from the generated KeyboardPluginSpec (PL-10).
 */
class KeyboardPlugin(private val context: AkanNativePluginContext) : KeyboardPluginSpec {
    private var listening = false
    private var last: KeyboardState? = null
    private val events = KeyboardEvents(context)

    /** Events the page listens to (change, willShow, didShow, willHide, didHide). */
    private val listened = HashSet<String>()

    init {
        context.onInsetsChanged { insets ->
            val next = state(insets)
            if (next == last) return@onInsetsChanged
            last = next
            if (listening) events.change(next)
        }
        context.onKeyboardTransition { t ->
            if (t.phase !in listened) return@onKeyboardTransition
            val data = KeyboardTransition(height = Math.round(t.height).toDouble(), duration = t.durationMs.toDouble())
            when (t.phase) {
                "willShow" -> events.willShow(data)
                "didShow" -> events.didShow(data)
                "willHide" -> events.willHide(data)
                "didHide" -> events.didHide(data)
            }
        }
    }

    override fun setResizeMode(args: KeyboardSetResizeModeArgs, reply: AkanNativeVoidReply) {
        context.setImeResize(args.mode == KeyboardResizeMode.RESIZE)
        reply.resolve()
    }

    private fun state(insets: AkanNativeInsets) = KeyboardState(visible = insets.imeVisible, height = Math.round(insets.imeHeight).toDouble())

    override fun getState(reply: AkanNativeReply<KeyboardState>) = reply.resolve(state(context.insets))

    override fun hide(reply: AkanNativeVoidReply) {
        val activity = context.activity
        activity.getSystemService(InputMethodManager::class.java)?.hideSoftInputFromWindow(context.webView.windowToken, 0)
        // API 29 has no insets controller; hideSoftInputFromWindow is what androidx does there.
        if (Build.VERSION.SDK_INT >= 30) Api30.hideIme(activity)
        // Hiding the IME keeps DOM focus; blur so the next tap reopens it.
        context.webView.evaluateJavascript("document.activeElement&&document.activeElement.blur&&document.activeElement.blur()", null)
        reply.resolve()
    }

    override fun startListening(event: String) {
        if (event == "change") listening = true else listened.add(event)
    }

    override fun stopListening(event: String) {
        if (event == "change") listening = false else listened.remove(event)
    }

    private object Api30 {
        fun hideIme(activity: Activity) {
            activity.window.insetsController?.hide(WindowInsets.Type.ime())
        }
    }
}
