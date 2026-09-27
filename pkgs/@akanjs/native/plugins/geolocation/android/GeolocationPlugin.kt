package com.akanjs.plugins.geolocation

import android.Manifest
import android.app.Activity
import android.app.Application
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.location.LocationRequest
import android.os.Build
import android.os.Bundle
import android.os.CancellationSignal
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import java.util.concurrent.Executor
import java.util.function.Consumer
import com.akanjs.runtime.AkanNativeErrorCode
import com.akanjs.runtime.AkanNativePluginContext
import com.akanjs.runtime.AkanNativeReply

/**
 * Framework LocationManager instead of Play Services FusedLocationProviderClient (plugins.md §2),
 * following tauri-plugins-workspace/plugins/geolocation/android/src/main/java/Geolocation.kt:
 * - Provider: LocationManager.FUSED_PROVIDER (API 31; implemented by Play services where present,
 *   by the AOSP FusedLocation otherwise), else GPS for high accuracy with fine permission, else
 *   NETWORK. GPS is never used with coarse permission only.
 * - Both ACCESS_FINE_LOCATION and ACCESS_COARSE_LOCATION are requested together: on Android 12+
 *   the dialog offers precise or approximate, and the user may grant coarse only (precise: false,
 *   the system then coarsens every fix; a high-accuracy request quietly gets the approximate one).
 *   Balanced and coarse-only requests do not turn on GPS: where there is no network location
 *   (the emulator, verified) they only get a fix another request produced recently, or time out.
 *   capacitor/android/.../BridgeWebChromeClient.java:246-273 treats coarse as enough in the same way.
 * - getCurrentPosition: newest getLastKnownLocation within maximumAge (Tauri's getLastLocation),
 *   else getCurrentLocation (API 31 LocationRequest overload) with a CancellationSignal for the
 *   timeout. The platform ends a single request after at most 30 s with null (NOT_FOUND).
 * - Watches stop on pause and resume on resume (Tauri onPause/onResume): background delivery would
 *   need ACCESS_BACKGROUND_LOCATION or a foreground service.
 * - Location turned off is NOT_FOUND for getCurrentPosition and an "error" event for a watch, whose
 *   registration stays so updates resume when it is turned on (Tauri rejects checkPermissions instead).
 * Emulator: `adb emu geo fix <lon> <lat>`, `adb shell pm grant <app id> android.permission.ACCESS_FINE_LOCATION`.
 * Arguments arrive decoded and checked by the generated GeolocationPluginSpec (PL-10); the ranges
 * of timeout and maximumAge are checked here.
 */
class GeolocationPlugin(private val context: AkanNativePluginContext) : GeolocationPluginSpec {
    private class Watch(val provider: String, val high: Boolean, val listener: LocationListener)

    private val activity = context.activity
    private val events = GeolocationEvents(context)
    private val manager: LocationManager? = activity.getSystemService(LocationManager::class.java)
    private val main = Handler(Looper.getMainLooper())
    private val listening = LinkedHashSet<String>()
    private var watch: Watch? = null
    private var resumed = true
    private var askedForWatch = false
    private var lastReport: String? = null

    private val lifecycle = object : Application.ActivityLifecycleCallbacks {
        override fun onActivityResumed(activity: Activity) {
            resumed = true
            updateWatch() // also picks up a permission granted in Settings meanwhile
        }

        override fun onActivityPaused(activity: Activity) {
            resumed = false
            updateWatch()
        }

        override fun onActivityStarted(activity: Activity) {}
        override fun onActivityStopped(activity: Activity) {}
        override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) {}
        override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) {}
        override fun onActivityDestroyed(activity: Activity) {}
    }

    override fun checkPermission(reply: AkanNativeReply<GeolocationLocationPermission>) = reply.resolve(permission())

    override fun requestPermission(reply: AkanNativeReply<GeolocationLocationPermission>) =
        context.requestPermissions(PERMISSIONS) { reply.resolve(permission()) }

    override fun startListening(event: String) {
        if (event !in EVENTS) return
        if (listening.isEmpty()) {
            askedForWatch = false
            lastReport = null
            activity.registerActivityLifecycleCallbacks(lifecycle)
        }
        listening.add(event)
        updateWatch()
    }

    override fun stopListening(event: String) {
        if (!listening.remove(event)) return
        if (listening.isEmpty()) activity.unregisterActivityLifecycleCallbacks(lifecycle)
        updateWatch()
    }

    override fun destroy() {
        if (listening.isNotEmpty()) activity.unregisterActivityLifecycleCallbacks(lifecycle)
        listening.clear()
        stopWatch()
    }

    // ------------------------------------------------------------ permission

    private fun granted(permission: String) = activity.checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED
    private fun fine() = granted(Manifest.permission.ACCESS_FINE_LOCATION)
    private fun anyLocation() = fine() || granted(Manifest.permission.ACCESS_COARSE_LOCATION)

    private fun permission(): GeolocationLocationPermission =
        if (anyLocation()) GeolocationLocationPermission(location = GeolocationPermissionState.GRANTED, precise = fine())
        // Both are always requested together, so the coarse history stands for the pair.
        else GeolocationLocationPermission(location = permissionState(Manifest.permission.ACCESS_COARSE_LOCATION), precise = null)

    /** context.permissionState answers with one of the four AkanNativePermission strings. */
    private fun permissionState(permission: String): GeolocationPermissionState {
        val state = context.permissionState(permission)
        return GeolocationPermissionState.entries.first { it.json == state }
    }

    // ------------------------------------------------------------ getCurrentPosition

    /** A non-negative number of ms, or [fallback] when absent. JSON has no Infinity: it arrives as null. */
    private fun milliseconds(value: Double?, name: String, fallback: Long, reply: AkanNativeReply<*>): Long? {
        if (value == null) return fallback
        if (value < 0) {
            reply.reject(AkanNativeErrorCode.INVALID_ARGS, "$name must be a number of ms >= 0")
            return null
        }
        return value.coerceAtMost(Long.MAX_VALUE.toDouble()).toLong()
    }

    override fun getCurrentPosition(args: GeolocationPositionOptions, reply: AkanNativeReply<GeolocationPosition>) {
        val timeout = milliseconds(args.timeout, "timeout", 30_000, reply) ?: return
        val maximumAge = milliseconds(args.maximumAge, "maximumAge", 0, reply) ?: return
        val high = args.enableHighAccuracy == true
        if (anyLocation()) return locate(reply, high, timeout, maximumAge)
        // Like W3C getCurrentPosition, ask first. After "don't ask again" this answers at once.
        context.requestPermissions(PERMISSIONS) {
            if (anyLocation()) locate(reply, high, timeout, maximumAge)
            else reply.reject(AkanNativeErrorCode.PERMISSION_DENIED, "location access was denied")
        }
    }

    private fun locate(reply: AkanNativeReply<GeolocationPosition>, high: Boolean, timeout: Long, maximumAge: Long) {
        val lm = manager ?: return reply.reject(AkanNativeErrorCode.UNSUPPORTED, "no location service")
        if (!lm.isLocationEnabled) return reply.reject(AkanNativeErrorCode.NOT_FOUND, "location is turned off")
        val fine = fine()
        if (maximumAge > 0) cached(lm, maximumAge)?.let { return reply.resolve(position(it)) }
        if (timeout == 0L) return reply.reject(AkanNativeErrorCode.NOT_FOUND, "no position within 0 ms")
        val provider = provider(lm, high, fine, enabledOnly = true)
            ?: return reply.reject(AkanNativeErrorCode.NOT_FOUND, "no location provider is enabled")
        val signal = CancellationSignal()
        var done = false
        val timer = Runnable {
            if (!done) {
                done = true
                signal.cancel()
                reply.reject(AkanNativeErrorCode.NOT_FOUND, "no position within $timeout ms")
            }
        }
        main.postDelayed(timer, timeout)
        val settle = { settleReply: AkanNativeReply<GeolocationPosition>.() -> Unit ->
            if (!done) {
                done = true
                main.removeCallbacks(timer)
                reply.settleReply()
            }
        }
        val deliver: (Location?) -> Unit = { location ->
            settle { if (location == null) reject(AkanNativeErrorCode.NOT_FOUND, "no position from $provider") else resolve(position(location)) }
        }
        try {
            when {
                Build.VERSION.SDK_INT >= 31 -> Api31.currentLocation(lm, provider, high && fine, timeout, signal, activity.mainExecutor, deliver)
                Build.VERSION.SDK_INT >= 30 -> Api30.currentLocation(lm, provider, signal, activity.mainExecutor, deliver)
                else -> oneShot(lm, provider, signal, deliver)
            }
        } catch (e: SecurityException) { // permission revoked in between
            settle { reject(AkanNativeErrorCode.PERMISSION_DENIED, e.message ?: "location access was denied") }
        } catch (e: IllegalArgumentException) { // provider vanished
            settle { reject(AkanNativeErrorCode.NOT_FOUND, e.message ?: "no provider $provider") }
        }
    }

    /**
     * API 29 has no getCurrentLocation: updates from the provider, removed after the first fix or when
     * the provider is turned off (androidx LocationManagerCompat). The caller's timer still applies.
     */
    private fun oneShot(lm: LocationManager, provider: String, signal: CancellationSignal, done: (Location?) -> Unit) {
        var finished = false
        lateinit var listener: LocationListener
        val finish = { location: Location? ->
            if (!finished) {
                finished = true
                lm.removeUpdates(listener)
                done(location)
            }
        }
        listener = object : LocationListener {
            override fun onLocationChanged(location: Location) = finish(location)
            override fun onProviderDisabled(provider: String) = finish(null)
            override fun onProviderEnabled(provider: String) {}
            @Deprecated("abstract before API 30, never called from 29 on")
            override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
        }
        signal.setOnCancelListener {
            if (!finished) {
                finished = true
                lm.removeUpdates(listener)
            }
        }
        lm.requestLocationUpdates(provider, 0L, 0f, listener, Looper.getMainLooper())
    }

    /** Whether the provider exists. hasProvider is API 31; before it the fused provider is hidden. */
    private fun has(lm: LocationManager, provider: String): Boolean = when {
        Build.VERSION.SDK_INT >= 31 -> Api31.hasProvider(lm, provider)
        provider == LocationManager.FUSED_PROVIDER -> false
        else -> provider in lm.allProviders
    }

    /** The newest last known fix of any provider, if it is at most [maximumAge] ms old. */
    private fun cached(lm: LocationManager, maximumAge: Long): Location? {
        val now = SystemClock.elapsedRealtimeNanos()
        return PROVIDERS.asSequence()
            .filter { has(lm, it) }
            .mapNotNull { runCatching { lm.getLastKnownLocation(it) }.getOrNull() }
            .filter { (now - it.elapsedRealtimeNanos) / 1_000_000 <= maximumAge }
            .maxByOrNull { it.elapsedRealtimeNanos }
    }

    private fun provider(lm: LocationManager, high: Boolean, fine: Boolean, enabledOnly: Boolean): String? {
        fun usable(p: String) = has(lm, p) && (!enabledOnly || lm.isProviderEnabled(p))
        return when {
            usable(LocationManager.FUSED_PROVIDER) -> LocationManager.FUSED_PROVIDER
            high && fine && usable(LocationManager.GPS_PROVIDER) -> LocationManager.GPS_PROVIDER
            usable(LocationManager.NETWORK_PROVIDER) -> LocationManager.NETWORK_PROVIDER
            fine && usable(LocationManager.GPS_PROVIDER) -> LocationManager.GPS_PROVIDER
            else -> null
        }
    }

    // ------------------------------------------------------------ watch

    private fun updateWatch() {
        if (listening.isEmpty() || !resumed) return stopWatch()
        val lm = manager ?: return report(GeolocationErrorCode.UNSUPPORTED, "no location service")
        if (!anyLocation()) {
            stopWatch()
            if (askedForWatch) return report(GeolocationErrorCode.PERMISSION_DENIED, "location access was denied")
            askedForWatch = true
            // The dialog pauses the activity; the watch starts on the following resume.
            context.requestPermissions(PERMISSIONS) { if (!anyLocation()) report(GeolocationErrorCode.PERMISSION_DENIED, "location access was denied") }
            return
        }
        val fine = fine()
        val high = "highAccuracyPosition" in listening && fine
        // Registered even while location is off: updates start when it is turned on.
        val provider = provider(lm, high, fine, enabledOnly = false) ?: return report(GeolocationErrorCode.NOT_FOUND, "no location provider")
        val current = watch
        if (current != null && current.provider == provider && current.high == high) return
        stopWatch()
        val listener = object : LocationListener {
            override fun onLocationChanged(location: Location) {
                lastReport = null
                val fix = position(location)
                for (event in listening.toList()) if (event == "highAccuracyPosition") events.highAccuracyPosition(fix) else events.position(fix)
            }

            override fun onProviderDisabled(provider: String) = report(GeolocationErrorCode.NOT_FOUND, "location is turned off")

            override fun onProviderEnabled(provider: String) {
                lastReport = null
            }

            @Deprecated("abstract before API 30, never called from 29 on")
            override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
        }
        try {
            val interval = if (high) 1_000L else 5_000L
            when {
                Build.VERSION.SDK_INT >= 31 -> Api31.requestUpdates(lm, provider, high, activity.mainExecutor, listener)
                Build.VERSION.SDK_INT >= 30 -> Api30.requestUpdates(lm, provider, interval, activity.mainExecutor, listener)
                else -> lm.requestLocationUpdates(provider, interval, 0f, listener, Looper.getMainLooper())
            }
            watch = Watch(provider, high, listener)
        } catch (e: RuntimeException) { // SecurityException, IllegalArgumentException
            Log.w("AkanNative", "geolocation: cannot watch $provider", e)
            return report(if (e is SecurityException) GeolocationErrorCode.PERMISSION_DENIED else GeolocationErrorCode.NOT_FOUND, e.message ?: "cannot watch $provider")
        }
        if (!lm.isLocationEnabled) report(GeolocationErrorCode.NOT_FOUND, "location is turned off")
    }

    private fun stopWatch() {
        val current = watch ?: return
        manager?.removeUpdates(current.listener)
        watch = null
    }

    /** Sends an "error" event, once per distinct problem until the next fix. */
    private fun report(code: GeolocationErrorCode, message: String) {
        val key = "${code.json} $message"
        if (lastReport == key) return
        lastReport = key
        events.error(GeolocationError(code = code, message = message))
    }

    // ------------------------------------------------------------ Location → Position

    /** Float → Double through its shortest decimal form: 3.9f stays 3.9, not 3.9000000953674316. */
    private fun num(value: Float): Double = value.toString().toDouble()

    private fun position(l: Location) = GeolocationPosition(
        latitude = l.latitude,
        longitude = l.longitude,
        accuracy = num(l.accuracy),
        altitude = if (l.hasAltitude()) l.altitude else null, // WGS84 ellipsoid, as W3C
        altitudeAccuracy = if (l.hasVerticalAccuracy()) num(l.verticalAccuracyMeters) else null,
        heading = if (l.hasBearing() && l.hasSpeed() && l.speed > 0f) num(l.bearing) else null,
        speed = if (l.hasSpeed()) num(l.speed) else null,
        timestamp = l.time.toDouble(), // epoch ms: exact in a Double, and written without a fraction
    )

    private object Api30 {
        fun currentLocation(lm: LocationManager, provider: String, signal: CancellationSignal, executor: Executor, done: (Location?) -> Unit) =
            lm.getCurrentLocation(provider, signal, executor, Consumer { done(it) })

        fun requestUpdates(lm: LocationManager, provider: String, interval: Long, executor: Executor, listener: LocationListener) =
            lm.requestLocationUpdates(provider, interval, 0f, executor, listener)
    }

    private object Api31 {
        fun hasProvider(lm: LocationManager, provider: String): Boolean = lm.hasProvider(provider)

        fun currentLocation(lm: LocationManager, provider: String, high: Boolean, timeout: Long, signal: CancellationSignal, executor: Executor, done: (Location?) -> Unit) {
            val request = LocationRequest.Builder(0)
                .setQuality(if (high) LocationRequest.QUALITY_HIGH_ACCURACY else LocationRequest.QUALITY_BALANCED_POWER_ACCURACY)
                .setDurationMillis(timeout)
                .build()
            lm.getCurrentLocation(provider, request, signal, executor, Consumer { done(it) })
        }

        fun requestUpdates(lm: LocationManager, provider: String, high: Boolean, executor: Executor, listener: LocationListener) {
            val request = LocationRequest.Builder(if (high) 1_000 else 5_000)
                .setQuality(if (high) LocationRequest.QUALITY_HIGH_ACCURACY else LocationRequest.QUALITY_BALANCED_POWER_ACCURACY)
                .setMinUpdateIntervalMillis(if (high) 500 else 2_000)
                .build()
            lm.requestLocationUpdates(provider, request, executor, listener)
        }
    }

    private companion object {
        val PERMISSIONS = arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
        val EVENTS = setOf("position", "highAccuracyPosition")
        val PROVIDERS = listOf(LocationManager.FUSED_PROVIDER, LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER, LocationManager.PASSIVE_PROVIDER)
    }
}
