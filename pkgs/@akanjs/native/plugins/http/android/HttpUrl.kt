package com.akanjs.plugins.http

/**
 * URL and redirect rules of the http plugin, the same as src/common.ts (canonicalUrl, redirected)
 * and ios/HttpUrl.swift. Free of Android classes, so it can be checked on a plain JVM.
 */
object HttpUrl {
    /** Path segments that mean "this" or "parent" (WHATWG also reads %2e as "."). */
    private val DOT = setOf(".", "%2e")
    private val DOT_DOT = setOf("..", "%2e%2e", ".%2e", "%2e.")
    private const val HEX = "0123456789ABCDEF"
    private const val SUB_DELIMS = "-._~!$&'()*+,;="

    private fun isHex(b: Int) = (b in 0x30..0x39) || (b in 0x41..0x46) || (b in 0x61..0x66)

    private fun isAlnum(b: Int) = (b in 0x30..0x39) || (b in 0x41..0x5A) || (b in 0x61..0x7A)

    /** RFC 3986 unreserved and sub-delims. */
    private fun isUnreservedOrSubDelim(b: Int) = isAlnum(b) || (b < 0x80 && SUB_DELIMS.indexOf(b.toChar()) >= 0)

    /** What RFC 3986 allows unescaped in a path and query. */
    private fun isPathChar(b: Int) = isUnreservedOrSubDelim(b) || b == ':'.code || b == '@'.code || b == '/'.code || b == '?'.code

    /**
     * The canonical form (src/common.ts canonicalUrl): lowercase scheme and host, no default
     * port, "/" for an empty path, no fragment, path and query percent-encoded where RFC 3986
     * needs it. null for anything that is not an absolute http(s) URL, has credentials, a
     * malformed host or port, or dot segments.
     */
    fun canonical(input: String): String? {
        val text = input.substringBefore('#')
        val scheme = when {
            text.regionMatches(0, "http://", 0, 7, ignoreCase = true) -> "http"
            text.regionMatches(0, "https://", 0, 8, ignoreCase = true) -> "https"
            else -> return null
        }
        val rest = text.substring(scheme.length + 3)
        val end = rest.indexOfFirst { it == '/' || it == '?' }.let { if (it < 0) rest.length else it }
        val authority = rest.substring(0, end)
        if (authority.isEmpty() || '@' in authority) return null

        val host: String
        var port = ""
        if (authority.startsWith("[")) {
            val close = authority.indexOf(']')
            if (close < 0) return null
            host = authority.substring(0, close + 1)
            val after = authority.substring(close + 1)
            if (after.isNotEmpty()) {
                if (!after.startsWith(":")) return null
                port = after.substring(1)
            }
            val inside = host.substring(1, host.length - 1)
            if (inside.isEmpty() || !inside.all { isHex(it.code) || it == ':' || it == '.' }) return null
        } else {
            val colon = authority.lastIndexOf(':')
            host = if (colon < 0) authority else authority.substring(0, colon)
            port = if (colon < 0) "" else authority.substring(colon + 1)
            // No percent escapes in a host: a deny of a host must not be passed by escaping a letter.
            if (host.isEmpty() || !host.all { isUnreservedOrSubDelim(it.code) }) return null
        }
        var portPart = ""
        if (port.isNotEmpty()) {
            if (port.length > 5 || !port.all { it in '0'..'9' }) return null
            val n = port.toInt()
            if (n > 65535) return null
            if (!((scheme == "http" && n == 80) || (scheme == "https" && n == 443))) portPart = ":$n"
        }

        val bytes = rest.substring(end).toByteArray(Charsets.UTF_8)
        val tail = StringBuilder()
        var i = 0
        while (i < bytes.size) {
            val b = bytes[i].toInt() and 0xFF
            if (b == '%'.code && i + 2 < bytes.size && isHex(bytes[i + 1].toInt() and 0xFF) && isHex(bytes[i + 2].toInt() and 0xFF)) {
                tail.append(b.toChar()).append((bytes[i + 1].toInt() and 0xFF).toChar()).append((bytes[i + 2].toInt() and 0xFF).toChar())
                i += 3
                continue
            }
            if (b < 0x80 && isPathChar(b)) tail.append(b.toChar()) else tail.append('%').append(HEX[b shr 4]).append(HEX[b and 0x0F])
            i++
        }
        val q = tail.indexOf("?")
        val path = (if (q < 0) tail.toString() else tail.substring(0, q)).ifEmpty { "/" }
        val query = if (q < 0) "" else tail.substring(q)
        if (path.split('/').any { it.lowercase() in DOT || it.lowercase() in DOT_DOT }) return null
        return "$scheme://${host.lowercase()}$portPart$path$query"
    }

    /** The origin of a canonical URL (whose path always starts with "/"). */
    fun origin(url: String): String {
        val slash = url.indexOf('/', url.indexOf("://") + 3)
        return if (slash < 0) url else url.substring(0, slash)
    }

    /**
     * RFC 3986 5.2.4 on an absolute path: "." and ".." (also %2e forms, as WHATWG) resolved,
     * ".." above the root dropped. java.net.URI.normalize() keeps a leading "..", which would
     * leave the URL unusable.
     */
    private fun removeDotSegments(path: String): String {
        val segments = path.split('/')
        val out = ArrayList<String>()
        for (i in 1 until segments.size) {
            val segment = segments[i].lowercase()
            val last = i == segments.lastIndex
            when (segment) {
                in DOT -> if (last) out.add("")
                in DOT_DOT -> {
                    if (out.isNotEmpty()) out.removeAt(out.lastIndex)
                    if (last) out.add("")
                }
                else -> out.add(segments[i])
            }
        }
        return "/" + out.joinToString("/")
    }

    /** RFC 3986 appendix B: scheme, authority, path, query of a URI reference. */
    private val REFERENCE = Regex("^(([^:/?#]+):)?(//([^/?#]*))?([^?#]*)(\\?([^#]*))?(#.*)?$", RegexOption.DOT_MATCHES_ALL)

    /**
     * A redirect target: Location resolved against the current URL by RFC 3986 5.2.2, canonical.
     * java.net.URI.resolve (RFC 2396) turns "?page=2" against /list?page=1 into /?page=2.
     */
    fun redirectTarget(location: String, current: String): String? {
        val r = REFERENCE.find(location.trim(' ', '\t', '\n', '\r')) ?: return null
        val base = REFERENCE.find(current) ?: return null
        val baseScheme = base.groups[2]?.value ?: return null
        val baseAuthority = base.groups[4]?.value ?: return null
        val basePath = base.groups[5]?.value.orEmpty()
        val refPath = r.groups[5]?.value.orEmpty()
        val refQuery = r.groups[7]?.value
        val scheme: String
        val authority: String
        val path: String
        var query = refQuery
        when {
            r.groups[2] != null -> {
                scheme = r.groups[2]!!.value
                authority = r.groups[4]?.value ?: return null
                path = removeDotSegments(refPath.ifEmpty { "/" })
            }
            r.groups[3] != null -> {
                scheme = baseScheme
                authority = r.groups[4]!!.value
                path = removeDotSegments(refPath.ifEmpty { "/" })
            }
            else -> {
                scheme = baseScheme
                authority = baseAuthority
                path = when {
                    refPath.isEmpty() -> {
                        if (refQuery == null) query = base.groups[7]?.value
                        basePath.ifEmpty { "/" }
                    }
                    refPath.startsWith("/") -> removeDotSegments(refPath)
                    else -> removeDotSegments(basePath.substring(0, basePath.lastIndexOf('/') + 1).ifEmpty { "/" } + refPath)
                }
            }
        }
        return canonical("$scheme://$authority$path${query?.let { "?$it" } ?: ""}")
    }

    class Hop(val method: String, val headers: List<Pair<String, String>>, val body: ByteArray?)

    /** The fetch standard's HTTP-redirect fetch (src/common.ts redirected). */
    fun redirected(status: Int, hop: Hop, from: String, to: String): Hop {
        var method = hop.method
        var headers = hop.headers
        var body = hop.body
        if (((status == 301 || status == 302) && method == "POST") || (status == 303 && method != "GET" && method != "HEAD")) {
            method = "GET"
            body = null
            headers = headers.filter { it.first.lowercase() !in setOf("content-type", "content-encoding", "content-language", "content-location") }
        }
        if (origin(from) != origin(to)) {
            headers = headers.filter { it.first.lowercase() !in setOf("authorization", "cookie", "proxy-authorization") }
        }
        return Hop(method, headers, body)
    }
}
