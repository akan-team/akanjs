package com.akanjs.plugins.browser

import android.app.Activity
import android.app.Application
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import com.akanjs.runtime.AkanNativeErrorCode
import com.akanjs.runtime.AkanNativePluginContext
import com.akanjs.runtime.AkanNativeVoidReply

/**
 * Custom Tabs without androidx.browser (plugins.md §2 AndroidX table): an ACTION_VIEW intent with
 * the extras CustomTabsIntent.Builder would add.
 * - EXTRA_SESSION with a null binder is what makes the browser open a Custom Tab instead of a
 *   normal tab; plus the toolbar color, share button on and the app as referrer, as
 *   capacitor-plugins/browser/android/.../Browser.java:113-134 sets them.
 * - The package is picked like CustomTabsClient.getPackageName: the default browser if it has a
 *   Custom Tabs service, else the first one that has. Both lookups need the <queries> in
 *   native-plugin.json (Android 11 package visibility; Capacitor's manifest has the same).
 *   No Custom Tabs browser: a plain browser in its own task, which close() cannot close.
 * - close(): Custom Tabs have no close API. Capacitor restarts its singleTask trampoline
 *   (BrowserControllerActivity.java:49-55), which clears the tab above it. Since Android 15 that
 *   start is a background activity launch and is blocked for apps targeting 35+ while the tab
 *   covers the app (verified: "Background activity launch blocked", BAL_BLOCK). finishActivity(requestCode)
 *   is not a launch and closes the tab (verified), so the tab is started with this plugin's own
 *   request code: AkanNativePluginContext.startActivityForResult does not expose the one it picks.
 * - finished: the shell activity resumes, which in this task only happens once the tab above it is
 *   gone (Done, back, or the launcher icon). The result of the tab would say the same, but it goes
 *   to the shell's result map only for requests started through the context. Capacitor reports a
 *   minimized (picture-in-picture) tab as finished on Android < 14 (Browser.java:190-200); here
 *   that should happen on every version, since the app is back in front (not verified).
 * - open() needs the app in front: a page timer calling it from the background would be a blocked
 *   launch as well (PERMISSION_DENIED), and it resolves once the tab covers the app.
 * Arguments arrive decoded and type-checked by the generated BrowserPluginSpec (PL-10).
 */
class BrowserPlugin(private val context: AkanNativePluginContext) : BrowserPluginSpec {
    private enum class State { NONE, OPENING, SHOWING }

    private val main = Handler(Looper.getMainLooper())
    private var state = State.NONE
    private var customTab = false
    private var resumed = false
    private val events = BrowserEvents(context)
    private var opening: AkanNativeVoidReply? = null
    private var closing: AkanNativeVoidReply? = null

    private val openTimeout = Runnable {
        if (state != State.OPENING) return@Runnable
        state = State.NONE
        opening?.reject(AkanNativeErrorCode.INTERNAL, "the browser did not open")
        opening = null
    }
    private val closeTimeout = Runnable {
        closing?.reject(AkanNativeErrorCode.INTERNAL, "the browser did not close")
        closing = null
    }

    private val lifecycle = object : Application.ActivityLifecycleCallbacks {
        override fun onActivityPaused(activity: Activity) {
            resumed = false
            if (state != State.OPENING) return
            state = State.SHOWING
            main.removeCallbacks(openTimeout)
            opening?.resolve()
            opening = null
        }

        override fun onActivityResumed(activity: Activity) {
            resumed = true
            if (state != State.SHOWING) return
            state = State.NONE
            main.removeCallbacks(closeTimeout)
            val reply = closing
            closing = null
            if (reply != null) reply.resolve() else events.finished(BrowserFinishedEvent())
        }

        override fun onActivityStarted(activity: Activity) {}
        override fun onActivityStopped(activity: Activity) {}
        override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) {}
        override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) {}
        override fun onActivityDestroyed(activity: Activity) {}
    }

    init {
        // Created in the shell's onCreate: the first onResume is still to come.
        context.activity.registerActivityLifecycleCallbacks(lifecycle)
    }

    override fun open(args: BrowserOpenArgs, reply: AkanNativeVoidReply) {
        val uri = checkedUri(args.url, reply) ?: return
        val color = args.toolbarColor?.let { hex ->
            if (!COLOR.matches(hex)) return reply.reject(AkanNativeErrorCode.INVALID_ARGS, "toolbarColor must look like \"#1a2b3c\"")
            Color.parseColor(hex)
        }
        if (state != State.NONE) return reply.reject(AkanNativeErrorCode.INVALID_ARGS, "a browser is already open; close() it first")
        if (!resumed) return reply.reject(AkanNativeErrorCode.PERMISSION_DENIED, "the browser can only be opened while the app is in front")
        val activity = context.activity
        val provider = customTabsPackage(activity)
        try {
            if (provider != null) {
                val intent = Intent(Intent.ACTION_VIEW, uri).setPackage(provider)
                intent.putExtras(Bundle().apply { putBinder(EXTRA_SESSION, null) })
                intent.putExtra(EXTRA_SHARE_STATE, SHARE_STATE_ON)
                intent.putExtra(Intent.EXTRA_REFERRER, Uri.parse("android-app://${activity.packageName}"))
                if (color != null) intent.putExtra(EXTRA_TOOLBAR_COLOR, color)
                activity.startActivityForResult(intent, REQUEST_TAB)
            } else {
                activity.startActivity(Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            }
        } catch (e: ActivityNotFoundException) {
            return reply.reject(AkanNativeErrorCode.NOT_FOUND, "no browser can open $uri")
        } catch (e: SecurityException) {
            return reply.reject(AkanNativeErrorCode.PERMISSION_DENIED, e.message ?: "not allowed to open $uri")
        }
        customTab = provider != null
        state = State.OPENING
        opening = reply
        main.postDelayed(openTimeout, OPEN_TIMEOUT_MS)
    }

    override fun close(reply: AkanNativeVoidReply) {
        if (state == State.NONE) return reply.resolve()
        if (!customTab) return reply.reject(AkanNativeErrorCode.UNSUPPORTED, "the browser runs as its own app (no Custom Tabs support) and cannot be closed")
        closing?.resolve() // an earlier close() still waiting: the same tab
        main.removeCallbacks(closeTimeout)
        closing = reply
        context.activity.finishActivity(REQUEST_TAB)
        main.postDelayed(closeTimeout, CLOSE_TIMEOUT_MS)
    }

    override fun destroy() {
        main.removeCallbacks(openTimeout)
        main.removeCallbacks(closeTimeout)
        context.activity.unregisterActivityLifecycleCallbacks(lifecycle)
    }

    private fun checkedUri(text: String, reply: AkanNativeVoidReply): Uri? {
        val uri = if (text.isEmpty()) null else Uri.parse(text).normalizeScheme()
        val problem = when {
            uri == null || !uri.isAbsolute -> "url must be an absolute URL"
            uri.scheme != "http" && uri.scheme != "https" -> "only http and https URLs open in the in-app browser (got ${uri.scheme}:)"
            uri.host.isNullOrEmpty() -> "$text has no host"
            else -> return uri
        }
        reply.reject(AkanNativeErrorCode.INVALID_ARGS, problem)
        return null
    }

    companion object {
        const val ACTION_CUSTOM_TABS_SERVICE = "android.support.customtabs.action.CustomTabsService"
        const val EXTRA_SESSION = "android.support.customtabs.extra.SESSION"
        const val EXTRA_TOOLBAR_COLOR = "android.support.customtabs.extra.TOOLBAR_COLOR"
        const val EXTRA_SHARE_STATE = "androidx.browser.customtabs.extra.SHARE_STATE"
        const val SHARE_STATE_ON = 1
        /** Far from the shell's own request codes, which count up from 1000. */
        private const val REQUEST_TAB = 0x6F6D0B01
        private const val OPEN_TIMEOUT_MS = 3000L
        private const val CLOSE_TIMEOUT_MS = 3000L
        private val COLOR = Regex("^#[0-9a-fA-F]{6}$")

        /** The browser to open Custom Tabs in, or null when none supports them. */
        fun customTabsPackage(activity: Activity): String? {
            val pm = activity.packageManager
            val providers = pm.queryIntentServices(Intent(ACTION_CUSTOM_TABS_SERVICE), 0).mapNotNull { it.serviceInfo?.packageName }
            if (providers.isEmpty()) return null
            val browse = Intent(Intent.ACTION_VIEW, Uri.parse("https://")).addCategory(Intent.CATEGORY_BROWSABLE)
            val default = pm.resolveActivity(browse, PackageManager.MATCH_DEFAULT_ONLY)?.activityInfo?.packageName
            return if (default != null && default in providers) default else providers.first()
        }
    }
}
