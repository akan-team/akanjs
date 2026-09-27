package com.akanjs.plugins.localnotifications

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * Declared in the manifest (android.applicationXml, exported="false": only the system and this app
 * reach it). It runs without the Activity, on the Context the system gives it:
 * - FIRE: an alarm of LocalNotifications.arm went off
 * - BOOT_COMPLETED: alarms do not survive a reboot (capacitor-plugins/local-notifications/android/
 *   .../LocalNotificationRestoreReceiver.java). LOCKED_BOOT_COMPLETED is not used: the store is in
 *   credential-encrypted storage, which is locked until the user unlocks (Capacitor listens for it
 *   and then returns early when the user is locked, :16-17).
 * - MY_PACKAGE_REPLACED: re-arm after an update, in case the alarms went with the old version
 * - RESTORE: the plugin creates one reflectively and calls onReceive with it on every app start
 *   (a force stop also clears alarms). That also keeps the constructor and onReceive in R8 release
 *   builds, which do not read the manifest (packages/cli/src/platforms/android.ts PROGUARD).
 */
class LocalNotificationReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        try {
            when (intent.action) {
                LocalNotifications.ACTION_FIRE -> {
                    val id = intent.getIntExtra(LocalNotifications.EXTRA_ID, Int.MIN_VALUE)
                    if (id != Int.MIN_VALUE || intent.hasExtra(LocalNotifications.EXTRA_ID)) LocalNotifications.fire(context, id)
                }
                Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED, LocalNotifications.ACTION_RESTORE ->
                    LocalNotifications.restore(context)
            }
        } catch (e: RuntimeException) {
            Log.e(LocalNotifications.TAG, "local-notifications: ${intent.action} failed", e)
        } catch (e: LinkageError) { // an API this Android lacks, reached without a version check
            Log.e(LocalNotifications.TAG, "local-notifications: ${intent.action} needs a newer Android", e)
        }
    }
}
