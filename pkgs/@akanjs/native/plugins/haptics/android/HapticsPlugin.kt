package com.akanjs.plugins.haptics

import android.app.Activity
import android.content.Context
import android.media.AudioAttributes
import android.os.Build
import android.os.VibrationAttributes
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.provider.Settings
import com.akanjs.runtime.AkanNativeErrorCode
import com.akanjs.runtime.AkanNativePluginContext
import com.akanjs.runtime.AkanNativeVoidReply

/**
 * VibratorManager.defaultVibrator (API 31; the VIBRATOR_SERVICE vibrator below) with the VIBRATE
 * permission (normal, granted at install).
 * - impact / notification: composition primitives (API 30) where the vibrator supports them, else
 *   predefined effects, which fall back to a generic buzz on their own. Both are tuned per device.
 *   tauri-plugins-workspace/plugins/haptics/android/src/main/java/patterns (Impact.kt, Notification.kt)
 *   plays amplitude waveforms instead, which turn into plain buzzes on vibrators without amplitude
 *   control; its notification waveforms stay as the fallback here.
 * - selection: EFFECT_TICK, the effect the framework uses for picker and clock ticks.
 * - UI feedback is played with USAGE_TOUCH, so the user's "touch feedback" setting applies like
 *   System Haptics does on iOS. Below API 33 the service does not apply that setting, so the plugin
 *   reads it (Settings.System.HAPTIC_FEEDBACK_ENABLED) and plays with sonification audio
 *   attributes, which API 30+ maps to USAGE_TOUCH. vibrate() is a plain one-shot, like
 *   react-native VibrationModule.kt:26-34.
 * - API 29 has no composition primitives (30; PRIMITIVE_LOW_TICK 31): predefined effects there.
 * A device without a vibrator resolves and does nothing, like iOS without a Taptic Engine.
 * Arguments arrive decoded and checked by the generated HapticsPluginSpec (PL-10).
 */
class HapticsPlugin(context: AkanNativePluginContext) : HapticsPluginSpec {
    private val activity = context.activity
    private val vibrator: Vibrator? =
        if (Build.VERSION.SDK_INT >= 31) Api31.defaultVibrator(activity) else @Suppress("DEPRECATION") activity.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator

    private class Step(val primitive: Int, val scale: Float, val delay: Int = 0)

    override fun impact(args: HapticsImpactArgs, reply: AkanNativeVoidReply) {
        val effect = when (args.style ?: HapticsImpactStyle.MEDIUM) {
            HapticsImpactStyle.LIGHT -> compose(Step(PRIMITIVE_CLICK, 0.4f)) ?: VibrationEffect.createPredefined(VibrationEffect.EFFECT_TICK)
            HapticsImpactStyle.MEDIUM -> compose(Step(PRIMITIVE_CLICK, 0.7f)) ?: VibrationEffect.createPredefined(VibrationEffect.EFFECT_CLICK)
            HapticsImpactStyle.HEAVY -> compose(Step(PRIMITIVE_CLICK, 1f)) ?: VibrationEffect.createPredefined(VibrationEffect.EFFECT_HEAVY_CLICK)
            HapticsImpactStyle.SOFT -> compose(Step(PRIMITIVE_LOW_TICK, 1f)) ?: VibrationEffect.createPredefined(VibrationEffect.EFFECT_TICK)
            HapticsImpactStyle.RIGID -> compose(Step(PRIMITIVE_TICK, 1f)) ?: VibrationEffect.createPredefined(VibrationEffect.EFFECT_CLICK)
        }
        play(reply, effect, touch = true)
    }

    override fun notification(args: HapticsNotificationArgs, reply: AkanNativeVoidReply) {
        val effect = when (args.type ?: HapticsNotificationType.SUCCESS) {
            HapticsNotificationType.SUCCESS -> compose(Step(PRIMITIVE_CLICK, 0.5f), Step(PRIMITIVE_CLICK, 1f, 100))
                ?: waveform(longArrayOf(0, 40, 100, 40), intArrayOf(0, 50, 0, 60))
            HapticsNotificationType.WARNING -> compose(Step(PRIMITIVE_CLICK, 1f), Step(PRIMITIVE_CLICK, 0.5f, 150))
                ?: waveform(longArrayOf(0, 40, 120, 60), intArrayOf(0, 40, 0, 60))
            HapticsNotificationType.ERROR -> compose(Step(PRIMITIVE_CLICK, 1f), Step(PRIMITIVE_CLICK, 0.8f, 100), Step(PRIMITIVE_CLICK, 1f, 100))
                ?: waveform(longArrayOf(0, 60, 100, 40, 80, 50), intArrayOf(0, 50, 0, 40, 0, 50))
        }
        play(reply, effect, touch = true)
    }

    override fun selection(reply: AkanNativeVoidReply) = play(reply, VibrationEffect.createPredefined(VibrationEffect.EFFECT_TICK), touch = true)

    override fun vibrate(args: HapticsVibrateArgs, reply: AkanNativeVoidReply) {
        val value = args.duration ?: 300.0
        if (value < 1 || value > 10000) return reply.reject(AkanNativeErrorCode.INVALID_ARGS, "duration must be a number of milliseconds between 1 and 10000")
        play(reply, VibrationEffect.createOneShot(Math.round(value), VibrationEffect.DEFAULT_AMPLITUDE), touch = false)
    }

    /** Primitives in sequence, or null when this Android or the vibrator cannot play every one of them. */
    private fun compose(vararg steps: Step): VibrationEffect? {
        val v = vibrator ?: return null
        if (Build.VERSION.SDK_INT < 30) return null
        if (Build.VERSION.SDK_INT < 31 && steps.any { it.primitive == PRIMITIVE_LOW_TICK }) return null
        return Api30.compose(v, steps)
    }

    private fun waveform(timings: LongArray, amplitudes: IntArray): VibrationEffect =
        VibrationEffect.createWaveform(timings, amplitudes, -1)

    /** Plays [effect]; [touch] feedback follows the user's touch feedback setting. */
    @Suppress("DEPRECATION")
    private fun play(reply: AkanNativeVoidReply, effect: VibrationEffect, touch: Boolean) {
        val v = vibrator
        if (v == null || !v.hasVibrator()) return reply.resolve()
        try {
            when {
                !touch -> v.vibrate(effect)
                Build.VERSION.SDK_INT >= 33 -> Api33.vibrateTouch(v, effect)
                Settings.System.getInt(activity.contentResolver, Settings.System.HAPTIC_FEEDBACK_ENABLED, 1) != 0 -> v.vibrate(effect, SONIFICATION)
            }
            reply.resolve()
        } catch (e: SecurityException) {
            reply.reject(AkanNativeErrorCode.PERMISSION_DENIED, "android.permission.VIBRATE is missing from the app manifest")
        }
    }

    private object Api30 {
        fun compose(v: Vibrator, steps: Array<out Step>): VibrationEffect? {
            if (!v.areAllPrimitivesSupported(*steps.map { it.primitive }.toIntArray())) return null
            val composition = VibrationEffect.startComposition()
            for (step in steps) composition.addPrimitive(step.primitive, step.scale, step.delay)
            return composition.compose()
        }
    }

    private object Api31 {
        fun defaultVibrator(activity: Activity): Vibrator? = activity.getSystemService(VibratorManager::class.java)?.defaultVibrator
    }

    private object Api33 {
        fun vibrateTouch(v: Vibrator, effect: VibrationEffect) = v.vibrate(effect, VibrationAttributes.createForUsage(VibrationAttributes.USAGE_TOUCH))
    }

    private companion object {
        /** The pre-33 stand-in for USAGE_TOUCH (VibrationAttributes.Builder(AudioAttributes) maps them). */
        val SONIFICATION: AudioAttributes = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()
        const val PRIMITIVE_CLICK = VibrationEffect.Composition.PRIMITIVE_CLICK
        const val PRIMITIVE_TICK = VibrationEffect.Composition.PRIMITIVE_TICK
        const val PRIMITIVE_LOW_TICK = VibrationEffect.Composition.PRIMITIVE_LOW_TICK
    }
}
