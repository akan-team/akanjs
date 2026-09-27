// Plugin permission ACL (requirements PL-11, plugins.md C7): the Kotlin copy of
// packages/core/src/acl.ts. The CLI resolves the app's capabilities into boot.json `acl`; the
// bridge checks every call here before a plugin sees it, and hands the matching scopes to the call.
package com.akanjs.runtime

import java.util.concurrent.ConcurrentHashMap
import org.json.JSONArray
import org.json.JSONObject
import org.json.JSONTokener

/** What a call may touch: `allow == null` means no restriction beyond the plugin's own rules. */
class AkanNativeScope(val allow: List<Map<String, String>>?, val deny: List<Map<String, String>>) {
    /**
     * Whether [value] (e.g. mapOf("base" to "data", "path" to "notes/a.txt")) is inside the scope.
     * Fields in [pathFields] match as paths (`*` stays within a segment, `**` crosses "/"), fields in
     * [urlFields] as URLs (AkanNativeGlob.url). [fold]: the paths are on a case-insensitive volume.
     */
    fun permits(value: Map<String, String>, pathFields: Set<String> = emptySet(), urlFields: Set<String> = emptySet(), fold: Boolean = false): Boolean {
        if (deny.any { matches(it, value, pathFields, urlFields, deny = true, fold) }) return false
        return allow == null || allow.any { matches(it, value, pathFields, urlFields, deny = false, fold) }
    }

    private fun matches(entry: Map<String, String>, value: Map<String, String>, pathFields: Set<String>, urlFields: Set<String>, deny: Boolean, fold: Boolean): Boolean =
        entry.all { (field, pattern) ->
            val actual = value[field] ?: return@all false
            val path = field in pathFields
            when {
                field in urlFields -> AkanNativeGlob.url(pattern, actual, deny)
                path && fold -> AkanNativeGlob.match(pattern.lowercase(), actual.lowercase(), true, deny)
                else -> AkanNativeGlob.match(pattern, actual, path, deny)
            }
        }
}

/**
 * Same rules as globMatch and urlMatch in packages/core/src/acl.ts; the cases in
 * packages/core/vectors/scope.json run here too (scripts/native-vectors.ts).
 */
object AkanNativeGlob {
    private val cache = ConcurrentHashMap<String, Regex>()

    private fun test(source: String, text: String): Boolean =
        cache.getOrPut(source) { Regex(source, RegexOption.DOT_MATCHES_ALL) }.matches(text)

    private fun StringBuilder.appendEscaped(c: Char): StringBuilder = if (c in "\\^$.|+()[]{}") append('\\').append(c) else append(c)

    /**
     * acl.ts globMatch: in an allow entry no path wildcard matches a name that starts with "."; a
     * deny entry ([deny]) covers dot files too.
     */
    fun match(pattern: String, text: String, path: Boolean, deny: Boolean = false): Boolean = test(source(pattern, path, deny), text)

    fun source(pattern: String, path: Boolean, deny: Boolean = false): String {
        val dots = !path || deny
        val guard = if (dots) "" else "(?!\\.)"
        val segment = "$guard[^/]*"
        val across = if (dots) ".*" else "(?:[^/]|/(?!\\.))*"
        val out = StringBuilder()
        var i = 0
        while (i < pattern.length) {
            val c = pattern[i]
            val start = i == 0 || pattern[i - 1] == '/'
            when {
                c == '*' && i + 1 < pattern.length && pattern[i + 1] == '*' -> {
                    i++
                    when {
                        !path -> out.append(".*")
                        i + 1 < pattern.length && pattern[i + 1] == '/' && start -> {
                            out.append("(?:$segment/)*")
                            i++
                        }
                        i == pattern.length - 1 && i >= 2 && pattern[i - 2] == '/' -> {
                            out.setLength(out.length - 1)
                            out.append("(?:/$segment)*")
                        }
                        else -> out.append(if (start) guard else "").append(across)
                    }
                }
                c == '*' -> out.append(if (path) (if (start) segment else "[^/]*") else ".*")
                c == '?' -> out.append(if (path) (if (start) "$guard[^/]" else "[^/]") else ".")
                else -> out.appendEscaped(c)
            }
            i++
        }
        return out.toString()
    }

    /** `*` (and `**`) → [star], `?` → one character, everything else literal. */
    private fun wildcard(pattern: String, text: String, star: String): Boolean {
        val out = StringBuilder()
        var i = 0
        while (i < pattern.length) {
            val c = pattern[i]
            if (c == '*') {
                while (i + 1 < pattern.length && pattern[i + 1] == '*') i++
                out.append(star)
            } else if (c == '?') out.append('.') else out.appendEscaped(c)
            i++
        }
        return test(out.toString(), text)
    }

    class UrlParts(val scheme: String, val host: String?, val port: String, val rest: String)

    /** urlParts in packages/core/src/acl.ts. */
    fun urlParts(text: String, pattern: Boolean = false): UrlParts? {
        val colon = text.indexOf(':')
        if (colon <= 0) return null
        val scheme = text.substring(0, colon).lowercase()
        var rest = text.substring(colon + 1)
        if (!pattern) rest.indexOfFirst { it == '?' || it == '#' }.takeIf { it >= 0 }?.let { rest = rest.substring(0, it) }
        if (!rest.startsWith("//")) return UrlParts(scheme, null, "", rest)
        rest = rest.substring(2)
        val end = rest.indexOf('/')
        var authority = if (end < 0) rest else rest.substring(0, end)
        authority = authority.substring(authority.lastIndexOf('@') + 1) // user info
        val bracket = if (authority.startsWith("[")) authority.indexOf(']') + 1 else 0 // IPv6
        val portColon = authority.indexOf(':', bracket)
        return UrlParts(
            scheme,
            (if (portColon < 0) authority else authority.substring(0, portColon)).lowercase(),
            if (portColon < 0) "" else authority.substring(portColon + 1),
            if (end < 0) "" else rest.substring(end),
        )
    }

    private val DEFAULT_PORTS = mapOf("http" to "80", "https" to "443", "ws" to "80", "wss" to "443")

    /**
     * urlMatch in packages/core/src/acl.ts: scheme, host, port and path compared separately. A
     * pattern without a port matches the default port in an allow entry, every port in a deny entry.
     */
    fun url(pattern: String, url: String, deny: Boolean = false): Boolean {
        if (pattern.isNotEmpty() && pattern.all { it == '*' }) return true
        val p = urlParts(pattern, pattern = true) ?: return false
        val v = urlParts(url) ?: return false
        if ((p.host == null) != (v.host == null)) return false
        if (!wildcard(p.scheme, v.scheme, "[a-z0-9+.-]*")) return false
        if (p.host != null && v.host != null) {
            if (!wildcard(p.host, v.host, ".*")) return false
            val port = v.port.ifEmpty { DEFAULT_PORTS[v.scheme] ?: "" }
            if (if (p.port.isEmpty()) !deny && port != (DEFAULT_PORTS[v.scheme] ?: "") else p.port != "*" && p.port != port) return false
            if (p.rest.isEmpty()) return true
        }
        return wildcard(p.rest, v.rest, ".*")
    }
}

class AkanNativeAcl private constructor(private val grants: List<Grant>, private val denied: Map<String, Set<String>>) {
    private class Grant(
        val plugin: String,
        val windows: Set<Int>?, // null: every window
        val items: Set<String>?, // null: everything
        val allow: List<Map<String, String>>?,
        val deny: List<Map<String, String>>,
    )

    /** The C7 check: allowed, and the scope for the call. */
    fun check(plugin: String, item: String, window: Int = 1): Pair<Boolean, AkanNativeScope?> {
        if (denied[plugin]?.contains(item) == true) return false to null
        val matching = grants.filter { g ->
            g.plugin == plugin && (g.items?.contains(item) ?: true) && (g.windows?.contains(window) ?: true)
        }
        if (matching.isEmpty()) return false to null
        val allow = if (matching.any { it.allow == null }) null else matching.flatMap { it.allow!! }
        val deny = matching.flatMap { it.deny }
        return true to if (allow == null && deny.isEmpty()) null else AkanNativeScope(allow, deny)
    }

    companion object {
        /** What the bridge enforces when boot.json's ACL is broken: nothing is allowed (fail-closed). */
        val DENY_ALL = AkanNativeAcl(emptyList(), emptyMap())

        /**
         * boot.json's ACL (acl.ts loadAcl), from plain values (Map, List, String, Number, null): null
         * when boot.json has none (everything allowed). One that is not well formed denies everything,
         * and the second value says why: a malformed part must not loosen the rest (one bad grant
         * used to crash onCreate, a non-object `denied` to drop every denial).
         */
        fun from(boot: Map<*, *>): Pair<AkanNativeAcl?, String?> {
            if (!boot.containsKey("acl")) return null to null
            val value = boot["acl"]
            problem(value)?.let { return DENY_ALL to it }
            val acl = value as Map<*, *>
            fun entries(v: Any?) = (v as? List<*>)?.map { e -> (e as Map<*, *>).entries.associate { (k, x) -> k as String to x as String } }
            val grants = (acl["grants"] as List<*>).map { item ->
                val g = item as Map<*, *>
                Grant(
                    plugin = g["plugin"] as String,
                    windows = (g["windows"] as? List<*>)?.map { (it as Number).toInt() }?.toSet(),
                    items = (g["items"] as? List<*>)?.map { it as String }?.toSet(),
                    allow = entries(g["allow"]),
                    deny = entries(g["deny"]) ?: emptyList(),
                )
            }
            val denied = (acl["denied"] as? Map<*, *>)?.entries?.associate { (k, v) -> k as String to (v as List<*>).map { it as String }.toSet() } ?: emptyMap()
            return AkanNativeAcl(grants, denied) to null
        }

        /** acl.ts aclProblem: why a value is not an ACL the bridge can enforce, or null. */
        fun problem(value: Any?): String? {
            fun strings(v: Any?) = v is List<*> && v.all { it is String }
            fun scopes(v: Any?) = v == null || (v is List<*> && v.all { e -> e is Map<*, *> && e.values.all { it is String } })
            fun window(v: Any?) = v is Number && v.toDouble().let { it == Math.floor(it) && it >= 1 }
            val acl = value as? Map<*, *>
            val grants = acl?.get("grants") as? List<*> ?: return "acl must be { grants: [...], denied?: {...} }"
            for ((i, item) in grants.withIndex()) {
                val g = item as? Map<*, *>
                val plugin = g?.get("plugin")
                if (g == null || plugin !is String || plugin.isEmpty()) return "grant $i has no plugin"
                val windows = g["windows"]
                if (windows != "*" && !(windows is List<*> && windows.all(::window))) return "grant $i: bad windows"
                if (g["items"] != "*" && !strings(g["items"])) return "grant $i: bad items"
                if (!scopes(g["allow"]) || !scopes(g["deny"])) return "grant $i: bad scopes"
            }
            if (acl.containsKey("denied")) {
                val denied = acl["denied"]
                if (denied !is Map<*, *> || !denied.values.all(::strings)) return "bad denied"
            }
            return null
        }

        /** boot.json's text: null when it has no ACL (everything allowed); a malformed one, or text that is not JSON, denies everything. */
        fun load(bootJson: String): AkanNativeAcl? {
            val boot = try {
                plain(JSONTokener(bootJson).nextValue()) as? Map<*, *>
            } catch (e: Exception) {
                null
            }
            val (acl, problem) = if (boot == null) DENY_ALL to "boot.json is not a JSON object" else from(boot)
            if (problem != null) android.util.Log.e("akan-native", "boot.json: the capabilities cannot be read ($problem); every plugin call is denied")
            return acl
        }

        /** org.json values as plain Kotlin ones (Map, List, null), which the kernel reads. */
        fun plain(value: Any?): Any? = when (value) {
            JSONObject.NULL -> null
            is JSONObject -> value.keys().asSequence().associateWith { plain(value.opt(it)) }
            is JSONArray -> (0 until value.length()).map { plain(value.opt(it)) }
            else -> value
        }
    }
}
