package com.akanjs.runtime

import android.content.ContentProvider
import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.database.MatrixCursor
import android.net.Uri
import android.os.ParcelFileDescriptor
import android.provider.OpenableColumns
import android.webkit.MimeTypeMap
import java.io.File
import java.io.FileNotFoundException

/**
 * Framework-only stand-in for androidx FileProvider (plugins.md C4):
 *   content://<applicationId>.akan-native.files/capture/<name>  ↔  <cacheDir>/akan-native-capture/<name>
 * Declared exported=false + grantUriPermissions=true, so only an app handed a one-shot URI grant
 * (FLAG_GRANT_*_URI_PERMISSION on the intent) can open a file. Verified with the emulator camera
 * (docs/research/android.md §2.8).
 */
class AkanNativeFileProvider : ContentProvider() {
    companion object {
        const val DIR = "akan-native-capture"
        private val NAME = Regex("[A-Za-z0-9_-][A-Za-z0-9._-]{0,127}")

        fun authority(context: Context) = context.packageName + ".akan-native.files"

        fun target(context: Context, name: String): Pair<File, Uri> {
            require(NAME.matches(name)) { "bad capture name $name" }
            val dir = File(context.cacheDir, DIR).apply { mkdirs() }
            return File(dir, name) to Uri.parse("content://${authority(context)}/capture/$name")
        }
    }

    override fun onCreate(): Boolean = true

    private fun fileFor(uri: Uri): File {
        val segments = uri.pathSegments
        if (segments.size != 2 || segments[0] != "capture" || !NAME.matches(segments[1])) throw FileNotFoundException("bad uri $uri")
        return File(File(context!!.cacheDir, DIR), segments[1])
    }

    override fun openFile(uri: Uri, mode: String): ParcelFileDescriptor {
        val file = fileFor(uri)
        file.parentFile?.mkdirs()
        return ParcelFileDescriptor.open(file, ParcelFileDescriptor.parseMode(mode))
    }

    override fun getType(uri: Uri): String {
        val ext = uri.lastPathSegment?.substringAfterLast('.', "")?.lowercase() ?: ""
        return MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext) ?: "application/octet-stream"
    }

    override fun query(uri: Uri, projection: Array<String>?, selection: String?, args: Array<String>?, sort: String?): Cursor {
        val file = fileFor(uri)
        val columns = projection ?: arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE)
        val row: Array<Any?> = columns.map { column ->
            when (column) {
                OpenableColumns.DISPLAY_NAME -> file.name
                OpenableColumns.SIZE -> file.length()
                else -> null
            }
        }.toTypedArray()
        return MatrixCursor(columns, 1).apply { addRow(row) }
    }

    override fun insert(uri: Uri, values: ContentValues?): Uri? = null
    override fun delete(uri: Uri, selection: String?, args: Array<String>?): Int = 0
    override fun update(uri: Uri, values: ContentValues?, selection: String?, args: Array<String>?): Int = 0
}
