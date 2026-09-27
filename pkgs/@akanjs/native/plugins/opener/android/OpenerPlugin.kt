package com.akanjs.plugins.opener

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import com.akanjs.runtime.AkanNativeErrorCode
import com.akanjs.runtime.AkanNativeExternal
import com.akanjs.runtime.AkanNativePluginContext
import com.akanjs.runtime.AkanNativeReply
import com.akanjs.runtime.AkanNativeVoidReply

/**
 * ACTION_VIEW for http, https, mailto and tel (src/url.ts and the iOS plugin check the same list).
 * - normalizeScheme() first: intent filters match the scheme case-sensitively, and a new task for
 *   the other app (react-native IntentModule.kt:124, :255-279).
 * - CATEGORY_BROWSABLE as for links the page follows (shell SH-4): only activities that accept
 *   links from a browser can be started this way.
 * - No handler throws ActivityNotFoundException: NOT_FOUND. startActivity needs no package
 *   visibility, so this works without <queries>.
 * - openSettings: ACTION_APPLICATION_DETAILS_SETTINGS for this package (IntentModule.kt:169-189).
 * - canOpenUrl is not in native-plugin.json: since Android 11 resolveActivity() sees other apps only if
 *   the manifest lists them in <queries> (capacitor-plugins/app-launcher/README.md), which plugin
 *   manifests cannot add yet. canOpen() below is what it will run once they can (the generated
 *   OpenerPluginSpec then declares it too).
 * Arguments arrive decoded by the generated OpenerPluginSpec (PL-10); the URL checks stay here.
 */
class OpenerPlugin(private val context: AkanNativePluginContext) : OpenerPluginSpec {
    override fun openUrl(args: OpenerOpenUrlArgs, reply: AkanNativeVoidReply) {
        val uri = uri(args.url, reply) ?: return
        // PL-11 scopes { url }: matched on the URL normalized like the JS URL class does.
        if (reply.call.inScope(mapOf("url" to normalized(uri)), urlFields = setOf("url"), what = uri.toString())) start(reply, view(uri))
    }

    override fun openSettings(reply: AkanNativeVoidReply) = start(
        reply,
        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", context.activity.packageName, null))
            .addCategory(Intent.CATEGORY_DEFAULT)
            .addFlags(Intent.FLAG_ACTIVITY_NO_HISTORY or Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS),
    )

    @Suppress("unused") // canOpenUrl, once the manifest can declare <queries> (see above)
    private fun canOpen(uri: Uri): Boolean = view(uri).resolveActivity(context.activity.packageManager) != null

    private fun view(uri: Uri) = Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE)

    private fun start(reply: AkanNativeVoidReply, intent: Intent) {
        if (!AkanNativeExternal.allowed()) return reply.reject(AkanNativeErrorCode.NOT_ALLOWED, "at most one URL per second leaves the app; try again later")
        try {
            context.activity.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            reply.resolve()
        } catch (e: ActivityNotFoundException) {
            reply.reject(AkanNativeErrorCode.NOT_FOUND, "no app can open ${intent.data}")
        } catch (e: SecurityException) {
            reply.reject(AkanNativeErrorCode.PERMISSION_DENIED, e.message ?: "not allowed to open ${intent.data}")
        }
    }

    /** Lowercase scheme and host, "/" as the path of a bare http(s) host: the same text `new URL(u).href` gives. */
    private fun normalized(uri: Uri): String {
        var b = uri.buildUpon().scheme(uri.scheme?.lowercase())
        uri.encodedAuthority?.let { b = b.encodedAuthority(it.lowercase()) }
        if (uri.scheme?.startsWith("http") == true && uri.encodedPath.isNullOrEmpty()) b = b.encodedPath("/")
        return b.build().toString()
    }

    /** The checked URI with a normalized scheme, or null after rejecting the call. */
    private fun uri(text: String, reply: AkanNativeReply<*>): Uri? {
        val uri = if (text.isEmpty()) null else Uri.parse(text).normalizeScheme()
        val scheme = uri?.scheme
        val problem = when {
            uri == null || scheme == null || !uri.isAbsolute -> "url must be an absolute URL"
            scheme !in AkanNativeExternal.schemes -> "only ${AkanNativeExternal.schemes.joinToString(", ")} URLs can be opened (got $scheme:)"
            scheme.startsWith("http") && uri.host.isNullOrEmpty() -> "$text has no host"
            else -> return uri
        }
        reply.reject(AkanNativeErrorCode.INVALID_ARGS, problem)
        return null
    }

}
