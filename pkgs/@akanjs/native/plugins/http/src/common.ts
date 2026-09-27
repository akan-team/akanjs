// Request rules shared by the page wrapper (index.ts), the web and the desktop implementations.
// The Swift (ios/HttpUrl.swift, ios/HttpPlugin.swift) and Kotlin (android/HttpUrl.kt,
// android/HttpPlugin.kt) implementations follow the same rules and messages.
import { AkanNativeError, type CallScope, scopePermits } from "../../../packages/core/src/index.ts";
import type { BodyEncoding, HttpMethod, NativeResponseType } from "./index.ts";

export const METHODS: readonly HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];
/** Whole request, redirects and body included. */
export const DEFAULT_TIMEOUT = 60_000;
/** Android takes timeouts as int milliseconds. */
export const MAX_TIMEOUT = 2_147_483_647;
/** The fetch standard's limit. */
export const MAX_REDIRECTS = 20;
export const REDIRECTS = new Set([301, 302, 303, 307, 308]);

/**
 * Headers the HTTP stack owns: it frames the body, the connection and compression itself (every
 * platform decodes gzip on its own, and Android stops doing so once the app sets Accept-Encoding).
 */
export const RESERVED_HEADERS = new Set([
  "host",
  "content-length",
  "transfer-encoding",
  "connection",
  "keep-alive",
  "upgrade",
  "te",
  "trailer",
  "expect",
  "accept-encoding",
]);
const TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

const invalid = (message: string) => new AkanNativeError("INVALID_ARGS", message);

// ------------------------------------------------------------------ URLs

/** What RFC 3986 allows unescaped in a path and query (unreserved, sub-delims, ":", "@", "/", "?"). */
const PATH_CHAR = /^[A-Za-z0-9\-._~!$&'()*+,;=:@/?]$/;
/** A host name: RFC 3986 reg-name without percent escapes (a deny of a host must not be passed by escaping a letter). */
const HOST = /^[A-Za-z0-9\-._~!$&'()*+,;=]+$/;
const IPV6 = /^\[[0-9A-Fa-f:.]+\]$/;
/** Path segments that mean "this" or "parent" (WHATWG also reads %2e as "."). */
const DOT_SEGMENTS = new Set([".", "..", "%2e", "%2e%2e", ".%2e", "%2e."]);
const isHex = (b: number | undefined) =>
  b !== undefined && ((b >= 0x30 && b <= 0x39) || (b >= 0x41 && b <= 0x46) || (b >= 0x61 && b <= 0x66));

/**
 * The form a URL is matched against the app's scope in and sent in, the same on every platform:
 * lowercase scheme and host, no default port, "/" for an empty path, no fragment, and the path and
 * query percent-encoded where RFC 3986 needs it (UTF-8; valid %XX kept). null for anything that is
 * not an absolute http(s) URL, has credentials or a malformed host or port, or still has dot
 * segments (they must be resolved before a scope can be checked).
 */
export function canonicalUrl(text: string): string | null {
  const hash = text.indexOf("#");
  if (hash >= 0) text = text.slice(0, hash);
  const scheme = /^(https?):\/\//i.exec(text);
  if (!scheme) return null;
  const rest = text.slice(scheme[0].length);
  let end = rest.search(/[/?]/);
  if (end < 0) end = rest.length;
  const authority = rest.slice(0, end);
  if (!authority || authority.includes("@")) return null;
  let host: string;
  let port = "";
  if (authority.startsWith("[")) {
    const close = authority.indexOf("]");
    if (close < 0) return null;
    host = authority.slice(0, close + 1);
    const after = authority.slice(close + 1);
    if (after && !after.startsWith(":")) return null;
    port = after.slice(1);
    if (!IPV6.test(host)) return null;
  } else {
    const colon = authority.lastIndexOf(":");
    host = colon < 0 ? authority : authority.slice(0, colon);
    port = colon < 0 ? "" : authority.slice(colon + 1);
    if (!HOST.test(host)) return null;
  }
  const name = scheme[1]!.toLowerCase();
  let portPart = "";
  if (port) {
    if (!/^[0-9]{1,5}$/.test(port) || Number(port) > 65535) return null;
    const n = Number(port);
    if (!((name === "http" && n === 80) || (name === "https" && n === 443))) portPart = `:${n}`;
  }
  const bytes = new TextEncoder().encode(rest.slice(end));
  let tail = "";
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]!;
    if (b === 0x25 && isHex(bytes[i + 1]) && isHex(bytes[i + 2])) {
      tail += String.fromCharCode(b, bytes[i + 1]!, bytes[i + 2]!);
      i += 2;
    } else if (b < 0x80 && PATH_CHAR.test(String.fromCharCode(b))) tail += String.fromCharCode(b);
    else tail += `%${b.toString(16).toUpperCase().padStart(2, "0")}`;
  }
  const q = tail.indexOf("?");
  const path = (q < 0 ? tail : tail.slice(0, q)) || "/";
  if (path.split("/").some((segment) => DOT_SEGMENTS.has(segment.toLowerCase()))) return null;
  return `${name}://${host.toLowerCase()}${portPart}${path}${q < 0 ? "" : tail.slice(q)}`;
}

/** A URL as the page gives it → the canonical form, after WHATWG parsing (new URL) resolves dots, IDN hosts and escapes. */
export function normalizeUrl(url: unknown): string {
  if (typeof url !== "string" || url.length === 0) throw invalid("url must be an absolute http or https URL");
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw invalid(`${url} is not an absolute URL`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
    throw invalid(`only http and https URLs can be requested (got ${parsed.protocol})`);
  if (parsed.username || parsed.password)
    throw invalid("url must not hold credentials; send an Authorization header instead");
  const canonical = canonicalUrl(parsed.href);
  if (!canonical) throw invalid(`${url} is not an http or https URL akan-native can request`);
  return canonical;
}

/** The origin of a canonical URL (whose path always starts with "/"): scheme, host and port. */
export function originOf(url: string): string {
  const slash = url.indexOf("/", url.indexOf("://") + 3);
  return slash < 0 ? url : url.slice(0, slash);
}

/** PL-11: the app's capabilities may limit requests to scopes { url } (URL patterns, urlMatch in @akanjs/native/core). */
export function checkScope(scope: CallScope | undefined, url: string, what = "request to"): void {
  if (!scopePermits(scope, { url }, [], ["url"]))
    throw new AkanNativeError("NOT_ALLOWED", `${what} ${url} is outside the app's capabilities`);
}

// ------------------------------------------------------------------ requests

export interface Prepared {
  url: string;
  method: HttpMethod;
  /** Names as given; unique regardless of case. */
  headers: [string, string][];
  body: Uint8Array | null;
  responseType: NativeResponseType;
  timeout: number;
}

// Standard alphabet, padding optional, no whitespace (plugins/filesystem/src/common.ts).
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

export function base64ToBytes(data: string): Uint8Array | null {
  if (!BASE64.test(data) || data.length % 4 === 1 || (data.includes("=") && data.length % 4 !== 0)) return null;
  const binary = atob(data.padEnd(Math.ceil(data.length / 4) * 4, "="));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function bytesToBase64(bytes: Uint8Array): string {
  const native = (bytes as Uint8Array & { toBase64?: () => string }).toBase64;
  if (typeof native === "function") return native.call(bytes);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** Checks a request as the host receives it (the page wrapper already made url canonical). */
export function prepare(args: unknown): Prepared {
  if (!args || typeof args !== "object" || Array.isArray(args)) throw invalid("options must be an object");
  const o = args as Record<string, unknown>;
  if (typeof o.url !== "string") throw invalid("url must be an absolute http or https URL");
  const url = canonicalUrl(o.url);
  if (!url) throw invalid(`${o.url} is not an http or https URL akan-native can request`);

  const method = (o.method ?? "GET") as HttpMethod;
  if (!METHODS.includes(method)) throw invalid(`method must be one of ${METHODS.join(", ")}`);

  const headers: [string, string][] = [];
  if (o.headers !== undefined && o.headers !== null) {
    if (typeof o.headers !== "object" || Array.isArray(o.headers))
      throw invalid("headers must be an object of strings");
    const seen = new Set<string>();
    for (const [name, value] of Object.entries(o.headers as Record<string, unknown>)) {
      if (!TOKEN.test(name)) throw invalid(`header name ${JSON.stringify(name)} is not valid`);
      const lower = name.toLowerCase();
      if (RESERVED_HEADERS.has(lower)) throw invalid(`header ${name} is set by the HTTP stack`);
      if (seen.has(lower)) throw invalid(`header ${name} is given twice`);
      seen.add(lower);
      if (typeof value !== "string") throw invalid(`headers.${name} must be a string`);
      if (/[\r\n\0]/.test(value)) throw invalid(`headers.${name} must not contain CR, LF or NUL`);
      headers.push([name, value.replace(/^[ \t]+|[ \t]+$/g, "")]);
    }
  }

  const encoding = (o.bodyEncoding ?? "utf8") as BodyEncoding;
  if (encoding !== "utf8" && encoding !== "base64") throw invalid("bodyEncoding must be one of utf8, base64");
  let body: Uint8Array | null = null;
  if (o.body !== undefined && o.body !== null) {
    if (typeof o.body !== "string")
      throw invalid('body must be a string (text, or base64 with bodyEncoding: "base64")');
    if (method === "GET" || method === "HEAD") throw invalid(`a ${method} request cannot have a body`);
    body = encoding === "base64" ? base64ToBytes(o.body) : new TextEncoder().encode(o.body);
    if (!body) throw invalid("body is not valid base64");
    if (!headers.some(([name]) => name.toLowerCase() === "content-type")) {
      headers.push(["Content-Type", encoding === "base64" ? "application/octet-stream" : "text/plain;charset=UTF-8"]);
    }
  }

  const responseType = (o.responseType ?? "text") as NativeResponseType;
  if (responseType !== "text" && responseType !== "base64") throw invalid("responseType must be one of text, base64");

  const timeout = o.timeout ?? DEFAULT_TIMEOUT;
  if (typeof timeout !== "number" || !Number.isFinite(timeout) || timeout <= 0 || timeout > MAX_TIMEOUT) {
    throw invalid(`timeout must be a number of milliseconds between 1 and ${MAX_TIMEOUT}`);
  }
  return { url, method, headers, body, responseType, timeout };
}

/** Methods that get an empty body (Content-Length: 0) when none is given. */
export const BODY_METHODS = new Set(["POST", "PUT", "PATCH"]);

/**
 * The next hop of a redirect, per the fetch standard (HTTP-redirect fetch, steps 12-13 and the
 * cross-origin Authorization rule): 301/302 turn POST into GET, 303 turns everything but GET/HEAD
 * into GET, both dropping the body and its headers; 307/308 keep method and body. Credentials
 * (Authorization, Cookie, Proxy-Authorization) do not follow to another origin.
 */
export function redirected(
  status: number,
  request: { method: HttpMethod; headers: [string, string][]; body: Uint8Array | null },
  from: string,
  to: string,
): { method: HttpMethod; headers: [string, string][]; body: Uint8Array | null } {
  let { method, headers, body } = request;
  if (
    ((status === 301 || status === 302) && method === "POST") ||
    (status === 303 && method !== "GET" && method !== "HEAD")
  ) {
    method = "GET";
    body = null;
    headers = headers.filter(
      ([name]) =>
        !["content-type", "content-encoding", "content-language", "content-location"].includes(name.toLowerCase()),
    );
  }
  if (originOf(from) !== originOf(to)) {
    headers = headers.filter(
      ([name]) => !["authorization", "cookie", "proxy-authorization"].includes(name.toLowerCase()),
    );
  }
  return { method, headers, body };
}

/** A redirect target: Location resolved against the current URL, in canonical form. */
export function redirectTarget(location: string, current: string): string {
  let next: string | null = null;
  try {
    next = canonicalUrl(new URL(location, current).href);
  } catch {
    // not a URL
  }
  if (!next) throw new AkanNativeError("INTERNAL", `cannot follow the redirect from ${current} to ${location}`);
  return next;
}

// ------------------------------------------------------------------ responses

/**
 * Response headers: lowercase names, repeated headers joined with ", " (Set-Cookie too, as
 * iOS and Android give them). Content-Encoding and Content-Length describe the encoded body,
 * which every platform has already decoded, so they are left out then (Android drops them too).
 */
export function responseHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, name) => {
    if (name !== "set-cookie") out[name] = out[name] === undefined ? value : `${out[name]}, ${value}`;
  });
  const cookies = typeof headers.getSetCookie === "function" ? headers.getSetCookie() : [];
  if (cookies.length) out["set-cookie"] = cookies.join(", ");
  const encoding = out["content-encoding"];
  if (encoding !== undefined && encoding.toLowerCase() !== "identity") {
    delete out["content-encoding"];
    delete out["content-length"];
  }
  return out;
}

const utf8 = new TextDecoder("utf-8");

/** The body for the bridge: UTF-8 text (BOM dropped, bad bytes as U+FFFD, as fetch's text()) or base64. */
export function encodeBody(bytes: Uint8Array, type: NativeResponseType): string {
  return type === "base64" ? bytesToBase64(bytes) : utf8.decode(bytes);
}

/** Any failure of the transfer itself (DNS, connect, TLS, reset, timeout): INTERNAL. */
export function networkError(error: unknown, request: Prepared, hint = ""): AkanNativeError {
  if (error instanceof AkanNativeError) return error;
  const name = (error as { name?: string })?.name;
  if (name === "TimeoutError")
    return new AkanNativeError("INTERNAL", `request to ${request.url} timed out after ${request.timeout} ms`);
  return new AkanNativeError(
    "INTERNAL",
    `request to ${request.url} failed: ${String((error as Error)?.message ?? error)}${hint}`,
  );
}
