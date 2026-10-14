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

export interface UpdateDecisionInput {
  /** The binary's keyIds, in `updates.publicKeys` order, without those `updates.revokedKeys` lists. */
  ring: readonly string[];
  /** keyIds state.json has revoked. */
  revoked: readonly string[];
  /** The envelope's keyId, whose signature over the manifest verified. */
  signer: string;
  revokeKeys: readonly string[];
  resetSequence: boolean;
  sequence: number;
  /** The binary's own bundle (updates.json `embeddedSequence`). */
  embedded: number;
  /** The bundle running now, null for the binary's own. */
  running: { sequence: number; keyId: string } | null;
}

export type UpdateDecision =
  | { kind: "untrusted" | "revoked" | "self-revoke" | "revoke-later" }
  | { kind: "take" | "stale"; baseline: number; revoke: string[] };

/**
 * Whether a web bundle manifest is taken (updates protocol v2, vectors/updates.json). A key may revoke only keys listed
 * before it, so a leaked online key — listed first — cannot revoke the offline spares that recover from it, and
 * `resetSequence` counts only on a manifest that newly revokes a key, so replaying it cannot roll anyone back. A bundle a
 * revoked key signed sets no bar, and revocations apply even when the release itself is not newer.
 */
export function updateDecision(input: UpdateDecisionInput): UpdateDecision {
  const { ring, revoked, signer, revokeKeys } = input;
  const index = ring.indexOf(signer);
  if (index < 0) return { kind: "untrusted" };
  if (revoked.includes(signer)) return { kind: "revoked" };
  if (revokeKeys.includes(signer)) return { kind: "self-revoke" };
  if (revokeKeys.some((id) => ring.indexOf(id) > index)) return { kind: "revoke-later" };
  const revoke = ring.filter((id) => revokeKeys.includes(id) && !revoked.includes(id));
  const running = input.running && ![...revoked, ...revoke].includes(input.running.keyId) ? input.running.sequence : 0;
  const baseline = input.resetSequence && revoke.length ? input.embedded : Math.max(input.embedded, running);
  return { kind: input.sequence > baseline ? "take" : "stale", baseline, revoke };
}

/** One answer of updateDecision as the vectors write it. */
export const updateDecisionWire = (decision: UpdateDecision) =>
  decision.kind === "take" || decision.kind === "stale"
    ? `${decision.kind}:${decision.baseline}:${decision.revoke.join(",")}`
    : decision.kind;

/** The v2 envelope of a channel for one native API: one file per binary generation, so each takes its own fixes. */
export const updateManifestUrl = (url: string, platform: string, channel: string, nativeApi: string) =>
  `${url}/${platform}/${channel}/${nativeApi}.json`;

/** An envelope's signer or a revokeKeys entry: the first 8 bytes of the raw public key's SHA-256, in hex. */
export const isUpdateKeyId = (s: string) => /^[0-9a-f]{16}$/.test(s);

/** The most keys a manifest may revoke: every host refuses a longer revokeKeys. */
export const MAX_REVOKE_KEYS = 16;

/** The largest manifest an envelope may carry, in bytes. */
export const MAX_UPDATE_MANIFEST = 1 << 20;

const isBase64Char = (c: number) =>
  (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 43 || c === 47;

/**
 * Base64 as iOS's Data(base64Encoded:) takes it: the standard alphabet, padded, no whitespace. Android's and Java's
 * decoders also take line breaks or a missing padding, so every host checks this first, or one envelope would reach
 * one platform and not the other.
 */
export function isStrictBase64(s: string): boolean {
  if (s.length % 4 !== 0) return false;
  const pad = s.endsWith("==") ? 2 : s.endsWith("=") ? 1 : 0;
  for (let i = 0; i < s.length - pad; i++) if (!isBase64Char(s.charCodeAt(i))) return false;
  return true;
}

const base64Size = (s: string) => (s.length / 4) * 3 - (s.endsWith("==") ? 2 : s.endsWith("=") ? 1 : 0);

const fromBase64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export type EnvelopeVerdict = "open" | "untrusted" | "revoked" | "encoding" | "too-large" | "signature";

/**
 * Whether a phone takes the manifest bytes of an envelope's three fields (vectors/updates.json `envelopes`), checked in
 * this order by every host: a signer of `ring` (the binary's keyIds) it has not revoked, both fields in strict base64, a
 * manifest of at most MAX_UPDATE_MANIFEST bytes, then `verify` (Ed25519 by the signer's key) over the decoded bytes.
 */
export function checkUpdateEnvelope(
  envelope: { manifest: string; keyId: string; signature: string },
  ring: readonly string[],
  revoked: readonly string[],
  verify: (manifest: Uint8Array, signature: Uint8Array, keyId: string) => boolean,
): { verdict: "open"; manifest: Uint8Array } | { verdict: Exclude<EnvelopeVerdict, "open"> } {
  const { manifest, keyId, signature } = envelope;
  if (!ring.includes(keyId)) return { verdict: "untrusted" };
  if (revoked.includes(keyId)) return { verdict: "revoked" };
  if (!isStrictBase64(manifest) || !isStrictBase64(signature)) return { verdict: "encoding" };
  if (base64Size(manifest) > MAX_UPDATE_MANIFEST) return { verdict: "too-large" };
  const bytes = fromBase64(manifest);
  return verify(bytes, fromBase64(signature), keyId) ? { verdict: "open", manifest: bytes } : { verdict: "signature" };
}

/** Names the update folder already uses: what packUpdate writes beside the channels, and the folders of the files. */
export const RESERVED_CHANNELS: readonly string[] = ["bundle", "manifest.template", "compat", "pack", "files", "app"];

/** A channel the publisher can make: a file name in the release folder and a string an app's config compares. */
export const isChannelName = (s: string) => /^[a-z0-9][a-z0-9._-]{0,40}$/.test(s) && !RESERVED_CHANNELS.includes(s);

// ------------------------------------------------------------------ update reports

/** What became of a release on a phone, posted to updates.report.url (vectors/updates.json `reports`). */
export const UPDATE_REPORT_EVENTS = ["downloaded", "applied", "confirmed", "rolledBack", "failed"] as const;
export type UpdateReportEvent = (typeof UPDATE_REPORT_EVENTS)[number];

/** Why: rolledBack for timeout, relaunch, hang or verify; failed for download, verify, disk, signature or manifest. */
export const UPDATE_REPORT_REASONS = [
  "timeout",
  "relaunch",
  "hang",
  "verify",
  "download",
  "disk",
  "signature",
  "manifest",
] as const;
export type UpdateReportReason = (typeof UPDATE_REPORT_REASONS)[number];

export interface UpdateReportEntry {
  /** Counts up for as long as the install lasts, so a receiver can drop a batch it already took. */
  id: number;
  event: UpdateReportEvent;
  bundle: string;
  sequence: number | null;
  reason: UpdateReportReason | null;
  /** updateReportTime: UTC, always three fraction digits. */
  at: string;
}

/** One request to updates.report.url, with no credentials. */
export interface UpdateReportBody {
  app: string;
  platform: string;
  channel: string;
  /** 32 random hex digits that last as long as the install: not a device identifier. */
  installId: string;
  nativeApi: string;
  appVersion: string;
  /** "iOS 18.1", "Android 15". */
  os: string;
  events: UpdateReportEntry[];
}

/** The events a phone keeps waiting, the oldest dropped first. */
export const UPDATE_REPORT_LIMIT = 100;

/** The events one request carries. */
export const UPDATE_REPORT_BATCH = 20;

/** An event is kept once per release and reason: a check that fails at every launch is one failure. */
export const updateReportKey = (event: UpdateReportEvent, bundle: string, reason: UpdateReportReason | null) =>
  `${event}|${bundle}|${reason ?? ""}`;

export type UpdateReportOutcome = "sent" | "dropped" | "kept";

/**
 * What the answer to a report request does to its batch: a 2xx sends it, and a 400, 413 or 422 drops it, since the
 * same body would be refused forever. Any other answer, or none (0), keeps it for the next time.
 */
export function updateReportOutcome(status: number): UpdateReportOutcome {
  if (status >= 200 && status < 300) return "sent";
  return status === 400 || status === 413 || status === 422 ? "dropped" : "kept";
}

/**
 * When a kept batch may go again, in seconds since the epoch: `now` plus a Retry-After of delay-seconds (RFC 9110
 * §10.2.3, digits only), else null. An HTTP date is not read; the batch goes at the next launch or return instead.
 */
export function updateReportRetryAt(retryAfter: string | null, now: number): number | null {
  const value = retryAfter?.replace(/^[ \t]+|[ \t]+$/g, "") ?? "";
  if (!/^[0-9]+$/.test(value)) return null;
  const seconds = Number(value);
  return Number.isFinite(seconds) ? now + seconds : null;
}

/** Whether a send waits for an earlier Retry-After; a wait of more than a day is a clock that moved, so it ends. */
export const updateReportWaits = (retryAt: number | null, now: number) =>
  retryAt !== null && retryAt > now && retryAt < now + 86_400;

/** An event's `at` for milliseconds since the epoch: UTC, always three fraction digits. */
export const updateReportTime = (ms: number) => new Date(ms).toISOString();
