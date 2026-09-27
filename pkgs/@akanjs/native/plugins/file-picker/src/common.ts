// Argument checks shared by the web and desktop implementations; ios/FilePickerPlugin.swift and
// android/FilePickerPlugin.kt apply the same rules.
import { AkanNativeError } from "../../../packages/core/src/index.ts";

export const invalid = (message: string) => new AkanNativeError("INVALID_ARGS", message);

export function checkObject(args: unknown, optional: boolean): Record<string, unknown> {
  if ((args === undefined || args === null) && optional) return {};
  if (!args || typeof args !== "object" || Array.isArray(args)) throw invalid("options must be an object");
  return args as Record<string, unknown>;
}

const MIME = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/([a-z0-9][a-z0-9!#$&^_.+-]*|\*)$/;
const EXTENSION = /^[a-z0-9][a-z0-9_+-]*(\.[a-z0-9_+-]+)*$/;

/**
 * File types as given to pickFiles: MIME types ("image/png", "image/*") or file name extensions
 * ("pdf" or ".pdf"). Normalized to lower case, extensions without the dot. "*\/*" or no types
 * means any file.
 */
export function checkTypes(types: unknown): string[] {
  if (types === undefined || types === null) return [];
  if (!Array.isArray(types)) throw invalid("types must be an array of MIME types or extensions");
  const out: string[] = [];
  for (const type of types) {
    if (typeof type !== "string") throw invalid("types must be an array of MIME types or extensions");
    const t = type.trim().toLowerCase().replace(/^\./, "");
    if (t === "*/*") return [];
    if (t.includes("/") ? !MIME.test(t) : !EXTENSION.test(t) || t.length > 32)
      throw invalid(`not a MIME type or file extension: ${type}`);
    if (!out.includes(t)) out.push(t);
  }
  return out;
}

export function checkFlag(value: unknown, key: string): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value !== "boolean") throw invalid(`${key} must be a boolean`);
  return value;
}

/** A file name for saveFile: one path segment, no control characters. */
export function checkName(name: unknown): string {
  if (typeof name !== "string" || name.trim().length === 0) throw invalid("name must be a non-empty file name");
  if (name.length > 255) throw invalid("name is longer than 255 characters");
  if (
    /[/\\]/.test(name) ||
    [...name].some((c) => c.charCodeAt(0) < 0x20 || c.charCodeAt(0) === 0x7f) ||
    name === "." ||
    name === ".."
  )
    throw invalid(`name must be a file name, not a path (got ${name})`);
  return name;
}

export const DEFAULT_LIMIT = 1000;
export const MAX_LIMIT = 10000;

export function checkLimit(value: unknown): number {
  if (value === undefined || value === null) return DEFAULT_LIMIT;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > MAX_LIMIT) {
    throw invalid(`limit must be an integer from 1 to ${MAX_LIMIT}`);
  }
  return value;
}

export function checkMime(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" || !MIME.test(value.toLowerCase()) || value.endsWith("/*"))
    throw invalid("mime must be a MIME type such as text/csv");
  return value.toLowerCase();
}

// Standard alphabet, padding optional, no whitespace; the same rule as the filesystem plugin.
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

export function checkBase64(data: string): void {
  if (!BASE64.test(data) || data.length % 4 === 1 || (data.includes("=") && data.length % 4 !== 0))
    throw invalid("data is not valid base64");
}

export type SaveSource = { kind: "data"; data: string; encoding: "utf8" | "base64" } | { kind: "url"; url: string };

/** Content for saveFile: `data` (text, or base64 with encoding) or `url`. Exactly one. */
export function checkSaveSource(args: Record<string, unknown>): SaveSource {
  const hasData = args.data !== undefined && args.data !== null;
  const hasUrl = args.url !== undefined && args.url !== null;
  if (hasData === hasUrl) throw invalid("pass either data or url");
  if (hasUrl) {
    if (typeof args.url !== "string" || args.url.length === 0) throw invalid("url must be a non-empty string");
    if (args.encoding !== undefined && args.encoding !== null) throw invalid("encoding applies to data, not url");
    return { kind: "url", url: args.url };
  }
  if (typeof args.data !== "string") throw invalid('data must be a string (text, or base64 with encoding: "base64")');
  const encoding = args.encoding ?? "utf8";
  if (encoding !== "utf8" && encoding !== "base64") throw invalid('encoding must be "utf8" or "base64"');
  if (encoding === "base64") checkBase64(args.data);
  return { kind: "data", data: args.data, encoding };
}

export function base64ToBytes(data: string): Uint8Array {
  const binary = atob(data);
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

/** A FileRef served by the host: "/__akan_native/file/<id>", optionally on the app origin. */
export function isFileRef(url: string): boolean {
  const m =
    /^(?:app:\/\/localhost|https:\/\/app\.localhost)?\/__akan_native\/file\/([A-Za-z0-9_-]{1,128}(\.[A-Za-z0-9]{1,8})?)$/.exec(
      url,
    );
  return m !== null;
}

/** Hidden entries (".DS_Store", ".git/…") are left out of pickDirectory everywhere. */
export const isHidden = (relativePath: string) => relativePath.split("/").some((s) => s.startsWith("."));
