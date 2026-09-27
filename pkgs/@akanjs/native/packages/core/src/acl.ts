// Plugin permission ACL (requirements PL-11, plugins.md C7). The CLI resolves the app's
// capabilities into this shape and writes it into boot.json; every host checks each bridge call
// against it before dispatch (desktop dispatcher, iOS/Android AkanNativeBridge), and the page applies it
// to web implementations. The Swift (native/ios/Sources/AkanNativeAcl.swift) and Kotlin
// (native/android/.../AkanNativeAcl.kt) copies follow this file; keep the three in step.
//
// Model after tauri-utils/src/acl and tauri/crates/tauri/src/ipc/authority.rs, simplified:
// - a grant allows some items of one plugin in some windows, optionally with scopes
// - a denied item is denied in every window and wins over any grant (Tauri: denial ignores the
//   window and webview labels)
// - scopes travel to the plugin with the call; the plugin enforces them

/** A scope entry: field → glob. The plugin says which fields it knows (its manifest `scope`). */
export type ScopeEntry = Record<string, string>;

export interface AclGrant {
  plugin: string;
  /** Window ids (1 = the main window), or every window. Mobile and web pages are window 1. */
  windows: "*" | number[];
  /** Methods, `listen:<event>` for subscriptions, or everything. */
  items: "*" | string[];
  /** Absent: no restriction from this grant. */
  allow?: ScopeEntry[];
  deny?: ScopeEntry[];
}

export interface ResolvedAcl {
  grants: AclGrant[];
  /** plugin → items denied everywhere. */
  denied?: Record<string, string[]>;
}

/** What a call may touch. `allow: null`: anything the plugin allows by itself, minus `deny`. */
export interface CallScope {
  allow: ScopeEntry[] | null;
  deny: ScopeEntry[];
}

export interface Access {
  allowed: boolean;
  /** Only when some matching grant carries scopes. */
  scope?: CallScope;
}

/** What hosts enforce when boot.json's ACL is broken: nothing is allowed (fail-closed). */
export const DENY_ALL: ResolvedAcl = { grants: [], denied: {} };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isStrings = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === "string");
const isScopes = (v: unknown) =>
  v === undefined ||
  (Array.isArray(v) && v.every((e) => isRecord(e) && Object.values(e).every((s) => typeof s === "string")));

/**
 * Why an ACL from boot.json is not one the hosts can enforce, or null. Every host checks the same
 * shape (Swift AkanNativeAcl.from, Kotlin AkanNativeAcl.from; vectors/acl.json): a malformed part must not
 * loosen the rest, as when one bad denial dropped every denial or one bad grant allowed everything.
 */
export function aclProblem(value: unknown): string | null {
  if (!isRecord(value) || !Array.isArray(value.grants)) return "acl must be { grants: [...], denied?: {...} }";
  for (const [i, g] of value.grants.entries()) {
    if (!isRecord(g) || typeof g.plugin !== "string" || g.plugin === "") return `grant ${i} has no plugin`;
    if (
      g.windows !== "*" &&
      !(Array.isArray(g.windows) && g.windows.every((w) => Number.isInteger(w) && (w as number) >= 1))
    )
      return `grant ${i}: bad windows`;
    if (g.items !== "*" && !isStrings(g.items)) return `grant ${i}: bad items`;
    if (!isScopes(g.allow) || !isScopes(g.deny)) return `grant ${i}: bad scopes`;
  }
  if (value.denied !== undefined && !(isRecord(value.denied) && Object.values(value.denied).every(isStrings)))
    return "bad denied";
  return null;
}

/**
 * A host's ACL from its boot data. boot.json without one (a build without capabilities, unit
 * tests): null, everything allowed. One that is not well formed: nothing allowed.
 */
export function loadAcl(boot: { acl?: unknown }): { acl: ResolvedAcl | null; problem: string | null } {
  if (!("acl" in boot) || boot.acl === undefined) return { acl: null, problem: null };
  const problem = aclProblem(boot.acl);
  return problem ? { acl: DENY_ALL, problem } : { acl: boot.acl as ResolvedAcl, problem: null };
}

/** The ACL item of a `$listen` for `event`. */
export const listenItem = (event: string) => `listen:${event}`;

/**
 * The C7 check. Without an ACL (older builds, unit tests) everything is allowed, as before PL-11.
 */
export function aclCheck(acl: ResolvedAcl | undefined | null, plugin: string, item: string, window = 1): Access {
  if (!acl) return { allowed: true };
  if (acl.denied?.[plugin]?.includes(item)) return { allowed: false };
  const matching = acl.grants.filter(
    (g) =>
      g.plugin === plugin &&
      (g.items === "*" || g.items.includes(item)) &&
      (g.windows === "*" || g.windows.includes(window)),
  );
  if (matching.length === 0) return { allowed: false };
  const allow = matching.some((g) => !g.allow) ? null : matching.flatMap((g) => g.allow!);
  const deny = matching.flatMap((g) => g.deny ?? []);
  return allow === null && deny.length === 0 ? { allowed: true } : { allowed: true, scope: { allow, deny } };
}

const cache = new Map<string, RegExp>();

/** The anchored regex for `source`, compiled once. `u`: `?` is one character, not one UTF-16 unit. */
function compiled(source: string): RegExp {
  let re = cache.get(source);
  if (!re) {
    re = new RegExp(`^(?:${source})$`, "su");
    cache.set(source, re);
  }
  return re;
}

const escape = (c: string) => c.replace(/[\\^$.|+()[\]{}]/g, "\\$&");

/**
 * Glob match of the whole `text`. Path mode (`path: true`): `*` and `?` stop at "/", `**` crosses
 * it, `**​/` also matches no folder, and a trailing `/**` also matches the folder itself
 * ("exports/**" covers "exports"). In an allow entry no wildcard matches a name that starts with
 * "." (".env", ".git/"): dot files are allowed only when the pattern names the dot itself
 * (".config/**", "**​/.env"). A deny entry (`deny: true`) covers them too ("private/**" keeps
 * "private/.env" out). Otherwise `*` and `**` match anything (plain values such as a filesystem
 * base; URLs use urlMatch). No other syntax: every other character is literal. Case-sensitive;
 * scopePermits folds case for case-insensitive volumes.
 */
export function globMatch(pattern: string, text: string, path: boolean, deny = false): boolean {
  return compiled(globSource(pattern, path, deny)).test(text);
}

export function globSource(pattern: string, path: boolean, deny = false): string {
  // Allow entries in path mode: a wildcard at the start of a name never matches a leading ".".
  const dots = !path || deny;
  const guard = dots ? "" : "(?!\\.)";
  const segment = `${guard}[^/]*`;
  const across = dots ? ".*" : "(?:[^/]|/(?!\\.))*";
  let out = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]!;
    const start = i === 0 || pattern[i - 1] === "/";
    if (c === "*") {
      const double = pattern[i + 1] === "*";
      if (!double) {
        out += path ? (start ? segment : "[^/]*") : ".*";
        continue;
      }
      i++;
      if (!path) out += ".*";
      else if (pattern[i + 1] === "/" && start) {
        out += `(?:${segment}/)*`; // "**/" at a segment start: zero or more folders
        i++;
      } else if (i === pattern.length - 1 && pattern[i - 2] === "/") {
        out = `${out.slice(0, -1)}(?:/${segment})*`; // trailing "/**": the folder too
      } else out += (start ? guard : "") + across;
    } else if (c === "?") out += path ? (start ? `${guard}[^/]` : "[^/]") : ".";
    else out += escape(c);
  }
  return out;
}

/** `*` (and `**`) → `star`, `?` → one character, everything else literal. */
function wildcard(pattern: string, text: string, star: string): boolean {
  let out = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]!;
    if (c === "*") {
      while (pattern[i + 1] === "*") i++;
      out += star;
    } else out += c === "?" ? "." : escape(c);
  }
  return compiled(out).test(text);
}

/**
 * A URL split for matching. `rest` is the path of a URL with an authority, or what follows the
 * scheme otherwise (the addresses of mailto:, the number of tel:). Scheme and host are lowercase.
 * A URL's query and fragment are not part of it; in a pattern `?` is a wildcard, so only "/" ends
 * the authority.
 */
export interface UrlParts {
  scheme: string;
  host: string | null;
  port: string;
  rest: string;
}

export function urlParts(text: string, pattern = false): UrlParts | null {
  const colon = text.indexOf(":");
  if (colon <= 0) return null;
  const scheme = text.slice(0, colon).toLowerCase();
  let rest = text.slice(colon + 1);
  const query = pattern ? -1 : rest.search(/[?#]/);
  if (query >= 0) rest = rest.slice(0, query);
  if (!rest.startsWith("//")) return { scheme, host: null, port: "", rest };
  rest = rest.slice(2);
  const end = rest.indexOf("/");
  let authority = end < 0 ? rest : rest.slice(0, end);
  authority = authority.slice(authority.lastIndexOf("@") + 1); // user info
  const bracket = authority.startsWith("[") ? authority.indexOf("]") + 1 : 0; // IPv6
  const portColon = authority.indexOf(":", bracket);
  return {
    scheme,
    host: (portColon < 0 ? authority : authority.slice(0, portColon)).toLowerCase(),
    port: portColon < 0 ? "" : authority.slice(portColon + 1),
    rest: end < 0 ? "" : rest.slice(end),
  };
}

const DEFAULT_PORTS: Record<string, string> = { http: "80", https: "443", ws: "80", wss: "443" };

/**
 * URL scope match, for the fields a plugin names in scopePermits' `urlFields`: scheme, host, port
 * and the rest are compared separately, so no wildcard reaches from one into another
 * ("https://*.example.com/*" never matches "https://evil.com/x.example.com/"). Scheme and host
 * ignore case, and `*` in the host spans dots (a.b.example.com). A pattern without a port matches
 * only the scheme's default port in an allow entry ("https://api.example.com/*" does not reach a
 * debug server on :8443, as URLPattern strings in Tauri do), but every port in a deny entry (a deny
 * of a host covers all of it); ":*" is any port. A pattern without a path matches any path, and `*`
 * alone every URL; `*` in the path crosses "/". The query and fragment are never compared, and `?`
 * is always a one-character wildcard. A pattern without a scheme matches nothing. `url` is the
 * plugin's normalized URL (percent-encoded, no default port, dot segments resolved).
 */
export function urlMatch(pattern: string, url: string, deny = false): boolean {
  if (/^\*+$/.test(pattern)) return true;
  const p = urlParts(pattern, true);
  const v = urlParts(url);
  if (!p || !v || (p.host === null) !== (v.host === null)) return false;
  if (!wildcard(p.scheme, v.scheme, "[a-z0-9+.-]*")) return false;
  if (p.host !== null) {
    if (!wildcard(p.host, v.host!, ".*")) return false;
    const port = v.port || DEFAULT_PORTS[v.scheme] || "";
    if (p.port === "" ? !deny && port !== (DEFAULT_PORTS[v.scheme] ?? "") : p.port !== "*" && p.port !== port)
      return false;
    if (p.rest === "") return true;
  }
  return wildcard(p.rest, v.rest, ".*");
}

function entryMatches(
  entry: ScopeEntry,
  value: Record<string, string>,
  pathFields: readonly string[],
  urlFields: readonly string[],
  deny: boolean,
  fold: boolean,
): boolean {
  for (const [field, pattern] of Object.entries(entry)) {
    const actual = value[field];
    if (actual === undefined) return false;
    const path = pathFields.includes(field);
    const match = urlFields.includes(field)
      ? urlMatch(pattern, actual, deny)
      : path && fold
        ? globMatch(pattern.toLowerCase(), actual.toLowerCase(), true, deny)
        : globMatch(pattern, actual, path, deny);
    if (!match) return false;
  }
  return true;
}

/**
 * Whether `value` (the fields of what a call touches, e.g. { base, path } or { url }) is inside the
 * call's scope: no deny entry matches, and some allow entry matches unless allow is unrestricted.
 * `fold`: the path fields name files on a case-insensitive volume (macOS and Windows by default,
 * Android's shared storage), so "Secret/x" is compared as "secret/x" and a deny cannot be passed
 * by changing case.
 */
export function scopePermits(
  scope: CallScope | undefined | null,
  value: Record<string, string>,
  pathFields: readonly string[] = [],
  urlFields: readonly string[] = [],
  fold = false,
): boolean {
  if (!scope) return true;
  if (scope.deny.some((e) => entryMatches(e, value, pathFields, urlFields, true, fold))) return false;
  return scope.allow === null || scope.allow.some((e) => entryMatches(e, value, pathFields, urlFields, false, fold));
}
