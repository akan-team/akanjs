package com.akanjs.plugins.splashscreen

import com.akanjs.runtime.AkanNativeErrorCode
import com.akanjs.runtime.AkanNativePluginContext
import com.akanjs.runtime.AkanNativeVoidReply

/**
 * Lets the system splash screen go (SH-6). The shell keeps it up with a pre-draw listener
 * (AkanNativeActivity.holdSplash) and also releases it after the first page load when splash.autoHide is on.
 * Arguments arrive decoded and checked by the generated SplashScreenPluginSpec (PL-10).
 */
class SplashScreenPlugin(private val context: AkanNativePluginContext) : SplashScreenPluginSpec {
    override fun hide(args: SplashScreenHideArgs, reply: AkanNativeVoidReply) {
        val fade = args.fadeOutDuration ?: 200.0
        if (fade < 0 || fade > 10_000) return reply.reject(AkanNativeErrorCode.INVALID_ARGS, "fadeOutDuration must be between 0 and 10000 ms")
        context.hideSplash(fade.toLong())
        reply.resolve()
    }
}
