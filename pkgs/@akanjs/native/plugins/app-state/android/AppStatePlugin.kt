package com.akanjs.plugins.appstate

import android.app.Activity
import android.app.Application
import android.content.ComponentCallbacks2
import android.content.res.Configuration
import android.os.Bundle
import com.akanjs.runtime.AkanNativePluginContext
import com.akanjs.runtime.AkanNativeReply

/**
 * Activity lifecycle → active / inactive / background.
 * react-native AppStateModule maps pause straight to background; here a paused but
 * still visible activity (split screen, system dialog) is "inactive" and only onStop is "background".
 * The result and event types come from the generated AppStatePluginSpec (PL-10).
 */
class AppStatePlugin(private val context: AkanNativePluginContext) : AppStatePluginSpec {
    private var state = AppStateValue.ACTIVE // the shell creates plugins while the activity is being resumed
    private var listening = false
    private var memoryListening = false
    private val events = AppStateEvents(context)

    // Android 14 stopped sending the RUNNING_* levels to a foreground app; below it they are the only early signal.
    @Suppress("DEPRECATION")
    private val memoryCallbacks = object : ComponentCallbacks2 {
        override fun onTrimMemory(level: Int) {
            val warning = when {
                level >= ComponentCallbacks2.TRIM_MEMORY_BACKGROUND -> AppStateMemoryWarningLevel.CRITICAL
                level == ComponentCallbacks2.TRIM_MEMORY_RUNNING_CRITICAL -> AppStateMemoryWarningLevel.CRITICAL
                level == ComponentCallbacks2.TRIM_MEMORY_RUNNING_LOW -> AppStateMemoryWarningLevel.MODERATE
                else -> return
            }
            if (memoryListening) events.memoryWarning(AppStateMemoryWarningEvent(level = warning))
        }

        override fun onLowMemory() {
            if (memoryListening) events.memoryWarning(AppStateMemoryWarningEvent(level = AppStateMemoryWarningLevel.CRITICAL))
        }

        override fun onConfigurationChanged(newConfig: Configuration) {}
    }

    private val callbacks = object : Application.ActivityLifecycleCallbacks {
        override fun onActivityResumed(activity: Activity) = update(AppStateValue.ACTIVE)
        override fun onActivityPaused(activity: Activity) = update(AppStateValue.INACTIVE)
        override fun onActivityStarted(activity: Activity) = update(AppStateValue.INACTIVE)
        override fun onActivityStopped(activity: Activity) = update(AppStateValue.BACKGROUND)
        override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) {}
        override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) {}
        override fun onActivityDestroyed(activity: Activity) {}
    }

    init {
        // Activity-scoped registration (API 29+): only our activity's transitions arrive.
        context.activity.registerActivityLifecycleCallbacks(callbacks)
    }

    private fun update(next: AppStateValue) {
        if (next == state) return
        state = next
        if (listening) events.change(AppStateChangeEvent(state = next))
    }

    override fun getState(reply: AkanNativeReply<AppStateGetStateResult>) = reply.resolve(AppStateGetStateResult(state = state))

    override fun startListening(event: String) {
        when (event) {
            "change" -> listening = true
            "memoryWarning" -> if (!memoryListening) {
                memoryListening = true
                context.activity.registerComponentCallbacks(memoryCallbacks)
            }
        }
    }

    override fun stopListening(event: String) {
        when (event) {
            "change" -> listening = false
            "memoryWarning" -> if (memoryListening) {
                memoryListening = false
                context.activity.unregisterComponentCallbacks(memoryCallbacks)
            }
        }
    }

    override fun destroy() {
        context.activity.unregisterActivityLifecycleCallbacks(callbacks)
        if (memoryListening) context.activity.unregisterComponentCallbacks(memoryCallbacks)
    }
}
