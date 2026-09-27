package com.akanjs.plugins.camera

import android.Manifest
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.ContentValues
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.media.ExifInterface
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.ext.SdkExtensions
import android.provider.MediaStore
import android.util.Log
import com.akanjs.runtime.AkanNativeErrorCode
import com.akanjs.runtime.AkanNativePluginContext
import com.akanjs.runtime.AkanNativeReply
import com.akanjs.runtime.AkanNativeVoidReply
import java.io.File
import org.json.JSONObject

/**
 * Photo capture without androidx FileProvider (docs/research/android.md §2.8):
 * - camera: ACTION_IMAGE_CAPTURE writing into the shell's AkanNativeFileProvider via a one-shot URI grant
 * - library: the framework Photo Picker (MediaStore.ACTION_PICK_IMAGES), no storage permission
 * The manifest does not declare CAMERA on purpose: once declared, ACTION_IMAGE_CAPTURE throws
 * SecurityException until the permission is granted (verified). Without it the capture intent
 * needs no permission, so check/requestPermission report "granted" (capacitor-plugins/camera does the same).
 * If the app declares CAMERA anyway (C8, for getUserMedia), the plugin asks for it before capturing.
 * Arguments arrive decoded and checked by the generated CameraPluginSpec (PL-10).
 */
class CameraPlugin(private val context: AkanNativePluginContext) : CameraPluginSpec {
    private var busy = false

    /** How photos are handed over (index.ts): quality 1-100, size limits in pixels. */
    private class Output(val quality: Int?, val maxWidth: Int?, val maxHeight: Int?)

    private fun output(quality: Double?, maxWidth: Double?, maxHeight: Double?): Output? {
        if ((maxWidth != null && maxWidth < 1) || (maxHeight != null && maxHeight < 1)) return null
        return Output(quality?.toInt()?.coerceIn(1, 100), maxWidth?.toInt(), maxHeight?.toInt())
    }

    override fun checkPermission(reply: AkanNativeReply<CameraCheckPermissionResult>) =
        resolvePermission(reply, if (declaresCamera) context.permissionState(Manifest.permission.CAMERA) else "granted") {
            CameraCheckPermissionResult(camera = it)
        }

    override fun requestPermission(reply: AkanNativeReply<CameraRequestPermissionResult>) = withCameraPermission { granted ->
        resolvePermission(reply, if (granted) "granted" else context.permissionState(Manifest.permission.CAMERA)) {
            CameraRequestPermissionResult(camera = it)
        }
    }

    /**
     * permissionState may also answer "prompt-with-rationale" (plugins.md C1), which the spec's
     * PermissionState does not list: that one still goes out as the plain string.
     */
    private fun <T> resolvePermission(reply: AkanNativeReply<T>, state: String, result: (CameraPermissionState) -> T) {
        val known = CameraPermissionState.entries.firstOrNull { it.json == state }
        if (known != null) reply.resolve(result(known)) else reply.call.resolve(JSONObject().put("camera", state))
    }

    /**
     * An app that declares CAMERA itself (`permissions.camera` for getUserMedia, plugins.md C8)
     * makes ACTION_IMAGE_CAPTURE throw SecurityException until CAMERA is granted, so ask first.
     */
    private val declaresCamera by lazy {
        val activity = context.activity
        activity.packageManager.getPackageInfo(activity.packageName, PackageManager.GET_PERMISSIONS)
            .requestedPermissions?.contains(Manifest.permission.CAMERA) == true
    }

    private fun withCameraPermission(then: (granted: Boolean) -> Unit) {
        if (!declaresCamera) return then(true)
        context.requestPermissions(arrayOf(Manifest.permission.CAMERA)) { granted -> then(granted[Manifest.permission.CAMERA] == true) }
    }

    override fun takePhoto(args: CameraTakePhotoOptions, reply: AkanNativeReply<CameraPhoto>) {
        if (busy) return reply.reject(AkanNativeErrorCode.CANCELLED, "another photo request is in progress")
        val out = output(args.quality, args.maxWidth, args.maxHeight) ?: return reply.reject(AkanNativeErrorCode.INVALID_ARGS, "maxWidth and maxHeight must be at least 1")
        val library = args.source == CameraTakePhotoOptionsSource.LIBRARY // default: the camera
        val front = args.direction == CameraTakePhotoOptionsDirection.FRONT
        busy = true
        val done: (AkanNativeReply<CameraPhoto>.() -> Unit) -> Unit = { finish -> busy = false; reply.finish() }
        try {
            if (library) pick(out, done)
            else withCameraPermission { granted ->
                if (!granted) return@withCameraPermission done { reject(AkanNativeErrorCode.PERMISSION_DENIED, "camera access was denied") }
                try {
                    capture(front, out, done)
                } catch (e: ActivityNotFoundException) {
                    done { reject(AkanNativeErrorCode.UNSUPPORTED, "no camera app") }
                } catch (e: SecurityException) {
                    done { reject(AkanNativeErrorCode.PERMISSION_DENIED, e.message ?: "camera permission") }
                }
            }
        } catch (e: ActivityNotFoundException) {
            done { reject(AkanNativeErrorCode.UNSUPPORTED, if (library) "no photo picker" else "no camera app") }
        } catch (e: SecurityException) {
            done { reject(AkanNativeErrorCode.PERMISSION_DENIED, e.message ?: "camera permission") }
        }
    }

    private fun capture(front: Boolean, out: Output, done: (AkanNativeReply<CameraPhoto>.() -> Unit) -> Unit) {
        val name = "IMG_${System.currentTimeMillis()}.jpg"
        val (file, uri) = context.captureTarget(name)
        val intent = Intent(MediaStore.ACTION_IMAGE_CAPTURE)
            .putExtra(MediaStore.EXTRA_OUTPUT, uri)
            .addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_READ_URI_PERMISSION)
        intent.clipData = ClipData.newRawUri("output", uri)
        if (front) {
            // No official extra exists; these are the ones camera apps are known to read.
            intent.putExtra("android.intent.extras.CAMERA_FACING", 1)
                .putExtra("android.intent.extras.LENS_FACING_FRONT", 1)
                .putExtra("android.intent.extra.USE_FRONT_CAMERA", true)
        }
        context.startActivityForResult("capture:$name", intent) { code, _ ->
            if (code == Activity.RESULT_OK && file.length() > 0) {
                // Camera apps write EXIF orientation instead of turning the picture: encode off the main thread.
                Thread {
                    try {
                        val result = photo(normalized(file, "image/jpeg", out), "image/jpeg")
                        context.runOnMain { done { resolve(result) } }
                    } catch (e: Exception) {
                        Log.e("AkanNative", "encoding the photo failed", e)
                        context.runOnMain { done { reject(AkanNativeErrorCode.INTERNAL, e.toString()) } }
                    }
                }.start()
            } else {
                file.delete()
                done { reject(AkanNativeErrorCode.CANCELLED, "photo capture was cancelled") }
            }
        }
    }

    /**
     * The photo picker for up to [limit] images, no storage permission in any case (androidx
     * PickVisualMedia's ladder): the system picker from API 33, or 30+ with the R extension 2 that
     * Play system updates bring; else Google Play's backport of it; else the document picker for
     * images (its results are cut to the limit).
     */
    private fun pickIntent(limit: Int): Intent {
        if (Build.VERSION.SDK_INT >= 33 || (Build.VERSION.SDK_INT >= 30 && Api30.rExtension() >= 2)) {
            return Intent(MediaStore.ACTION_PICK_IMAGES).setType("image/*").apply {
                if (limit > 1) putExtra(MediaStore.EXTRA_PICK_IMAGES_MAX, minOf(limit, PickerApi33.maxLimit()))
            }
        }
        val pm = context.activity.packageManager
        for ((action, max) in BACKPORTS) {
            val info = pm.resolveActivity(Intent(action), PackageManager.MATCH_DEFAULT_ONLY or PackageManager.MATCH_SYSTEM_ONLY)?.activityInfo ?: continue
            return Intent(action).setClassName(info.packageName, info.name).setType("image/*").apply { if (limit > 1) putExtra(max, limit) }
        }
        return Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("image/*").apply {
            if (limit > 1) putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
        }
    }

    /**
     * Keeps content: URIs of other apps' providers. Any app can answer the document picker's intent,
     * and a file: URI or one of this app's own providers would hand its private files to the page.
     */
    private fun foreign(uri: Uri): Boolean {
        val authority = uri.authority ?: return false
        return uri.scheme == "content" && context.activity.packageManager.resolveContentProvider(authority, 0)?.packageName.let { it != null && it != context.activity.packageName }
    }

    private object Api30 {
        fun rExtension(): Int = SdkExtensions.getExtensionVersion(Build.VERSION_CODES.R)
    }

    /** API 33, and 30-32 with the R extension 2 (pickIntent checks). */
    private object PickerApi33 {
        fun maxLimit(): Int = MediaStore.getPickImagesMaxLimit()
    }

    private fun pick(out: Output, done: (AkanNativeReply<CameraPhoto>.() -> Unit) -> Unit) {
        context.startActivityForResult("pick", pickIntent(1)) { code, data ->
            val src: Uri? = data?.data?.takeIf(::foreign)
            if (code != Activity.RESULT_OK || src == null) return@startActivityForResult done { reject(AkanNativeErrorCode.CANCELLED, "no photo was picked") }
            val resolver = context.activity.contentResolver
            val mime = resolver.getType(src) ?: "image/jpeg"
            val ext = when (mime) { "image/png" -> "png"; "image/gif" -> "gif"; "image/webp" -> "webp"; "image/heic" -> "heic"; else -> "jpg" }
            // Copy off the main thread: photos are megabytes.
            Thread {
                try {
                    val (file, _) = context.captureTarget("PICK_${System.currentTimeMillis()}.$ext")
                    resolver.openInputStream(src)!!.use { input -> file.outputStream().use { input.copyTo(it) } }
                    val jpeg = normalized(file, mime, out)
                    val result = photo(jpeg, if (jpeg == file) mime else "image/jpeg")
                    context.runOnMain { done { resolve(result) } }
                } catch (e: Exception) {
                    Log.e("AkanNative", "copying the picked photo failed", e)
                    context.runOnMain { done { reject(AkanNativeErrorCode.INTERNAL, e.toString()) } }
                }
            }.start()
        }
    }

    /** Photo Picker with a limit (EXTRA_PICK_IMAGES_MAX); results come as ClipData. No permission needed. */
    override fun pickImages(args: CameraPickImagesOptions, reply: AkanNativeReply<CameraPickImagesResult>) {
        if (busy) return reply.reject(AkanNativeErrorCode.CANCELLED, "another photo request is in progress")
        val out = output(args.quality, args.maxWidth, args.maxHeight) ?: return reply.reject(AkanNativeErrorCode.INVALID_ARGS, "maxWidth and maxHeight must be at least 1")
        val limit = (args.limit?.toInt() ?: 10).coerceIn(1, 20)
        val intent = pickIntent(limit)
        busy = true
        try {
            context.startActivityForResult("pickMany", intent) { code, data ->
                val uris = ArrayList<Uri>()
                data?.clipData?.let { clip -> for (i in 0 until clip.itemCount) clip.getItemAt(i).uri?.let(uris::add) }
                if (uris.isEmpty()) data?.data?.let(uris::add)
                uris.retainAll(::foreign)
                if (code != Activity.RESULT_OK || uris.isEmpty()) {
                    busy = false
                    return@startActivityForResult reply.reject(AkanNativeErrorCode.CANCELLED, "no photo was picked")
                }
                Thread {
                    val photos = ArrayList<CameraPhoto>()
                    try {
                        for ((i, uri) in uris.take(limit).withIndex()) photos.add(copyToCache(uri, "PICK_${System.currentTimeMillis()}_$i", out))
                        context.runOnMain { busy = false; reply.resolve(CameraPickImagesResult(photos = photos)) }
                    } catch (e: Exception) {
                        Log.e("AkanNative", "copying the picked photos failed", e)
                        context.runOnMain { busy = false; reply.reject(AkanNativeErrorCode.INTERNAL, e.toString()) }
                    }
                }.start()
            }
        } catch (e: ActivityNotFoundException) {
            busy = false
            reply.reject(AkanNativeErrorCode.UNSUPPORTED, "no photo picker")
        }
    }

    private fun copyToCache(src: Uri, stem: String, out: Output): CameraPhoto {
        val resolver = context.activity.contentResolver
        val mime = resolver.getType(src) ?: "image/jpeg"
        val ext = when (mime) { "image/png" -> "png"; "image/gif" -> "gif"; "image/webp" -> "webp"; "image/heic" -> "heic"; else -> "jpg" }
        val (file, _) = context.captureTarget("$stem.$ext")
        resolver.openInputStream(src)!!.use { input -> file.outputStream().use { input.copyTo(it) } }
        val jpeg = normalized(file, mime, out)
        return photo(jpeg, if (jpeg == file) mime else "image/jpeg")
    }

    /**
     * The photo as the page gets it (index.ts): an upright JPEG within the size limits. An upright JPEG
     * that fits, with no quality asked for, is kept as it is; anything else (HEIC, PNG, WebP, a rotated
     * or larger photo) is decoded at the smallest sample size that still covers the target, turned by
     * its EXIF orientation, scaled, put on white, and encoded; the source file is removed. A file that
     * does not decode stays as it is.
     */
    private fun normalized(file: File, mime: String, out: Output): File {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(file.path, bounds)
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return file
        val orientation = try {
            ExifInterface(file.path).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
        } catch (e: Exception) {
            ExifInterface.ORIENTATION_NORMAL
        }
        val swaps = orientation in listOf(ExifInterface.ORIENTATION_ROTATE_90, ExifInterface.ORIENTATION_ROTATE_270, ExifInterface.ORIENTATION_TRANSPOSE, ExifInterface.ORIENTATION_TRANSVERSE)
        val width = if (swaps) bounds.outHeight else bounds.outWidth
        val height = if (swaps) bounds.outWidth else bounds.outHeight
        val scale = minOf(1.0, (out.maxWidth ?: width).toDouble() / width, (out.maxHeight ?: height).toDouble() / height)
        val upright = orientation == ExifInterface.ORIENTATION_NORMAL || orientation == ExifInterface.ORIENTATION_UNDEFINED
        if (mime == "image/jpeg" && upright && scale >= 1.0 && out.quality == null) return file
        val targetWidth = maxOf(1, Math.round(width * scale).toInt())
        val targetHeight = maxOf(1, Math.round(height * scale).toInt())
        var sample = 1
        while (width / (sample * 2) >= targetWidth && height / (sample * 2) >= targetHeight) sample *= 2
        val decoded = BitmapFactory.decodeFile(file.path, BitmapFactory.Options().apply { inSampleSize = sample }) ?: return file
        val matrix = Matrix()
        when (orientation) {
            ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> matrix.setScale(-1f, 1f)
            ExifInterface.ORIENTATION_ROTATE_180 -> matrix.setRotate(180f)
            ExifInterface.ORIENTATION_FLIP_VERTICAL -> { matrix.setRotate(180f); matrix.postScale(-1f, 1f) }
            ExifInterface.ORIENTATION_TRANSPOSE -> { matrix.setRotate(90f); matrix.postScale(-1f, 1f) }
            ExifInterface.ORIENTATION_ROTATE_90 -> matrix.setRotate(90f)
            ExifInterface.ORIENTATION_TRANSVERSE -> { matrix.setRotate(-90f); matrix.postScale(-1f, 1f) }
            ExifInterface.ORIENTATION_ROTATE_270 -> matrix.setRotate(-90f)
        }
        val sampledWidth = if (swaps) decoded.height else decoded.width
        matrix.postScale(targetWidth.toFloat() / sampledWidth, targetWidth.toFloat() / sampledWidth)
        val turned = Bitmap.createBitmap(decoded, 0, 0, decoded.width, decoded.height, matrix, true)
        if (turned !== decoded) decoded.recycle()
        // JPEG has no alpha: transparent pixels would turn black.
        val opaque = Bitmap.createBitmap(turned.width, turned.height, Bitmap.Config.ARGB_8888)
        Canvas(opaque).apply { drawColor(Color.WHITE); drawBitmap(turned, 0f, 0f, null) }
        turned.recycle()
        val (jpeg, _) = context.captureTarget("${file.nameWithoutExtension}_${System.nanoTime()}.jpg")
        jpeg.outputStream().use { opaque.compress(Bitmap.CompressFormat.JPEG, out.quality ?: 90, it) }
        opaque.recycle()
        file.delete()
        return jpeg
    }

    /**
     * Adds a photo of this app to the shared library: MediaStore insert under DCIM with IS_PENDING
     * while writing (capacitor-plugins/camera CameraPlugin.java inserts with RELATIVE_PATH=DCIM).
     * Apps may add their own media without a permission since Android 10.
     */
    override fun saveToGallery(args: CameraSaveToGalleryArgs, reply: AkanNativeVoidReply) {
        val (file, mime) = context.file(args.url) ?: return reply.reject(AkanNativeErrorCode.INVALID_ARGS, "url must be a file URL of this app (/__akan_native/file/<id>)")
        Thread {
            try {
                val resolver = context.activity.contentResolver
                val values = ContentValues().apply {
                    put(MediaStore.MediaColumns.DISPLAY_NAME, file.name)
                    put(MediaStore.MediaColumns.MIME_TYPE, mime)
                    put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DCIM)
                    put(MediaStore.MediaColumns.IS_PENDING, 1)
                }
                val uri = resolver.insert(MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY), values)
                    ?: throw IllegalStateException("MediaStore refused the new image")
                resolver.openOutputStream(uri)!!.use { out -> file.inputStream().use { it.copyTo(out) } }
                resolver.update(uri, ContentValues().apply { put(MediaStore.MediaColumns.IS_PENDING, 0) }, null, null)
                reply.resolve()
            } catch (e: Exception) {
                Log.e("AkanNative", "saving to the gallery failed", e)
                reply.reject(AkanNativeErrorCode.INTERNAL, e.toString())
            }
        }.start()
    }

    /** FileRef + size in the orientation the image is displayed in. */
    private fun photo(file: File, mime: String): CameraPhoto {
        val ref = context.fileRef(file, mime)
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(file.path, bounds)
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return CameraPhoto(ref)
        val rotated = try {
            when (ExifInterface(file.path).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) {
                ExifInterface.ORIENTATION_ROTATE_90, ExifInterface.ORIENTATION_ROTATE_270,
                ExifInterface.ORIENTATION_TRANSPOSE, ExifInterface.ORIENTATION_TRANSVERSE -> true
                else -> false
            }
        } catch (e: Exception) {
            false
        }
        return CameraPhoto(
            ref,
            width = (if (rotated) bounds.outHeight else bounds.outWidth).toDouble(),
            height = (if (rotated) bounds.outWidth else bounds.outHeight).toDouble(),
        )
    }

    override fun onRestoredActivityResult(key: String, resultCode: Int, data: Intent?) {
        // The app process died while the camera was open; the page that asked is gone (plugins.md C6).
        // Keep the file so a later restore API can hand it out; for now only log it.
        Log.w("AkanNative", "camera result after process restart: key=$key result=$resultCode (kept in the capture cache)")
    }

    private companion object {
        /** Google Play's photo picker backport for Android 11 and older: action and limit extra (androidx PickVisualMedia). */
        val BACKPORTS = listOf(
            "androidx.activity.result.contract.action.PICK_IMAGES" to "androidx.activity.result.contract.extra.PICK_IMAGES_MAX",
            "com.google.android.gms.provider.action.PICK_IMAGES" to "com.google.android.gms.provider.extra.PICK_IMAGES_MAX",
        )
    }
}
