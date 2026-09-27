import { EXTERNAL_SCHEMES } from "../../../packages/core/src/contract.ts";
import { AkanNativeError, type CallScope, scopePermits } from "../../../packages/core/src/index.ts";

/**
 * Schemes the opener hands to the system by default: the shell's external list (contract.json;
 * tauri-plugins-workspace/plugins/opener allows the same, permissions/allow-default-urls.toml). An
 * app adds others with security.shell.externalSchemes. Anything else (file:, javascript:, other
 * apps' schemes) is INVALID_ARGS on every platform; the native implementations check the same list.
 */
export const OPENER_SCHEMES = EXTERNAL_SCHEMES;

/** Parses and checks a URL for openUrl/canOpenUrl. Scheme case is normalized by URL (as Android normalizeScheme). */
export function checkUrl(url: unknown, schemes: readonly string[] = OPENER_SCHEMES): URL {
  if (typeof url !== "string" || url.length === 0)
    throw new AkanNativeError("INVALID_ARGS", "url must be a non-empty string");
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new AkanNativeError("INVALID_ARGS", `${url} is not an absolute URL`);
  }
  const scheme = parsed.protocol.slice(0, -1);
  if (!schemes.includes(scheme)) {
    throw new AkanNativeError("INVALID_ARGS", `only ${schemes.join(", ")} URLs can be opened (got ${scheme}:)`);
  }
  if ((scheme === "http" || scheme === "https") && !parsed.hostname)
    throw new AkanNativeError("INVALID_ARGS", `${url} has no host`);
  return parsed;
}

/**
 * PL-11: the app's capabilities may limit openUrl to scopes { url } (URL patterns, urlMatch in
 * @akanjs/native/core), matched against the normalized URL, e.g. { url: "https://*.example.com/*" }.
 * Throws NOT_ALLOWED outside the call's scope.
 */
export function checkUrlScope(scope: CallScope | undefined, url: URL): void {
  if (!scopePermits(scope, { url: url.href }, [], ["url"]))
    throw new AkanNativeError("NOT_ALLOWED", `${url.href} is outside the app's capabilities`);
}
