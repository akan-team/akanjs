package com.akanjs.plugins.appearance

import android.app.UiModeManager
import android.content.Context
import android.content.res.Configuration
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.akanjs.runtime.AkanNativeCompat
import com.akanjs.runtime.AkanNativeErrorCode
import com.akanjs.runtime.AkanNativePluginContext
import com.akanjs.runtime.AkanNativeReply
import com.akanjs.runtime.AkanNativeVoidReply

/**
 * UiModeManager.setApplicationNightMode (API 31) instead of AppCompatDelegate.setDefaultNightMode,
 * which react-native uses (AppearanceModule.kt:85-95), plugins.md §2 AndroidX table.
 * - The system keeps the per-app night mode across launches and applies it to the app's
 *   configuration before the activity starts; MODE_NIGHT_AUTO clears it (follow the system).
 *   There is no getter, so the setting is mirrored in SharedPreferences and written again at
 *   start, which also clears a stale system value after the app's data was cleared.
 * - The shell handles uiMode changes without recreating the activity (configChanges); the
 *   DayNight theme then flips the WebView's prefers-color-scheme with a matchMedia change event
 *   (docs/research/android.md: verified for system switches, algorithmic darkening off).
 * - mode: the fixed setting, or the configuration's night bit when following the system.
 * - change: onConfigurationChanged, plus a check shortly after set(), since a setting that keeps
 *   the drawn scheme (system dark, set dark) changes no configuration. Duplicates are filtered.
 * - Below API 31 there is no per-app night mode: the setting goes to AkanNativeCompat.storeNightMode, the
 *   shell applies it as an override configuration when the activity starts, and set() recreates the
 *   activity when the drawn scheme changes, so the page reloads there.
 * Arguments arrive decoded and checked by the generated AppearancePluginSpec (PL-10).
 */
class AppearancePlugin(private val context: AkanNativePluginContext) : AppearancePluginSpec {
    private val prefs = context.activity.getSharedPreferences("akan-native.appearance", Context.MODE_PRIVATE)
    private val uiModes: UiModeManager? = context.activity.getSystemService(UiModeManager::class.java)
    private val main = Handler(Looper.getMainLooper())
    private val check = Runnable { report() }
    private val events = AppearanceEvents(context)
    private var listening = false
    private var last: AppearanceState? = null

    init {
        try {
            if (Build.VERSION.SDK_INT >= 31) uiModes?.let { Api31.setNightMode(it, nightMode(setting())) }
        } catch (e: RuntimeException) {
            Log.w("AkanNative", "appearance: cannot apply the stored setting", e)
        }
    }

    override fun get(reply: AkanNativeReply<AppearanceState>) = reply.resolve(state())

    override fun set(args: AppearanceSetArgs, reply: AkanNativeVoidReply) {
        if (Build.VERSION.SDK_INT < 31) return setLegacy(args.mode, reply)
        val manager = uiModes ?: return reply.reject(AkanNativeErrorCode.UNSUPPORTED, "no UiModeManager on this device")
        Api31.setNightMode(manager, nightMode(args.mode))
        prefs.edit().putString(KEY, args.mode.json).apply()
        reply.resolve()
        main.removeCallbacks(check)
        main.postDelayed(check, SETTLE_MS)
    }

    /** API 29 and 30: store the override and recreate the activity when the drawn scheme changes. */
    private fun setLegacy(mode: AppearanceSetting, reply: AkanNativeVoidReply) {
        val activity = context.activity
        val night = when (mode) {
            AppearanceSetting.DARK -> true
            AppearanceSetting.LIGHT -> false
            AppearanceSetting.SYSTEM -> null
        }
        val drawn = isNight(activity.resources.configuration)
        // The application's configuration has no activity override: the system's own scheme.
        val next = night ?: isNight(activity.applicationContext.resources.configuration)
        AkanNativeCompat.storeNightMode(activity, night)
        prefs.edit().putString(KEY, mode.json).apply()
        reply.resolve()
        if (next != drawn) main.post { activity.recreate() }
    }

    private fun isNight(config: Configuration) = (config.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES

    private object Api31 {
        fun setNightMode(manager: UiModeManager, mode: Int) = manager.setApplicationNightMode(mode)
    }

    override fun onConfigurationChanged(config: Configuration) = report()

    override fun startListening(event: String) {
        if (event != "change") return
        listening = true
        last = state()
    }

    override fun stopListening(event: String) {
        if (event != "change") return
        listening = false
        last = null
        main.removeCallbacks(check)
    }

    override fun destroy() = main.removeCallbacks(check)

    private fun report() {
        if (!listening) return
        val next = state()
        if (next == last) return
        last = next
        events.change(next)
    }

    private fun setting(): AppearanceSetting =
        prefs.getString(KEY, null)?.let { stored -> AppearanceSetting.entries.firstOrNull { it.json == stored } } ?: AppearanceSetting.SYSTEM

    private fun state(): AppearanceState = when (val setting = setting()) {
        AppearanceSetting.LIGHT -> AppearanceState(mode = AppearanceColorScheme.LIGHT, setting = setting)
        AppearanceSetting.DARK -> AppearanceState(mode = AppearanceColorScheme.DARK, setting = setting)
        AppearanceSetting.SYSTEM -> {
            val night = (context.activity.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
            AppearanceState(mode = if (night) AppearanceColorScheme.DARK else AppearanceColorScheme.LIGHT, setting = setting)
        }
    }

    private fun nightMode(setting: AppearanceSetting): Int = when (setting) {
        AppearanceSetting.DARK -> UiModeManager.MODE_NIGHT_YES
        AppearanceSetting.LIGHT -> UiModeManager.MODE_NIGHT_NO
        AppearanceSetting.SYSTEM -> UiModeManager.MODE_NIGHT_AUTO
    }

    private companion object {
        const val KEY = "setting"
        const val SETTLE_MS = 500L
    }
}
