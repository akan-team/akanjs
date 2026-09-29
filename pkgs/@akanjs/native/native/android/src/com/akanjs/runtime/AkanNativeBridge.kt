package com.akanjs.runtime

import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.webkit.WebMessage
import android.webkit.WebMessagePort
import android.webkit.WebView
import java.io.File
import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject
import org.json.JSONTokener

/**
 * Bridge over a framework MessagePort (docs/research/android.md §4.1):
 *   page: listens for "message", then fetch("/__akan_native/hello")
 *   shell: createWebMessageChannel() and postWebMessage(port, targetOrigin = app origin)
 * Only the app-origin main frame receives the port. A JavascriptInterface would be injected
 * into every frame, cross-origin iframes included, so none is registered.
 * All dispatch happens on the main thread (the port callback is bound to the main Handler).
 *
 * Bridge v1.1: requests name their document (one page load, one port). A claim or a request with a
 * new id ends the current document, and calls of ended documents are refused. Responses and events
 * of the current document are numbered (`seq`) on the main thread just before they are posted.
 */
class AkanNativeBridge(private val webView: WebView) {
    private val main = Handler(Looper.getMainLooper())
    private val plugins = LinkedHashMap<String, AkanNativePlugin>()
    private val listeners = HashMap<String, Int>() // "plugin\u0000event" → count

    private var port: WebMessagePort? = null
    private var document: AkanNativeDocument? = null
    /** Ended documents, so their late calls are refused. */
    private val ended = ArrayDeque<String>()

    /** The app's capabilities from boot.json (PL-11); null for builds without an ACL (everything allowed). */
    var acl: AkanNativeAcl? = null

    /** boot.json `plugins`: what each plugin declares natively on Android (the L2 declaration gate). */
    var declarations: Map<*, *> = emptyMap<String, Any?>()

    /**
     * "plugin\u0000event" of events whose payload is a snapshot (plugins[].coalesce): only the latest of
     * a burst is sent (architecture review stage 4). Read once the declarations are set.
     */
    private val coalescing: Set<String> by lazy {
        val keys = mutableSetOf("\$host\u0000tick")
        for ((plugin, decl) in declarations) ((decl as? Map<*, *>)?.get("coalesce") as? List<*>)?.forEach { keys.add("$plugin\u0000$it") }
        keys
    }

    /** Dev builds: the self-test's \$host methods. */
    var dev = false
    /** The page's runtime forwards its console here (a dev build's `$console` attach), so the WebView's copy is spare. */
    @Volatile var consoleForwarded = false

    /** Dev builds: \$host.hang calls still open, and how many were cancelled. */
    private val hanging = ArrayList<AkanNativeCall>()
    private var hangCancels = 0

    fun register(id: String, plugin: AkanNativePlugin) {
        plugins[id] = plugin
    }

    fun plugins(): Collection<AkanNativePlugin> = plugins.values

    fun plugin(id: String): AkanNativePlugin? = plugins[id]

    /** FileRefs are the process's (AkanNativeApp): a page of another activity may still show one. */
    fun file(id: String): Pair<File, String>? = AkanNativeApp.file(id)

    fun registerFile(file: File, mime: String): JSONObject = AkanNativeApp.registerFile(file, mime)

    /** Ports handed out and not claimed yet, with their ring nonce (a few; the oldest is closed). */
    private val offers = ArrayList<Pair<String, WebMessagePort>>()

    /** The nonce of the current port's ring: the page has its port, so rings with it are late retries. */
    private var claimed: String? = null


    /**
     * The doorbell (/__akan_native/hello?n=<nonce>) rang. The shell posts a new port with that nonce to
     * the app-origin main frame, but keeps the current one until the page claims the new port
     * ("akan-native:claim", its first message). Only the page that rang knows its nonce, so a ring from a
     * frame (any frame can ring: a sandboxed frame's fetch carries the app origin as Referer) posts a
     * port the page ignores, and nothing changes (SEC-4; before, every ring reset the page's bridge).
     * A claim means a new document: the previous port and its subscriptions belong to a page that is
     * gone. This is decided on claim and not in onPageStarted because a small page can ring before
     * onPageStarted runs (reproduced on cold starts).
     *
     * The page rings again when no port came within 3 s (the first may have been posted before its
     * listener existed). Every offer for that ring stays open until the page claims one: it takes
     * the first port that reaches it and closes the others, and the shell closes the rest on claim.
     * Rings for the nonce the page already claimed are ignored.
     */
    fun offerPort(nonce: String) = main.post {
        if (nonce == claimed) return@post
        while (offers.size >= MAX_OFFERS) offers.removeAt(0).second.close()
        val (native, page) = webView.createWebMessageChannel()
        native.setWebMessageCallback(object : WebMessagePort.WebMessageCallback() {
            override fun onMessage(p: WebMessagePort, message: WebMessage) {
                if (port !== native) {
                    if (offers.none { it.second === native }) return // closed on another claim
                    claim(nonce, native)
                }
                val text = message.data ?: return
                if (text == CLAIM) return
                dispatch(text, p)
            }
        }, main)
        offers.add(nonce to native)
        webView.postWebMessage(WebMessage("akan-native:port:$nonce", arrayOf(page)), Uri.parse(AkanNativeAssetServer.ORIGIN))
    }

    private fun claim(nonce: String, native: WebMessagePort) {
        for ((_, other) in offers) if (other !== native) other.close() // retries, rings of frames, or of the page that is gone
        offers.clear()
        port?.close()
        endDocument()
        port = native
        claimed = nonce
    }

    /**
     * The page's document ended (a new one claimed a port or called, or the activity is gone). In
     * this order, each step guarded, done by the host without asking the page: its calls end (their
     * plugins' onCancel handlers run), its subscriptions stop, what its calls own is closed (last
     * first), then the plugins' documentEnded hooks run. Calling it again does nothing.
     */
    fun endDocument() {
        val doc = document ?: return
        document = null
        if (doc.id.isNotEmpty()) {
            ended.addLast(doc.id)
            while (ended.size > 16) ended.removeFirst()
        }
        val running = doc.running.values.mapNotNull { it.get() }
        doc.running.clear()
        for (call in running) safely("bridge") { call.cancel(AkanNativeErrorCode.CANCELLED, "the page that made this call is gone") }
        for ((key, count) in listeners) {
            if (count <= 0) continue
            val (plugin, event) = key.split('\u0000', limit = 2)
            safely(plugin) { plugins[plugin]?.stopListening(event) }
        }
        listeners.clear()
        for (dispose in doc.end()) safely("bridge") { dispose() }
        for ((id, plugin) in plugins) safely(id) { plugin.documentEnded(doc.id) }
    }

    /** The window (activity) is gone: its document ends and the App services forget its plugins' listeners. */
    fun windowEnded(owner: Any) {
        endDocument()
        AkanNativeLinks.removeAll(owner)
    }

    /** Table sizes for the document churn check (K13, dev \$host.info). */
    private fun stats(): JSONObject = JSONObject()
        .put("documents", if (document == null) 0 else 1)
        .put("ended", ended.size)
        .put("subscriptions", listeners.values.sum())
        .put("running", document?.running?.size ?: 0)
        .put("resources", document?.resourceCount ?: 0)
        .put("files", AkanNativeApp.fileCount)
        .put("linkListeners", AkanNativeLinks.listenerCount)

    /** The document of a request: a new id ends the current one, an ended one gets null. */
    private fun dispatch(text: String, port: WebMessagePort) {
        val raw = try {
            JSONTokener(text).nextValue()
        } catch (e: JSONException) {
            return post(port, error(0, AkanNativeErrorCode.INVALID_ARGS, "request is not JSON"), AkanNativeDocument(""))
        }
        val parsed = AkanNativeAcl.plain(raw)
        // SEC-3: the shape of the request, checked like every host does (AkanNativeKernel, shared vectors).
        AkanNativeKernel.validateRequest(parsed)?.let { problem ->
            val id = ((parsed as? Map<*, *>)?.get("id") as? Number)?.toDouble()?.takeIf { it == Math.floor(it) }?.toLong() ?: 0
            return post(port, error(id, AkanNativeErrorCode.INVALID_ARGS, problem), AkanNativeDocument(""))
        }
        val req = parsed as Map<*, *>
        val id = (req["id"] as Number).toLong()
        val pluginId = req["plugin"] as String
        val method = req["method"] as String
        // Bridge v1.1: which document the request belongs to (AkanNativeKernel.admitDocument).
        val docId = req["doc"] as String?
        val doc = when (AkanNativeKernel.admitDocument(document?.id, ended, docId)) {
            AkanNativeAdmission.CURRENT -> document!!
            AkanNativeAdmission.NEW -> {
                endDocument()
                AkanNativeDocument(docId ?: "").also { document = it }
            }
            AkanNativeAdmission.ENDED -> return post(port, error(id, AkanNativeErrorCode.INTERNAL, "the page that made this call is gone"), AkanNativeDocument(""))
            // Its answer would take a number the page runtime never sees, and its id would be spent
            // for the runtime's own request with that id.
            AkanNativeAdmission.NO_DOC -> return post(port, error(id, AkanNativeErrorCode.INVALID_ARGS, "request has no document id"), AkanNativeDocument(""))
        }
        // v1.1 `once`, before any AkanNativeCall exists: a dropped one would be answered by its safety net.
        if (doc.id.isNotEmpty() && !doc.ids.accept(id)) {
            Log.w(TAG, "dropping a repeated request $id")
            return
        }
        val args = (raw as JSONObject).optJSONObject("args") ?: JSONObject()
        val call = AkanNativeCall(method, args) { body ->
            onMain { doc.running.remove(id) }
            body.put("v", 1).put("id", id)
            post(port, body, doc)
        }
        if (pluginId == "\$bridge") return bridgeOp(call, doc)
        doc.running[id] = java.lang.ref.WeakReference(call)
        call.document = doc
        if (pluginId == "\$console") return console(call)
        if (pluginId == "\$host") return host(call)
        val plugin = plugins[pluginId] ?: return call.reject(AkanNativeErrorCode.NOT_FOUND, "plugin $pluginId is not registered")
        // L2: an undeclared method or event never reaches the plugin, whatever its code handles.
        val subscription = method == "\$listen" || method == "\$unlisten"
        if (!AkanNativeKernel.declares(declarations[pluginId], method, if (subscription) call.string("event") else null)) {
            return call.reject(AkanNativeErrorCode.NOT_FOUND, if (subscription) "event $pluginId.${call.string("event")} is not declared" else "method $pluginId.$method is not declared")
        }
        // PL-11 / plugins.md C7: checked before the plugin sees the call. $unlisten always passes.
        val rules = acl
        if (method != "\$unlisten" && rules != null) {
            val event = call.string("event") ?: ""
            val (allowed, scope) = rules.check(pluginId, if (method == "\$listen") "listen:$event" else method)
            if (!allowed) {
                val what = if (method == "\$listen") "$event events" else "$method()"
                return call.reject(AkanNativeErrorCode.NOT_ALLOWED, "$pluginId.$what is not allowed by the app's capabilities")
            }
            call.scope = scope
        }
        if (method == "\$listen" || method == "\$unlisten") {
            val event = call.string("event") ?: return call.reject(AkanNativeErrorCode.INVALID_ARGS, "$method requires args.event")
            val key = "$pluginId\u0000$event"
            val before = listeners[key] ?: 0
            val after = maxOf(0, before + if (method == "\$listen") 1 else -1)
            listeners[key] = after
            if (before == 0 && after == 1) safely(pluginId) { plugin.startListening(event) }
            if (before > 0 && after == 0) safely(pluginId) { plugin.stopListening(event) }
            return call.resolve()
        }
        try {
            plugin.handle(call)
        } catch (e: Exception) {
            Log.e(TAG, "$pluginId.$method failed", e)
            call.reject(AkanNativeErrorCode.INTERNAL, e.toString())
        } catch (e: LinkageError) { // an API this Android lacks, reached without a version check
            Log.e(TAG, "$pluginId.$method needs an API this Android version does not have", e)
            call.reject(AkanNativeErrorCode.UNSUPPORTED, "$pluginId.$method is not available on this Android version")
        }
    }

    /**
     * \$bridge operations (v1.1 `cancel`): follow-ups on what this document's own calls handed out,
     * so they need no ACL entry. Messages come in order over the port, so a cancel never overtakes its call.
     */
    private fun bridgeOp(call: AkanNativeCall, doc: AkanNativeDocument) {
        if (call.method == "cancel") {
            val target = call.args.getLong("id")
            val running = doc.running.remove(target)?.get() ?: return call.resolve(JSONObject().put("cancelled", false))
            val timeout = call.string("reason") == "timeout"
            running.cancel(if (timeout) AkanNativeErrorCode.TIMEOUT else AkanNativeErrorCode.CANCELLED, if (timeout) "the page's time limit for this call ran out" else "cancelled by the page")
            return call.resolve(JSONObject().put("cancelled", true))
        }
        // release
        val url = call.string("url") ?: ""
        val path = url.removePrefix(AkanNativeAssetServer.ORIGIN)
        val released = path.startsWith("/__akan_native/file/") && AkanNativeApp.releaseFile(path.removePrefix("/__akan_native/file/"))
        call.resolve(JSONObject().put("released", released))
    }

    private fun onMain(block: () -> Unit) {
        if (Looper.myLooper() == Looper.getMainLooper()) block() else main.post(block)
    }

    fun emit(plugin: String, event: String, data: Any?) {
        if ((listeners["$plugin\u0000$event"] ?: 0) == 0) return
        send(plugin, event, data)
    }

    /** An event for the current document. */
    private fun send(plugin: String, event: String, data: Any?) = onMain {
        val message = JSONObject().put("v", 1).put("plugin", plugin).put("event", event)
        if (data != null) message.put("data", data)
        val target = port ?: return@onMain
        val doc = document ?: return@onMain
        val key = "$plugin\u0000$event"
        if (key !in coalescing) return@onMain post(target, message, doc)
        // The last waiting entry is replaced when it is the same event; otherwise it queues behind.
        if (doc.outbox.lastOrNull()?.first == key) doc.outbox[doc.outbox.size - 1] = key to message else doc.outbox.add(key to message)
        if (!doc.outboxScheduled) {
            doc.outboxScheduled = true
            main.postDelayed({ flushOutbox(doc) }, 100)
        }
    }

    /** Sends the document's waiting coalesced events, in order (numbered now, when they go). Main thread. */
    private fun flushOutbox(doc: AkanNativeDocument) {
        doc.outboxScheduled = false
        if (doc.outbox.isEmpty()) return
        val target = port
        val waiting = doc.outbox.toList()
        doc.outbox.clear()
        if (document !== doc || target == null) return
        for ((_, message) in waiting) deliver(target, message, doc)
    }

    /**
     * Numbers the message (on the main thread, where everything is sent from) and posts it. A plugin
     * may answer after the page reloaded (camera after an activity result, a dialog left open): its
     * port is closed by then and postMessage throws IllegalStateException. The page that asked is
     * gone, so the answer is dropped. Posting also happens from plugin threads: hop to main.
     */
    private fun post(port: WebMessagePort, message: JSONObject, doc: AkanNativeDocument) {
        val send = Runnable {
            flushOutbox(doc) // what waits goes first, so the page sees it in order
            deliver(port, message, doc)
        }
        if (Looper.myLooper() == Looper.getMainLooper()) send.run() else main.post(send)
    }

    /** Numbers a message of `doc` while it is the current document and posts it. Main thread. */
    private fun deliver(port: WebMessagePort, message: JSONObject, doc: AkanNativeDocument) {
        if (doc.id.isNotEmpty()) {
            message.put("doc", doc.id)
            if (document === doc) message.put("seq", ++doc.seq)
        }
        try {
            port.postMessage(WebMessage(jsSafe(message.toString())))
        } catch (e: IllegalStateException) {
            Log.i(TAG, "dropping a bridge message for a page that is gone")
        }
    }

    /** A response for a request that never becomes an AkanNativeCall (not numbered). */
    private fun error(id: Long, code: String, message: String): JSONObject =
        JSONObject().put("v", 1).put("id", id).put("ok", false).put("error", JSONObject().put("code", code).put("message", message))

    /** Shell built-ins the page runtime calls. Dev builds only: the self-test's bridge checks. */
    /** dev builds: the page console at its own priority (WV-3), through the bridge as on iOS and the desktop. */
    private fun console(call: AkanNativeCall) {
        if (!dev) return call.reject(AkanNativeErrorCode.NOT_FOUND, "plugin \$console is not registered")
        consoleForwarded = true
        if (call.method != "attach") {
            val priority = when (call.method) {
                "error" -> Log.ERROR
                "warn" -> Log.WARN
                "trace", "verbose", "debug" -> Log.DEBUG
                else -> Log.INFO
            }
            Log.println(priority, "AkanNativeConsole", (call.string("message") ?: "").trimEnd('\n'))
        }
        call.resolve()
    }

    private fun host(call: AkanNativeCall) {
        // AkanNativeFeatures.DEV is a constant: release builds (false) lose these methods and what only they
        // reach (AkanNativeVectors) in R8 (architecture review stage 6).
        if (!AkanNativeFeatures.DEV || !dev) return call.reject(AkanNativeErrorCode.NOT_FOUND, "unknown host method ${call.method}")
        when (call.method) {
            "echo" -> { // answers, then sends an event right after the answer (the order check)
                call.resolve(call.args)
                send("\$host", "echo", call.args)
            }
            "info" -> call.resolve(JSONObject().put("instance", AkanNativeApp.instance).put("bundleSelections", AkanNativeApp.bundleSelections).put("windows", AkanNativeApp.windows).put("stats", stats()).put("cancels", hangCancels))
            "burst" -> { // coalescing \$host.tick events, then the answer (the coalesce check)
                val count = call.int("count") ?: 0
                for (n in 0 until count) send("\$host", "tick", JSONObject().put("n", n))
                call.resolve(JSONObject().put("sent", count))
            }
            "hang" -> { // never answers by itself; counts its cancellation (v1.1 cancel check)
                hanging.add(call)
                call.onCancel {
                    hangCancels++
                    hanging.remove(call)
                }
            }
            "vectors" -> { // the shared vectors against this device's kernel (AkanNativeVectors), off the main thread
                Thread {
                    val result = AkanNativeVectors.run()
                    call.resolve(JSONObject().put("passed", result.passed).put("expected", AkanNativeVectors.expected).put("failures", JSONArray(result.failures.take(20))))
                }.start()
            }
            "recreate" -> { // a new activity in this process
                call.resolve()
                main.postDelayed({ (webView.context as? android.app.Activity)?.recreate() }, 200)
            }
            else -> call.reject(AkanNativeErrorCode.NOT_FOUND, "unknown host method ${call.method}")
        }
    }

    private inline fun safely(plugin: String, block: () -> Unit) {
        try {
            block()
        } catch (e: Exception) {
            Log.e(TAG, "plugin $plugin failed", e)
        } catch (e: LinkageError) {
            Log.e(TAG, "plugin $plugin needs an API this Android version does not have", e)
        }
    }

    companion object {
        private const val CLAIM = "akan-native:claim"
        private const val MAX_OFFERS = 4
        /** org.json output is valid JS; escape the two line terminators older engines choke on. */
        fun jsSafe(json: String): String = json.replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")
    }
}

/** One page load (bridge v1.1 `doc`): the numbering of what it is sent, and its request ids. Main thread only. */
internal class AkanNativeDocument(override val id: String) : AkanNativeDocumentScope {
    var seq = 0
    val ids = AkanNativeCallIds()
    /** Calls not answered yet (v1.1 `cancel`). Weak: a call a plugin drops must still be collected, which answers it. */
    val running = HashMap<Long, java.lang.ref.WeakReference<AkanNativeCall>>()
    /** Coalescing events not sent yet, in order (AkanNativeBridge.send). Main thread. */
    val outbox = ArrayList<Pair<String, JSONObject>>()
    var outboxScheduled = false
    override var ended = false
        private set
    private val resources = LinkedHashMap<Long, () -> Unit>()
    private var nextToken = 0L

    override fun own(dispose: () -> Unit): Long {
        if (ended) {
            dispose()
            return 0
        }
        resources[++nextToken] = dispose
        return nextToken
    }

    override fun disown(token: Long) {
        resources.remove(token)
    }

    val resourceCount: Int get() = resources.size

    /** Marks it ended and hands over its disposers, last owned first. */
    fun end(): List<() -> Unit> {
        ended = true
        return resources.values.reversed().also { resources.clear() }
    }
}

/**
 * A document's request ids (v1.1 `once`): each is accepted once. Ids grow within a document; recent
 * ones are kept in a set and older ones covered by a floor (CallIds in @akanjs/native/desktop).
 */
internal class AkanNativeCallIds {
    private var floor = Long.MIN_VALUE
    private val seen = HashSet<Long>()

    fun accept(id: Long): Boolean {
        if (id <= floor || id in seen) return false
        seen.add(id)
        if (seen.size > 1024) {
            val oldest = seen.sorted().take(512)
            seen.removeAll(oldest.toSet())
            floor = oldest.last()
        }
        return true
    }
}
