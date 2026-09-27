package com.akanjs.plugins.share

import android.app.Activity
import android.app.Application
import android.app.PendingIntent
import android.content.ActivityNotFoundException
import android.content.BroadcastReceiver
import android.content.ClipData
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.util.Log
import com.akanjs.runtime.AkanNativeCall
import com.akanjs.runtime.AkanNativeCompat
import com.akanjs.runtime.AkanNativeErrorCode
import com.akanjs.runtime.AkanNativePluginContext
import com.akanjs.runtime.AkanNativeReply
import java.io.File
import java.util.UUID
import org.json.JSONObject

/**
 * ACTION_SEND / ACTION_SEND_MULTIPLE through Intent.createChooser.
 * - Which app was chosen comes back through the chooser's IntentSender
 *   (capacitor-plugins/share/…/SharePlugin.java:141-161). Capacitor registers an exported receiver
 *   and checks a nonce; here the PendingIntent is explicit (setPackage) and the receiver is
 *   RECEIVER_NOT_EXPORTED, so only broadcasts sent as this app arrive. FLAG_MUTABLE lets the chooser
 *   fill in EXTRA_CHOSEN_COMPONENT; Android 14 allows that because the intent is explicit.
 * - Targets often answer RESULT_CANCELED even after sharing, so completed = a target was chosen, or
 *   the activity went through onStop (the target covered it), or RESULT_OK (:76-87, :215-219).
 *   react-native ShareModule.kt:37-54 cannot tell a closed sheet at all.
 * - title → EXTRA_SUBJECT (mail) and EXTRA_TITLE (the sheet's preview title). The intent has one text
 *   field, so url is appended to text (Capacitor :117-126).
 * - Files need a content:// URI in the shell's own provider (plugins.md C4), a read grant, and
 *   ClipData even for a single file: the grant only reaches the target through ClipData (:192-200).
 * Arguments arrive decoded and type-checked by the generated SharePluginSpec (PL-10).
 */
class SharePlugin(private val context: AkanNativePluginContext) : SharePluginSpec {
    /**
     * canShare answers false for options it cannot decode instead of rejecting (src/index.ts, as
     * navigator.canShare does); everything else goes through the generated dispatch.
     */
    override fun handle(call: AkanNativeCall) {
        if (call.method == "canShare" && runCatching { ShareOptions.fromAkanNative(call.args, "") }.isFailure) {
            return call.resolve(JSONObject().put("value", false))
        }
        akanNativeDispatch(call)
    }

    private class Pending(val reply: AkanNativeReply<ShareResult>, val nonce: String) {
        var target: String? = null
        var stopped = false
    }

    private val activity: Activity get() = context.activity
    private val action = context.activity.packageName + ".akan-native.share.CHOSEN"
    private var pending: Pending? = null

    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(c: Context, intent: Intent) {
            val p = pending ?: return
            if (intent.getStringExtra(EXTRA_NONCE) != p.nonce) return // a late broadcast from an earlier share
            val chosen = AkanNativeCompat.parcelableExtra(intent, Intent.EXTRA_CHOSEN_COMPONENT, ComponentName::class.java) ?: return
            p.target = chosen.packageName
        }
    }

    private val lifecycle = object : Application.ActivityLifecycleCallbacks {
        override fun onActivityStopped(a: Activity) {
            pending?.stopped = true
        }
        override fun onActivityCreated(a: Activity, state: Bundle?) {}
        override fun onActivityStarted(a: Activity) {}
        override fun onActivityResumed(a: Activity) {}
        override fun onActivityPaused(a: Activity) {}
        override fun onActivitySaveInstanceState(a: Activity, state: Bundle) {}
        override fun onActivityDestroyed(a: Activity) {}
    }

    init {
        // Before API 33 RECEIVER_NOT_EXPORTED is ignored and a runtime receiver is exported, so there the
        // sender must hold this app's signature permission (what androidx ContextCompat does); the
        // per-share nonce stays as the second check. The PendingIntent is sent as this app.
        if (Build.VERSION.SDK_INT >= 33) Api33.register(activity, receiver, IntentFilter(action))
        else activity.registerReceiver(receiver, IntentFilter(action), activity.packageName + ".AKAN_NATIVE_INTERNAL_BROADCAST", null)
        activity.registerActivityLifecycleCallbacks(lifecycle) // this activity only (API 29)
    }

    override fun destroy() {
        runCatching { activity.unregisterReceiver(receiver) }
        activity.unregisterActivityLifecycleCallbacks(lifecycle)
    }

    private class Problem(val code: String, message: String) : Exception(message)

    private class Content(val title: String?, val body: String?, val files: List<Pair<File, String>>)

    // Invalid options are "cannot share", as navigator.canShare answers.
    override fun canShare(args: ShareOptions, reply: AkanNativeReply<ShareCanShareResult>) =
        reply.resolve(ShareCanShareResult(value = reply.call.args.length() == 0 || runCatching { content(args) }.isSuccess))

    private fun content(args: ShareOptions): Content {
        val title = args.title?.ifEmpty { null }
        val text = args.text?.ifEmpty { null }
        val url = args.url?.ifEmpty { null }
        if (url != null) {
            val scheme = Uri.parse(url).scheme?.lowercase()
            if (scheme == null || scheme in NOT_LINKS) throw Problem(AkanNativeErrorCode.INVALID_ARGS, "url must be an absolute URL (got $url)")
        }
        val files = (args.files ?: emptyList()).map { ref ->
            localFile(ref) ?: throw Problem(AkanNativeErrorCode.NOT_FOUND, "$ref is not a file of this session")
        }
        val body = listOfNotNull(text, url).joinToString(" ").ifEmpty { null }
        if (body == null && files.isEmpty()) throw Problem(AkanNativeErrorCode.INVALID_ARGS, "share needs text, url or files")
        return Content(title, body, files)
    }

    /** The file and MIME type behind a /__akan_native/file/<id> URL. */
    private fun localFile(ref: String): Pair<File, String>? = context.file(ref)

    override fun share(args: ShareOptions, reply: AkanNativeReply<ShareResult>) {
        if (pending != null) return reply.reject(AkanNativeErrorCode.CANCELLED, "a share sheet is already open")
        val content = try {
            content(args)
        } catch (e: Problem) {
            return reply.reject(e.code, e.message ?: "invalid share options")
        }
        if (content.files.isEmpty()) return launch(reply, content, emptyList())
        // Copying can take a while for videos: off the main thread.
        Thread {
            try {
                val uris = content.files.mapIndexed { i, (file, mime) -> stage(file, i) to mime }
                context.runOnMain { launch(reply, content, uris) }
            } catch (e: Exception) {
                Log.e("AkanNative", "share: staging files failed", e)
                reply.reject(AkanNativeErrorCode.INTERNAL, "could not prepare the files: $e")
            }
        }.start()
    }

    /** A content:// URI for [file]: its own if it is already in the provider's folder (camera photos), else a copy. */
    private fun stage(file: File, index: Int): Uri {
        if (NAME.matches(file.name)) {
            val (inPlace, uri) = context.captureTarget(file.name)
            if (inPlace.canonicalPath == file.canonicalPath) return uri
        }
        val safe = file.name.replace(Regex("[^A-Za-z0-9._-]"), "_").takeLast(100)
        val (copy, uri) = context.captureTarget("share-${System.currentTimeMillis()}-$index-$safe")
        file.copyTo(copy, overwrite = true)
        return uri
    }

    private fun launch(reply: AkanNativeReply<ShareResult>, content: Content, files: List<Pair<Uri, String>>) {
        if (pending != null) return reply.reject(AkanNativeErrorCode.CANCELLED, "a share sheet is already open")
        val send = Intent(if (files.size > 1) Intent.ACTION_SEND_MULTIPLE else Intent.ACTION_SEND)
        content.body?.let { send.putExtra(Intent.EXTRA_TEXT, it) }
        content.title?.let { send.putExtra(Intent.EXTRA_SUBJECT, it).putExtra(Intent.EXTRA_TITLE, it) }
        if (files.isEmpty()) {
            send.type = "text/plain"
        } else {
            send.type = commonType(files.map { it.second })
            val uris = ArrayList(files.map { it.first })
            if (uris.size == 1) send.putExtra(Intent.EXTRA_STREAM, uris[0]) else send.putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris)
            val clip = ClipData.newRawUri(null, uris[0])
            for (uri in uris.drop(1)) clip.addItem(ClipData.Item(uri))
            send.clipData = clip
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }

        val nonce = UUID.randomUUID().toString()
        val chosen = Intent(action).setPackage(activity.packageName).putExtra(EXTRA_NONCE, nonce)
        // Mutable so the chooser can add EXTRA_CHOSEN_COMPONENT; below API 31 every PendingIntent is.
        val mutable = if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0
        val sender = PendingIntent.getBroadcast(activity, 0, chosen, PendingIntent.FLAG_UPDATE_CURRENT or mutable).intentSender
        val chooser = Intent.createChooser(send, null, sender)
        val p = Pending(reply, nonce)
        pending = p
        try {
            context.startActivityForResult("share", chooser) { code, _ ->
                pending = null
                reply.resolve(ShareResult(completed = p.target != null || p.stopped || code == Activity.RESULT_OK, target = p.target))
            }
        } catch (e: ActivityNotFoundException) {
            pending = null
            reply.reject(AkanNativeErrorCode.UNSUPPORTED, "no share sheet on this device")
        }
    }

    override fun onRestoredActivityResult(key: String, resultCode: Int, data: Intent?) {
        // The process died while the sheet was open; the page that asked is gone (plugins.md C6).
        Log.i("AkanNative", "share result after process restart dropped (result=$resultCode)")
    }

    private companion object {
        const val EXTRA_NONCE = "com.akanjs.share.nonce"
        val NOT_LINKS = setOf("javascript", "data", "blob", "file")
        val NAME = Regex("[A-Za-z0-9_-][A-Za-z0-9._-]{0,127}")

        // One type → that type; one major type → e.g. image/*; otherwise */*
        // (Capacitor sends */* for every multi-file share).
        fun commonType(types: List<String>): String {
            val distinct = types.map { it.lowercase() }.distinct()
            if (distinct.size == 1) return distinct[0]
            val majors = distinct.map { it.substringBefore('/') }.distinct()
            return if (majors.size == 1) "${majors[0]}/*" else "*/*"
        }
    }

    private object Api33 {
        fun register(activity: Activity, receiver: BroadcastReceiver, filter: IntentFilter) {
            activity.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
        }
    }
}
