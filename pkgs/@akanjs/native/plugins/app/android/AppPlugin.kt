package com.akanjs.plugins.app

import android.content.ComponentName
import android.content.Intent
import android.os.Handler
import android.os.Looper
import com.akanjs.runtime.AkanNativeActivity
import com.akanjs.runtime.AkanNativeBackProgress
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
 *   setBackEnabled(false) gives back to the system while the page has nothing to go back to, and
 *   backProgress follows the swipe (API 34+) of a back the page will take.
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

    override fun relaunch(reply: AkanNativeVoidReply) {
        val activity = context.activity
        reply.resolve()
        // The system starts the new task once this process is gone, in a new one (the answer reaches the page first).
        Handler(Looper.getMainLooper()).postDelayed({
            activity.startActivity(Intent.makeRestartActivityTask(ComponentName(activity, activity.javaClass)))
            Runtime.getRuntime().exit(0)
        }, 100)
    }

    override fun minimize(reply: AkanNativeVoidReply) {
        context.activity.moveTaskToBack(true)
        reply.resolve()
    }

    override fun setBackEnabled(args: AppSetBackEnabledArgs, reply: AkanNativeVoidReply) {
        context.setBackEnabled(args.enabled)
        reply.resolve()
    }

    private fun backProgressEvent(progress: AkanNativeBackProgress) = AppBackProgressEvent(
        phase = when (progress.phase) {
            AkanNativeBackProgress.Phase.STARTED -> AppBackProgressPhase.STARTED
            AkanNativeBackProgress.Phase.PROGRESSED -> AppBackProgressPhase.PROGRESSED
            AkanNativeBackProgress.Phase.CANCELLED -> AppBackProgressPhase.CANCELLED
        },
        progress = progress.progress.toDouble(),
        swipeEdge = if (progress.fromRightEdge) AppBackProgressEventSwipeEdge.RIGHT else AppBackProgressEventSwipeEdge.LEFT,
    )

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
            "backProgress" -> context.setBackProgressListener { progress -> events.backProgress(backProgressEvent(progress)) }
        }
    }

    override fun stopListening(event: String) {
        when (event) {
            "urlOpen" -> {
                linksListening = false
                AkanNativeLinks.unlisten(this)
            }
            "backButton" -> context.setBackInterceptor(null)
            "backProgress" -> context.setBackProgressListener(null)
        }
    }
}
