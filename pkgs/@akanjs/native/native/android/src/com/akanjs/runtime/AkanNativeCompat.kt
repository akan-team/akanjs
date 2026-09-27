// Framework APIs that changed after Android 10 (API 29, the app's minSdk), in one place for the shell
// and the plugins. Code that needs API N lives in an ApiN object and runs only under
// `Build.VERSION.SDK_INT >= N`; the build checks this (packages/cli/src/lib/apilevel.ts).
package com.akanjs.runtime

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Parcelable
import android.view.Display

object AkanNativeCompat {
    /** The display the activity is on. Activity.getDisplay is API 30. */
    fun display(activity: Activity): Display? =
        if (Build.VERSION.SDK_INT >= 30) Api30.display(activity) else @Suppress("DEPRECATION") activity.windowManager.defaultDisplay

    /**
     * A typed Parcelable extra. The typed getParcelableExtra is API 33, with a bug in 13 that androidx
     * IntentCompat avoids by using it from 34 on; the untyped one is deprecated there.
     */
    fun <T : Parcelable> parcelableExtra(intent: Intent, name: String, type: Class<T>): T? {
        if (Build.VERSION.SDK_INT >= 34) return Api33.parcelableExtra(intent, name, type)
        @Suppress("DEPRECATION") val value: Parcelable? = intent.getParcelableExtra(name)
        return if (type.isInstance(value)) type.cast(value) else null
    }

    /**
     * The app's own light or dark setting below API 31, which has no per-app night mode
     * (UiModeManager.setApplicationNightMode): AkanNativeActivity applies it as an override configuration
     * when it starts. null: follow the system.
     */
    fun storedNightMode(context: Context): Boolean? {
        val prefs = context.getSharedPreferences(NIGHT_PREFS, Context.MODE_PRIVATE)
        return if (prefs.contains(NIGHT_KEY)) prefs.getBoolean(NIGHT_KEY, false) else null
    }

    /** Stores the setting for the next activity start (commit: the recreated activity reads it at once). */
    fun storeNightMode(context: Context, night: Boolean?) {
        val edit = context.getSharedPreferences(NIGHT_PREFS, Context.MODE_PRIVATE).edit()
        if (night == null) edit.remove(NIGHT_KEY) else edit.putBoolean(NIGHT_KEY, night)
        edit.commit()
    }

    private const val NIGHT_PREFS = "akan-native.nightmode"
    private const val NIGHT_KEY = "night"

    private object Api30 {
        fun display(activity: Activity): Display? = activity.display
    }

    private object Api33 {
        fun <T : Parcelable> parcelableExtra(intent: Intent, name: String, type: Class<T>): T? = intent.getParcelableExtra(name, type)
    }
}
