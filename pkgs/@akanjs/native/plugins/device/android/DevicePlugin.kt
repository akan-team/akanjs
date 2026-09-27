package com.akanjs.plugins.device

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.Build
import android.provider.Settings
import android.webkit.WebView
import com.akanjs.runtime.AkanNativeErrorCode
import com.akanjs.runtime.AkanNativePluginContext
import com.akanjs.runtime.AkanNativeReply

/**
 * Device facts from Build and Settings, following capacitor-plugins/device/android/.../Device.java:
 * - id: ANDROID_ID, unique per signing key, user and device (:31-33).
 * - webViewVersion: the WebView provider package (:73-89).
 * - battery: the sticky ACTION_BATTERY_CHANGED intent, read without subscribing (:35-59). Capacitor
 *   divides level by scale even when both are missing (-1 / -1 = 100%); here that is null.
 * - isVirtual: react-native AndroidInfoHelpers.kt:28-31 (fingerprint), Capacitor Device.java:61-63
 *   (product), plus the emulator kernels' hardware names.
 * - language: the app's current locale (per-app language included). The code comes from the BCP 47
 *   tag, since Locale.getLanguage() may return legacy ISO codes ("iw" for Hebrew).
 * The result types come from the generated DevicePluginSpec (PL-10).
 */
class DevicePlugin(private val context: AkanNativePluginContext) : DevicePluginSpec {
    override fun getInfo(reply: AkanNativeReply<DeviceInfo>) = reply.resolve(
        DeviceInfo(
            platform = DevicePlatform.ANDROID,
            model = Build.MODEL,
            manufacturer = Build.MANUFACTURER,
            osName = "Android",
            osVersion = Build.VERSION.RELEASE,
            isVirtual = isEmulator,
            webViewVersion = WebView.getCurrentWebViewPackage()?.versionName,
        ),
    )

    override fun getId(reply: AkanNativeReply<DeviceGetIdResult>) {
        val id = Settings.Secure.getString(context.activity.contentResolver, Settings.Secure.ANDROID_ID)
        if (id.isNullOrEmpty()) reply.reject(AkanNativeErrorCode.INTERNAL, "ANDROID_ID is not available")
        else reply.resolve(DeviceGetIdResult(identifier = id))
    }

    override fun getLanguage(reply: AkanNativeReply<DeviceGetLanguageResult>) {
        val tag = context.activity.resources.configuration.locales[0].toLanguageTag()
        reply.resolve(DeviceGetLanguageResult(tag = tag, code = tag.substringBefore('-').lowercase()))
    }

    override fun getBattery(reply: AkanNativeReply<DeviceBatteryInfo>) = reply.resolve(battery())

    private val isEmulator: Boolean
        get() = Build.HARDWARE == "ranchu" || Build.HARDWARE == "goldfish" ||
            Build.FINGERPRINT.startsWith("google/sdk_gphone") || Build.FINGERPRINT.contains("generic") ||
            Build.FINGERPRINT.contains("vbox") || Build.PRODUCT.contains("sdk")

    private fun battery(): DeviceBatteryInfo {
        // A null receiver returns the last sticky broadcast without registering anything. System
        // broadcasts still arrive with RECEIVER_NOT_EXPORTED, which targetSdk 34+ asks for.
        val intent: Intent? = context.activity.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED), Context.RECEIVER_NOT_EXPORTED)
        val present = intent?.getBooleanExtra(BatteryManager.EXTRA_PRESENT, false) == true
        val level = intent?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
        val scale = intent?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
        val plugged = intent?.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0) ?: 0
        return DeviceBatteryInfo(
            level = if (present && level >= 0 && scale > 0) Math.round(level * 100.0 / scale) / 100.0 else null,
            charging = if (present) plugged != 0 else null,
        )
    }
}
