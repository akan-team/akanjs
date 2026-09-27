// Runtime side of the plugin bindings akan-native generates from a plugin's TypeScript spec (PL-10):
// decoding call arguments with the field path in the INVALID_ARGS message, and typed replies.
package com.akanjs.runtime

import org.json.JSONArray
import org.json.JSONObject

class AkanNativeArgsException(message: String) : IllegalArgumentException(message)

/** Decoders and encoders used by the generated argument and result classes. */
object AkanNativeJson {
    fun key(path: String, name: String): String = if (path.isEmpty()) name else "$path.$name"

    fun isNull(value: Any?): Boolean = value == null || value == JSONObject.NULL

    fun invalid(path: String, expected: String): AkanNativeArgsException = AkanNativeArgsException("${label(path)} must be $expected")

    private fun label(path: String) = if (path.isEmpty()) "the argument" else path

    private fun fail(value: Any?, path: String, expected: String): Nothing =
        throw if (isNull(value)) AkanNativeArgsException("${label(path)} is required") else invalid(path, expected)

    fun obj(value: Any?, path: String): JSONObject = value as? JSONObject ?: fail(value, path, "an object")

    fun string(value: Any?, path: String): String = value as? String ?: fail(value, path, "a string")

    fun number(value: Any?, path: String): Double {
        val d = (value as? Number)?.toDouble()
        if (d == null || !d.isFinite()) fail(value, path, "a number")
        return d
    }

    fun bool(value: Any?, path: String): Boolean = value as? Boolean ?: fail(value, path, "true or false")

    /** TS `unknown`: any JSON value, null included (JSONObject.NULL). */
    @Suppress("UNUSED_PARAMETER")
    fun any(value: Any?, path: String): Any = value ?: JSONObject.NULL

    fun <T> array(value: Any?, path: String, item: (Any?, String) -> T): List<T> {
        val a = value as? JSONArray ?: fail(value, path, "an array")
        return List(a.length()) { item(a.opt(it), "$path[$it]") }
    }

    fun <T> map(value: Any?, path: String, item: (Any?, String) -> T): Map<String, T> {
        val o = obj(value, path)
        return o.keys().asSequence().associateWith { item(o.opt(it), key(path, it)) }
    }

    /** Missing and null both mean "not given" for optional fields. */
    inline fun <T> optional(value: Any?, decode: (Any?) -> T): T? = if (isNull(value)) null else decode(value)

    /** Decodes a call's arguments, or rejects it with INVALID_ARGS and returns null. */
    inline fun <T> decode(call: AkanNativeCall, decode: (JSONObject) -> T): T? =
        try {
            decode(call.args)
        } catch (e: AkanNativeArgsException) {
            call.reject(AkanNativeErrorCode.INVALID_ARGS, e.message ?: "invalid arguments")
            null
        }

    fun <T> list(values: List<T>, encode: (T) -> Any?): JSONArray = JSONArray().apply { values.forEach { put(encode(it)) } }

    fun <T> dict(values: Map<String, T>, encode: (T) -> Any?): JSONObject = JSONObject().apply { values.forEach { (k, v) -> put(k, encode(v)) } }
}

/**
 * A typed answer to one call. Like AkanNativeCall, resolve or reject once, from any thread. [call] is
 * there for what the types do not cover, e.g. `call.inScope(...)` (PL-11).
 */
open class AkanNativeReply<T>(val call: AkanNativeCall, private val encode: (T) -> Any?) {
    fun resolve(value: T) = call.resolve(encode(value))

    fun reject(code: String, message: String, data: Any? = null, retryable: Boolean = false) = call.reject(code, message, data, retryable)

    /** See AkanNativeCall.onCancel. */
    fun onCancel(handler: () -> Unit) = call.onCancel(handler)

    val isCancelled: Boolean get() = call.isCancelled
}

/** The reply of a method that resolves without a value (Promise<void>). */
class AkanNativeVoidReply(call: AkanNativeCall) : AkanNativeReply<Unit>(call, { null }) {
    fun resolve() = call.resolve()
}

/** A file served at /__akan_native/file/<id> (PL-7): `FileRef` in plugin specs. Generated types that extend FileRef take one in a constructor. */
data class AkanNativeFileRef(val url: String, val mime: String, val size: Double) {
    fun toAkanNative(): JSONObject = JSONObject().put("url", url).put("mime", mime).put("size", size)

    companion object {
        fun fromAkanNative(value: Any?, path: String): AkanNativeFileRef {
            val o = AkanNativeJson.obj(value, path)
            return AkanNativeFileRef(
                url = AkanNativeJson.string(o.opt("url"), AkanNativeJson.key(path, "url")),
                mime = AkanNativeJson.string(o.opt("mime"), AkanNativeJson.key(path, "mime")),
                size = AkanNativeJson.number(o.opt("size"), AkanNativeJson.key(path, "size")),
            )
        }
    }
}
