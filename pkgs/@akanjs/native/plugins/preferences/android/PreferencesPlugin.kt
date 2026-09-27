package com.akanjs.plugins.preferences

import android.content.Context
import com.akanjs.runtime.AkanNativeErrorCode
import com.akanjs.runtime.AkanNativePluginContext
import com.akanjs.runtime.AkanNativeReply
import com.akanjs.runtime.AkanNativeVoidReply

/**
 * SharedPreferences in its own file, written with apply() (as capacitor-plugins/preferences does).
 * Arguments arrive decoded and checked by the generated PreferencesPluginSpec (PL-10).
 */
class PreferencesPlugin(context: AkanNativePluginContext) : PreferencesPluginSpec {
    private val prefs = context.activity.getSharedPreferences("akan-native.preferences", Context.MODE_PRIVATE)

    override fun get(args: PreferencesGetArgs, reply: AkanNativeReply<PreferencesGetResult>) {
        if (valid(args.key, reply)) reply.resolve(PreferencesGetResult(value = prefs.getString(args.key, null)))
    }

    override fun set(args: PreferencesSetArgs, reply: AkanNativeVoidReply) {
        if (!valid(args.key, reply)) return
        prefs.edit().putString(args.key, args.value).apply()
        reply.resolve()
    }

    override fun remove(args: PreferencesRemoveArgs, reply: AkanNativeVoidReply) {
        if (!valid(args.key, reply)) return
        prefs.edit().remove(args.key).apply()
        reply.resolve()
    }

    override fun keys(reply: AkanNativeReply<PreferencesKeysResult>) = reply.resolve(PreferencesKeysResult(keys = prefs.all.keys.sorted()))

    override fun clear(reply: AkanNativeVoidReply) {
        prefs.edit().clear().apply()
        reply.resolve()
    }

    private fun valid(key: String, reply: AkanNativeReply<*>): Boolean {
        if (key.isNotEmpty()) return true
        reply.reject(AkanNativeErrorCode.INVALID_ARGS, "key must be a non-empty string")
        return false
    }
}
