// Bridge protocol v1.1 (docs/architecture.md §4): `v` stays 1; v1.1 adds fields and reserved names,
// announced through boot.json `bridge.features`.
// Shared by the WebView client (@akanjs/native/core) and the desktop plugin host (@akanjs/native/desktop).
// Keep this file free of DOM and Bun APIs.

import { ERROR_CODES as CONTRACT_ERROR_CODES, INIT_PREFIX, INIT_SUFFIX } from "./contract.ts";
import { isDocumentId, isName } from "./kernel.ts";

export const PROTOCOL_VERSION = 1;

/**
 * What the hosts of this akan-native version speak beyond v1 (boot.json `bridge.features`, part of the UP-3
 * fingerprint, so a web bundle never runs on a shell that lacks one):
 * - doc: every request names its document (one page load); the host ends the previous document
 *   when a new one calls or the main frame commits a navigation, and refuses calls of ended ones
 * - seq: the host numbers a document's responses and events (from 1) where it sends them; the page
 *   delivers them in that order
 * - once: a document's request id runs at most once
 * - cancel: `$bridge.cancel { id, reason }` ends a running call of the same document at once
 *   (CANCELLED, or TIMEOUT for reason "timeout") and tells its plugin; `$bridge.release { url }`
 *   drops a FileRef. Errors may carry `data` and `retryable`.
 */
export const BRIDGE_FEATURES = ["doc", "seq", "once", "cancel"] as const;

/** Reserved method names for event subscription. */
export const LISTEN = "$listen";
export const UNLISTEN = "$unlisten";

/**
 * Reserved plugin id for the bridge's follow-up operations (v1.1 `cancel`). They act on something a
 * call of the same page handed out, so holding it is the permission (no ACL entry):
 * - cancel { id, reason }: the call `id` of this document ends now (reason "abort" → CANCELLED,
 *   "timeout" → TIMEOUT); answers `{ cancelled }`, false when the call already finished
 * - release { url }: the FileRef at `url` is no longer served; answers `{ released }`
 */
export const BRIDGE_PLUGIN = "$bridge";
export const CANCEL = "cancel";
export const RELEASE = "release";
export type CancelReason = "abort" | "timeout";

/**
 * A plugin's method and event names (manifest, definePlugin): a letter, then letters, digits and "_".
 * Names starting with "$" belong to the bridge ($listen, $unlisten, $bridge, $host, $console).
 */
export const MEMBER_NAME = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

/** Method names the plugin object uses itself, or that JavaScript and React look for on any object. */
export const RESERVED_MEMBERS: readonly string[] = [
  "id",
  "methods",
  "events",
  "implementation",
  "isSupported",
  "isAllowed",
  "eventImplementation",
  "listen",
  "then",
  "toJSON",
  "constructor",
  "prototype",
  "__proto__",
];
export const CANCEL_REASONS: readonly CancelReason[] = ["abort", "timeout"];

/** The app's capabilities do not grant a call: NOT_ALLOWED (PL-11). PERMISSION_DENIED is the OS or the user saying no. */
export type ErrorCode = (typeof CONTRACT_ERROR_CODES)[number];

export const ERROR_CODES: readonly ErrorCode[] = CONTRACT_ERROR_CODES;

/** JS → host */
export interface BridgeRequest {
  v: 1;
  id: number;
  plugin: string;
  method: string;
  args?: unknown;
  /** The calling document (v1.1 `doc`). The page runtime always sends it. */
  doc?: string;
}

export interface BridgeErrorBody {
  code: ErrorCode;
  message: string;
  /** Details a caller can act on, e.g. `{ reason: "packageManaged" }` (v1.1 `cancel`). */
  data?: unknown;
  /** The same call may work later (a plugin still starting, the network, a busy database). */
  retryable?: boolean;
}

/** Where a host message goes and its place in the document's order (v1.1 `doc`, `seq`). */
export interface Delivery {
  doc?: string;
  seq?: number;
}

/** host → JS, answers one request */
export type BridgeResponse =
  | ({ v: 1; id: number; ok: true; result?: unknown } & Delivery)
  | ({ v: 1; id: number; ok: false; error: BridgeErrorBody } & Delivery);

/** host → JS, push */
export interface BridgeEvent extends Delivery {
  v: 1;
  plugin: string;
  event: string;
  data?: unknown;
}

/** Arguments of the reserved $listen / $unlisten methods. */
export interface ListenArgs {
  event: string;
}

/** Large results (photos, files) are returned as a URL served by the host (PL-7). */
export interface FileRef {
  url: string;
  mime: string;
  size: number;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A document id: the page runtime makes 32 hex digits; hosts accept 8 to 64 of [A-Za-z0-9_-] (contract.json). */
export const DOC_ID = /^[A-Za-z0-9_-]{8,64}$/;

/** Validates an incoming request (SEC-3). Returns an error message or null. */
export function validateRequest(value: unknown): string | null {
  if (!isObject(value)) return "request must be an object";
  if (value.v !== PROTOCOL_VERSION) return `unsupported protocol version: ${String(value.v)}`;
  if (typeof value.id !== "number" || !Number.isSafeInteger(value.id)) return "id must be an integer";
  if (typeof value.plugin !== "string" || !isName(value.plugin)) return "invalid plugin name";
  if (typeof value.method !== "string" || !isName(value.method)) return "invalid method name";
  if (value.doc !== undefined && (typeof value.doc !== "string" || !isDocumentId(value.doc)))
    return "invalid document id";
  if (
    (value.method === LISTEN || value.method === UNLISTEN) &&
    !(isObject(value.args) && typeof value.args.event === "string")
  ) {
    return `${value.method} requires args.event`;
  }
  if (value.plugin === BRIDGE_PLUGIN) {
    const args = isObject(value.args) ? value.args : {};
    if (value.method === CANCEL) {
      if (typeof args.id !== "number" || !Number.isSafeInteger(args.id)) return "$bridge.cancel requires args.id";
      if (args.reason !== undefined && !CANCEL_REASONS.includes(args.reason as CancelReason))
        return "$bridge.cancel: reason must be abort or timeout";
    } else if (value.method === RELEASE) {
      if (typeof args.url !== "string") return "$bridge.release requires args.url";
    } else return `unknown bridge operation $bridge.${value.method}`;
  }
  return null;
}

export function isResponse(value: unknown): value is BridgeResponse {
  return (
    isObject(value) && value.v === PROTOCOL_VERSION && typeof value.id === "number" && typeof value.ok === "boolean"
  );
}

export function isEvent(value: unknown): value is BridgeEvent {
  return (
    isObject(value) &&
    value.v === PROTOCOL_VERSION &&
    typeof value.plugin === "string" &&
    typeof value.event === "string"
  );
}

export function okResponse(id: number, result?: unknown): BridgeResponse {
  return result === undefined ? { v: 1, id, ok: true } : { v: 1, id, ok: true, result };
}

export function errorResponse(
  id: number,
  code: ErrorCode,
  message: string,
  extra?: { data?: unknown; retryable?: boolean },
): BridgeResponse {
  const error: BridgeErrorBody = { code, message };
  if (extra?.data !== undefined) error.data = extra.data;
  if (extra?.retryable) error.retryable = true;
  return { v: 1, id, ok: false, error };
}

// ------------------------------------------------------------------ init.js
// /__akan_native/init.js = INIT_PREFIX + <boot JSON> + "," + <env JSON> + INIT_SUFFIX
// Hosts concatenate the bundled boot.json and env.runtime.json without parsing them
// (docs/architecture.md §3.1). The two literals come from contract.json.

export { INIT_PREFIX, INIT_SUFFIX };

export function renderInitScript(bootJson: string, envJson: string): string {
  return `${INIT_PREFIX}${bootJson},${envJson}${INIT_SUFFIX}`;
}

/** Reserved plugin id for forwarding page console output to the host log in dev builds (WV-3). */
export const CONSOLE_PLUGIN = "$console";

/** Reserved plugin id for shell built-ins the page runtime calls itself, e.g. `print` (plugins.md D8). */
export const HOST_PLUGIN = "$host";
