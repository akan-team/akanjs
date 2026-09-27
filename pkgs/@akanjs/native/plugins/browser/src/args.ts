import { AkanNativeError } from "../../../packages/core/src/index.ts";

/**
 * http and https only: SFSafariViewController takes nothing else (capacitor-plugins/browser/ios/
 * Sources/BrowserPlugin/Browser.swift:19) and Custom Tabs are browser tabs. Other schemes belong
 * to the opener plugin. The native implementations check the same rules.
 */
export function checkUrl(url: unknown): URL {
  if (typeof url !== "string" || url.length === 0)
    throw new AkanNativeError("INVALID_ARGS", "url must be a non-empty string");
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new AkanNativeError("INVALID_ARGS", `${url} is not an absolute URL`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new AkanNativeError(
      "INVALID_ARGS",
      `only http and https URLs open in the in-app browser (got ${parsed.protocol})`,
    );
  }
  if (!parsed.hostname) throw new AkanNativeError("INVALID_ARGS", `${url} has no host`);
  return parsed;
}

/** "#rrggbb" or undefined. Capacitor logs and ignores a bad color; here it is INVALID_ARGS. */
export function checkColor(color: unknown): string | undefined {
  if (color === undefined || color === null) return undefined;
  if (typeof color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(color)) {
    throw new AkanNativeError("INVALID_ARGS", `toolbarColor must look like "#1a2b3c" (got ${JSON.stringify(color)})`);
  }
  return color;
}
