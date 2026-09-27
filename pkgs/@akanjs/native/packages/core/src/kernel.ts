// Decisions every akan-native host makes the same way (docs/architecture.md §5): asset routes, path
// decoding, Range requests, ids, MIME types, the document a request belongs to, and where a
// navigation goes. Pure functions. The Rust (native/desktop/src/routes.rs, navigation.rs), Swift
// (AkanNativeKernel.swift) and Kotlin (AkanNativeKernel.kt) hosts implement the same and must pass the same
// vectors (packages/core/vectors; scripts/native-vectors.ts, cargo test, and on the device in
// the self-test). Tables and constants come from contract.json (contract.ts).

import {
  EXTERNAL_SCHEMES,
  FRAME_SCHEMES,
  ID_BUNDLE,
  ID_DOCUMENT,
  ID_FILE_REF,
  ID_NAME,
  type IdSpec,
  MAX_RANGE_BYTES,
  MAX_RETAINED_EVENTS,
  MIME,
  MIME_UTF8,
  NEVER_EXTERNAL_SCHEMES,
  ROUTES,
} from "./contract.ts";

// ------------------------------------------------------------------ ids

/** Whether `s` follows an id grammar: its characters and length, and an optional ".ext" after the first dot. */
export function idValid(spec: IdSpec, s: string): boolean {
  if (spec.extMax > 0) {
    const dot = s.indexOf(".");
    if (dot < 0) return run(s, spec.chars, spec.min, spec.max);
    return run(s.slice(0, dot), spec.chars, spec.min, spec.max) && run(s.slice(dot + 1), spec.extChars, 1, spec.extMax);
  }
  if (s.length < spec.min || s.length > spec.max) return false;
  if (!(spec.first || spec.chars).includes(s[0]!) || spec.notFirst.includes(s[0]!)) return false;
  for (let i = 1; i < s.length; i++) if (!spec.chars.includes(s[i]!)) return false;
  return true;
}

function run(s: string, chars: string, min: number, max: number): boolean {
  if (s.length < min || s.length > max) return false;
  for (const c of s) if (c.length !== 1 || !chars.includes(c)) return false;
  return true;
}

export const isFileRefId = (s: string) => idValid(ID_FILE_REF, s);
export const isBundleId = (s: string) => idValid(ID_BUNDLE, s);
export const isDocumentId = (s: string) => idValid(ID_DOCUMENT, s);
export const isName = (s: string) => idValid(ID_NAME, s);

// ------------------------------------------------------------------ paths and routes

const utf8 = new TextDecoder("utf-8", { fatal: true });
const encoder = new TextEncoder();

/** Strict percent-decoding: "%" and two hex digits, and the result must be UTF-8; otherwise null. */
export function decodePath(s: string): string | null {
  const bytes: number[] = [];
  for (let i = 0; i < s.length; ) {
    if (s[i] === "%") {
      const hex = s.slice(i + 1, i + 3);
      if (!/^[0-9A-Fa-f]{2}$/.test(hex)) return null;
      bytes.push(parseInt(hex, 16));
      i += 3;
    } else {
      const c = s.codePointAt(i)!;
      const ch = String.fromCodePoint(c);
      bytes.push(...encoder.encode(ch));
      i += ch.length;
    }
  }
  try {
    return utf8.decode(new Uint8Array(bytes));
  } catch {
    return null;
  }
}

export type Route =
  | { kind: "init" }
  | { kind: "ipc" }
  | { kind: "hello" }
  | { kind: "file"; id: string }
  | { kind: "asset"; path: string }
  | { kind: "not-found" };

/**
 * Maps a URL pathname (still percent-encoded) to a route. `exists` tells whether a relative asset
 * path exists. Every host routes /__akan_native/ipc and /__akan_native/hello; the ones that do not serve them
 * answer 404.
 *
 *   /__akan_native/init.js · /__akan_native/ipc · /__akan_native/hello · /__akan_native/file/<id>   the host's own
 *   /__akan_native/<anything else>                                             404
 *   existing file                                                       the file
 *   missing, no extension                                               index.html (SPA route)
 *   missing, with extension                                             404 (a missing asset should not turn into HTML)
 *
 * Traversal is refused, not normalized. A path with ":" is never looked up as a file: on Windows
 * "C:" makes the joined path absolute (the host would read outside the app folder) and "a:b" names
 * an alternate data stream. It can still be an SPA route ("/at/12:30").
 */
export function route(pathname: string, exists: (relativePath: string) => boolean): Route {
  const decoded = decodePath(pathname);
  if (decoded === null) return { kind: "not-found" };
  const segments = decoded.split("/").filter((s) => s.length > 0);
  if (segments.some((s) => s === ".." || s === "." || s.includes("\\") || s.includes("\0")))
    return { kind: "not-found" };

  if (segments[0] === ROUTES.root) {
    if (segments.length === 2 && segments[1] === ROUTES.init) return { kind: "init" };
    if (segments.length === 2 && segments[1] === ROUTES.ipc) return { kind: "ipc" };
    if (segments.length === 2 && segments[1] === ROUTES.hello) return { kind: "hello" };
    if (segments.length === 3 && segments[1] === ROUTES.file && isFileRefId(segments[2]!))
      return { kind: "file", id: segments[2]! };
    return { kind: "not-found" };
  }
  const relative = segments.join("/");
  if (relative === "" || relative === "index.html") return { kind: "asset", path: "index.html" };
  if (!relative.includes(":") && exists(relative)) return { kind: "asset", path: relative };
  return segments[segments.length - 1]!.includes(".") ? { kind: "not-found" } : { kind: "asset", path: "index.html" };
}

/** Paths a host answers itself even when its pages come from a dev server: /__akan_native/*, and paths that do not decode. */
export function isHostPath(pathname: string): boolean {
  const decoded = decodePath(pathname);
  return decoded === null || decoded.split("/").find((s) => s.length > 0) === ROUTES.root;
}

// ------------------------------------------------------------------ MIME

function extension(path: string): string | null {
  const base = path.slice(path.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  return dot <= 0 ? null : base.slice(dot + 1).toLowerCase(); // no extension, or a dot file such as .env
}

/** The MIME type for a file name (FileRefs): application/octet-stream when unknown. */
export function fileMime(path: string): string {
  const ext = extension(path);
  return ext !== null && Object.hasOwn(MIME, ext) ? MIME[ext]! : "application/octet-stream";
}

/** The Content-Type an asset is served with: text types carry charset=utf-8. */
export function assetMime(path: string): string {
  const mime = fileMime(path);
  return mime.startsWith("text/") || MIME_UTF8.includes(mime) ? `${mime}; charset=utf-8` : mime;
}

/**
 * Whether a FileRef of this type is served with `Content-Security-Policy: sandbox`: everything but
 * images other than SVG, audio, video, fonts and PDF. A sandboxed document has an opaque origin, so
 * an HTML or SVG file a plugin serves (a picked or downloaded file) cannot reach the bridge or the
 * page even when it is opened as a document; <img>, <video> and <audio> are unaffected. PDF is left
 * out because macOS WebKit draws nothing for a sandboxed PDF (iOS and WebView2 do; checked
 * 2026-09-26); its viewer runs no page script, and nosniff keeps HTML named .pdf a PDF.
 */
export function fileRefSandboxed(mime: string): boolean {
  const type = mime.split(";")[0]!.trim().toLowerCase();
  return type === "image/svg+xml" || !(/^(image|audio|video|font)\//.test(type) || type === "application/pdf");
}

// ------------------------------------------------------------------ Range

export type RangeAnswer = { status: 200 } | { status: 206; start: number; end: number } | { status: 416 };

/**
 * A Range header (IN-5, RFC 9110 §14) for a file of `size` bytes. One "bytes=" range is supported:
 * a header that is not one (another unit, several ranges, bad syntax, last before first) is ignored
 * and the whole file is sent. A valid range the file cannot satisfy is 416. A response carries at
 * most MAX_RANGE_BYTES, from the range's start.
 */
export function parseRange(header: string | null, size: number): RangeAnswer {
  const m = header === null ? null : /^bytes=([0-9]{0,18})-([0-9]{0,18})$/.exec(header);
  if (!m || (m[1] === "" && m[2] === "")) return { status: 200 };
  let start: number;
  let end: number;
  if (m[1] === "") {
    const suffix = Number(m[2]);
    if (suffix === 0 || size === 0) return { status: 416 };
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(m[1]);
    const last = m[2] === "" ? Infinity : Number(m[2]);
    if (last < start) return { status: 200 };
    if (start >= size) return { status: 416 };
    end = Math.min(last, size - 1);
  }
  return { status: 206, start, end: Math.min(end, start + MAX_RANGE_BYTES - 1) };
}

// ------------------------------------------------------------------ documents (bridge v1.1)

export type Admission = "current" | "new" | "ended" | "no-doc";

/**
 * What a host does with a request of document `requested` (null: none) while `current` is the
 * window's document (null: none; "": one without an id): join the current one, start a new one
 * (ending the current), refuse it because that document ended, or refuse it because it has no id
 * while the current document has one (its answer would take a number the page never sees).
 */
export function admitDocument(current: string | null, ended: readonly string[], requested: string | null): Admission {
  if (requested === null) return current === null ? "new" : current === "" ? "current" : "no-doc";
  if (requested === current) return "current";
  return ended.includes(requested) ? "ended" : "new";
}

// ------------------------------------------------------------------ retained events (C2)

/**
 * Events that can come before the page listens (links, notification taps; plugins.md C2, Capacitor
 * retainUntilConsumed). A live event goes to every listener; one that no listener accepted is kept
 * when `retain` (at most MAX_RETAINED_EVENTS, the oldest go) and replayed, in order, to the next
 * listener, once. A listener returns false when it is gone (its window ended): it is dropped and the
 * event counts as not delivered.
 */
export class RetainedEvents<T> {
  private readonly listeners = new Map<string, (event: T) => boolean>();
  private readonly queue: T[] = [];

  listen(key: string, listener: (event: T) => boolean): void {
    this.listeners.set(key, listener);
    while (this.queue.length) {
      if (!listener(this.queue[0]!)) return void this.listeners.delete(key);
      this.queue.shift();
    }
  }

  unlisten(key: string): void {
    this.listeners.delete(key);
  }

  emit(event: T, retain: boolean): void {
    let delivered = false;
    for (const [key, listener] of [...this.listeners]) {
      if (listener(event)) delivered = true;
      else this.listeners.delete(key);
    }
    if (!delivered && retain && this.queue.push(event) > MAX_RETAINED_EVENTS) this.queue.shift();
  }
}

// ------------------------------------------------------------------ declarations (L2)

/**
 * Whether a plugin's declaration in boot.json (`plugins[id]`: "web", or its native methods and
 * events on this platform) lets a call through: hosts refuse undeclared methods and events with
 * NOT_FOUND before the ACL and the plugin, whatever the plugin's code implements.
 */
export function declares(decl: unknown, method: string, event: string | null): boolean {
  if (typeof decl !== "object" || decl === null) return false;
  const list =
    (method === "$listen" || method === "$unlisten"
      ? (decl as { events?: unknown }).events
      : (decl as { methods?: unknown }).methods) ?? [];
  const name = method === "$listen" || method === "$unlisten" ? event : method;
  return Array.isArray(list) && name !== null && list.includes(name);
}

// ------------------------------------------------------------------ navigation (SH-4, L0)

/** The lowercase scheme of a URL, or null when it has none. */
export function schemeOf(url: string): string | null {
  const m = /^([A-Za-z][A-Za-z0-9+.-]*):/.exec(url);
  return m ? m[1]!.toLowerCase() : null;
}

/** The schemes the shell hands to the OS: the contract's, and what the app added (never the forbidden ones). */
export function externalSchemes(extra: readonly string[] = []): string[] {
  return [
    ...EXTERNAL_SCHEMES,
    ...extra
      .map((s) => s.toLowerCase())
      .filter((s) => !NEVER_EXTERNAL_SCHEMES.includes(s) && !EXTERNAL_SCHEMES.includes(s)),
  ];
}

/**
 * Where a navigation goes. The app's own pages (and about:) load, but its /__akan_native/* paths never
 * become a document of the app's origin: a FileRef holding someone's HTML would run with the
 * bridge (Capacitor GHSA-rvm3-566m-v7fv); a frame may show a FileRef, which is served sandboxed
 * (fileRefSandboxed). Otherwise a top-level navigation is handed to the OS when its scheme is an
 * external one and dropped when not; a frame may load http, https, data, blob and about pages but
 * never opens anything.
 */
export function decideNavigation(
  url: string,
  topLevel: boolean,
  origin: string,
  extra: readonly string[] = [],
): "load" | "open" | "drop" {
  const scheme = schemeOf(url);
  const inApp = url === origin || (url.startsWith(origin) && "/?#".includes(url[origin.length]!));
  if (inApp) {
    const path = url.slice(origin.length).replace(/[?#][\s\S]*$/, "") || "/";
    if (!isHostPath(path)) return "load";
    return !topLevel && route(path, () => false).kind === "file" ? "load" : "drop";
  }
  if (scheme === "about") return "load";
  if (scheme === null) return "drop";
  if (!topLevel) return FRAME_SCHEMES.includes(scheme) ? "load" : "drop";
  return externalSchemes(extra).includes(scheme) ? "open" : "drop";
}
