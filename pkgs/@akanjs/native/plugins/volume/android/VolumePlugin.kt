package com.akanjs.plugins.volume

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioManager
import com.akanjs.runtime.AkanNativeErrorCode
import com.akanjs.runtime.AkanNativePluginContext
import com.akanjs.runtime.AkanNativeReply
import kotlin.math.roundToInt

/**
 * The media volume (STREAM_MUSIC), what the volume keys move while the app plays: the level and mute the
 * desktop reports for the default output.
 * - A volume change unmutes a muted stream (AudioService), so setVolume mutes it again: the desktop keeps
 *   the mute apart from the level.
 * - VOLUME_CHANGED_ACTION and STREAM_MUTE_CHANGED_ACTION are the system's own broadcasts, public only as
 *   strings. A receiver registered with RECEIVER_NOT_EXPORTED still gets them (they come from the system).
 * - A fixed volume (isVolumeFixed: a TV box whose HDMI sink sets it) reads, but setVolume and setMuted
 *   answer UNSUPPORTED.
 */
class VolumePlugin(private val context: AkanNativePluginContext) : VolumePluginSpec {
    private val audio: AudioManager? = context.activity.getSystemService(AudioManager::class.java)
    private val events = VolumeEvents(context)
    private var receiver: BroadcastReceiver? = null
    private var last: VolumeState? = null

    override fun getVolume(reply: AkanNativeReply<VolumeState>) {
        val am = audio ?: return reply.reject(AkanNativeErrorCode.UNSUPPORTED, "this device has no audio service")
        reply.resolve(state(am))
    }

    override fun setVolume(args: VolumeSetVolumeArgs, reply: AkanNativeReply<VolumeState>) {
        val am = settable(reply) ?: return
        if (!(args.level >= 0.0 && args.level <= 1.0))
            return reply.reject(AkanNativeErrorCode.INVALID_ARGS, "level must be a number from 0 to 1")
        val muted = am.isStreamMute(STREAM)
        val min = am.getStreamMinVolume(STREAM)
        val max = am.getStreamMaxVolume(STREAM)
        am.setStreamVolume(STREAM, min + ((max - min) * args.level).roundToInt(), 0)
        if (muted && !am.isStreamMute(STREAM)) am.adjustStreamVolume(STREAM, AudioManager.ADJUST_MUTE, 0)
        reply.resolve(state(am))
    }

    override fun setMuted(args: VolumeSetMutedArgs, reply: AkanNativeReply<VolumeState>) {
        val am = settable(reply) ?: return
        am.adjustStreamVolume(STREAM, if (args.muted) AudioManager.ADJUST_MUTE else AudioManager.ADJUST_UNMUTE, 0)
        reply.resolve(state(am))
    }

    override fun startListening(event: String) {
        val am = audio
        if (event != "change" || receiver != null || am == null) return
        last = state(am)
        val r = object : BroadcastReceiver() {
            override fun onReceive(c: Context, intent: Intent) {
                val next = state(am)
                if (next == last) return
                last = next
                events.change(next)
            }
        }
        val filter = IntentFilter().apply {
            addAction(VOLUME_CHANGED)
            addAction(MUTE_CHANGED)
        }
        context.activity.registerReceiver(r, filter, Context.RECEIVER_NOT_EXPORTED)
        receiver = r
    }

    override fun stopListening(event: String) {
        val r = receiver
        if (event != "change" || r == null) return
        context.activity.unregisterReceiver(r)
        receiver = null
    }

    override fun destroy() = stopListening("change")

    private fun settable(reply: AkanNativeReply<VolumeState>): AudioManager? {
        val am = audio
        when {
            am == null -> reply.reject(AkanNativeErrorCode.UNSUPPORTED, "this device has no audio service")
            am.isVolumeFixed -> reply.reject(AkanNativeErrorCode.UNSUPPORTED, "this device's volume is fixed")
            else -> return am
        }
        return null
    }

    private fun state(am: AudioManager): VolumeState {
        val min = am.getStreamMinVolume(STREAM)
        val max = am.getStreamMaxVolume(STREAM)
        val level = if (max > min) (am.getStreamVolume(STREAM) - min).toDouble() / (max - min) else null
        return VolumeState(
            level = level?.let { Math.round(it * 1000) / 1000.0 },
            muted = am.isStreamMute(STREAM),
            settable = !am.isVolumeFixed,
        )
    }

    private companion object {
        const val STREAM = AudioManager.STREAM_MUSIC
        const val VOLUME_CHANGED = "android.media.VOLUME_CHANGED_ACTION"
        const val MUTE_CHANGED = "android.media.STREAM_MUTE_CHANGED_ACTION"
    }
}
