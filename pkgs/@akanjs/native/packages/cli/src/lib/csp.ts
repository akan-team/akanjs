// Content-Security-Policy for index.html (SEC-4).
//
// The SPA's JS and CSS are inlined into index.html by design (IN-1), so a policy without
// 'unsafe-inline' has to allow them by hash. The build hashes every inline <script> and <style>
// of the final index.html and adds the hashes to script-src / style-src, like Tauri does for its
// assets (tauri-codegen/src/embedded_assets.rs CspHashes, tauri/src/manager/mod.rs set_csp).
//
// Delivery: a <meta http-equiv> as the first element of <head>. It works the same on the four
// platforms and on any static web host, without native changes. What a meta policy cannot do
// (frame-ancestors, report-to, sandbox) does not apply to an app page that is always the top
// document of its WebView; web deployments that need frame-ancestors set it as a server header.

import { createHash } from "node:crypto";
import { NEVER_EXTERNAL_SCHEMES } from "../../../core/src/contract.ts";
import { CliError } from "./log.ts";

export type CspDirectives = Record<string, string | string[]>;
/** "strict" is akan-native's recommended policy; a string or a directive map is used as given. */
export type CspConfig = "strict" | string | CspDirectives;

/**
 * Everything an akan-native app needs and nothing else: the page, init.js, the bridge (desktop fetch to
 * /__akan_native/ipc, Android /__akan_native/hello + MessagePort; iOS messageHandlers are outside CSP), FileRefs
 * (/__akan_native/file/*), blob:/data: images and media (camera, file-picker, filesystem on the web), dev
 * live reload (same-origin EventSource), fetch() of blob:/data: URLs (web FileRefs). Remote APIs,
 * CDNs and fonts must be added by the app.
 */
export const STRICT_CSP: Record<string, string[]> = {
  "default-src": ["'self'"],
  "script-src": ["'self'"],
  "style-src": ["'self'"],
  "img-src": ["'self'", "blob:", "data:"],
  "media-src": ["'self'", "blob:", "data:"],
  "font-src": ["'self'", "data:"],
  // blob:/data: too: on the web a FileRef is a blob: URL, and apps read it with fetch(ref.url).
  "connect-src": ["'self'", "blob:", "data:"],
  "worker-src": ["'self'", "blob:"],
  "frame-src": ["'self'"],
  "object-src": ["'none'"],
  "base-uri": ["'none'"],
  "form-action": ["'self'"],
};

/** frame-ancestors, report-uri, report-to and sandbox are ignored in a <meta> policy. */
const HEADER_ONLY = ["frame-ancestors", "report-uri", "report-to", "sandbox"];

export function parseCsp(text: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const part of text.split(";")) {
    const [name, ...sources] = part.trim().split(/\s+/);
    if (!name) continue;
    const key = name.toLowerCase();
    if (!out.has(key)) out.set(key, sources); // the first occurrence wins, as in browsers
  }
  return out;
}

function toMap(config: CspConfig): Map<string, string[]> {
  if (config === "strict") return new Map(Object.entries(STRICT_CSP).map(([k, v]) => [k, [...v]]));
  if (typeof config === "string") return parseCsp(config);
  return new Map(
    Object.entries(config).map(([k, v]) => [
      k.toLowerCase(),
      Array.isArray(v) ? [...v] : v.trim().split(/\s+/).filter(Boolean),
    ]),
  );
}

export function serializeCsp(map: Map<string, string[]>): string {
  return [...map].map(([name, sources]) => (sources.length ? `${name} ${sources.join(" ")}` : name)).join("; ");
}

/** The HTML parser turns CRLF and lone CR into LF before a script's text is hashed. */
export function normalizeForHash(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

export function cspHash(text: string): string {
  return `'sha256-${createHash("sha256").update(normalizeForHash(text), "utf8").digest("base64")}'`;
}

/**
 * Inline <script> (without src) and <style> contents of a document. Like the HTML tokenizer, a
 * script or style ends at the first `</script` / `</style`, so text in the bundle that merely
 * mentions a tag does not start a new element (bundlers escape `</script` inside JS).
 */
export function inlineBlocks(html: string): { scripts: string[]; styles: string[] } {
  const scripts: string[] = [];
  const styles: string[] = [];
  const open = /<(script|style)\b([^>]*)>/gi;
  for (let m = open.exec(html); m; m = open.exec(html)) {
    const tag = m[1]!.toLowerCase();
    const close = new RegExp(`</${tag}`, "i");
    const rest = html.slice(m.index + m[0].length);
    const end = close.exec(rest);
    const body = end ? rest.slice(0, end.index) : rest;
    const external = tag === "script" && /\bsrc\s*=/i.test(m[2] ?? "");
    if (!external && body.length > 0) (tag === "script" ? scripts : styles).push(body);
    open.lastIndex = m.index + m[0].length + (end ? end.index : rest.length);
  }
  return { scripts, styles };
}

/**
 * The policy for this index.html: the configured directives plus hashes of its inline scripts
 * and styles. A directive the app left out is derived from default-src first, so adding hashes
 * never drops sources the app allowed. A directive with 'unsafe-inline' stays as it is: hashes
 * would switch 'unsafe-inline' off (CSP2) and break inline styles the app relies on.
 */
export function buildCsp(
  config: CspConfig,
  html: string,
): { policy: string; scripts: number; styles: number; warnings: string[] } {
  const map = toMap(config);
  const warnings: string[] = [];
  for (const name of HEADER_ONLY) {
    if (map.delete(name))
      warnings.push(`security.csp: ${name} has no effect in a <meta> policy; set it as a server header on the web`);
  }
  const { scripts, styles } = inlineBlocks(html);
  const add = (directive: string, blocks: string[]) => {
    if (blocks.length === 0) return;
    let sources = map.get(directive);
    if (!sources) {
      sources = [...(map.get("default-src") ?? ["'self'"])];
      map.set(directive, sources);
    }
    if (sources.includes("'unsafe-inline'")) {
      warnings.push(
        `security.csp: ${directive} has 'unsafe-inline'; inline ${directive === "script-src" ? "scripts" : "styles"} are not hashed`,
      );
      return;
    }
    if (sources.includes("'none'")) sources.splice(sources.indexOf("'none'"), 1);
    for (const hash of new Set(blocks.map(cspHash))) if (!sources.includes(hash)) sources.push(hash);
  };
  add("script-src", scripts);
  add("style-src", styles);
  return { policy: serializeCsp(map), scripts: scripts.length, styles: styles.length, warnings };
}

export function validateCsp(raw: unknown): CspConfig | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw === "string" && raw.trim()) return raw;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [name, value] of Object.entries(raw)) {
      const ok = typeof value === "string" || (Array.isArray(value) && value.every((v) => typeof v === "string"));
      if (!ok || !/^[a-z-]+$/i.test(name))
        throw new CliError(`security.csp.${name} must be a source list (string or string[])`);
    }
    return raw as CspDirectives;
  }
  throw new CliError(`security.csp must be "strict", a policy string, or a directive map`);
}

const CSP_META = /<meta\b[^>]*http-equiv\s*=\s*["']?content-security-policy/i;

/**
 * Inserts the policy near the top of <head>: right after `<meta charset>` when there is one (so
 * the charset stays in the first 1024 bytes a browser scans), else first. Either way it comes
 * before the inlined styles and the bundle; only init.js may precede it, which 'self' allows.
 */
export function injectCspMeta(html: string, policy: string): string {
  if (CSP_META.test(html)) {
    throw new CliError(
      "index.html already has a Content-Security-Policy <meta>; remove it or drop security.csp from akan-native.config.ts",
    );
  }
  const tag = `<meta http-equiv="Content-Security-Policy" content="${policy.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}">`;
  const head = /<head(\s[^>]*)?>/i.exec(html);
  if (!head) throw new CliError("index.html has no <head> for the Content-Security-Policy <meta>");
  const afterHead = head.index + head[0].length;
  const rest = html.slice(afterHead);
  const charset = /<meta\b[^>]*\bcharset\s*=[^>]*>/i.exec(rest);
  // The policy must come before anything it governs: styles, links and scripts other than init.js.
  const governed = /<(?:style|link)\b|<script\b(?![^>]*__akan_native\/init\.js)/i.exec(rest);
  const at =
    charset && (!governed || charset.index < governed.index)
      ? afterHead + charset.index + charset[0].length
      : afterHead;
  return html.slice(0, at) + tag + html.slice(at);
}

/** True when the source index.html brings its own policy (left alone when security.csp is unset). */
export function hasCspMeta(html: string): boolean {
  return CSP_META.test(html);
}

/**
 * security.shell.externalSchemes (L0): lowercase URL schemes the shell may also hand to the OS.
 * Schemes that reach local files, run script or name the app itself can never be added.
 */
export function validateExternalSchemes(raw: unknown): string[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new CliError("security.shell.externalSchemes must be an array of URL schemes");
  for (const scheme of raw) {
    if (typeof scheme !== "string" || !/^[a-z][a-z0-9+.-]*$/.test(scheme)) {
      throw new CliError(
        `security.shell.externalSchemes: ${JSON.stringify(scheme)} is not a lowercase URL scheme (write "sms", not "sms:")`,
      );
    }
    if (NEVER_EXTERNAL_SCHEMES.includes(scheme))
      throw new CliError(
        `security.shell.externalSchemes: ${scheme}: links can never leave the app (${NEVER_EXTERNAL_SCHEMES.join(", ")})`,
      );
  }
  return [...new Set(raw as string[])];
}
