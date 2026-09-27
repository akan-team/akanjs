package com.akanjs.plugins.network

import android.app.Activity
import android.app.Application
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.akanjs.runtime.AkanNativePluginContext
import com.akanjs.runtime.AkanNativeReply

/**
 * The default network, with ACCESS_NETWORK_STATE (normal permission).
 * - connected needs NET_CAPABILITY_INTERNET and NET_CAPABILITY_VALIDATED, not just a network
 *   (capacitor-plugins/network/android/.../Network.java:74-93). Validation lands a moment after a
 *   network appears, as another onCapabilitiesChanged.
 * - Events use the capabilities the callback is given. Capacitor queries getNetworkCapabilities()
 *   inside the callback (Network.java:28-32 → NetworkPlugin.java:84-86), which the
 *   ConnectivityManager docs warn may return stale values there.
 * - The callback runs on the main looper and only while the page listens. Capacitor unregisters it
 *   on pause and compares the status on resume (NetworkPlugin.java:57-82); here it stays registered
 *   and resume only re-reads the status, in case a frozen background process missed a callback.
 * - A handover (Wi-Fi off → cellular) loses the old default network about 100 ms before the new one
 *   arrives (measured on the emulator). Capacitor reports that gap as offline (NetworkPlugin.java:24-29);
 *   here "none" is sent only when no network follows within LOST_GRACE_MS.
 * The result and event types come from the generated NetworkPluginSpec (PL-10).
 */
class NetworkPlugin(private val context: AkanNativePluginContext) : NetworkPluginSpec {
    private val none = NetworkStatus(connected = false, type = NetworkConnectionType.NONE)
    private val connectivity: ConnectivityManager? = context.activity.getSystemService(ConnectivityManager::class.java)
    private val events = NetworkEvents(context)
    private var callback: ConnectivityManager.NetworkCallback? = null
    private var defaultNetwork: Network? = null
    private var last: NetworkStatus? = null
    private val main = Handler(Looper.getMainLooper())
    private val offline = Runnable { update(none) }

    private val lifecycle = object : Application.ActivityLifecycleCallbacks {
        override fun onActivityResumed(activity: Activity) = update(current())
        override fun onActivityPaused(activity: Activity) {}
        override fun onActivityStarted(activity: Activity) {}
        override fun onActivityStopped(activity: Activity) {}
        override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) {}
        override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) {}
        override fun onActivityDestroyed(activity: Activity) {}
    }

    override fun getStatus(reply: AkanNativeReply<NetworkStatus>) = reply.resolve(current())

    override fun startListening(event: String) {
        val cm = connectivity
        if (event != "change" || callback != null || cm == null) return
        last = current()
        val cb = object : ConnectivityManager.NetworkCallback() {
            override fun onCapabilitiesChanged(network: Network, capabilities: NetworkCapabilities) {
                main.removeCallbacks(offline)
                defaultNetwork = network
                update(status(capabilities))
            }

            override fun onLost(network: Network) {
                // A switch reports the new default network; only losing the current one means offline.
                if (network != defaultNetwork) return
                defaultNetwork = null
                main.postDelayed(offline, LOST_GRACE_MS)
            }
        }
        try {
            // Delivers the current default network right away; that matches `last` and sends nothing.
            cm.registerDefaultNetworkCallback(cb, main)
        } catch (e: RuntimeException) { // SecurityException without the permission, TooManyRequestsException
            Log.w("AkanNative", "network: cannot watch the default network", e)
            return
        }
        callback = cb
        context.activity.registerActivityLifecycleCallbacks(lifecycle)
    }

    override fun stopListening(event: String) {
        val cb = callback
        if (event != "change" || cb == null) return
        connectivity?.unregisterNetworkCallback(cb)
        context.activity.unregisterActivityLifecycleCallbacks(lifecycle)
        main.removeCallbacks(offline)
        callback = null
        defaultNetwork = null
    }

    override fun destroy() = stopListening("change")

    private fun update(next: NetworkStatus) {
        if (callback == null || next == last) return
        last = next
        events.change(next)
    }

    /** Queried outside network callbacks, where the answer is current. */
    private fun current(): NetworkStatus {
        val cm = connectivity ?: return none
        val network = cm.activeNetwork ?: return none
        val capabilities = cm.getNetworkCapabilities(network) ?: return none
        return status(capabilities)
    }

    private fun status(capabilities: NetworkCapabilities): NetworkStatus {
        val connected = capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
            capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
        // A VPN's capabilities carry the transports of the networks under it.
        val type = when {
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> NetworkConnectionType.WIFI
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> NetworkConnectionType.CELLULAR
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> NetworkConnectionType.ETHERNET
            else -> NetworkConnectionType.UNKNOWN
        }
        return NetworkStatus(connected = connected, type = type)
    }

    private companion object {
        const val LOST_GRACE_MS = 1000L
    }
}
