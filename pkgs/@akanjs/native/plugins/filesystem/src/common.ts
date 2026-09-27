// Argument checks and helpers shared by the web and desktop implementations. The Swift and Kotlin
// implementations mirror these rules (ios/FilesystemPlugin.swift, android/FilesystemPlugin.kt).
import { AkanNativeError, type CallScope, scopePermits } from "../../../packages/core/src/index.ts";
import type { BaseDirectory, Encoding, EntryType } from "./index.ts";

export const BASES: readonly BaseDirectory[] = ["data", "cache", "documents", "temp"];

export const invalid = (message: string) => new AkanNativeError("INVALID_ARGS", message);

export function checkObject(args: unknown, what = "options"): Record<string, unknown> {
  if (!args || typeof args !== "object" || Array.isArray(args)) throw invalid(`${what} must be an object`);
  return args as Record<string, unknown>;
}

export function checkBase(base: unknown, key = "base"): BaseDirectory {
  if (typeof base !== "string" || !BASES.includes(base as BaseDirectory)) {
    throw invalid(`${key} must be one of ${BASES.join(", ")}`);
  }
  return base as BaseDirectory;
}

/**
 * A path relative to a base directory, as segments. Only "/" separates segments; "" and "."
 * segments are dropped. Rejected: absolute paths, "..", backslashes and NUL, so a path can never
 * leave its base by its spelling (tauri/crates/tauri/src/path/mod.rs:47 SafePathBuf rejects any
 * ParentDir component the same way). Symbolic links are checked separately, after resolving.
 * `allowRoot`: whether "" (the base itself) is acceptable, e.g. for readDir.
 */
export function checkPath(path: unknown, allowRoot: boolean, key = "path"): string[] {
  if (typeof path !== "string") throw invalid(`${key} must be a string`);
  if (path.startsWith("/")) throw invalid(`${key} must be relative to its base directory, not absolute (got ${path})`);
  if (path.includes("\\")) throw invalid(`${key} must use "/" as separator (got ${path})`);
  if (path.includes("\0")) throw invalid(`${key} must not contain NUL`);
  const segments = path.split("/").filter((s) => s !== "" && s !== ".");
  if (segments.includes("..")) throw invalid(`${key} must not contain ".." (got ${path})`);
  if (!allowRoot && segments.length === 0) throw invalid(`${key} must name a file or folder inside the base directory`);
  return segments;
}

/**
 * PL-11: the app's capabilities may limit filesystem calls to scopes { base?, path? } (globs; the
 * path is relative to the base with "/" separators; an allowed wildcard never matches a dot file).
 * `fold`: the base is on a case-insensitive volume. Throws NOT_ALLOWED outside the call's scope.
 */
export function checkScope(scope: CallScope | undefined, base: BaseDirectory, segments: string[], fold = false): void {
  const path = segments.join("/");
  if (!scopePermits(scope, { base, path }, ["path"], [], fold)) {
    throw new AkanNativeError("NOT_ALLOWED", `${base}:${path || "."} is outside the app's capabilities`);
  }
}

export function checkEncoding(encoding: unknown, allowNone: boolean): Encoding | undefined {
  if (encoding === undefined || encoding === null) {
    if (allowNone) return undefined;
    return "utf8";
  }
  if (encoding !== "utf8" && encoding !== "base64") throw invalid(`encoding must be "utf8" or "base64"`);
  return encoding;
}

export function checkFlag(value: unknown, key: string): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value !== "boolean") throw invalid(`${key} must be a boolean`);
  return value;
}

/**
 * A FileRef served by the host: "/__akan_native/file/<id>", absolute on the app origin, or null. The origin
 * is the shell's (`__AKAN_NATIVE__.origin`); without one (the desktop plugin host, tests) either shell origin.
 */
export function fileRefId(
  url: string,
  origin = (globalThis as { __AKAN_NATIVE__?: { origin?: string } }).__AKAN_NATIVE__?.origin,
): string | null {
  let path = url;
  const at = url.indexOf("/__akan_native/file/");
  if (at > 0) {
    const prefix = url.slice(0, at);
    if (origin ? prefix !== origin : prefix !== "app://localhost" && prefix !== "https://app.localhost") return null;
    path = url.slice(at);
  }
  if (!path.startsWith("/__akan_native/file/")) return null;
  const id = path.slice("/__akan_native/file/".length);
  return /^[A-Za-z0-9_-]{1,128}(\.[A-Za-z0-9]{1,8})?$/.test(id) ? id : null;
}

// Standard alphabet (RFC 4648 §4), padding optional, no whitespace. Every platform decodes this
// strictly: Bun's Buffer and Android's android.util.Base64 would otherwise skip bad characters,
// and iOS Data(base64Encoded:) requires the padding (the Swift side adds it).
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

export function checkBase64(data: string): void {
  if (!BASE64.test(data) || data.length % 4 === 1 || (data.includes("=") && data.length % 4 !== 0)) {
    throw invalid("data is not valid base64");
  }
}

export function bytesToBase64(bytes: Uint8Array): string {
  const native = (bytes as Uint8Array & { toBase64?: () => string }).toBase64;
  if (typeof native === "function") return native.call(bytes);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export function base64ToBytes(data: string): Uint8Array {
  checkBase64(data);
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// UTF-8 both ways. The byte order mark is kept (ignoreBOM), as Node, Swift and Kotlin keep it, so a
// read returns exactly what is on disk; invalid bytes decode to U+FFFD on every platform.
const decoder = new TextDecoder("utf-8", { ignoreBOM: true });
const encoder = new TextEncoder();
export const decodeUtf8 = (bytes: Uint8Array) => decoder.decode(bytes);
export const encodeUtf8 = (text: string) => encoder.encode(text);

/** Content to write: text or base64 `data`, or a `url` to copy from. Exactly one. */
export type WriteSource = { kind: "data"; data: string; encoding: Encoding } | { kind: "url"; url: string };

export function checkWriteSource(args: Record<string, unknown>): WriteSource {
  const hasData = args.data !== undefined && args.data !== null;
  const hasUrl = args.url !== undefined && args.url !== null;
  if (hasData === hasUrl) throw invalid("pass either data or url");
  if (hasUrl) {
    if (typeof args.url !== "string" || args.url.length === 0) throw invalid("url must be a non-empty string");
    if (args.encoding !== undefined && args.encoding !== null) throw invalid("encoding applies to data, not url");
    return { kind: "url", url: args.url };
  }
  if (typeof args.data !== "string") throw invalid('data must be a string (text, or base64 with encoding: "base64")');
  const encoding = checkEncoding(args.encoding, false)!;
  if (encoding === "base64") checkBase64(args.data);
  return { kind: "data", data: args.data, encoding };
}

export { mimeFor } from "../../../packages/core/src/index.ts";

export function sortEntries<T extends { name: string }>(entries: T[]): T[] {
  return entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/** Runs tasks one after another in call order, so un-awaited calls (e.g. append chunks) land in order. */
export function serialQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(task: () => Promise<T> | T): Promise<T> => {
    const run = tail.then(task);
    tail = run.catch(() => {});
    return run;
  };
}

export type { EntryType };
