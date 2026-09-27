package com.akanjs.plugins.filesystem

import android.os.Environment
import android.util.Log
import android.webkit.MimeTypeMap
import com.akanjs.runtime.AkanNativeCall
import com.akanjs.runtime.AkanNativeErrorCode
import com.akanjs.runtime.AkanNativePluginContext
import com.akanjs.runtime.AkanNativeReply
import com.akanjs.runtime.AkanNativeScope
import com.akanjs.runtime.AkanNativeVoidReply
import java.io.File
import java.io.IOException
import java.nio.ByteBuffer
import java.nio.CharBuffer
import java.nio.charset.CodingErrorAction
import java.nio.file.AccessDeniedException
import java.nio.file.AtomicMoveNotSupportedException
import java.nio.file.DirectoryNotEmptyException
import java.nio.file.FileAlreadyExistsException
import java.nio.file.Files
import java.nio.file.LinkOption
import java.nio.file.NoSuchFileException
import java.nio.file.NotDirectoryException
import java.nio.file.Path
import java.nio.file.StandardCopyOption
import java.nio.file.StandardOpenOption
import java.nio.file.attribute.BasicFileAttributes
import java.util.Base64
import java.util.UUID
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import org.json.JSONObject

/**
 * Files in four base folders (plugins/filesystem/src/index.ts has the table):
 *   data      Context.filesDir                                   (Auto Backup)
 *   cache     cacheDir/files                                     (cleared under storage pressure)
 *   documents getExternalFilesDir(DIRECTORY_DOCUMENTS)           (no permission, removed with the app;
 *             tauri/crates/tauri/mobile/android/…/PathPlugin.kt getDocumentDir uses the same folder)
 *   temp      cacheDir/temp
 * The cacheDir subfolders keep the shell's (akan-native-capture) and WebView's own cache out of reach.
 * - Paths: relative, "/"-separated, no ".." (src/common.ts; tauri/crates/tauri/src/path/mod.rs:47).
 *   Symbolic links are resolved (toRealPath) and must stay inside the resolved base, as
 *   tauri-plugins-workspace/plugins/fs/src/commands.rs:1606-1640 checks after following links.
 * - One worker thread: the main thread never waits for the disk and calls finish in page order.
 * - data (internal storage) and documents (external storage) are different file systems, so a
 *   rename between them falls back to copy + delete (a plain rename fails with EXDEV).
 * - base64 is java.util.Base64 without line breaks: android.util.Base64.DEFAULT inserts a newline
 *   every 76 characters (react-native FileReaderModule.kt:87 uses NO_WRAP for the same reason).
 * - Arguments arrive decoded by the generated FilesystemPluginSpec (PL-10). readFile (overloaded in
 *   the spec) and writeFile (an intersection with a union) stay untyped there and read call.args.
 */
class FilesystemPlugin(private val context: AkanNativePluginContext) : FilesystemPluginSpec {
    private val worker: ExecutorService = Executors.newSingleThreadExecutor { r -> Thread(r, "akan-native-filesystem") }
    private val activity get() = context.activity

    private class Problem(val code: String, message: String) : Exception(message)

    private class Base(val name: String, val root: Path)

    override fun destroy() {
        worker.shutdown()
    }

    private fun dir(name: String): File? = when (name) {
        "data" -> activity.filesDir
        "cache" -> File(activity.cacheDir, "files")
        "documents" -> activity.getExternalFilesDir(Environment.DIRECTORY_DOCUMENTS)
        "temp" -> File(activity.cacheDir, "temp")
        else -> null
    }

    /**
     * PL-11: the app's capabilities may limit calls to scopes { base?, path? } (globs, path relative
     * to its base with "/" separators; src/common.ts checkScope), on the spelled path first. ".."
     * never gets this far: the argument checks reject it. The worker checks the resolved path again
     * (a symbolic link's target) and what a recursive call reaches inside a folder. `documents` is
     * shared storage, which ignores case: "PRIVATE/x" is the file private/x, so there paths are
     * compared folded.
     */
    private fun inScope(call: AkanNativeCall, targets: List<Pair<String, String>>): Boolean {
        val scope = call.scope ?: return true
        for ((base, raw) in targets) {
            val path = raw.split('/').filter { it.isNotEmpty() && it != "." }.joinToString("/")
            if (!scope.permits(mapOf("base" to base, "path" to path), setOf("path"), fold = folds(base))) {
                call.reject(AkanNativeErrorCode.NOT_ALLOWED, "$base:${path.ifEmpty { "." }} is outside the app's capabilities")
                return false
            }
        }
        return true
    }

    /** Shared storage (documents) ignores case; the app's own folders do not. */
    private fun folds(base: String) = base == "documents"

    /** The scope of the call the worker thread runs (PL-11): the worker checks real locations against it. */
    private val currentScope = ThreadLocal<AkanNativeScope?>()

    private fun <T> scoped(call: AkanNativeCall, work: () -> T): T {
        currentScope.set(call.scope)
        try {
            return work()
        } finally {
            currentScope.remove()
        }
    }

    /** NOT_ALLOWED unless [parts] of [base] is inside the running call's scope. */
    private fun check(base: Base, parts: List<String>) {
        val scope = currentScope.get() ?: return
        val path = parts.joinToString("/")
        if (!scope.permits(mapOf("base" to base.name, "path" to path), setOf("path"), fold = folds(base.name))) {
            throw Problem(AkanNativeErrorCode.NOT_ALLOWED, "${base.name}:${path.ifEmpty { "." }} is outside the app's capabilities")
        }
    }

    /**
     * With a scope, what a recursive call reaches under a folder must be inside it as well: a copy or
     * move of "notes" must not carry a denied "notes/secret" along, nor remove it.
     */
    private fun checkTree(base: Base, parts: List<String>, dir: Path, to: Pair<Base, List<String>>? = null) {
        currentScope.get() ?: return
        Files.walk(dir).use { stream ->
            for (p in stream) {
                if (p == dir) continue
                val sub = dir.relativize(p).map { it.toString() }
                check(base, parts + sub)
                to?.let { (toBase, toParts) -> check(toBase, toParts + sub) }
            }
        }
    }

    /** The scope target of the untyped methods, read from the raw arguments. */
    private fun target(call: AkanNativeCall) = listOf((call.string("base") ?: "") to (call.string("path") ?: ""))

    private fun targets(args: FilesystemMoveOptions) = listOf(args.base.json to args.from, (args.toBase ?: args.base).json to args.to)

    /** Runs [work] on the worker thread and answers with its result, or rejects with the error's code. */
    private fun <T> perform(reply: AkanNativeReply<T>, work: () -> T) {
        worker.execute {
            try {
                reply.resolve(scoped(reply.call) { work() })
            } catch (e: Exception) {
                fail(reply.call, e)
            }
        }
    }

    private fun fail(call: AkanNativeCall, e: Exception) {
        if (e is Problem) return call.reject(e.code, e.message ?: "failed")
        if (e !is IOException && e !is SecurityException) Log.e("AkanNative", "filesystem.${call.method} failed", e)
        call.reject(codeOf(e), e.message ?: e.toString())
    }

    override fun readFile(call: AkanNativeCall) {
        if (!inScope(call, target(call))) return
        worker.execute {
            try {
                call.resolve(scoped(call) { read(call.args) })
            } catch (e: Exception) {
                fail(call, e)
            }
        }
    }

    override fun writeFile(call: AkanNativeCall) {
        if (!inScope(call, target(call))) return
        var source: File? = null
        if (call.args.has("url") && !call.args.isNull("url")) {
            val ref = call.args.opt("url") as? String
            if (ref.isNullOrEmpty()) return call.reject(AkanNativeErrorCode.INVALID_ARGS, "url must be a non-empty string")
            source = context.file(ref)?.first ?: return call.reject(AkanNativeErrorCode.NOT_FOUND, "$ref is not a file of this session")
        }
        val src = source
        worker.execute {
            try {
                scoped(call) { write(call.args, src) }
                call.resolve()
            } catch (e: Exception) {
                fail(call, e)
            }
        }
    }

    override fun readDir(args: FilesystemPathOptions, reply: AkanNativeReply<FilesystemReadDirResult>) {
        if (inScope(reply.call, listOf(args.base.json to args.path))) perform(reply) { list(args) }
    }

    override fun stat(args: FilesystemPathOptions, reply: AkanNativeReply<FilesystemFileInfo>) {
        if (!inScope(reply.call, listOf(args.base.json to args.path))) return
        perform(reply) {
            val target = resolve(base(args.base.json, "base"), segments(args.path, true), true)
            if (!target.second) throw notFound("${args.path} does not exist")
            info(target.first, follow = true)
        }
    }

    override fun exists(args: FilesystemPathOptions, reply: AkanNativeReply<FilesystemExistsResult>) {
        if (!inScope(reply.call, listOf(args.base.json to args.path))) return
        perform(reply) { FilesystemExistsResult(value = resolve(base(args.base.json, "base"), segments(args.path, true), true).second) }
    }

    override fun mkdir(args: FilesystemMkdirArgs, reply: AkanNativeVoidReply) {
        if (inScope(reply.call, listOf(args.base.json to args.path))) perform(reply) { makeDir(args) }
    }

    override fun remove(args: FilesystemRemoveArgs, reply: AkanNativeVoidReply) {
        if (inScope(reply.call, listOf(args.base.json to args.path))) perform(reply) { delete(args) }
    }

    override fun rename(args: FilesystemMoveOptions, reply: AkanNativeVoidReply) {
        if (inScope(reply.call, targets(args))) perform(reply) { move(args, keepSource = false) }
    }

    override fun copy(args: FilesystemMoveOptions, reply: AkanNativeVoidReply) {
        if (inScope(reply.call, targets(args))) perform(reply) { move(args, keepSource = true) }
    }

    override fun paths(reply: AkanNativeReply<Map<String, String>>) {
        val dirs = BASES.associateWith { dir(it)?.absolutePath }
        val known = dirs.mapNotNull { (name, path) -> path?.let { name to it } }.toMap()
        // documents is null while external storage is not mounted, which the spec's
        // Record<BaseDirectory, string> cannot say: that answer still goes out with the null.
        if (known.size < dirs.size) return reply.call.resolve(JSONObject().apply { for ((name, path) in dirs) put(name, path ?: JSONObject.NULL) })
        reply.resolve(known)
    }

    // ------------------------------------------------------------------ arguments (src/common.ts)

    private fun invalid(message: String) = Problem(AkanNativeErrorCode.INVALID_ARGS, message)
    private fun notFound(message: String) = Problem(AkanNativeErrorCode.NOT_FOUND, message)

    /** The base named [value]; typed arguments pass a valid name, the untyped ones are checked here. */
    private fun base(value: Any?, key: String): Base {
        val name = value as? String
        if (name == null || name !in BASES) throw invalid("$key must be one of ${BASES.joinToString(", ")}")
        val dir = dir(name) ?: throw Problem(AkanNativeErrorCode.UNSUPPORTED, "$name is not available (external storage is not mounted)")
        Files.createDirectories(dir.toPath())
        return Base(name, dir.toPath().toRealPath())
    }

    private fun segments(value: Any?, allowRoot: Boolean, key: String = "path"): List<String> =
        segments(value as? String ?: throw invalid("$key must be a string"), allowRoot, key)

    private fun segments(path: String, allowRoot: Boolean, key: String = "path"): List<String> {
        if (path.startsWith("/")) throw invalid("$key must be relative to its base directory, not absolute (got $path)")
        if (path.contains('\\')) throw invalid("$key must use \"/\" as separator (got $path)")
        if (path.contains('\u0000')) throw invalid("$key must not contain NUL")
        val parts = path.split('/').filter { it.isNotEmpty() && it != "." }
        if (".." in parts) throw invalid("$key must not contain \"..\" (got $path)")
        if (!allowRoot && parts.isEmpty()) throw invalid("$key must name a file or folder inside the base directory")
        return parts
    }

    private fun flag(args: JSONObject, key: String): Boolean {
        if (!args.has(key) || args.isNull(key)) return false
        return args.opt(key) as? Boolean ?: throw invalid("$key must be a boolean")
    }

    private fun encoding(args: JSONObject, allowNone: Boolean): String? {
        if (!args.has("encoding") || args.isNull("encoding")) return if (allowNone) null else "utf8"
        val value = args.opt("encoding")
        if (value != "utf8" && value != "base64") throw invalid("encoding must be \"utf8\" or \"base64\"")
        return value as String
    }

    private fun decodeBase64(text: String): ByteArray {
        if (!BASE64.matches(text) || text.length % 4 == 1 || (text.contains('=') && text.length % 4 != 0)) throw invalid("data is not valid base64")
        return try {
            Base64.getDecoder().decode(text)
        } catch (e: IllegalArgumentException) {
            throw invalid("data is not valid base64")
        }
    }

    /** UTF-8 with unpaired surrogates as U+FFFD (what TextEncoder writes), not "?". */
    private fun encodeUtf8(text: String): ByteArray {
        val encoder = Charsets.UTF_8.newEncoder()
            .onMalformedInput(CodingErrorAction.REPLACE)
            .onUnmappableCharacter(CodingErrorAction.REPLACE)
            .replaceWith(byteArrayOf(0xEF.toByte(), 0xBF.toByte(), 0xBD.toByte()))
        val buffer: ByteBuffer = encoder.encode(CharBuffer.wrap(text))
        return ByteArray(buffer.remaining()).also { buffer.get(it) }
    }

    // ------------------------------------------------------------------ resolving

    private fun lexists(path: Path) = Files.exists(path, LinkOption.NOFOLLOW_LINKS)

    /** Real location of [parts] in [base] and whether it exists; with [follow] false the last part is not resolved. */
    private fun resolve(base: Base, parts: List<String>, follow: Boolean): Pair<Path, Boolean> {
        val shown = if (parts.isEmpty()) "." else parts.joinToString("/")
        val last = if (follow) null else parts.lastOrNull()
        var current = (if (follow) parts else parts.dropLast(1)).fold(base.root) { p, s -> p.resolve(s) }
        val rest = ArrayList<String>()
        while (true) {
            val real = try {
                current.toRealPath()
            } catch (e: NoSuchFileException) {
                null
            } catch (e: NotDirectoryException) {
                null
            } catch (e: IOException) {
                if (e.message?.contains("Not a directory") == true) null else throw e
            }
            if (real != null) {
                if (!real.startsWith(base.root)) throw Problem(AkanNativeErrorCode.PERMISSION_DENIED, "$shown leads outside its base directory through a symbolic link")
                var path: Path = real
                for (s in rest.asReversed()) path = path.resolve(s)
                if (last != null) path = path.resolve(last)
                val exists = rest.isEmpty() && (last == null || lexists(path))
                // PL-11: through a symbolic link the scope applies to the real location as well; the
                // caller then uses exactly this path.
                val actual = base.root.relativize(path).map { it.toString() }.filter { it.isNotEmpty() }
                if (actual != parts) check(base, actual)
                return path to exists
            }
            if (lexists(current)) throw Problem(AkanNativeErrorCode.PERMISSION_DENIED, "$shown is a dangling symbolic link")
            rest.add(current.fileName.toString())
            current = current.parent ?: throw Problem(AkanNativeErrorCode.INTERNAL, "cannot resolve $shown")
        }
    }

    private fun attrs(path: Path, follow: Boolean): BasicFileAttributes? = try {
        if (follow) Files.readAttributes(path, BasicFileAttributes::class.java)
        else Files.readAttributes(path, BasicFileAttributes::class.java, LinkOption.NOFOLLOW_LINKS)
    } catch (e: NoSuchFileException) {
        null
    }

    private fun typeOf(a: BasicFileAttributes) = when {
        a.isSymbolicLink -> FilesystemEntryType.SYMLINK
        a.isRegularFile -> FilesystemEntryType.FILE
        a.isDirectory -> FilesystemEntryType.DIRECTORY
        else -> FilesystemEntryType.OTHER
    }

    private fun sizeOf(a: BasicFileAttributes) = (if (a.isRegularFile) a.size() else 0L).toDouble()

    private fun info(path: Path, follow: Boolean): FilesystemFileInfo {
        val a = attrs(path, follow) ?: throw notFound("${path.fileName} does not exist")
        return FilesystemFileInfo(type = typeOf(a), size = sizeOf(a), mtime = a.lastModifiedTime().toMillis().toDouble())
    }

    private fun isDirectory(path: Path) = Files.isDirectory(path) // follows links, like stat

    private fun requireParent(base: Base, parts: List<String>, shown: String) {
        val (parent, exists) = resolve(base, parts.dropLast(1), true)
        if (!exists) throw notFound("the folder of $shown does not exist")
        if (!isDirectory(parent)) throw invalid("the parent of $shown is not a folder")
    }

    private fun mimeOf(name: String): String {
        val ext = name.substringAfterLast('.', "").lowercase()
        return if (ext.isEmpty()) "application/octet-stream" else MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext) ?: "application/octet-stream"
    }

    // ------------------------------------------------------------------ operations

    private fun read(args: JSONObject): JSONObject {
        val base = base(args.opt("base"), "base")
        val parts = segments(args.opt("path"), false)
        val encoding = encoding(args, true)
        val shown = parts.joinToString("/")
        val (path, exists) = resolve(base, parts, true)
        if (!exists) throw notFound("$shown does not exist")
        if (!Files.isRegularFile(path)) throw invalid("$shown is not a file")
        // Without an encoding the file stays where it is and the shell serves it (Range included).
        if (encoding == null) return context.fileRef(path.toFile(), mimeOf(path.fileName.toString())).toAkanNative()
        val bytes = Files.readAllBytes(path)
        // String(bytes, UTF_8) replaces invalid bytes with U+FFFD and keeps a BOM, like the other platforms.
        val text = if (encoding == "utf8") String(bytes, Charsets.UTF_8) else Base64.getEncoder().encodeToString(bytes)
        return JSONObject().put("data", text)
    }

    private fun write(args: JSONObject, source: File?) {
        val base = base(args.opt("base"), "base")
        val parts = segments(args.opt("path"), false)
        val append = flag(args, "append")
        val recursive = flag(args, "recursive")
        val hasData = args.has("data") && !args.isNull("data")
        if (hasData == (source != null)) throw invalid("pass either data or url")
        val bytes: ByteArray? = if (hasData) {
            val text = args.opt("data") as? String ?: throw invalid("data must be a string (text, or base64 with encoding: \"base64\")")
            if (encoding(args, false) == "base64") decodeBase64(text) else encodeUtf8(text)
        } else {
            if (args.has("encoding") && !args.isNull("encoding")) throw invalid("encoding applies to data, not url")
            null
        }
        val shown = parts.joinToString("/")
        if (recursive) {
            val (parent, exists) = resolve(base, parts.dropLast(1), true)
            if (!exists) Files.createDirectories(parent)
        }
        requireParent(base, parts, shown)
        val (target, exists) = resolve(base, parts, true)
        if (exists && !Files.isRegularFile(target)) throw invalid("$shown is not a file")
        if (append) {
            Files.newOutputStream(target, StandardOpenOption.CREATE, StandardOpenOption.APPEND).use { out ->
                if (bytes != null) out.write(bytes) else Files.copy(source!!.toPath(), out)
            }
            return
        }
        // Write next to the target, then rename over it: never a half-written file.
        val tmp = target.resolveSibling(".${target.fileName}.${UUID.randomUUID()}.tmp")
        try {
            if (bytes != null) Files.write(tmp, bytes) else Files.copy(source!!.toPath(), tmp)
            Files.move(tmp, target, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING)
        } catch (e: Exception) {
            Files.deleteIfExists(tmp)
            throw e
        }
    }

    private fun list(args: FilesystemPathOptions): FilesystemReadDirResult {
        val base = base(args.base.json, "base")
        val parts = segments(args.path, true)
        val shown = if (parts.isEmpty()) "." else parts.joinToString("/")
        val (dir, exists) = resolve(base, parts, true)
        if (!exists) throw notFound("$shown does not exist")
        if (!isDirectory(dir)) throw invalid("$shown is not a folder")
        val entries = ArrayList<FilesystemDirEntry>()
        Files.newDirectoryStream(dir).use { stream ->
            for (child in stream) {
                // Entries outside the scope are not listed (a dot file under an allowed "notes/**", a denied folder).
                if (runCatching { check(base, parts + child.fileName.toString()) }.isFailure) continue
                val a = attrs(child, follow = false) ?: continue
                entries.add(
                    FilesystemDirEntry(
                        name = child.fileName.toString(),
                        type = typeOf(a),
                        size = sizeOf(a),
                        mtime = a.lastModifiedTime().toMillis().toDouble(),
                    ),
                )
            }
        }
        // Sorted by UTF-16 code units, as the JS implementations sort (String.compareTo does).
        entries.sortWith { a, b -> a.name.compareTo(b.name) }
        return FilesystemReadDirResult(entries = entries)
    }

    private fun makeDir(args: FilesystemMkdirArgs) {
        val base = base(args.base.json, "base")
        val parts = segments(args.path, true)
        val recursive = args.recursive ?: false
        val shown = if (parts.isEmpty()) "the base folder" else parts.joinToString("/")
        val (target, exists) = resolve(base, parts, true)
        if (exists) {
            if (recursive && isDirectory(target)) return
            throw invalid("$shown already exists")
        }
        if (!recursive) requireParent(base, parts, shown)
        try {
            if (recursive) Files.createDirectories(target) else Files.createDirectory(target)
        } catch (e: FileAlreadyExistsException) {
            throw invalid("a file is in the way of $shown")
        }
    }

    /** Deletes a tree without following links into other folders. */
    private fun deleteTree(path: Path) {
        val a = attrs(path, follow = false) ?: return
        if (a.isDirectory) Files.newDirectoryStream(path).use { stream -> for (child in stream) deleteTree(child) }
        Files.delete(path)
    }

    private fun copyTree(src: Path, dst: Path) {
        val a = attrs(src, follow = false) ?: throw notFound("${src.fileName} does not exist")
        if (a.isDirectory) {
            Files.createDirectory(dst)
            Files.newDirectoryStream(src).use { stream -> for (child in stream) copyTree(child, dst.resolve(child.fileName.toString())) }
        } else {
            Files.copy(src, dst, StandardCopyOption.REPLACE_EXISTING, LinkOption.NOFOLLOW_LINKS)
        }
    }

    private fun delete(args: FilesystemRemoveArgs) {
        val base = base(args.base.json, "base")
        val parts = segments(args.path, false)
        val recursive = args.recursive ?: false
        val shown = parts.joinToString("/")
        val (target, _) = resolve(base, parts, false)
        val a = attrs(target, follow = false) ?: throw notFound("$shown does not exist")
        if (a.isDirectory && !recursive) {
            try {
                Files.delete(target)
            } catch (e: DirectoryNotEmptyException) {
                throw invalid("$shown is not empty (pass recursive: true)")
            }
            return
        }
        if (a.isDirectory) checkTree(base, parts, target)
        deleteTree(target)
    }

    private fun move(args: FilesystemMoveOptions, keepSource: Boolean) {
        val base = base(args.base.json, "base")
        val toBase = args.toBase?.let { base(it.json, "toBase") } ?: base
        val from = segments(args.from, false, "from")
        val to = segments(args.to, false, "to")
        val fromShown = from.joinToString("/")
        val toShown = to.joinToString("/")
        // rename moves a link itself, copy copies what it points to
        val (src, srcExists) = resolve(base, from, keepSource)
        if (!srcExists) throw notFound("$fromShown does not exist")
        val srcAttrs = attrs(src, follow = keepSource) ?: throw notFound("$fromShown does not exist")
        requireParent(toBase, to, toShown)
        val (dst, _) = resolve(toBase, to, false)
        if (dst == src) throw invalid("from and to are the same path")
        if (dst.startsWith(src) && dst.nameCount > src.nameCount) throw invalid("cannot move or copy a folder into itself")
        if (srcAttrs.isDirectory) checkTree(base, from, src, toBase to to)
        val dstAttrs = attrs(dst, follow = false)
        if (dstAttrs != null) {
            val same = try {
                Files.isSameFile(src, dst)
            } catch (e: IOException) {
                false
            }
            if (same && keepSource) throw invalid("from and to are the same file")
            if (!same) {
                if (dstAttrs.isDirectory) throw invalid("$toShown already exists and is a folder")
                if (srcAttrs.isDirectory) throw invalid("$toShown already exists and is a file")
            }
        }
        if (keepSource) {
            // Copy next to the destination and rename over it, so an existing file is replaced atomically.
            val tmp = dst.resolveSibling(".${dst.fileName}.${UUID.randomUUID()}.tmp")
            try {
                copyTree(src, tmp)
                Files.move(tmp, dst, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING)
            } catch (e: Exception) {
                runCatching { deleteTree(tmp) }
                throw e
            }
            return
        }
        try {
            Files.move(src, dst, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING)
        } catch (e: AtomicMoveNotSupportedException) {
            // Internal and external storage are different file systems (EXDEV): copy, then delete.
            if (dstAttrs != null) Files.delete(dst)
            copyTree(src, dst)
            deleteTree(src)
        }
    }

    private companion object {
        val BASES = listOf("data", "cache", "documents", "temp")
        val BASE64 = Regex("^[A-Za-z0-9+/]*={0,2}$")

        fun codeOf(e: Exception): String = when (e) {
            is NoSuchFileException -> AkanNativeErrorCode.NOT_FOUND
            is FileAlreadyExistsException, is DirectoryNotEmptyException, is NotDirectoryException -> AkanNativeErrorCode.INVALID_ARGS
            is AccessDeniedException, is SecurityException -> AkanNativeErrorCode.PERMISSION_DENIED
            is java.io.FileNotFoundException -> AkanNativeErrorCode.NOT_FOUND
            else -> AkanNativeErrorCode.INTERNAL
        }
    }
}
