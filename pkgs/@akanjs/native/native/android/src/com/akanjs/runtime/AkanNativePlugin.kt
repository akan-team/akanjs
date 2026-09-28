// Plugin API for Android (docs/architecture.md §6). Framework APIs and kotlin-stdlib only.
package com.akanjs.runtime

import android.app.Activity
import android.content.Intent
import android.content.res.Configuration
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.webkit.WebView
import java.io.File
import java.lang.ref.PhantomReference
import java.lang.ref.ReferenceQueue
import java.util.Collections
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean
import org.json.JSONObject

object AkanNativeErrorCode {
    const val UNSUPPORTED = "UNSUPPORTED"
    const val PERMISSION_DENIED = "PERMISSION_DENIED"
    const val CANCELLED = "CANCELLED"
    /** The page's time limit ran out (AbortSignal.timeout); CANCELLED is any other abort. */
    const val TIMEOUT = "TIMEOUT"
    const val INVALID_ARGS = "INVALID_ARGS"
    const val NOT_FOUND = "NOT_FOUND"
    /** The app's capabilities do not grant this (PL-11). PERMISSION_DENIED is the OS or the user. */
    const val NOT_ALLOWED = "NOT_ALLOWED"
    const val INTERNAL = "INTERNAL"
}

/**
 * A native plugin. Implementations have a constructor taking [AkanNativePluginContext] and are listed
 * in the generated AkanNativeGeneratedPlugins.kt (no reflection). All entry points run on the main thread.
 */
interface AkanNativePlugin {
    fun handle(call: AkanNativeCall)

    /** First page listener for [event] subscribed (`$listen`). */
    fun startListening(event: String) {}

    /** Last page listener for [event] left (`$unlisten`), or the page reloaded. */
    fun stopListening(event: String) {}

    /**
     * Whether a link the app was opened with is this plugin's own answer (auth-session's sign-in
     * callback, R10): then the shell does not hand it to app.urlOpen. onNewIntent still follows.
     */
    fun claimsLink(intent: Intent): Boolean = false

    /** Activity callbacks forwarded by the shell (plugins.md C3). */
    fun onNewIntent(intent: Intent) {}
    fun onConfigurationChanged(config: Configuration) {}

    /**
     * An activity result arrived after the app process was recreated, so the original call is
     * gone (plugins.md C6). [key] is what the plugin passed to startActivityForResult.
     */
    fun onRestoredActivityResult(key: String, resultCode: Int, data: Intent?) {}

    /**
     * The page's document (one page load) ended, after its calls, listeners and owned resources
     * (AkanNativeDocumentScope.own) were closed: for per-page state kept by document id.
     */
    fun documentEnded(document: String) {}

    fun destroy() {}
}

/**
 * One page load (architecture §3.7 Document scope), for what must not outlive it. Main thread only.
 */
interface AkanNativeDocumentScope {
    /** "" for a page that sends no document id. */
    val id: String
    /** True once the page is gone. */
    val ended: Boolean

    /**
     * Ties a resource to this page: [dispose] runs when it ends (the last owned first), or right away
     * if it already has (a call that finished after its page left). Returns a token for [disown].
     */
    fun own(dispose: () -> Unit): Long

    /** Forgets a resource without disposing it (it was closed on request). */
    fun disown(token: Long)
}

/** A keyboard transition: [phase] willShow, didShow, willHide or didHide; the height (dp) once it ends; the animation's length. */
data class AkanNativeKeyboardTransition(val phase: String, val height: Float, val durationMs: Long)

/** A back swipe in progress (API 34+): [progress] runs 0–1 from [fromRightEdge]'s side; CANCELLED ends one let go. */
data class AkanNativeBackProgress(val phase: Phase, val progress: Float, val fromRightEdge: Boolean) {
    enum class Phase { STARTED, PROGRESSED, CANCELLED }
}

/** A plugin whose manifest needs a newer Android than this device (`android.minSdk`): every call is UNSUPPORTED. */
class AkanNativeUnsupportedPlugin(private val reason: String) : AkanNativePlugin {
    override fun handle(call: AkanNativeCall) = call.reject(AkanNativeErrorCode.UNSUPPORTED, reason)
}

/**
 * Runs an action once an object has been garbage collected: what java.lang.ref.Cleaner does, which
 * is API 33. One daemon thread waits on the reference queue; the references themselves stay
 * reachable in [live] until their action ran, or they would be collected before being queued.
 */
internal object AkanNativeReaper {
    private val queue = ReferenceQueue<Any>()
    private val live: MutableSet<Ref> = Collections.newSetFromMap(ConcurrentHashMap())

    private class Ref(referent: Any, val action: () -> Unit) : PhantomReference<Any>(referent, queue)

    init {
        Thread({
            while (true) {
                val ref = try { queue.remove() as Ref } catch (_: InterruptedException) { continue }
                live.remove(ref)
                try { ref.action() } catch (e: Throwable) { android.util.Log.e("akan-native", "reaper action failed", e) }
            }
        }, "akan-native-reaper").apply { isDaemon = true }.start()
    }

    /** [action] must not hold [referent], or it is never collected. */
    fun register(referent: Any, action: () -> Unit) {
        live.add(Ref(referent, action))
    }
}

/**
 * One bridge call. Resolve or reject exactly once, from any thread.
 *
 * The page may give up on a call (its AbortSignal, bridge v1.1 `cancel`), and a call ends with its
 * page: the bridge then answers it (CANCELLED or TIMEOUT) and runs the [onCancel] handlers on the
 * main thread, where a plugin stops the work (closes a dialog, cancels a BiometricPrompt).
 */
class AkanNativeCall(
    val method: String,
    val args: JSONObject,
    private val finish: (JSONObject) -> Unit,
) {
    private val finished = AtomicBoolean(false)
    @Volatile private var cancelled = false
    private val cancelHandlers = ArrayList<() -> Unit>()

    /**
     * The calling page's document (set by the bridge): `call.document?.own { … }` ties a resource to
     * the page, closed when it ends. Main thread only.
     */
    var document: AkanNativeDocumentScope? = null

    /** True once the page gave up on the call or went away; answers after that are dropped. */
    val isCancelled: Boolean get() = cancelled

    /** Runs [handler] on the main thread when the call is cancelled (right away if it already was). Not after the call was answered. */
    fun onCancel(handler: () -> Unit) {
        val now = synchronized(cancelHandlers) {
            if (!cancelled && !finished.get()) cancelHandlers.add(handler)
            cancelled
        }
        if (now) handler()
    }

    /** The bridge ends the call (main thread): the handlers run, then the page gets [code]. */
    fun cancel(code: String, message: String) {
        val handlers = synchronized(cancelHandlers) {
            if (cancelled || finished.get()) return
            cancelled = true
            cancelHandlers.toList().also { cancelHandlers.clear() }
        }
        for (handler in handlers) {
            try {
                handler()
            } catch (e: Exception) {
                android.util.Log.e("akan-native", "$method: a cancel handler failed", e)
            }
        }
        reject(code, message)
    }

    init {
        // A plugin that drops a call without answering (a lost callback, a thread that died) would
        // leave the page's Promise pending forever: once the call is garbage it is rejected, as the
        // iOS AkanNativeCall does in deinit. The action must not hold the call, hence the copies.
        val done = finished
        val send = finish
        val name = method
        AkanNativeReaper.register(this) {
            if (done.compareAndSet(false, true)) {
                send(JSONObject().put("ok", false).put("error", JSONObject().put("code", AkanNativeErrorCode.INTERNAL).put("message", "$name was dropped without an answer")))
            }
        }
    }

    /** What the app's capabilities allow this call (PL-11); null = only the plugin's own rules. */
    var scope: AkanNativeScope? = null

    /** Rejects with NOT_ALLOWED unless [value] is inside the call's scope; true when allowed. */
    fun inScope(value: Map<String, String>, pathFields: Set<String> = emptySet(), urlFields: Set<String> = emptySet(), what: String): Boolean {
        if (scope?.permits(value, pathFields, urlFields) != false) return true
        reject(AkanNativeErrorCode.NOT_ALLOWED, "$what is outside the app's capabilities")
        return false
    }

    fun resolve(result: Any? = null) {
        val body = JSONObject().put("ok", true)
        if (result != null) body.put("result", result)
        complete(body)
    }

    /** [data]: details the page can act on (JSON values). [retryable]: the same call may work later. */
    fun reject(code: String, message: String, data: Any? = null, retryable: Boolean = false) {
        val error = JSONObject().put("code", code).put("message", message)
        if (data != null) error.put("data", data)
        if (retryable) error.put("retryable", true)
        complete(JSONObject().put("ok", false).put("error", error))
    }

    private fun complete(body: JSONObject) {
        if (finished.compareAndSet(false, true)) {
            synchronized(cancelHandlers) { cancelHandlers.clear() }
            finish(body)
        }
    }

    fun string(key: String): String? = if (args.has(key) && !args.isNull(key)) args.optString(key) else null
    fun bool(key: String): Boolean? = if (args.has(key) && !args.isNull(key)) args.optBoolean(key) else null
    fun int(key: String): Int? = if (args.has(key) && !args.isNull(key)) args.optInt(key) else null
}

/** Safe area and soft keyboard, in dp (== CSS px at the default zoom). */
data class AkanNativeInsets(
    val top: Float,
    val right: Float,
    val bottom: Float,
    val left: Float,
    val imeVisible: Boolean,
    /** ime.bottom − systemBars.bottom, as react-native ReactRootView computes it. */
    val imeHeight: Float,
)

/** Permission state (plugins.md C1). */
object AkanNativePermission {
    const val GRANTED = "granted"
    const val DENIED = "denied"
    const val PROMPT = "prompt"
    const val PROMPT_WITH_RATIONALE = "prompt-with-rationale"
}

/**
 * Permissions the user refused (plugins.md C1). shouldShowRequestPermissionRationale is false both
 * before the first request and after "don't ask again"; a refusal on record tells them apart.
 * Written from answers only (a cancelled request answers nothing) and cleared by a grant, so an
 * "only this time" grant that expired reads as prompt again. Kept in noBackupFilesDir: a backup or
 * a transfer to another device, where nothing was refused yet, never brings it along.
 */
internal class AkanNativePermissionHistory(context: android.content.Context) {
    private val file = java.io.File(context.noBackupFilesDir, "akan-native-permissions")
    private val refused: MutableSet<String> = runCatching { file.readLines().filter(String::isNotBlank).toMutableSet() }.getOrElse { mutableSetOf() }

    init {
        context.deleteSharedPreferences("akan-native.permissions") // earlier builds: written before asking, and backed up
    }

    operator fun contains(permission: String): Boolean = permission in refused

    fun record(answers: Map<String, Boolean>) {
        var changed = false
        for ((permission, granted) in answers) changed = (if (granted) refused.remove(permission) else refused.add(permission)) || changed
        if (changed) runCatching { file.writeText(refused.joinToString("\n")) }
    }
}

/** What the shell offers to a plugin. */
class AkanNativePluginContext internal constructor(
    val pluginId: String,
    val activity: Activity,
    val webView: WebView,
    private val host: Host,
) {
    internal interface Host {
        fun emit(plugin: String, event: String, data: Any?)
        fun registerFile(file: File, mime: String): JSONObject
        fun file(id: String): Pair<File, String>?
        fun captureTarget(name: String): Pair<File, Uri>
        fun startActivityForResult(plugin: String, key: String, intent: Intent, callback: (resultCode: Int, data: Intent?) -> Unit)
        fun requestPermissions(permissions: Array<String>, callback: (granted: Map<String, Boolean>) -> Unit)
        fun permissionState(permission: String): String
        fun insets(): AkanNativeInsets
        fun onInsetsChanged(listener: (AkanNativeInsets) -> Unit)
        fun setBackInterceptor(interceptor: (() -> Unit)?)
        fun setBackEnabled(enabled: Boolean)
        fun setBackProgressListener(listener: ((AkanNativeBackProgress) -> Unit)?)
        fun setImeResize(resize: Boolean)
        fun onKeyboardTransition(listener: (AkanNativeKeyboardTransition) -> Unit)
        fun hideSplash(fadeOutMs: Long)
        fun serveBundle(root: File?)
    }

    private val main = Handler(Looper.getMainLooper())

    /** Pushes an event of this plugin to the page. Delivered only while the page listens. */
    fun emit(event: String, data: Any? = null) = runOnMain { host.emit(pluginId, event, data) }

    /** Serves [file] at /__akan_native/file/<id> for the rest of the session and returns a FileRef. */
    fun registerFile(file: File, mime: String): JSONObject = host.registerFile(file, mime)

    /** Switches the page to another web bundle (UP-2, AkanNativeUpdates) and reloads it; null: the APK's own. */
    fun serveBundle(root: File?) = runOnMain { host.serveBundle(root) }

    /** [registerFile], as the typed FileRef of generated result types (PL-10). */
    fun fileRef(file: File, mime: String): AkanNativeFileRef {
        val ref = registerFile(file, mime)
        return AkanNativeFileRef(url = ref.optString("url"), mime = mime, size = ref.optDouble("size", 0.0))
    }

    /**
     * The file behind a FileRef URL ("/__akan_native/file/<id>" or "https://app.localhost/__akan_native/file/<id>"),
     * e.g. to share a photo taken earlier. null if it is not a file of this session.
     */
    fun file(ref: String): Pair<File, String>? {
        val path = ref.removePrefix("https://app.localhost")
        if (!path.startsWith("/__akan_native/file/")) return null
        return host.file(path.removePrefix("/__akan_native/file/"))
    }

    /** A cache file plus a content:// URI other apps may write to (camera EXTRA_OUTPUT), plugins.md C4. */
    fun captureTarget(name: String): Pair<File, Uri> = host.captureTarget(name)

    /**
     * Starts an activity for a result. [key] identifies the request if the process dies meanwhile
     * (the result then goes to [AkanNativePlugin.onRestoredActivityResult]).
     */
    fun startActivityForResult(key: String, intent: Intent, callback: (resultCode: Int, data: Intent?) -> Unit) =
        runOnMain { host.startActivityForResult(pluginId, key, intent, callback) }

    fun requestPermissions(permissions: Array<String>, callback: (granted: Map<String, Boolean>) -> Unit) =
        runOnMain { host.requestPermissions(permissions, callback) }

    /** granted | denied | prompt | prompt-with-rationale, with "denied" meaning permanently denied. */
    fun permissionState(permission: String): String = host.permissionState(permission)

    val insets: AkanNativeInsets get() = host.insets()

    fun onInsetsChanged(listener: (AkanNativeInsets) -> Unit) = host.onInsetsChanged(listener)

    /**
     * While set, the system back gesture calls [interceptor] instead of going back in the WebView
     * history (plugins.md S3). Only set it while the page listens: a registered callback disables
     * the system's predictive back-to-home animation.
     */
    fun setBackInterceptor(interceptor: (() -> Unit)?) = runOnMain { host.setBackInterceptor(interceptor) }

    /**
     * While an interceptor is set: whether back belongs to the page right now. false leaves back to the system, so the
     * root shows its back-to-home animation. A new interceptor starts at true.
     */
    fun setBackEnabled(enabled: Boolean) = runOnMain { host.setBackEnabled(enabled) }

    /** API 34+: the swipe of a back the interceptor will receive, for a page that animates it; null stops them. */
    fun setBackProgressListener(listener: ((AkanNativeBackProgress) -> Unit)?) = runOnMain { host.setBackProgressListener(listener) }

    /**
     * Keyboard mode (O6-1): true (default) shrinks the WebView's container by the keyboard, false lets
     * the keyboard cover the page.
     */
    fun setImeResize(resize: Boolean) = runOnMain { host.setImeResize(resize) }

    /** The keyboard's show and hide transitions (API 30+: before and after the animation; API 29: both at once). */
    fun onKeyboardTransition(listener: (AkanNativeKeyboardTransition) -> Unit) = host.onKeyboardTransition(listener)

    /** Lets the system splash screen go (SH-6), fading out over [fadeOutMs]. Nothing happens once it is gone. */
    fun hideSplash(fadeOutMs: Long = 200) = runOnMain { host.hideSplash(fadeOutMs) }

    fun runOnMain(block: () -> Unit) {
        if (Looper.myLooper() == Looper.getMainLooper()) block() else main.post(block)
    }
}
