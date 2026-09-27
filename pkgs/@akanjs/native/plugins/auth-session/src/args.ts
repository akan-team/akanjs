import { AkanNativeError } from "../../../packages/core/src/index.ts";

export interface StartArgs {
  url: URL;
  callbackScheme: string;
  ephemeral: boolean;
}

// The rule akan-native.config.ts applies to deepLinks.schemes (packages/cli/src/lib/project.ts).
const SCHEME = /^[a-z][a-z0-9+.-]*$/;
const RESERVED = ["http", "https", "file", "app", "javascript", "data", "about", "blob"];

/** Checks start()'s arguments; the native implementations check the same rules. */
export function checkStart(args: unknown): StartArgs {
  const a = (args ?? {}) as { url?: unknown; callbackScheme?: unknown; ephemeral?: unknown };
  if (typeof a.url !== "string" || a.url.length === 0)
    throw new AkanNativeError("INVALID_ARGS", "url must be a non-empty string");
  let url: URL;
  try {
    url = new URL(a.url);
  } catch {
    throw new AkanNativeError("INVALID_ARGS", `${a.url} is not an absolute URL`);
  }
  if ((url.protocol !== "https:" && url.protocol !== "http:") || !url.hostname) {
    throw new AkanNativeError("INVALID_ARGS", `the sign-in page must be an http or https URL (got ${a.url})`);
  }
  const scheme = a.callbackScheme;
  if (typeof scheme !== "string" || !SCHEME.test(scheme) || RESERVED.includes(scheme)) {
    throw new AkanNativeError(
      "INVALID_ARGS",
      `callbackScheme must be a lowercase custom scheme such as "myapp", as listed in deepLinks.schemes (got ${JSON.stringify(scheme)})`,
    );
  }
  if (a.ephemeral !== undefined && typeof a.ephemeral !== "boolean")
    throw new AkanNativeError("INVALID_ARGS", "ephemeral must be a boolean");
  return { url, callbackScheme: scheme, ephemeral: a.ephemeral ?? false };
}

/** Whether `url` is a callback for `scheme` (schemes compare case-insensitively). */
export function isCallback(url: string, scheme: string): boolean {
  const colon = url.indexOf(":");
  return colon > 0 && url.slice(0, colon).toLowerCase() === scheme;
}

/** The `state` parameter of a URL's query, or of its fragment (implicit flows), or null. */
export function stateOf(url: string): string | null {
  try {
    const u = new URL(url);
    return u.searchParams.get("state") ?? new URLSearchParams(u.hash.slice(1)).get("state");
  } catch {
    return null;
  }
}

/**
 * Whether a link is the answer to this sign-in. Any app, or a web page linking to the scheme, can
 * send a link of the callback scheme while start() waits; when the start URL carries OAuth's
 * `state`, only a callback with the same `state` is taken (RFC 6749 §10.12) and others are left
 * to the app plugin. PKCE is still the app's (RFC 8252 §8.1).
 */
export function isAnswer(url: string, scheme: string, state: string | null): boolean {
  return isCallback(url, scheme) && (state === null || stateOf(url) === state);
}
