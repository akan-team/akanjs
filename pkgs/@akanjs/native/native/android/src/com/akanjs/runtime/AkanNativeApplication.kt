package com.akanjs.runtime

import android.app.Application
import android.content.Context
import android.content.Intent
import android.util.Base64
import java.io.File
import java.security.SecureRandom
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import org.json.JSONObject

/**
 * The App scope (docs/architecture.md §3.7): what lives as long as the process. Activities come and
 * go while the process stays (back pressed and the app opened again, recreate()), so nothing that
 * must happen once per launch belongs to one. Registered as the manifest's application class.
 *
 * The process can also start without an activity (a notification alarm, boot), so the web bundle is
 * chosen when the first activity asks for it, not in onCreate.
 */
class AkanNativeApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        AkanNativeApp.context = applicationContext
        Thread { AkanNativeApp.cleanSessionFiles(applicationContext) }.start()
    }
}

object AkanNativeApp {
    internal lateinit var context: Context

    /** Tells processes apart in the self-test ($host.info): an activity made again keeps this one. */
    val instance: String = UUID.randomUUID().toString()

    var bundleSelections = 0
        private set

    /** Activities made in this process. */
    var windows = 0
        internal set

    private var bundleChosen = false

    /**
     * The web bundle to serve (UP-2), null for the APK's own. Chosen once per process: an activity
     * made again must not count as a new launch of an unconfirmed bundle and roll it back. Later it
     * is whatever apply() or a rollback made active.
     */
    fun bundleRoot(): File? {
        if (!bundleChosen) {
            bundleChosen = true
            if (AkanNativeFeatures.UPDATES) {
                AkanNativeUpdates.init(context)
                AkanNativeUpdates.launch()
            }
            bundleSelections++
        }
        if (!AkanNativeFeatures.UPDATES) return null
        return AkanNativeUpdates.active?.let { AkanNativeUpdates.bundleDirectory(it.bundle) }
    }

    // ---------------------------------------------------------------- FileRefs (PL-7)

    private val files = ConcurrentHashMap<String, Pair<File, String>>()
    private val random = SecureRandom()

    /** Serves [file] at /__akan_native/file/<id> for the rest of the process. The id cannot be guessed. */
    fun registerFile(file: File, mime: String): JSONObject {
        val bytes = ByteArray(12).also(random::nextBytes)
        // ASCII letters and digits only: the route accepts no other id (AkanNativeKernel.isFileRefId).
        val ext = file.name.substringAfterLast('.', "").filter { it in AkanNativeContract.ID_FILE_REF.extChars }.take(AkanNativeContract.ID_FILE_REF.extMax)
        val id = Base64.encodeToString(bytes, Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP) + if (ext.isEmpty()) "" else ".$ext"
        files[id] = file to mime
        return JSONObject().put("url", "/__akan_native/file/$id").put("mime", mime).put("size", file.length())
    }

    fun file(id: String): Pair<File, String>? = files[id]

    /**
     * Stops serving a FileRef (\$bridge.release). A file in one of akan-native's session folders is akan-native's
     * own copy (a photo, a picked document) and is deleted; other files belong to the user and stay.
     */
    fun releaseFile(id: String): Boolean {
        val (file, _) = files.remove(id) ?: return false
        val path = file.canonicalPath
        if (SESSION_DIRS.any { path.startsWith(File(context.cacheDir, it).canonicalPath + File.separator) }) file.delete()
        return true
    }

    /** How many FileRefs are served (K13). */
    val fileCount: Int get() = files.size

    /** cacheDir folders whose files akan-native writes for FileRefs: camera captures, picked documents. */
    val SESSION_DIRS = listOf(AkanNativeFileProvider.DIR, "akan-native-picked")

    /**
     * At process start: files an earlier process served are unreachable now (FileRefs live in memory).
     * Only files older than an hour go: a camera capture written while the process was dead still
     * belongs to the activity result that a restored activity is about to receive (plugins.md C6).
     */
    internal fun cleanSessionFiles(context: Context, now: Long = System.currentTimeMillis()) {
        for (name in SESSION_DIRS) {
            File(context.cacheDir, name).listFiles()?.forEach { if (now - it.lastModified() > 3_600_000) it.deleteRecursively() }
        }
    }
}

/**
 * Links the app was opened with (plugins.md S4, C2). The launch URL is the one the process started
 * with and never changes (getLaunchUrl gives the same answer to every page). Every URL, the launch
 * URL included, is also delivered once as an event: to the listeners, or to the first one that
 * subscribes. Side effects belong there, so a reloaded page does not handle a link twice.
 */
object AkanNativeLinks {
    var launchUrl: String? = null
        private set
    private var launched = false
    /** Every link, retained until a listener takes it (AkanNativeRetained, the shared C2 rule). */
    private val events = AkanNativeRetained<String>()

    /**
     * The link of a VIEW intent, if it is one this app handles. The launcher activity is exported,
     * so another app can send it an explicit VIEW intent with any data, past the manifest's intent
     * filters; only links the filters (deepLinks.schemes) accept count. An intent relaunched from
     * the recents screen carries the old link (react-native IntentModule skips those too).
     */
    fun urlOf(context: Context, intent: Intent?): String? {
        val data = intent?.takeIf { it.action == Intent.ACTION_VIEW && it.flags and Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY == 0 }?.data ?: return null
        val view = Intent(Intent.ACTION_VIEW, data).addCategory(Intent.CATEGORY_BROWSABLE).setPackage(context.packageName)
        return if (context.packageManager.queryIntentActivities(view, 0).isEmpty()) null else intent.dataString
    }

    /** An activity was created, with the link that started it (null when it was only recreated). */
    fun connected(url: String?) {
        if (!launched) {
            launched = true
            launchUrl = url
        }
        if (url != null) open(url)
    }

    private val owners = HashMap<Any, Any>()

    /**
     * Listeners return false when they are gone (a plugin of an activity that ended). [owner] is the
     * window (the plugin's activity): its listeners go when it is destroyed.
     */
    fun listen(key: Any, owner: Any, listener: (String) -> Boolean) {
        owners[key] = owner
        events.listen(key, listener)
    }

    fun unlisten(key: Any) {
        owners.remove(key)
        events.unlisten(key)
    }

    /** A window ended: its listeners go (every page registration has an owner). */
    fun removeAll(owner: Any) {
        for (key in owners.filterValues { it === owner }.keys) unlisten(key)
    }

    val listenerCount: Int get() = events.listenerCount

    fun open(url: String) = events.emit(url, retain = true)
}

/**
 * What the shell hands to the system (L0) and how often: the page's links and the opener share one
 * limit of EXTERNAL_OPENS_PER_SECOND, so a page cannot flood the device with other apps.
 */
object AkanNativeExternal {
    /** security.shell.externalSchemes from shell.json (set by the activity). */
    @Volatile
    var extra: List<String> = emptyList()

    /** http, https, mailto, tel and the app's own additions (never the forbidden ones). */
    val schemes: List<String> get() = AkanNativeKernel.externalSchemes(extra)

    private var last = 0L

    /** Whether an open may happen now; counts it when it may. */
    @Synchronized
    fun allowed(now: Long = android.os.SystemClock.elapsedRealtime()): Boolean {
        if (last != 0L && now - last < 1000L / AkanNativeContract.EXTERNAL_OPENS_PER_SECOND) return false
        last = now
        return true
    }
}
