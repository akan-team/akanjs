package com.akanjs.plugins.biometric

import android.app.Activity
import android.app.KeyguardManager
import android.content.pm.PackageManager
import android.hardware.biometrics.BiometricManager
import android.hardware.biometrics.BiometricManager.Authenticators.BIOMETRIC_WEAK
import android.hardware.biometrics.BiometricManager.Authenticators.DEVICE_CREDENTIAL
import android.hardware.biometrics.BiometricPrompt
import android.os.Build
import android.os.CancellationSignal
import com.akanjs.runtime.AkanNativeErrorCode
import com.akanjs.runtime.AkanNativePluginContext
import com.akanjs.runtime.AkanNativeReply
import com.akanjs.runtime.AkanNativeVoidReply

/**
 * Framework android.hardware.biometrics.BiometricPrompt instead of androidx.biometric (plugins.md §2).
 * tauri-plugins-workspace/plugins/biometric/android needs a separate AppCompat BiometricActivity
 * because the androidx prompt is a Fragment; the framework prompt is system UI started from any
 * Context, so it runs straight from the shell's Activity. Kept from Tauri:
 * - BIOMETRIC_WEAK (Class 2) like Tauri's status(): plain presence checks need no Class 3 sensor.
 *   BIOMETRIC_STRONG only matters for a CryptoObject-bound key, which this API does not offer.
 * - A negative button cannot be combined with DEVICE_CREDENTIAL (the builder throws).
 * - The sensor kind comes from PackageManager features (first of fingerprint, face, iris).
 * - KeyguardManager.isDeviceSecure tells whether a PIN / pattern / password exists.
 * USE_BIOMETRIC is a normal permission (granted at install).
 * API 29 has one tier and no authenticator types (both 30): canAuthenticate() counts only strong
 * biometrics and never the screen lock, so "credential allowed" is answered with isDeviceSecure, and
 * without a usable biometric the screen lock is asked through KeyguardManager's confirm intent, as
 * androidx.biometric does there (Tauri BiometricPlugin.kt:115-120, BiometricActivity.kt:56-65).
 * Arguments arrive decoded and type-checked by the generated BiometricPluginSpec (PL-10).
 */
class BiometricPlugin(private val context: AkanNativePluginContext) : BiometricPluginSpec {
    private var pending: CancellationSignal? = null

    override fun isAvailable(reply: AkanNativeReply<BiometricStatus>) = reply.resolve(status())

    override fun destroy() {
        pending?.cancel()
        pending = null
    }

    private val manager: BiometricManager? get() = context.activity.getSystemService(BiometricManager::class.java)

    private fun sensor(): BiometricBiometryType {
        val pm = context.activity.packageManager
        return when {
            pm.hasSystemFeature(PackageManager.FEATURE_FINGERPRINT) -> BiometricBiometryType.FINGERPRINT
            pm.hasSystemFeature(PackageManager.FEATURE_FACE) -> BiometricBiometryType.FACE
            pm.hasSystemFeature(PackageManager.FEATURE_IRIS) -> BiometricBiometryType.IRIS
            else -> BiometricBiometryType.NONE
        }
    }

    private fun deviceSecure(): Boolean = context.activity.getSystemService(KeyguardManager::class.java)?.isDeviceSecure == true

    /** Biometrics only (BIOMETRIC_WEAK on 30+; API 29's single tier). */
    private fun biometricCode(): Int {
        val m = manager ?: return BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE
        return if (Build.VERSION.SDK_INT >= 30) Api30.canAuthenticate(m, BIOMETRIC_WEAK) else @Suppress("DEPRECATION") m.canAuthenticate()
    }

    private fun status(): BiometricStatus {
        val code = biometricCode()
        val reason = when (code) {
            BiometricManager.BIOMETRIC_SUCCESS -> null
            BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED -> BiometricUnavailableReason.NOT_ENROLLED
            BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE -> BiometricUnavailableReason.NO_HARDWARE
            BiometricManager.BIOMETRIC_ERROR_NOT_ENABLED_FOR_APPS -> BiometricUnavailableReason.DENIED // Settings: "use for apps" off
            else -> BiometricUnavailableReason.UNAVAILABLE // HW_UNAVAILABLE, SECURITY_UPDATE_REQUIRED, IDENTITY_CHECK_NOT_ACTIVE
        }
        return BiometricStatus(
            available = code == BiometricManager.BIOMETRIC_SUCCESS,
            type = if (code == BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE) BiometricBiometryType.NONE else sensor(),
            reason = reason,
            deviceCredential = deviceSecure(),
        )
    }

    override fun authenticate(args: BiometricAuthenticateOptions, reply: AkanNativeVoidReply) {
        val reason = args.reason
        if (reason.isEmpty()) return reply.reject(AkanNativeErrorCode.INVALID_ARGS, "reason must be a non-empty string")
        if (pending != null) return reply.reject(AkanNativeErrorCode.CANCELLED, "another authentication is in progress")
        val allowCredential = args.allowDeviceCredential == true
        val authenticators = if (allowCredential) BIOMETRIC_WEAK or DEVICE_CREDENTIAL else BIOMETRIC_WEAK
        val activity = context.activity
        val title = args.title?.takeIf { it.isNotEmpty() }
        val code = when {
            Build.VERSION.SDK_INT >= 30 -> manager?.let { Api30.canAuthenticate(it, authenticators) } ?: BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE
            else -> biometricCode()
        }
        if (code != BiometricManager.BIOMETRIC_SUCCESS) {
            // API 29: the screen lock alone, when allowed and set up.
            if (Build.VERSION.SDK_INT < 30 && allowCredential && deviceSecure()) return confirmCredential(activity, title, reason, reply)
            val (error, message) = unavailable(code, allowCredential)
            return reply.reject(error, message)
        }

        val builder = BiometricPrompt.Builder(activity)
            .setTitle(title ?: reason) // required: build() throws without a title
        if (Build.VERSION.SDK_INT >= 30) Api30.allow(builder, authenticators)
        else @Suppress("DEPRECATION") builder.setDeviceCredentialAllowed(allowCredential)
        if (title != null) builder.setSubtitle(reason)
        val signal = CancellationSignal()
        var done = false
        val finish = { settle: AkanNativeVoidReply.() -> Unit ->
            if (!done) {
                done = true
                if (pending === signal) pending = null
                reply.settle()
            }
        }
        if (!allowCredential) {
            val cancel = args.cancelTitle?.takeIf { it.isNotEmpty() } ?: activity.getString(android.R.string.cancel)
            builder.setNegativeButton(cancel, activity.mainExecutor) { _, _ -> finish { reject(AkanNativeErrorCode.CANCELLED, "authentication was cancelled") } }
        }
        pending = signal
        // The prompt belongs to its call: cancelled (AbortSignal) or with its page gone, it goes away.
        reply.onCancel {
            done = true
            if (pending === signal) pending = null
            signal.cancel()
        }
        try {
            builder.build().authenticate(signal, activity.mainExecutor, object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) = finish { resolve() }

                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) =
                    finish { reject(errorFor(errorCode), errString.toString()) }

                // onAuthenticationFailed: one attempt did not match; the prompt stays up for another try.
            })
        } catch (e: RuntimeException) { // IllegalArgumentException from the builder, SecurityException without USE_BIOMETRIC
            finish { reject(AkanNativeErrorCode.INTERNAL, e.toString()) }
        }
    }

    /** API 29 without a usable biometric: the system's screen lock confirmation. */
    private fun confirmCredential(activity: Activity, title: String?, reason: String, reply: AkanNativeVoidReply) {
        @Suppress("DEPRECATION")
        val intent = activity.getSystemService(KeyguardManager::class.java)?.createConfirmDeviceCredentialIntent(title ?: reason, if (title != null) reason else null)
            ?: return reply.reject(AkanNativeErrorCode.PERMISSION_DENIED, "no screen lock is set up")
        try {
            context.startActivityForResult("credential", intent) { result, _ ->
                if (result == Activity.RESULT_OK) reply.resolve() else reply.reject(AkanNativeErrorCode.CANCELLED, "authentication was cancelled")
            }
        } catch (e: RuntimeException) {
            reply.reject(AkanNativeErrorCode.INTERNAL, e.toString())
        }
    }

    private object Api30 {
        fun canAuthenticate(manager: BiometricManager, authenticators: Int): Int = manager.canAuthenticate(authenticators)

        fun allow(builder: BiometricPrompt.Builder, authenticators: Int) {
            builder.setAllowedAuthenticators(authenticators)
        }
    }

    private fun unavailable(code: Int, allowCredential: Boolean): Pair<String, String> = when (code) {
        BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED ->
            AkanNativeErrorCode.PERMISSION_DENIED to if (allowCredential) "no biometrics and no screen lock are set up" else "no biometrics are enrolled"
        BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE -> AkanNativeErrorCode.UNSUPPORTED to "this device has no biometric sensor"
        BiometricManager.BIOMETRIC_ERROR_HW_UNAVAILABLE -> AkanNativeErrorCode.UNSUPPORTED to "the biometric sensor is unavailable"
        BiometricManager.BIOMETRIC_ERROR_NOT_ENABLED_FOR_APPS -> AkanNativeErrorCode.PERMISSION_DENIED to "biometrics are turned off for apps"
        else -> AkanNativeErrorCode.INTERNAL to "biometrics cannot be used (code $code)"
    }

    private fun errorFor(code: Int): String = when (code) {
        BiometricPrompt.BIOMETRIC_ERROR_USER_CANCELED, BiometricPrompt.BIOMETRIC_ERROR_CANCELED, BiometricPrompt.BIOMETRIC_ERROR_TIMEOUT ->
            AkanNativeErrorCode.CANCELLED
        BiometricPrompt.BIOMETRIC_ERROR_LOCKOUT, BiometricPrompt.BIOMETRIC_ERROR_LOCKOUT_PERMANENT, BiometricPrompt.BIOMETRIC_ERROR_NO_BIOMETRICS,
        BiometricPrompt.BIOMETRIC_ERROR_NO_DEVICE_CREDENTIAL, BiometricPrompt.BIOMETRIC_ERROR_NOT_ENABLED_FOR_APPS ->
            AkanNativeErrorCode.PERMISSION_DENIED
        BiometricPrompt.BIOMETRIC_ERROR_HW_NOT_PRESENT, BiometricPrompt.BIOMETRIC_ERROR_HW_UNAVAILABLE -> AkanNativeErrorCode.UNSUPPORTED
        else -> AkanNativeErrorCode.INTERNAL
    }
}
