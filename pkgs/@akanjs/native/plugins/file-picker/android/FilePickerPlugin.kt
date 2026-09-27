package com.akanjs.plugins.filepicker

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.provider.DocumentsContract
import android.provider.OpenableColumns
import android.util.Log
import android.webkit.MimeTypeMap
import com.akanjs.runtime.AkanNativeErrorCode
import com.akanjs.runtime.AkanNativeFileRef
import com.akanjs.runtime.AkanNativePluginContext
import com.akanjs.runtime.AkanNativeReply
import java.io.File
import java.util.Base64
import java.util.UUID
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * The Storage Access Framework, no permission needed:
 * - pickFiles: ACTION_OPEN_DOCUMENT (+ EXTRA_MIME_TYPES, EXTRA_ALLOW_MULTIPLE; results in ClipData
 *   when several). Each document is copied into cacheDir/akan-native-picked and served as a FileRef.
 * - saveFile: ACTION_CREATE_DOCUMENT with EXTRA_TITLE, then the content is written through the
 *   ContentResolver in mode "wt" (plain "w" does not truncate on every provider). The provider may
 *   rename the document ("name (1).txt"), so the result reads DISPLAY_NAME back.
 * - pickDirectory: ACTION_OPEN_DOCUMENT_TREE, walked with DocumentsContract child queries and copied
 *   like pickFiles. The tree grant is not persisted: the copies are the result.
 * - DISPLAY_NAME comes from another app and is only returned as `name`, never used in a path: a
 *   provider can answer "../../shared_prefs/x.xml" (capacitor/android/…/FileUtils.java:294
 *   sanitizeFilename strips ".." and "/" for the same reason). Copies get generated names.
 * - Types: MIME types as they are, extensions through MimeTypeMap, text/csv also as
 *   text/comma-separated-values (tauri-plugins-workspace/plugins/dialog/android/…/DialogPlugin.kt
 *   parseFiltersOption). An extension without a MIME type turns the filter off.
 * - Copies run on one worker thread, which first empties the previous session's akan-native-picked.
 * Arguments arrive decoded and type-checked by the generated FilePickerPluginSpec (PL-10); the rules
 * types cannot express (src/common.ts) are checked here.
 */
class FilePickerPlugin(private val context: AkanNativePluginContext) : FilePickerPluginSpec {
    private val activity: Activity get() = context.activity
    private val worker: ExecutorService = Executors.newSingleThreadExecutor { r -> Thread(r, "akan-native-file-picker") }
    private val folder = File(context.activity.cacheDir, "akan-native-picked")
    private var busy = false

    init {
        worker.execute { folder.deleteRecursively() } // FileRefs of earlier sessions are gone anyway
    }

    override fun destroy() {
        worker.shutdown()
    }

    private class Problem(val code: String, message: String) : Exception(message)

    private fun invalid(message: String) = Problem(AkanNativeErrorCode.INVALID_ARGS, message)

    /** One dialog at a time; a Problem thrown by [body] rejects with its code. */
    private fun <T> attempt(reply: AkanNativeReply<T>, body: () -> Unit) {
        if (busy) return reply.reject(AkanNativeErrorCode.CANCELLED, "a file dialog is already open")
        try {
            body()
        } catch (e: Problem) {
            busy = false
            reply.reject(e.code, e.message ?: "invalid arguments")
        } catch (e: ActivityNotFoundException) {
            busy = false
            reply.reject(AkanNativeErrorCode.UNSUPPORTED, "no document picker on this device")
        }
    }

    // ------------------------------------------------------------------ arguments (src/common.ts)

    /** MIME types or extensions, lower case, extensions without the dot; empty = any file. */
    private fun types(list: List<String>): List<String> {
        val out = ArrayList<String>()
        for (raw in list) {
            val t = raw.trim().lowercase().removePrefix(".")
            if (t == "*/*") return emptyList()
            val ok = if (t.contains('/')) MIME.matches(t) else EXTENSION.matches(t) && t.length <= 32
            if (!ok) throw invalid("not a MIME type or file extension: $raw")
            if (t !in out) out.add(t)
        }
        return out
    }

    /** MIME filter for the intent; null = any file. */
    private fun mimeFilter(types: List<String>): List<String>? {
        if (types.isEmpty()) return null
        val out = LinkedHashSet<String>()
        for (t in types) {
            val mime = if (t.contains('/')) t else MimeTypeMap.getSingleton().getMimeTypeFromExtension(t) ?: return null
            out.add(mime)
            if (mime == "text/csv") out.add("text/comma-separated-values")
        }
        return out.toList()
    }

    private fun name(name: String): String {
        if (name.isBlank()) throw invalid("name must be a non-empty file name")
        if (name.length > 255) throw invalid("name is longer than 255 characters")
        if (name.any { it == '/' || it == '\\' || it < ' ' || it == '\u007f' } || name == "." || name == "..") {
            throw invalid("name must be a file name, not a path (got $name)")
        }
        return name
    }

    private fun limit(value: Double?): Int {
        val d = value ?: return 1000
        if (d != Math.rint(d) || d < 1 || d > 10000) throw invalid("limit must be an integer from 1 to 10000")
        return d.toInt()
    }

    private fun decodeBase64(text: String): ByteArray {
        if (!BASE64.matches(text) || text.length % 4 == 1 || (text.contains('=') && text.length % 4 != 0)) throw invalid("data is not valid base64")
        return try {
            Base64.getDecoder().decode(text)
        } catch (e: IllegalArgumentException) {
            throw invalid("data is not valid base64")
        }
    }

    private fun mimeOf(name: String): String? {
        val ext = name.substringAfterLast('.', "").lowercase()
        return if (ext.isEmpty()) null else MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext)
    }

    // ------------------------------------------------------------------ pickFiles

    override fun pickFiles(args: FilePickerPickFilesOptions, reply: AkanNativeReply<FilePickerPickFilesResult>) = attempt(reply) {
        val filter = mimeFilter(types(args.types ?: emptyList()))
        val multiple = args.multiple ?: false
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
        when {
            filter == null -> intent.type = "*/*"
            filter.size == 1 -> intent.type = filter[0]
            else -> intent.setType("*/*").putExtra(Intent.EXTRA_MIME_TYPES, filter.toTypedArray())
        }
        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, multiple)
        busy = true
        context.startActivityForResult("pickFiles", intent) { code, data ->
            busy = false
            val uris = if (code == Activity.RESULT_OK) resultUris(data) else emptyList()
            if (uris.isEmpty()) return@startActivityForResult reply.resolve(FilePickerPickFilesResult(files = emptyList()))
            worker.execute {
                try {
                    val files = uris.map { uri -> queryName(uri).let { name -> FilePickerPickedFile(copy(uri, name, null), name = name) } }
                    reply.resolve(FilePickerPickFilesResult(files = files))
                } catch (e: Exception) {
                    Log.e("AkanNative", "file-picker: copying picked files failed", e)
                    reply.reject(AkanNativeErrorCode.INTERNAL, "could not read the picked file: $e")
                }
            }
        }
    }

    private fun resultUris(data: Intent?): List<Uri> {
        if (data == null) return emptyList()
        val clip = data.clipData
        if (clip != null) return (0 until clip.itemCount).mapNotNull { clip.getItemAt(it).uri }
        return listOfNotNull(data.data)
    }

    /** DISPLAY_NAME as a plain name: the last segment, no control characters. */
    private fun queryName(uri: Uri): String {
        val raw = try {
            activity.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
                if (c.moveToFirst() && !c.isNull(0)) c.getString(0) else null
            }
        } catch (e: Exception) {
            null
        }
        return cleanName(raw ?: uri.lastPathSegment ?: "file")
    }

    private fun cleanName(raw: String): String {
        val name = raw.substringAfterLast('/').filter { it >= ' ' && it != '\u007f' }.trim()
        return if (name.isEmpty() || name == "." || name == "..") "file" else name.take(255)
    }

    /** Copies a document into akan-native-picked under a generated name and returns its FileRef. */
    private fun copy(uri: Uri, name: String, mimeHint: String?): AkanNativeFileRef {
        val resolver = activity.contentResolver
        val reported = mimeHint ?: resolver.getType(uri) ?: mimeOf(name) ?: "application/octet-stream"
        // Android's old name for CSV; the other platforms (and MimeTypeMap now) say text/csv.
        val mime = if (reported == "text/comma-separated-values") "text/csv" else reported
        val ext = name.substringAfterLast('.', "").filter { it.isLetterOrDigit() && it.code < 128 }.take(8)
            .ifEmpty { MimeTypeMap.getSingleton().getExtensionFromMimeType(mime) ?: "" }
        folder.mkdirs()
        val target = File(folder, UUID.randomUUID().toString() + if (ext.isEmpty()) "" else ".$ext")
        val input = resolver.openInputStream(uri) ?: throw java.io.FileNotFoundException("cannot open $uri")
        input.use { i -> target.outputStream().use { o -> i.copyTo(o, 1 shl 16) } }
        return context.fileRef(target, mime)
    }

    // ------------------------------------------------------------------ saveFile

    override fun saveFile(args: FilePickerSaveFileOptions, reply: AkanNativeReply<FilePickerSaveFileResult>) = attempt(reply) {
        val name = name(args.name)
        val text = args.data
        val ref = args.url
        if ((text != null) == (ref != null)) throw invalid("pass either data or url")
        var mime = args.mime?.lowercase()?.also { m ->
            if (!MIME.matches(m) || m.endsWith("/*")) throw invalid("mime must be a MIME type such as text/csv")
        }
        var bytes: ByteArray? = null
        var source: File? = null
        if (text != null) {
            bytes = when (args.encoding ?: FilePickerSaveFileOptionsEncoding.UTF8) {
                FilePickerSaveFileOptionsEncoding.UTF8 -> text.toByteArray(Charsets.UTF_8)
                FilePickerSaveFileOptionsEncoding.BASE64 -> decodeBase64(text)
            }
        } else {
            if (args.encoding != null) throw invalid("encoding applies to data, not url")
            if (ref.isNullOrEmpty()) throw invalid("url must be a non-empty string")
            val (file, fileMime) = context.file(ref) ?: throw Problem(AkanNativeErrorCode.NOT_FOUND, "$ref is not a file of this session")
            source = file
            if (mime == null) mime = fileMime
        }
        // CREATE_DOCUMENT needs a concrete type; */* makes some providers drop the extension.
        val type = mime ?: mimeOf(name) ?: "application/octet-stream"
        val intent = Intent(Intent.ACTION_CREATE_DOCUMENT)
            .addCategory(Intent.CATEGORY_OPENABLE)
            .setType(type)
            .putExtra(Intent.EXTRA_TITLE, name)
        busy = true
        context.startActivityForResult("saveFile", intent) { code, data ->
            busy = false
            val uri = data?.data
            if (code != Activity.RESULT_OK || uri == null) return@startActivityForResult reply.resolve(FilePickerSaveFileResult(saved = false))
            worker.execute {
                val resolver = activity.contentResolver
                try {
                    val out = resolver.openOutputStream(uri, "wt") ?: throw java.io.FileNotFoundException("cannot write $uri")
                    out.use { o -> if (bytes != null) o.write(bytes) else source!!.inputStream().use { it.copyTo(o, 1 shl 16) } }
                    reply.resolve(FilePickerSaveFileResult(saved = true, name = queryName(uri)))
                } catch (e: Exception) {
                    Log.e("AkanNative", "file-picker: writing the document failed", e)
                    // Do not leave an empty document behind.
                    runCatching { DocumentsContract.deleteDocument(resolver, uri) }
                    reply.reject(AkanNativeErrorCode.INTERNAL, "could not write the file: $e")
                }
            }
        }
    }

    // ------------------------------------------------------------------ pickDirectory

    override fun pickDirectory(args: FilePickerPickDirectoryOptions, reply: AkanNativeReply<FilePickerPickDirectoryResult>) = attempt(reply) {
        val limit = limit(args.limit)
        busy = true
        context.startActivityForResult("pickDirectory", Intent(Intent.ACTION_OPEN_DOCUMENT_TREE)) { code, data ->
            busy = false
            val tree = data?.data
            if (code != Activity.RESULT_OK || tree == null) {
                return@startActivityForResult reply.resolve(FilePickerPickDirectoryResult(name = null, files = emptyList(), truncated = false))
            }
            worker.execute {
                try {
                    reply.resolve(walk(tree, limit))
                } catch (e: Exception) {
                    Log.e("AkanNative", "file-picker: reading the folder failed", e)
                    reply.reject(AkanNativeErrorCode.INTERNAL, "could not read the folder: $e")
                }
            }
        }
    }

    private fun walk(tree: Uri, limit: Int): FilePickerPickDirectoryResult {
        val resolver = activity.contentResolver
        val rootId = DocumentsContract.getTreeDocumentId(tree)
        val name = queryName(DocumentsContract.buildDocumentUriUsingTree(tree, rootId))
        val files = ArrayList<FilePickerDirectoryFile>()
        var truncated = false
        val columns = arrayOf(
            DocumentsContract.Document.COLUMN_DOCUMENT_ID,
            DocumentsContract.Document.COLUMN_DISPLAY_NAME,
            DocumentsContract.Document.COLUMN_MIME_TYPE,
        )
        val queue = ArrayDeque<Pair<String, String>>() // document id, relative folder ("" or "a/b/")
        queue.add(rootId to "")
        outer@ while (queue.isNotEmpty()) {
            val (id, prefix) = queue.removeFirst()
            val children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, id)
            val rows = ArrayList<Triple<String, String, String>>()
            resolver.query(children, columns, null, null, null)?.use { c ->
                while (c.moveToNext()) rows.add(Triple(c.getString(0), cleanName(c.getString(1) ?: "file"), c.getString(2) ?: ""))
            }
            for ((childId, childName, mime) in rows) {
                if (childName.startsWith(".")) continue // hidden, as on the other platforms
                if (mime == DocumentsContract.Document.MIME_TYPE_DIR) {
                    queue.add(childId to "$prefix$childName/")
                    continue
                }
                if (files.size == limit) {
                    truncated = true
                    break@outer
                }
                val uri = DocumentsContract.buildDocumentUriUsingTree(tree, childId)
                files.add(FilePickerDirectoryFile(copy(uri, childName, mime.ifEmpty { null }), name = childName, path = "$prefix$childName"))
            }
        }
        return FilePickerPickDirectoryResult(name = name, files = files, truncated = truncated)
    }

    override fun onRestoredActivityResult(key: String, resultCode: Int, data: Intent?) {
        // The process died while the picker was open; the page that asked is gone (plugins.md C6).
        Log.i("AkanNative", "file-picker result after process restart dropped ($key, result=$resultCode)")
    }

    private companion object {
        val MIME = Regex("^[a-z0-9][a-z0-9!#$&^_.+-]*/([a-z0-9][a-z0-9!#$&^_.+-]*|\\*)$")
        val EXTENSION = Regex("^[a-z0-9][a-z0-9_+-]*(\\.[a-z0-9_+-]+)*$")
        val BASE64 = Regex("^[A-Za-z0-9+/]*={0,2}$")
    }
}
