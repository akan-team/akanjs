package com.akanjs.plugins.authsession

import android.app.Activity
import android.app.Application
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import com.akanjs.runtime.AkanNativeErrorCode
import com.akanjs.runtime.AkanNativePluginContext
import com.akanjs.runtime.AkanNativeReply

/**
 * Custom Tab + the app's deep link, the AppAuth pattern (plugins.md §4.5, S4).
 * - The provider redirects to <callbackScheme>://…; the app's VIEW intent-filter for the scheme
 *   (akan-native.config.ts deepLinks.schemes) brings the singleTask shell activity back, which clears the
 *   tab above it, and the URL arrives through onNewIntent. The scheme is checked against the app's
 *   own intent filters first, so a missing entry fails at once instead of never calling back.
 *   ACTION_VIEW only, matching plugins/app; tauri-plugins-workspace/plugins/deep-link/android/.../
 *   DeepLinkPlugin.kt:51-53 also accepts ChromeOS's org.chromium.arc.intent.action.VIEW.
 * - Cancel: the tab is started for a result, which arrives when the tab is gone: after the
 *   redirect (the deep link comes with it, in either order) or when the user closed the tab or
 *   returned to the app another way. No deep link within GRACE_MS of that → CANCELLED.
 * - No Custom Tabs browser: the plain browser in its own task; returning to the app (onResume)
 *   without the redirect → CANCELLED after GRACE_MS.
 * - Custom Tab extras as in the browser plugin (EXTRA_SESSION null binder makes it a Custom Tab),
 *   without androidx.browser; the <queries> in native-plugin.json make the browsers visible.
 * - start() needs the app in front (PERMISSION_DENIED otherwise): Android 15+ blocks activity
 *   starts from the background for apps targeting 35+ (seen in the browser plugin's close()).
 * - A new start() rejects the running one with CANCELLED. If the process dies while the tab is up,
 *   the redirect starts a fresh app: the URL is then app.getLaunchUrl().
 * Arguments arrive decoded and type-checked by the generated AuthSessionPluginSpec (PL-10).
 */
class AuthSessionPlugin(private val context: AkanNativePluginContext) : AuthSessionPluginSpec {
    private val main = Handler(Looper.getMainLooper())
    private var pending: AkanNativeReply<AuthSessionStartResult>? = null
    private var scheme: String? = null
    /** The start URL's OAuth `state`: only a callback with the same one answers (src/args.ts isAnswer). */
    private var state: String? = null
    private var left = false // the app went to the background since start() (plain browser)
    private var plainBrowser = false
    private var resumed = false
    private val cancel = Runnable { finish(null) }

    private val lifecycle = object : Application.ActivityLifecycleCallbacks {
        override fun onActivityPaused(activity: Activity) {
            resumed = false
            left = true
        }

        override fun onActivityResumed(activity: Activity) {
            resumed = true
            if (plainBrowser && left && pending != null) main.postDelayed(cancel, GRACE_MS)
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

    override fun start(args: AuthSessionStartArgs, reply: AkanNativeReply<AuthSessionStartResult>) {
        val activity = context.activity
        val uri = if (args.url.isEmpty()) null else Uri.parse(args.url).normalizeScheme()
        if (uri == null || (uri.scheme != "http" && uri.scheme != "https") || uri.host.isNullOrEmpty()) {
            return reply.reject(AkanNativeErrorCode.INVALID_ARGS, "the sign-in page must be an http or https URL")
        }
        val callbackScheme = args.callbackScheme
        if (!SCHEME.matches(callbackScheme) || callbackScheme in RESERVED) {
            return reply.reject(AkanNativeErrorCode.INVALID_ARGS, "callbackScheme must be a lowercase custom scheme such as \"myapp\"")
        }
        val callback = Intent(Intent.ACTION_VIEW, Uri.parse("$callbackScheme://callback"))
            .addCategory(Intent.CATEGORY_BROWSABLE)
            .setPackage(activity.packageName)
        if (activity.packageManager.queryIntentActivities(callback, 0).isEmpty()) {
            return reply.reject(AkanNativeErrorCode.INVALID_ARGS, "the app does not handle $callbackScheme: links; add it to deepLinks.schemes in akan-native.config.ts")
        }
        // From the background the start would be a blocked background activity launch (Android 15+).
        if (!resumed) return reply.reject(AkanNativeErrorCode.PERMISSION_DENIED, "sign-in can only start while the app is in front")

        pending?.reject(AkanNativeErrorCode.CANCELLED, "replaced by a newer start()")
        main.removeCallbacks(cancel)
        pending = reply
        scheme = callbackScheme
        state = uri.getQueryParameter("state")
        left = false

        val provider = customTabsPackage(activity)
        plainBrowser = provider == null
        try {
            if (provider != null) {
                val intent = Intent(Intent.ACTION_VIEW, uri).setPackage(provider)
                intent.putExtras(Bundle().apply { putBinder(EXTRA_SESSION, null) })
                intent.putExtra(Intent.EXTRA_REFERRER, Uri.parse("android-app://${activity.packageName}"))
                context.startActivityForResult("auth", intent) { _, _ ->
                    // The tab is gone; the redirect's onNewIntent may come just before or after.
                    if (pending === reply) main.postDelayed(cancel, GRACE_MS)
                }
            } else {
                activity.startActivity(Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            }
        } catch (e: RuntimeException) { // ActivityNotFoundException, SecurityException
            finish(null, AkanNativeErrorCode.NOT_FOUND, "no browser can show the sign-in page: ${e.message}")
        }
    }

    /** The redirect that answers the running start(), or null. */
    private fun answer(intent: Intent): String? {
        val expected = scheme ?: return null
        if (pending == null || intent.action != Intent.ACTION_VIEW) return null
        val url = intent.dataString ?: return null
        if (!url.substringBefore(':').equals(expected, ignoreCase = true)) return null
        // Another app can send a link of the scheme too: with a state, it must be ours.
        val want = state
        if (want != null && stateOf(Uri.parse(url)) != want) return null
        return url
    }

    /** The answer ends start() and does not also reach app.urlOpen (R10), as on iOS. */
    override fun claimsLink(intent: Intent): Boolean = answer(intent) != null

    override fun onNewIntent(intent: Intent) {
        answer(intent)?.let { finish(it) }
    }

    /** `state` from the query, or from the fragment (implicit flows). */
    private fun stateOf(uri: Uri): String? =
        uri.getQueryParameter("state") ?: uri.fragment?.let { Uri.parse("x://fragment?$it").getQueryParameter("state") }

    override fun onRestoredActivityResult(key: String, resultCode: Int, data: Intent?) {}

    override fun destroy() {
        main.removeCallbacks(cancel)
        context.activity.unregisterActivityLifecycleCallbacks(lifecycle)
    }

    private fun finish(url: String?, code: String = AkanNativeErrorCode.CANCELLED, message: String = "the sign-in page was closed without a callback") {
        val reply = pending ?: return
        pending = null
        scheme = null
        state = null
        main.removeCallbacks(cancel)
        if (url != null) reply.resolve(AuthSessionStartResult(url = url)) else reply.reject(code, message)
    }

    private companion object {
        const val ACTION_CUSTOM_TABS_SERVICE = "android.support.customtabs.action.CustomTabsService"
        const val EXTRA_SESSION = "android.support.customtabs.extra.SESSION"
        const val GRACE_MS = 1000L
        val SCHEME = Regex("^[a-z][a-z0-9+.-]*$")
        val RESERVED = setOf("http", "https", "file", "app", "javascript", "data", "about", "blob")

        /** Like CustomTabsClient.getPackageName: the default browser if it has a Custom Tabs service, else the first that has. */
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
