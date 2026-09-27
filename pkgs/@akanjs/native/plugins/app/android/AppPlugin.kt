package com.akanjs.plugins.app

import com.akanjs.runtime.AkanNativeActivity
import com.akanjs.runtime.AkanNativeLinks
import com.akanjs.runtime.AkanNativePluginContext
import com.akanjs.runtime.AkanNativeReply
import com.akanjs.runtime.AkanNativeVoidReply

/**
 * App info, deep links (ACTION_VIEW intents, plugins.md S4) and the back button (S3).
 * - Links come from the shell's AkanNativeLinks (App scope): the launch URL is the process's and never
 *   changes; every link, the launch URL included, is delivered once as urlOpen, kept until the page
 *   listens (C2). react-native IntentModule / capacitor-plugins/app only take ACTION_VIEW intents too.
 * - backButton: while the page listens, the shell hands back gestures to us instead of going back
 *   in the WebView history (capacitor-plugins/app AppPlugin.java does the same with AndroidX).
 * The result and event types come from the generated AppPluginSpec (PL-10).
 */
class AppPlugin(private val context: AkanNativePluginContext) : AppPluginSpec {
    private val events = AppEvents(context)
    private var linksListening = false

    override fun getInfo(reply: AkanNativeReply<AppInfoResult>) {
        val activity = context.activity
        val info = activity.packageManager.getPackageInfo(activity.packageName, 0)
        reply.resolve(
            AppInfoResult(
                id = activity.packageName,
                name = activity.applicationInfo.loadLabel(activity.packageManager).toString(),
                version = info.versionName ?: "",
                build = info.longVersionCode.toDouble(),
            ),
        )
    }

    override fun getLaunchUrl(reply: AkanNativeReply<AppGetLaunchUrlResult>) = reply.resolve(AppGetLaunchUrlResult(url = AkanNativeLinks.launchUrl))

    override fun exit(reply: AkanNativeVoidReply) {
        reply.resolve()
        context.activity.finishAndRemoveTask()
    }

    override fun minimize(reply: AkanNativeVoidReply) {
        context.activity.moveTaskToBack(true)
        reply.resolve()
    }

    override fun startListening(event: String) {
        when (event) {
            "urlOpen" -> {
                linksListening = true
                AkanNativeLinks.listen(this, context.activity) { url ->
                    if (linksListening) events.urlOpen(AppUrlOpenEvent(url = url))
                    linksListening
                }
            }
            "backButton" -> context.setBackInterceptor {
                val canGoBack = (context.activity as? AkanNativeActivity)?.canGoBack() ?: false
                events.backButton(AppBackButtonEvent(canGoBack = canGoBack))
            }
        }
    }

    override fun stopListening(event: String) {
        when (event) {
            "urlOpen" -> {
                linksListening = false
                AkanNativeLinks.unlisten(this)
            }
            "backButton" -> context.setBackInterceptor(null)
        }
    }
}
