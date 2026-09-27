package com.akanjs.plugins.accessibility

import android.content.res.Configuration
import android.database.ContentObserver
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.accessibility.AccessibilityManager
import com.akanjs.runtime.AkanNativePluginContext
import com.akanjs.runtime.AkanNativeReply

/**
 * Screen reader, reduced motion and font scale, after
 * react-native/packages/react-native/ReactAndroid/.../accessibilityinfo/AccessibilityInfoModule.kt:
 * - screenReader: touch exploration (TalkBack and similar services), :94 and
 *   capacitor-plugins/screen-reader/android/.../ScreenReader.java:38-40, watched with a
 *   TouchExplorationStateChangeListener (:32-37).
 * - reduceMotion: an animation scale of 0. RN reads TRANSITION_ANIMATION_SCALE and parses it with
 *   ',' as a possible decimal separator (:101-121); "Remove animations" sets it to "0", the
 *   developer option to "0.0". ANIMATOR_DURATION_SCALE at 0 counts as well: the framework then runs
 *   no animators (ValueAnimator.areAnimatorsEnabled() is false), the other half of "Remove
 *   animations". Both are watched with a ContentObserver (:49-61).
 * - fontScale: Configuration.fontScale, changed through onConfigurationChanged (the shell handles
 *   fontScale without recreating the activity). Rounded to 3 places: the Float 1.15 would reach
 *   JSON as 1.149999976; capacitor-plugins/text-zoom/android/.../TextZoom.java:28-30 goes through
 *   Float.toString for the same reason.
 * - RN unregisters in onHostPause and compares again on resume (:236-263); here the sources run
 *   while the page listens, so a change made in Settings arrives when the app comes back.
 * announce runs in the page (a live region, src/announce.ts): View.announceForAccessibility and
 * AccessibilityEvent.TYPE_ANNOUNCEMENT, which RN uses (:282-292), are deprecated in API 36.
 * lynx/.../LynxAccessibilityModule.java:61-65 sets the view's accessibility pane title instead;
 * that relabels the WebView and does not repeat an identical message, so it is not used.
 * The state type comes from the generated AccessibilityPluginSpec (PL-10).
 */
class AccessibilityPlugin(private val context: AkanNativePluginContext) : AccessibilityPluginSpec {
    private val manager: AccessibilityManager? = context.activity.getSystemService(AccessibilityManager::class.java)
    private val resolver = context.activity.contentResolver
    private val events = AccessibilityEvents(context)
    private var listening = false
    private var last: AccessibilityState? = null

    private val touchExploration = AccessibilityManager.TouchExplorationStateChangeListener { report() }
    private val scales = object : ContentObserver(Handler(Looper.getMainLooper())) {
        override fun onChange(selfChange: Boolean, uri: Uri?) = report()
    }

    override fun getState(reply: AkanNativeReply<AccessibilityState>) = reply.resolve(state())

    override fun onConfigurationChanged(config: Configuration) = report()

    override fun startListening(event: String) {
        if (event != "change" || listening) return
        listening = true
        last = state()
        manager?.addTouchExplorationStateChangeListener(touchExploration)
        for (name in SCALES) resolver.registerContentObserver(Settings.Global.getUriFor(name), false, scales)
    }

    override fun stopListening(event: String) {
        if (event == "change") stop()
    }

    override fun destroy() = stop()

    private fun stop() {
        if (!listening) return
        listening = false
        last = null
        manager?.removeTouchExplorationStateChangeListener(touchExploration)
        resolver.unregisterContentObserver(scales)
    }

    private fun report() {
        if (!listening) return
        val next = state()
        if (next == last) return
        last = next
        events.change(next)
    }

    private fun state() = AccessibilityState(
        screenReader = manager?.isTouchExplorationEnabled == true,
        reduceMotion = SCALES.any { scaleIsZero(it) },
        fontScale = Math.round(context.activity.resources.configuration.fontScale * 1000.0) / 1000.0,
    )

    private fun scaleIsZero(name: String): Boolean {
        val raw = Settings.Global.getString(resolver, name) ?: return false
        return raw.replace(',', '.').toFloatOrNull() == 0f
    }

    private companion object {
        val SCALES = listOf(Settings.Global.TRANSITION_ANIMATION_SCALE, Settings.Global.ANIMATOR_DURATION_SCALE)
    }
}
