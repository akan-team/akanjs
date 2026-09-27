package com.akanjs.plugins.appstate

import android.app.Activity
import android.app.Application
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
    private val events = AppStateEvents(context)

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
        if (event == "change") listening = true
    }

    override fun stopListening(event: String) {
        if (event == "change") listening = false
    }

    override fun destroy() {
        context.activity.unregisterActivityLifecycleCallbacks(callbacks)
    }
}
