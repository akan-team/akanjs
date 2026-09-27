package com.akanjs.plugins.screenorientation

import android.content.pm.ActivityInfo
import android.hardware.display.DisplayManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.view.Surface
import com.akanjs.runtime.AkanNativeCompat
import com.akanjs.runtime.AkanNativeErrorCode
import com.akanjs.runtime.AkanNativePluginContext
import com.akanjs.runtime.AkanNativeReply
import com.akanjs.runtime.AkanNativeVoidReply

/**
 * Activity.requestedOrientation for locks, the display rotation for the type.
 * - Changes come from DisplayManager.DisplayListener: onConfigurationChanged misses 180° turns
 *   (the configuration's orientation stays "landscape"), which is what capacitor-plugins/screen-orientation
 *   ScreenOrientationPlugin.java:45-51 compares, so it never reports them.
 * - The type depends on the display's natural orientation, as Surface rotations count from it:
 *   phones are naturally portrait (ROTATION_90 = landscape-primary, ScreenOrientation.java:45-56),
 *   many tablets landscape. The mapping follows what the system picks for the matching
 *   SCREEN_ORIENTATION_* lock (DisplayRotation: portrait on a landscape device is ROTATION_270),
 *   so lock("portrait-primary") then get() gives "portrait-primary" on both.
 * - "portrait", "landscape" and "any" use the USER_* variants: either way up by the sensor, but the
 *   user's rotation lock still wins, like everywhere else in the system.
 * - Android 16 (API 36) ignores orientation requests on displays 600 dp and wider for apps targeting
 *   it; lock() rejects UNSUPPORTED there instead of pretending (plugins.md §4.1).
 * Arguments arrive decoded and checked by the generated ScreenOrientationPluginSpec (PL-10).
 */
class ScreenOrientationPlugin(private val context: AkanNativePluginContext) : ScreenOrientationPluginSpec {
    private val displays: DisplayManager? = context.activity.getSystemService(DisplayManager::class.java)
    private val main = Handler(Looper.getMainLooper())
    private val events = ScreenOrientationEvents(context)
    private var listener: DisplayManager.DisplayListener? = null
    private var last: ScreenOrientationOrientationType? = null

    override fun get(reply: AkanNativeReply<ScreenOrientationOrientationState>) = reply.resolve(ScreenOrientationOrientationState(type = type()))

    override fun lock(args: ScreenOrientationLockArgs, reply: AkanNativeVoidReply) {
        val activity = context.activity
        val requested = when (args.orientation) {
            ScreenOrientationOrientationLock.ANY -> ActivityInfo.SCREEN_ORIENTATION_FULL_USER
            ScreenOrientationOrientationLock.PORTRAIT -> ActivityInfo.SCREEN_ORIENTATION_USER_PORTRAIT
            ScreenOrientationOrientationLock.LANDSCAPE -> ActivityInfo.SCREEN_ORIENTATION_USER_LANDSCAPE
            ScreenOrientationOrientationLock.PORTRAIT_PRIMARY -> ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
            ScreenOrientationOrientationLock.PORTRAIT_SECONDARY -> ActivityInfo.SCREEN_ORIENTATION_REVERSE_PORTRAIT
            ScreenOrientationOrientationLock.LANDSCAPE_PRIMARY -> ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
            ScreenOrientationOrientationLock.LANDSCAPE_SECONDARY -> ActivityInfo.SCREEN_ORIENTATION_REVERSE_LANDSCAPE
        }
        if (Build.VERSION.SDK_INT >= 36 && activity.resources.configuration.smallestScreenWidthDp >= 600) {
            return reply.reject(AkanNativeErrorCode.UNSUPPORTED, "Android ignores orientation locks on screens 600 dp and wider")
        }
        activity.requestedOrientation = requested
        reply.resolve()
    }

    override fun unlock(reply: AkanNativeVoidReply) {
        context.activity.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
        reply.resolve()
    }

    override fun startListening(event: String) {
        val dm = displays
        if (event != "change" || listener != null || dm == null) return
        last = type()
        val l = object : DisplayManager.DisplayListener {
            override fun onDisplayChanged(displayId: Int) {
                if (displayId != AkanNativeCompat.display(context.activity)?.displayId) return
                val next = type()
                if (next == last) return // also brightness and refresh rate changes land here
                last = next
                events.change(ScreenOrientationOrientationState(type = next))
            }

            override fun onDisplayAdded(displayId: Int) {}
            override fun onDisplayRemoved(displayId: Int) {}
        }
        dm.registerDisplayListener(l, main)
        listener = l
    }

    override fun stopListening(event: String) {
        if (event != "change") return
        listener?.let { displays?.unregisterDisplayListener(it) }
        listener = null
        last = null
    }

    override fun destroy() = stopListening("change")

    private fun type(): ScreenOrientationOrientationType {
        val display = AkanNativeCompat.display(context.activity) ?: return ScreenOrientationOrientationType.PORTRAIT_PRIMARY
        val rotation = display.rotation
        // Mode sizes are in the natural orientation, whatever the current rotation is.
        val naturalPortrait = display.mode.physicalWidth <= display.mode.physicalHeight
        return if (naturalPortrait) {
            when (rotation) {
                Surface.ROTATION_90 -> ScreenOrientationOrientationType.LANDSCAPE_PRIMARY
                Surface.ROTATION_180 -> ScreenOrientationOrientationType.PORTRAIT_SECONDARY
                Surface.ROTATION_270 -> ScreenOrientationOrientationType.LANDSCAPE_SECONDARY
                else -> ScreenOrientationOrientationType.PORTRAIT_PRIMARY
            }
        } else {
            when (rotation) {
                Surface.ROTATION_90 -> ScreenOrientationOrientationType.PORTRAIT_SECONDARY
                Surface.ROTATION_180 -> ScreenOrientationOrientationType.LANDSCAPE_SECONDARY
                Surface.ROTATION_270 -> ScreenOrientationOrientationType.PORTRAIT_PRIMARY
                else -> ScreenOrientationOrientationType.LANDSCAPE_PRIMARY
            }
        }
    }
}
