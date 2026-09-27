package com.akanjs.plugins.push

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * FCM's entry point for this app (declared in the push plugin's manifest; the library's own service has
 * a lower priority). Firebase calls it on its own thread, also when no activity runs; the plugin gets
 * the token and the messages when it exists (PushPlugin.Router).
 */
class AkanNativeMessagingService : FirebaseMessagingService() {
    @Suppress("OVERRIDE_DEPRECATION")
    override fun onNewToken(token: String) = PushPlugin.Router.token(token)

    /** Data messages always; notification messages only while the app is in front (Firebase shows them otherwise). */
    override fun onMessageReceived(message: RemoteMessage) = PushPlugin.Router.message(this, message)
}
