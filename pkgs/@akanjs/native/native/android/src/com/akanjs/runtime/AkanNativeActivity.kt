package com.akanjs.runtime

import android.Manifest
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.Insets
import android.graphics.drawable.ColorDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.view.ViewTreeObserver
import android.view.Window
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import android.app.AlertDialog
import android.webkit.ConsoleMessage
import android.webkit.GeolocationPermissions
import android.webkit.JsPromptResult
import android.webkit.JsResult
import android.webkit.PermissionRequest
import android.webkit.RenderProcessGoneDetail
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.EditText
import android.widget.FrameLayout
import android.window.BackEvent
import android.window.OnBackAnimationCallback
import android.window.OnBackInvokedCallback
import android.window.OnBackInvokedDispatcher
import com.akanjs.generated.AkanNativeGeneratedPlugins
import java.io.File
import org.json.JSONObject

internal const val TAG = "AkanNative"

/**
 * The Android shell (docs/architecture.md §3.5): one framework Activity hosting a WebView on
 * https://app.localhost. No AppCompat, no AndroidX. Decisions verified in
 * docs/research/android.md: MessagePort bridge, own ContentProvider, IME padding, back handling.
 */
class AkanNativeActivity : Activity(), AkanNativePluginContext.Host {
    private lateinit var webView: WebView
    private lateinit var bridge: AkanNativeBridge
    private lateinit var server: AkanNativeAssetServer
    private lateinit var root: FrameLayout
    private lateinit var shell: JSONObject

    private class PendingResult(val plugin: String, val key: String, val callback: (Int, Intent?) -> Unit)
    private val results = HashMap<Int, PendingResult>()
    /** Requests of a previous process, restored from the saved state (plugins.md C6): code → (plugin, key). */
    private val restoredResults = HashMap<Int, Pair<String, String>>()
    private val permissionResults = HashMap<Int, (Map<String, Boolean>) -> Unit>()
    private var nextRequest = 1000

    /** Read by init.js requests on the WebView's IO thread (initScript). */
    @Volatile private var currentInsets = AkanNativeInsets(0f, 0f, 0f, 0f, false, 0f)
    private val insetsListeners = ArrayList<(AkanNativeInsets) -> Unit>()
    /** Keyboard mode "resize" (O6-1): pad the WebView's container by the IME. */
    private var imeResize = true
    private val keyboardListeners = ArrayList<(AkanNativeKeyboardTransition) -> Unit>()

    private val debuggable get() = (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0

    // ---------------------------------------------------------------- lifecycle

    override fun attachBaseContext(newBase: Context) {
        super.attachBaseContext(newBase)
        // Below API 31 the app's light or dark setting (appearance plugin) is an override of the
        // night bits, applied before the resources exist; it survives rotation and system switches.
        if (Build.VERSION.SDK_INT < 31) AkanNativeCompat.storedNightMode(newBase)?.let { night ->
            applyOverrideConfiguration(Configuration().apply { uiMode = if (night) Configuration.UI_MODE_NIGHT_YES else Configuration.UI_MODE_NIGHT_NO })
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Theme.DeviceDefault.DayNight has an action bar and no NoActionBar variant in the framework.
        requestWindowFeature(Window.FEATURE_NO_TITLE)
        edgeToEdge()
        shell = readAssetJson("akan-native/shell.json")
        imeResize = shell.optString("keyboardResize", "resize") != "none" // O6-1: before the page runs
        AkanNativeExternal.extra = shell.optJSONArray("externalSchemes")?.let { a -> (0 until a.length()).map { a.optString(it) } } ?: emptyList()
        restorePending(savedInstanceState)

        // A WebView too old to parse the page shows a white screen; say what to do instead.
        val chromium = webViewMajor()
        val minimum = shell.optInt("minWebViewVersion", 94)
        if (chromium in 1 until minimum) return showWebViewTooOld(chromium, minimum)

        if (debuggable || shell.optBoolean("devtools")) WebView.setWebContentsDebuggingEnabled(true) // WV-2
        webView = WebView(this)
        applyBackground()
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            setSupportMultipleWindows(false)
            javaScriptCanOpenWindowsAutomatically = false
            setSupportZoom(false)
            // android.autoplay: media plays without a tap first, as it does on iOS and the desktop.
            mediaPlaybackRequiresUserGesture = !shell.optBoolean("autoplay")
        }
        // The page follows prefers-color-scheme itself: no darkening by WebView.
        if (Build.VERSION.SDK_INT >= 33) Api33.noAlgorithmicDarkening(webView.settings)
        else @Suppress("DEPRECATION") { webView.settings.forceDark = WebSettings.FORCE_DARK_OFF }

        bridge = AkanNativeBridge(webView)
        bridge.acl = AkanNativeAcl.load(bootJson)
        bridge.declarations = (runCatching { AkanNativeAcl.plain(org.json.JSONObject(bootJson)) }.getOrNull() as? Map<*, *>)?.get("plugins") as? Map<*, *> ?: emptyMap<String, Any?>()
        bridge.dev = debuggable
        server = AkanNativeAssetServer(assets, bridge, ::initScript)
        server.root = AkanNativeApp.bundleRoot() // UP-2: a downloaded bundle, or null for assets/app; once per process
        AkanNativeApp.windows++
        // A recreated activity (configuration, process restore) brings no new link.
        AkanNativeLinks.connected(if (savedInstanceState == null) AkanNativeLinks.urlOf(this, intent) else null)
        // akan-native dev --hmr: debuggable builds only; the CLI never writes it into a release build either.
        if (debuggable) server.devServer = AkanNativeAssetServer.devServerOrNull(shell.optString("devServer").ifEmpty { null })
        server.devServer?.let { Log.i(TAG, "pages from $it (akan-native dev --hmr)") }
        for ((id, create) in AkanNativeGeneratedPlugins.all) {
            try {
                bridge.register(id, create(AkanNativePluginContext(id, this, webView, this)))
            } catch (e: Exception) {
                Log.e(TAG, "plugin $id failed to start", e)
            } catch (e: LinkageError) { // an API this Android lacks, reached without a version check
                Log.e(TAG, "plugin $id needs an API this Android version does not have", e)
            }
        }

        webView.webViewClient = Client()
        webView.webChromeClient = ChromeClient()

        root = FrameLayout(this)
        root.addView(webView, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        setContentView(root)
        installInsets()
        holdSplash()
        webView.loadUrl(AkanNativeAssetServer.ORIGIN + startPath())
    }

    /** Dev builds (O4-5): the first page's path and query; never one of akan-native's own paths. Else "/". */
    private fun startPath(): String {
        val path = if (debuggable) shell.optString("startPath") else ""
        val ok = path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/__akan_native") && path.none { it.isWhitespace() }
        return if (ok) path else "/"
    }

    /**
     * The WebView's Chromium major from its user agent (Google, AOSP, Huawei and Amazon WebViews all
     * say Chrome/N; Huawei's package version counts differently), else the package version; 0: unknown.
     */
    private fun webViewMajor(): Int {
        val agent = runCatching { WebSettings.getDefaultUserAgent(this) }.getOrNull() ?: ""
        Regex("Chrome/(\\d+)").find(agent)?.let { return it.groupValues[1].toInt() }
        return WebView.getCurrentWebViewPackage()?.versionName?.takeWhile { it.isDigit() }?.toIntOrNull() ?: 0
    }

    /** The shell's own screen for a WebView older than android.minWebViewVersion. */
    private fun showWebViewTooOld(chromium: Int, minimum: Int) {
        unsupportedWebView = true
        Log.e(TAG, "Android System WebView $chromium is older than $minimum (android.minWebViewVersion): not loading the app")
        val pkg = WebView.getCurrentWebViewPackage()?.packageName ?: "com.google.android.webview"
        // Below API 31 the theme's window background is the splash (color and icon): paint over it.
        val color = backgroundColor()
        window.setBackgroundDrawable(ColorDrawable(color))
        lightBars(Color.luminance(color) > 0.5f)
        val pad = (24 * resources.displayMetrics.density).toInt()
        val layout = android.widget.LinearLayout(this).apply {
            orientation = android.widget.LinearLayout.VERTICAL
            gravity = android.view.Gravity.CENTER
            setPadding(pad, pad, pad, pad)
        }
        layout.addView(android.widget.TextView(this).apply {
            text = "This app needs a newer version of Android System WebView (version $minimum or later; this device has $chromium)."
            textSize = 17f
            gravity = android.view.Gravity.CENTER
        })
        layout.addView(android.widget.Button(this).apply {
            text = "Update"
            setOnClickListener {
                val market = Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=$pkg"))
                try {
                    startActivity(market)
                } catch (e: ActivityNotFoundException) {
                    runCatching { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=$pkg"))) }
                }
            }
        })
        setContentView(layout)
    }

    /** The WebView is too old: nothing else was created (showWebViewTooOld). */
    private var unsupportedWebView = false

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        if (unsupportedWebView) return
        setIntent(intent)
        // A plugin's own answer (auth-session's callback) is not a deep link for app.urlOpen (R10).
        val claimed = bridge.plugins().any { runCatching { it.claimsLink(intent) }.getOrDefault(false) }
        if (!claimed) AkanNativeLinks.urlOf(this, intent)?.let(AkanNativeLinks::open)
        for (plugin in bridge.plugins()) runCatching { plugin.onNewIntent(intent) }
        // Dev builds: a relaunch with new env overrides (akan-native run) reloads the page with them.
        if (debuggable && intent.hasExtra(EXTRA_ENV)) webView.reload()
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        if (unsupportedWebView) return
        applyBackground() // dark mode switches without recreating the activity (configChanges has uiMode)
        for (plugin in bridge.plugins()) runCatching { plugin.onConfigurationChanged(newConfig) }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        if (unsupportedWebView) return
        val pending = JSONObject()
        for ((code, p) in results) pending.put(code.toString(), JSONObject().put("plugin", p.plugin).put("key", p.key))
        outState.putString(STATE_PENDING, pending.toString())
    }

    override fun onDestroy() {
        if (unsupportedWebView) return super.onDestroy()
        bridge.windowEnded(this) // the window is gone: so is its page's document
        for (plugin in bridge.plugins()) runCatching { plugin.destroy() }
        (webView.parent as? ViewGroup)?.removeView(webView)
        webView.destroy()
        super.onDestroy()
    }

    private fun restorePending(saved: Bundle?) {
        val text = saved?.getString(STATE_PENDING) ?: return
        val pending = runCatching { JSONObject(text) }.getOrNull() ?: return
        for (key in pending.keys()) {
            val entry = pending.getJSONObject(key)
            restoredResults[key.toInt()] = entry.getString("plugin") to entry.getString("key")
            nextRequest = maxOf(nextRequest, key.toInt() + 1)
        }
    }

    private fun isNight() = (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES

    /** The app's background color (config backgroundColor, backgroundColorDark in night mode). */
    private fun backgroundColor(): Int {
        val hex = if (isNight()) shell.optString("backgroundColorDark", "#000000") else shell.optString("backgroundColor", "#ffffff")
        return runCatching { Color.parseColor(hex) }.getOrDefault(if (isNight()) Color.BLACK else Color.WHITE)
    }

    private fun applyBackground() {
        // SH-3: paint the window and the WebView before the first frame.
        val color = backgroundColor()
        window.setBackgroundDrawable(ColorDrawable(color))
        webView.setBackgroundColor(color)
        // S1: dark bar icons on a light background, light ones on a dark background. The framework
        // DayNight theme keeps them light in day mode, where they vanish on a light page. Following the
        // painted color (not night mode) also fits an app that is dark in day mode.
        lightBars(Color.luminance(color) > 0.5f)
    }

    /**
     * Dark icons on light bars. Above API 30 through the insets controller; up to 30 with the legacy
     * flags, which API 30's controller does not reliably override (react-native WindowUtil.kt uses
     * the controller only above R). The flags word is read, changed and written back: setting it
     * whole would drop the layout and immersive flags.
     */
    @Suppress("DEPRECATION")
    private fun lightBars(light: Boolean) {
        if (Build.VERSION.SDK_INT > 30) return Api30.lightBars(window, light)
        val decor = window.decorView
        val bits = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR or View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
        decor.systemUiVisibility = if (light) decor.systemUiVisibility or bits else decor.systemUiVisibility and bits.inv()
    }

    /**
     * The page draws under the status and navigation bars and the display cutout on every version
     * (SH-2): API 35+ enforces it, below that the window lays its content out between the bars unless
     * told otherwise (react-native WindowUtil.kt, androidx EdgeToEdge). setDecorFitsSystemWindows is a
     * no-op where it is enforced.
     */
    @Suppress("DEPRECATION")
    private fun edgeToEdge() {
        val w = window
        if (Build.VERSION.SDK_INT >= 30) Api30.decorFitsSystemWindows(w, false)
        else w.decorView.systemUiVisibility = w.decorView.systemUiVisibility or
            View.SYSTEM_UI_FLAG_LAYOUT_STABLE or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
        w.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS or WindowManager.LayoutParams.FLAG_TRANSLUCENT_NAVIGATION)
        w.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS)
        if (Build.VERSION.SDK_INT < 35) {
            w.statusBarColor = Color.TRANSPARENT
            w.navigationBarColor = Color.TRANSPARENT
        }
        w.isStatusBarContrastEnforced = false // three-button navigation keeps its scrim (navigation bar contrast)
        w.attributes = w.attributes.apply {
            layoutInDisplayCutoutMode = if (Build.VERSION.SDK_INT >= 30) WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS
            else WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
        }
    }

    // ---------------------------------------------------------------- init.js

    private val bootJson by lazy { readAsset("akan-native/boot.json").trim() }

    /** INIT_PREFIX + boot.json + "," + env + ");" (architecture §3.1). Dev builds accept env overrides. */
    private fun initScript(): String {
        // A downloaded bundle brings the env it was published with (UP-2).
        var env = (if (AkanNativeFeatures.UPDATES) AkanNativeUpdates.active?.let { File(AkanNativeUpdates.bundleDirectory(it.bundle), "env.runtime.json").takeIf(File::isFile)?.readText()?.trim() } else null)
            ?: readAsset("akan-native/env.runtime.json").trim()
        val overrides = if (debuggable) intent?.getStringExtra(EXTRA_ENV) else null
        if (overrides != null) {
            try {
                val merged = JSONObject(env)
                val extra = JSONObject(overrides)
                for (key in extra.keys()) if (key.startsWith("PUBLIC_")) merged.put(key, extra.getString(key))
                env = merged.toString()
            } catch (e: Exception) {
                Log.w(TAG, "ignoring bad $EXTRA_ENV extra", e)
            }
        }
        // The shell's origin and engine: one value every origin comparison uses (`__AKAN_NATIVE__.origin`).
        val version = JSONObject.quote(WebView.getCurrentWebViewPackage()?.versionName ?: "")
        val engine = "window.__AKAN_NATIVE__.origin=\"${AkanNativeAssetServer.ORIGIN}\";window.__AKAN_NATIVE__.engine=\"android-webview\";window.__AKAN_NATIVE__.engineVersion=$version;\n"
        // A new document starts with the current safe area (N14); later changes are pushed.
        return INIT_PREFIX + AkanNativeBridge.jsSafe(bootJson) + "," + AkanNativeBridge.jsSafe(env) + INIT_SUFFIX + engine + cssInsets(currentInsets)
    }

    private fun readAsset(path: String): String = assets.open(path).bufferedReader().use { it.readText() }

    private fun readAssetJson(path: String): JSONObject = runCatching { JSONObject(readAsset(path)) }.getOrDefault(JSONObject())

    // ---------------------------------------------------------------- WebView clients

    private inner class Client : WebViewClient() {
        override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
            server.intercept(request)

        /**
         * SH-4 and L0 (AkanNativeKernel.decideNavigation, the rule every host shares): the WebView never
         * leaves the app origin. A top-level link of an external scheme opens in the system instead,
         * at most once a second; frames load web content but open nothing (WebView asks about frames
         * only for other schemes); everything else goes nowhere. true: not loaded here.
         */
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            val url = request.url
            return when (AkanNativeKernel.decideNavigation(url.toString(), request.isForMainFrame, AkanNativeAssetServer.ORIGIN, AkanNativeExternal.extra)) {
                AkanNativeNavigation.LOAD -> false
                AkanNativeNavigation.DROP -> true.also { Log.i(TAG, "blocked a ${url.scheme}: navigation (${if (request.isForMainFrame) "top level" else "a frame"})") }
                AkanNativeNavigation.OPEN -> {
                    if (!AkanNativeExternal.allowed()) Log.i(TAG, "not opening a ${url.scheme}: link: at most one per second leaves the app")
                    else try {
                        startActivity(Intent(Intent.ACTION_VIEW, url).addCategory(Intent.CATEGORY_BROWSABLE))
                    } catch (e: ActivityNotFoundException) {
                        Log.w(TAG, "no activity for $url")
                    }
                    true
                }
            }
        }

        override fun onPageFinished(view: WebView, url: String) {
            root.requestApplyInsets() // push insets into the new document
            if (splashConfig.optBoolean("autoHide", true)) hideSplash(SPLASH_FADE_MS)
            startReadyTimer()
        }

        override fun doUpdateVisitedHistory(view: WebView, url: String, isReload: Boolean) {
            // canGoBack() is stale inside this callback (verified): check on the next loop turn.
            view.post { updateBackCallback() }
        }

        override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
            // Returning false kills the app. Start over with a fresh WebView (plugins.md S10).
            Log.e(TAG, "WebView renderer gone (crashed=${detail.didCrash()}), recreating")
            // The page is gone now, not when the activity is made again: its calls end and its
            // subscriptions stop, so what arrives meanwhile waits for the next page (a renderer that
            // ends ends the document, architecture review stage 3).
            bridge.endDocument()
            recreate()
            return true
        }
    }

    private inner class ChromeClient : WebChromeClient() {
        override fun onConsoleMessage(message: ConsoleMessage): Boolean { // WV-3
            // A dev page forwards its console through the bridge once its runtime is up; this copy covers the rest.
            if (bridge.consoleForwarded) return true
            val priority = when (message.messageLevel()) {
                ConsoleMessage.MessageLevel.ERROR -> Log.ERROR
                ConsoleMessage.MessageLevel.WARNING -> Log.WARN
                ConsoleMessage.MessageLevel.DEBUG -> Log.DEBUG
                else -> Log.INFO
            }
            Log.println(priority, "AkanNativeConsole", message.message().trimEnd('\n'))
            return true
        }

        /** getUserMedia (plugins.md S6): only for the app origin and only permissions the manifest declares. */
        override fun onPermissionRequest(request: PermissionRequest) {
            // The app origin exactly (scheme, host and port), not any page on that host name (L0).
            if (request.origin.toString().trimEnd('/') != AkanNativeAssetServer.ORIGIN) return request.deny()
            val wanted = HashMap<String, String>() // WebView resource → Android permission
            for (resource in request.resources) {
                when (resource) {
                    PermissionRequest.RESOURCE_VIDEO_CAPTURE -> wanted[resource] = Manifest.permission.CAMERA
                    PermissionRequest.RESOURCE_AUDIO_CAPTURE -> wanted[resource] = Manifest.permission.RECORD_AUDIO
                }
            }
            if (wanted.isEmpty() || !wanted.values.all(::declares)) return request.deny()
            requestPermissions(wanted.values.distinct().toTypedArray()) { granted ->
                val allowed = wanted.filterValues { granted[it] == true }.keys.toTypedArray()
                if (allowed.isEmpty()) request.deny() else request.grant(allowed)
            }
        }

        /**
         * navigator.geolocation (plugins.md S6, C8): only for the app origin and only when the manifest
         * declares location (a plugin or the app's `permissions.location`). Without this override
         * WebView denies every request. Approximate location alone counts as allowed.
         */
        override fun onGeolocationPermissionsShowPrompt(origin: String, callback: GeolocationPermissions.Callback) {
            val wanted = listOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION).filter(::declares)
            if (origin.trimEnd('/') != AkanNativeAssetServer.ORIGIN || wanted.isEmpty()) return callback.invoke(origin, false, false)
            requestPermissions(wanted.toTypedArray()) { granted -> callback.invoke(origin, granted.values.any { it }, false) }
        }

        // JS alert/confirm/prompt (plugins.md S7). The WebChromeClient defaults put the page URL in the
        // title; these follow wry RustWebChromeClient.kt, plus prompt's default text (wry drops it)
        // and localized framework button labels.
        override fun onJsAlert(view: WebView, url: String, message: String, result: JsResult): Boolean {
            if (isFinishing) return false.also { result.cancel() }
            AlertDialog.Builder(this@AkanNativeActivity)
                .setMessage(message)
                .setPositiveButton(android.R.string.ok) { _, _ -> result.confirm() }
                .setOnCancelListener { result.cancel() }
                .show()
            return true
        }

        override fun onJsConfirm(view: WebView, url: String, message: String, result: JsResult): Boolean {
            if (isFinishing) return false.also { result.cancel() }
            AlertDialog.Builder(this@AkanNativeActivity)
                .setMessage(message)
                .setPositiveButton(android.R.string.ok) { _, _ -> result.confirm() }
                .setNegativeButton(android.R.string.cancel) { _, _ -> result.cancel() }
                .setOnCancelListener { result.cancel() }
                .show()
            return true
        }

        override fun onJsPrompt(view: WebView, url: String, message: String, defaultValue: String?, result: JsPromptResult): Boolean {
            if (isFinishing) return false.also { result.cancel() }
            val input = EditText(this@AkanNativeActivity).apply {
                setText(defaultValue ?: "")
                setSingleLine()
            }
            AlertDialog.Builder(this@AkanNativeActivity)
                .setMessage(message)
                .setView(input)
                .setPositiveButton(android.R.string.ok) { _, _ -> result.confirm(input.text.toString()) }
                .setNegativeButton(android.R.string.cancel) { _, _ -> result.cancel() }
                .setOnCancelListener { result.cancel() }
                .show()
            return true
        }

        // Full-screen video and element.requestFullscreen() (plugins.md S9). Capacitor and wry
        // answer onShowCustomView with onCustomViewHidden(), i.e. no full screen at all; this puts
        // the view over everything with the system bars hidden, and back leaves it.
        override fun onShowCustomView(view: View, callback: CustomViewCallback) {
            if (fullscreenView != null) return callback.onCustomViewHidden()
            fullscreenView = view
            fullscreenCallback = callback
            view.setBackgroundColor(Color.BLACK)
            (window.decorView as ViewGroup).addView(view, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
            systemBars(visible = false)
            updateBackCallback()
        }

        override fun onHideCustomView() = removeFullscreenView()

        // The default poster of a <video> without one is a grey play icon; browsers show nothing.
        override fun getDefaultVideoPoster(): Bitmap = Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888)

        override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
            // Without this, <input type=file> does nothing on Android (plugins.md S8).
            try {
                startActivityForResult("shell", "fileChooser", fileChooserIntent(params)) { code, data ->
                    callback.onReceiveValue(if (code == android.app.Activity.RESULT_OK) chosenFiles(data) else null)
                }
            } catch (e: ActivityNotFoundException) {
                callback.onReceiveValue(null)
            }
            return true
        }
    }

    /**
     * The system document picker for <input type=file>, with its `accept` types and `multiple`
     * (FileChooserParams.createIntent takes only the first type and one file).
     */
    private fun fileChooserIntent(params: WebChromeClient.FileChooserParams): Intent {
        val types = params.acceptTypes.orEmpty().flatMap { it.split(',') }.map { it.trim().lowercase() }.filter { it.isNotEmpty() }.mapNotNull { type ->
            if (type.startsWith(".")) android.webkit.MimeTypeMap.getSingleton().getMimeTypeFromExtension(type.drop(1)) else type.takeIf { '/' in it }
        }.distinct()
        return Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).apply {
            type = types.singleOrNull() ?: "*/*"
            if (types.size > 1) putExtra(Intent.EXTRA_MIME_TYPES, types.toTypedArray())
            if (params.mode == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE) putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
        }
    }

    /**
     * What the picker returned, keeping only content: URIs of other apps' providers. A picker is
     * any app that answers the intent: a file: URI or one of this app's own providers
     * (AkanNativeFileProvider) would hand the page this app's private files to upload.
     */
    private fun chosenFiles(data: Intent?): Array<Uri>? {
        val uris = buildList {
            data?.clipData?.let { clip -> for (i in 0 until clip.itemCount) clip.getItemAt(i).uri?.let(::add) }
            if (isEmpty()) data?.data?.let(::add)
        }
        val allowed = uris.filter { uri ->
            val authority = uri.authority
            uri.scheme == "content" && authority != null && packageManager.resolveContentProvider(authority, 0)?.packageName.let { it != null && it != packageName }
        }
        if (allowed.size < uris.size) Log.w(TAG, "file chooser: ignored ${uris.size - allowed.size} file(s) that are not another app's content")
        return allowed.takeIf { it.isNotEmpty() }?.toTypedArray()
    }

    // ---------------------------------------------------------------- splash (SH-6)

    private val splashConfig get() = shell.optJSONObject("splash") ?: JSONObject()
    private var splashHold: ViewTreeObserver.OnPreDrawListener? = null
    private var splashFadeOut = SPLASH_FADE_MS
    private val splashTimeout = Runnable {
        // capacitor-plugins/splash-screen warns the same way: the app looks slower than it is.
        Log.w(TAG, "splash hidden after the ${splashConfig.optLong("timeout", 10_000)} ms timeout; call splash.hide() once the UI is ready (or raise splash.timeout)")
        hideSplash(SPLASH_FADE_MS)
    }

    /**
     * Keeps the system splash screen (theme windowSplashScreen*) up until the page has loaded: the
     * content does not draw while this pre-draw listener says no, which is all androidx
     * SplashScreen.setKeepOnScreenCondition does (capacitor-plugins/splash-screen SplashScreen.java).
     */
    private fun holdSplash() {
        val hold = ViewTreeObserver.OnPreDrawListener { false }
        root.viewTreeObserver.addOnPreDrawListener(hold)
        splashHold = hold
        root.postDelayed(splashTimeout, splashConfig.optLong("timeout", 10_000))
        // Below API 31 the system removes the starting window with its own animation.
        if (Build.VERSION.SDK_INT >= 31) Api31.fadeSplash(this) { splashFadeOut }
    }

    // ---------------------------------------------------------------- insets (SH-2, useKeyboard)

    /** Bars and cutout, the IME's bottom edge (0 when hidden) and whether the IME shows, in pixels. */
    private class Measured(val bars: Insets, val imeBottom: Int, val imeVisible: Boolean)

    private fun installInsets() {
        root.setOnApplyWindowInsetsListener { view, insets ->
            val m = if (Build.VERSION.SDK_INT >= 30) Api30.measure(insets) else legacyMeasure(insets)
            val sys = m.bars
            val density = resources.displayMetrics.density
            // Keyboard height above the navigation bar, like react-native ReactRootView.
            val keyboard = if (m.imeVisible) maxOf(0, m.imeBottom - sys.bottom) else 0
            val next = AkanNativeInsets(sys.top / density, sys.right / density, sys.bottom / density, sys.left / density, m.imeVisible, keyboard / density)
            if (next != currentInsets) {
                val wasVisible = currentInsets.imeVisible
                currentInsets = next
                for (listener in insetsListeners.toList()) runCatching { listener(next) }
                // API 29 has no inset animations: will and did together, when the keyboard shows or hides.
                if (Build.VERSION.SDK_INT < 30 && wasVisible != next.imeVisible) {
                    val show = next.imeVisible
                    keyboardTransition(if (show) "willShow" else "willHide", next.imeHeight, 0)
                    keyboardTransition(if (show) "didShow" else "didHide", next.imeHeight, 0)
                }
            }
            // N14: --akan-native-safe-area-* on every WebView (older than 140 has no env(safe-area-inset-*),
            // capacitor SystemBars.java), the same names as on iOS, so a page reads one set of values.
            if (::webView.isInitialized) webView.evaluateJavascript(cssInsets(next), null)
            // "Resize" keyboard mode: shrink the WebView container by the IME so fixed bottom UI stays
            // visible (WebView ignores interactive-widget). Do not consume the insets (crbug 461332423).
            view.setPadding(0, 0, 0, if (m.imeVisible && imeResize) m.imeBottom else 0)
            val bars = Insets.of(sys.left, sys.top, sys.right, if (m.imeVisible) 0 else sys.bottom)
            if (Build.VERSION.SDK_INT >= 30) Api30.withBars(insets, bars)
            else @Suppress("DEPRECATION") WindowInsets.Builder(insets).setSystemWindowInsets(bars).build()
        }
        if (Build.VERSION.SDK_INT >= 30) Api30.watchImeAnimation(root) { show, heightPx, duration, done ->
            val phase = if (done) (if (show) "didShow" else "didHide") else (if (show) "willShow" else "willHide")
            keyboardTransition(phase, if (show) heightPx / resources.displayMetrics.density else 0f, duration)
        }
    }

    private fun keyboardTransition(phase: String, height: Float, durationMs: Long) {
        val t = AkanNativeKeyboardTransition(phase, height, durationMs)
        for (listener in keyboardListeners.toList()) runCatching { listener(t) }
    }

    /**
     * API 29 has no inset types: the system window insets hold the bars and, with adjustResize, the
     * IME; the stable insets hold the bars alone, so a system window bottom above the stable one is
     * the keyboard (androidx WindowInsetsCompat's rule). The cutout comes separately.
     */
    @Suppress("DEPRECATION")
    private fun legacyMeasure(insets: WindowInsets): Measured {
        val sw = insets.systemWindowInsets
        val st = insets.stableInsets
        val cut = insets.displayCutout
        val imeVisible = sw.bottom > st.bottom
        val bars = Insets.of(
            maxOf(sw.left, cut?.safeInsetLeft ?: 0), maxOf(sw.top, cut?.safeInsetTop ?: 0),
            maxOf(sw.right, cut?.safeInsetRight ?: 0), maxOf(minOf(sw.bottom, st.bottom), cut?.safeInsetBottom ?: 0),
        )
        return Measured(bars, if (imeVisible) sw.bottom else 0, imeVisible)
    }

    /** The CSS variables for these insets, in CSS px; bottom is 0 while the keyboard shows (as WebView's env() does). */
    private fun cssInsets(i: AkanNativeInsets): String {
        val bottom = if (i.imeVisible) 0f else i.bottom
        return "document.documentElement&&(function(s){s.setProperty('--akan-native-safe-area-top','${i.top}px');" +
            "s.setProperty('--akan-native-safe-area-right','${i.right}px');s.setProperty('--akan-native-safe-area-bottom','${bottom}px');" +
            "s.setProperty('--akan-native-safe-area-left','${i.left}px')})(document.documentElement.style);\n"
    }

    // ---------------------------------------------------------------- full screen (plugins.md S9)

    private var fullscreenView: View? = null
    private var fullscreenCallback: WebChromeClient.CustomViewCallback? = null

    private fun removeFullscreenView() {
        val view = fullscreenView ?: return
        fullscreenView = null
        fullscreenCallback = null
        (window.decorView as ViewGroup).removeView(view)
        systemBars(visible = true)
        updateBackCallback()
    }

    /**
     * Hides the system bars for a full-screen view (swipe brings them back for a moment) or shows
     * them again. Below API 30 the immersive flags; never the window's FLAG_FULLSCREEN, which turns
     * adjustResize off.
     */
    @Suppress("DEPRECATION")
    private fun systemBars(visible: Boolean) {
        if (Build.VERSION.SDK_INT >= 30) return Api30.systemBars(window, visible)
        val decor = window.decorView
        val bits = View.SYSTEM_UI_FLAG_FULLSCREEN or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
        decor.systemUiVisibility = if (visible) decor.systemUiVisibility and bits.inv() else decor.systemUiVisibility or bits
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        // Below API 30 a dialog or permission prompt clears the immersive flags: hide the bars again.
        if (hasFocus && fullscreenView != null && Build.VERSION.SDK_INT < 30) systemBars(visible = false)
    }

    /** Back or the page leaving: tell WebView (it exits document.fullscreenElement), then drop the view. */
    private fun exitFullscreen() {
        fullscreenCallback?.onCustomViewHidden()
        removeFullscreenView()
    }

    // ---------------------------------------------------------------- back (SH-5)

    private var backInterceptor: (() -> Unit)? = null
    private var backEnabled = true
    private var backProgressListener: ((AkanNativeBackProgress) -> Unit)? = null

    /** What back does inside the app. false: nothing to do here (the root, or a listener that gave back up). */
    private fun handleBack(): Boolean {
        val interceptor = backInterceptor
        when {
            fullscreenView != null -> exitFullscreen()
            interceptor != null && backEnabled -> interceptor()
            interceptor != null -> return false
            webView.canGoBack() -> webView.goBack()
            else -> return false
        }
        webView.post { updateBackCallback() }
        return true
    }

    /** A swipe reaches the page only when the page will take the back it ends in; a full-screen view's is its own. */
    private fun reportBackProgress(progress: AkanNativeBackProgress) {
        if (fullscreenView == null && backInterceptor != null && backEnabled) backProgressListener?.invoke(progress)
    }

    /** API 33+: the registered OnBackInvokedCallback (created only there: the interface is API 33). */
    private var backCallback: Any? = null
    private var backRegistered = false

    /**
     * API 33+: intercept back only while a full-screen view is up, a page listener wants it, or (with no listener)
     * there is history, so the system back-to-home animation stays at the root. Below 33 onBackPressed() does the same.
     */
    private fun updateBackCallback() {
        if (Build.VERSION.SDK_INT < 33) return
        val want = fullscreenView != null || if (backInterceptor != null) backEnabled else webView.canGoBack()
        if (want != backRegistered)
            backCallback = Api33.setBackCallback(this, backCallback, want, { handleBack() }, ::reportBackProgress)
        backRegistered = want
    }

    /** Below API 33 only (enableOnBackInvokedCallback takes it over from 33). */
    @Deprecated("the platform calls it below API 33 only")
    @Suppress("DEPRECATION")
    override fun onBackPressed() {
        if (unsupportedWebView) return super.onBackPressed()
        if (handleBack()) return
        // At the root: 31+ moves the task back and keeps the page; 29 and 30 would finish the activity.
        if (Build.VERSION.SDK_INT < 31) moveTaskToBack(true) else super.onBackPressed()
    }

    // ---------------------------------------------------------------- results and permissions (plugins.md C1, C3)

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        val pending = results.remove(requestCode)
        if (pending != null) return pending.callback(resultCode, data)
        val restored = restoredResults.remove(requestCode)
        if (restored != null) {
            val plugin = bridge.plugin(restored.first)
            if (plugin != null) runCatching { plugin.onRestoredActivityResult(restored.second, resultCode, data) }
            else Log.w(TAG, "activity result for ${restored.first}/${restored.second} after process restart dropped")
            return
        }
        super.onActivityResult(requestCode, resultCode, data)
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<String>, grantResults: IntArray) {
        val callback = permissionResults.remove(requestCode) ?: return
        // Empty when the request was cancelled (another one was showing): nothing was answered.
        val answers = permissions.indices.associate { permissions[it] to (grantResults.getOrNull(it) == PackageManager.PERMISSION_GRANTED) }
        permissionHistory.record(answers)
        callback(answers)
        permissionQueue.removeFirstOrNull()?.invoke() // the next request, one at a time
    }

    private fun declares(permission: String): Boolean = try {
        packageManager.getPackageInfo(packageName, PackageManager.GET_PERMISSIONS).requestedPermissions?.contains(permission) == true
    } catch (e: PackageManager.NameNotFoundException) {
        false
    }

    private val permissionHistory by lazy { AkanNativePermissionHistory(this) }

    /** Requests waiting for the one on screen: Android cancels a request made while another shows. */
    private val permissionQueue = ArrayDeque<() -> Unit>()

    // ---------------------------------------------------------------- AkanNativePluginContext.Host

    override fun emit(plugin: String, event: String, data: Any?) = bridge.emit(plugin, event, data)

    override fun registerFile(file: File, mime: String): JSONObject = bridge.registerFile(file, mime)

    override fun file(id: String): Pair<File, String>? = bridge.file(id)

    override fun captureTarget(name: String): Pair<File, Uri> = AkanNativeFileProvider.target(this, name)

    override fun startActivityForResult(plugin: String, key: String, intent: Intent, callback: (resultCode: Int, data: Intent?) -> Unit) {
        val code = nextRequest++
        results[code] = PendingResult(plugin, key, callback)
        try {
            startActivityForResult(intent, code)
        } catch (e: RuntimeException) { // ActivityNotFoundException, SecurityException
            results.remove(code)
            throw e
        }
    }

    override fun requestPermissions(permissions: Array<String>, callback: (granted: Map<String, Boolean>) -> Unit) {
        val request: () -> Unit = {
            val missing = permissions.filter { checkSelfPermission(it) != PackageManager.PERMISSION_GRANTED }
            if (missing.isEmpty()) {
                callback(permissions.associateWith { true })
                permissionQueue.removeFirstOrNull()?.invoke()
            } else {
                val code = nextRequest++
                permissionResults[code] = { granted -> callback(permissions.associateWith { granted[it] ?: (checkSelfPermission(it) == PackageManager.PERMISSION_GRANTED) }) }
                requestPermissions(missing.toTypedArray(), code)
            }
        }
        if (permissionResults.isEmpty()) request() else permissionQueue.addLast(request)
    }

    override fun permissionState(permission: String): String = when {
        checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED -> AkanNativePermission.GRANTED
        shouldShowRequestPermissionRationale(permission) -> AkanNativePermission.PROMPT_WITH_RATIONALE
        permission in permissionHistory -> AkanNativePermission.DENIED
        else -> AkanNativePermission.PROMPT
    }

    override fun insets(): AkanNativeInsets = currentInsets

    override fun onInsetsChanged(listener: (AkanNativeInsets) -> Unit) {
        insetsListeners.add(listener)
    }

    override fun setImeResize(resize: Boolean) {
        if (imeResize == resize) return
        imeResize = resize
        root.requestApplyInsets()
    }

    override fun onKeyboardTransition(listener: (AkanNativeKeyboardTransition) -> Unit) {
        keyboardListeners.add(listener)
    }

    override fun setBackInterceptor(interceptor: (() -> Unit)?) {
        backInterceptor = interceptor
        backEnabled = true
        updateBackCallback()
    }

    override fun setBackEnabled(enabled: Boolean) {
        backEnabled = enabled
        updateBackCallback()
    }

    override fun setBackProgressListener(listener: ((AkanNativeBackProgress) -> Unit)?) {
        backProgressListener = listener
    }

    // ---------------------------------------------------------------- web bundle updates (UP-2)

    private val readyTimeout = Runnable {
        if (AkanNativeFeatures.UPDATES && AkanNativeUpdates.onTrial) serveBundle(AkanNativeUpdates.rollback())
    }

    /** A bundle on trial must call notifyReady() within updates.readyTimeout of loading. */
    private fun startReadyTimer() {
        webView.removeCallbacks(readyTimeout)
        if (!AkanNativeFeatures.UPDATES) return
        val timeout = AkanNativeUpdates.config?.readyTimeoutMs ?: return
        if (AkanNativeUpdates.onTrial) webView.postDelayed(readyTimeout, timeout)
    }

    /** Serves another web bundle (null: the APK's own) and loads it from the start. */
    override fun serveBundle(root: File?) {
        webView.removeCallbacks(readyTimeout)
        server.root = root
        webView.loadUrl("${AkanNativeAssetServer.ORIGIN}/")
    }

    override fun hideSplash(fadeOutMs: Long) {
        val hold = splashHold ?: return
        splashHold = null
        splashFadeOut = fadeOutMs
        root.removeCallbacks(splashTimeout)
        root.viewTreeObserver.removeOnPreDrawListener(hold)
        root.invalidate()
    }

    /** For plugins: whether the WebView has history to go back to. */
    fun canGoBack(): Boolean = webView.canGoBack()

    // ---------------------------------------------------------------- newer APIs (lib/apilevel.ts)

    private object Api30 {
        @Suppress("DEPRECATION") // deprecated in 35, where edge-to-edge is enforced and this is a no-op
        fun decorFitsSystemWindows(window: Window, fits: Boolean) = window.setDecorFitsSystemWindows(fits)

        fun lightBars(window: Window, light: Boolean) {
            val bits = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS or WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
            window.insetsController?.setSystemBarsAppearance(if (light) bits else 0, bits)
        }

        fun systemBars(window: Window, visible: Boolean) {
            val controller = window.insetsController ?: return
            if (visible) return controller.show(WindowInsets.Type.systemBars())
            controller.hide(WindowInsets.Type.systemBars())
            controller.systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }

        private val bars get() = WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout()

        fun measure(insets: WindowInsets): Measured {
            val ime = WindowInsets.Type.ime()
            val visible = insets.isVisible(ime)
            return Measured(insets.getInsets(bars), if (visible) insets.getInsets(ime).bottom else 0, visible)
        }

        fun withBars(insets: WindowInsets, value: Insets): WindowInsets = WindowInsets.Builder(insets).setInsets(bars, value).build()

        /**
         * The IME's show and hide animations: [report] (show, height px above the bars once it ends,
         * duration ms, ended) at the start and at the end. At the start the view's root insets are
         * already the end state.
         */
        fun watchImeAnimation(view: View, report: (Boolean, Float, Long, Boolean) -> Unit) {
            val ime = WindowInsets.Type.ime()
            fun target(): Pair<Boolean, Float> {
                val insets = view.rootWindowInsets ?: return false to 0f
                val show = insets.isVisible(ime)
                val height = maxOf(0, insets.getInsets(ime).bottom - insets.getInsets(WindowInsets.Type.systemBars()).bottom)
                return show to height.toFloat()
            }
            view.setWindowInsetsAnimationCallback(object : android.view.WindowInsetsAnimation.Callback(DISPATCH_MODE_CONTINUE_ON_SUBTREE) {
                override fun onStart(animation: android.view.WindowInsetsAnimation, bounds: android.view.WindowInsetsAnimation.Bounds): android.view.WindowInsetsAnimation.Bounds {
                    if (animation.typeMask and ime != 0) target().let { (show, height) -> report(show, height, animation.durationMillis, false) }
                    return bounds
                }

                override fun onProgress(insets: WindowInsets, running: MutableList<android.view.WindowInsetsAnimation>): WindowInsets = insets

                override fun onEnd(animation: android.view.WindowInsetsAnimation) {
                    if (animation.typeMask and ime != 0) target().let { (show, height) -> report(show, height, animation.durationMillis, true) }
                }
            })
        }
    }

    private object Api31 {
        fun fadeSplash(activity: Activity, duration: () -> Long) {
            activity.splashScreen.setOnExitAnimationListener { view ->
                view.animate().alpha(0f).setDuration(duration()).withEndAction { view.remove() }.start()
            }
        }
    }

    private object Api33 {
        fun noAlgorithmicDarkening(settings: WebSettings) {
            settings.isAlgorithmicDarkeningAllowed = false
        }

        /** Registers or unregisters the back callback; returns the callback to keep. API 34+ also reports the swipe. */
        fun setBackCallback(
            activity: Activity,
            current: Any?,
            register: Boolean,
            onBack: () -> Unit,
            onProgress: (AkanNativeBackProgress) -> Unit,
        ): Any {
            val callback = (current as? OnBackInvokedCallback)
                ?: if (Build.VERSION.SDK_INT >= 34) Api34.animatedBackCallback(onBack, onProgress) else OnBackInvokedCallback { onBack() }
            if (register) activity.onBackInvokedDispatcher.registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, callback)
            else activity.onBackInvokedDispatcher.unregisterOnBackInvokedCallback(callback)
            return callback
        }
    }

    private object Api34 {
        fun animatedBackCallback(onBack: () -> Unit, onProgress: (AkanNativeBackProgress) -> Unit): OnBackInvokedCallback =
            object : OnBackAnimationCallback {
                override fun onBackStarted(backEvent: BackEvent) = onProgress(progressOf(AkanNativeBackProgress.Phase.STARTED, backEvent))

                override fun onBackProgressed(backEvent: BackEvent) = onProgress(progressOf(AkanNativeBackProgress.Phase.PROGRESSED, backEvent))

                override fun onBackCancelled() = onProgress(AkanNativeBackProgress(AkanNativeBackProgress.Phase.CANCELLED, 0f, false))

                override fun onBackInvoked() = onBack()
            }

        private fun progressOf(phase: AkanNativeBackProgress.Phase, event: BackEvent) =
            AkanNativeBackProgress(phase, event.progress, event.swipeEdge == BackEvent.EDGE_RIGHT)
    }

    companion object {
        /** Dev builds: JSON object of PUBLIC_ env overrides, e.g. am start --es akanNativeEnv '{"PUBLIC_X":"1"}'. */
        const val EXTRA_ENV = "akanNativeEnv"
        private const val STATE_PENDING = "akan-native.pendingResults"
        private const val SPLASH_FADE_MS = 200L
        // Must match @akanjs/native/core protocol.ts INIT_PREFIX / INIT_SUFFIX.
        private const val INIT_PREFIX = "window.__AKAN_NATIVE__=(function(o,b,e){for(var k in b)o[k]=b[k];o.env=e;return o})(window.__AKAN_NATIVE__||{},"
        private const val INIT_SUFFIX = ");\n"
    }
}
