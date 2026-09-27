import { AkanNativeError } from "../../../packages/core/src/index.ts";
import type { ShareOptions } from "./index.ts";

// Schemes that do not work as a link outside this page.
const NOT_LINKS = ["javascript:", "data:", "blob:", "file:"];

const invalid = (message: string) => new AkanNativeError("INVALID_ARGS", message);

/**
 * Normalizes share() options the way the native implementations read them: empty strings and
 * null count as missing, at least one of text, url or files is required, url is absolute.
 */
export function checkOptions(options: unknown): ShareOptions {
  if (!options || typeof options !== "object" || Array.isArray(options))
    throw invalid("share options must be an object");
  const { title, text, url, files } = options as Record<string, unknown>;
  const out: ShareOptions = {};
  for (const [key, value] of [
    ["title", title],
    ["text", text],
    ["url", url],
  ] as const) {
    if (value === undefined || value === null || value === "") continue;
    if (typeof value !== "string") throw invalid(`${key} must be a string`);
    out[key] = value;
  }
  if (files !== undefined && files !== null) {
    if (!Array.isArray(files) || files.some((f) => typeof f !== "string" || f.length === 0))
      throw invalid("files must be an array of file URLs");
    if (files.length > 0) out.files = files as string[];
  }
  if (!out.text && !out.url && !out.files) throw invalid("share needs text, url or files");
  if (out.url) {
    let parsed: URL;
    try {
      parsed = new URL(out.url);
    } catch {
      throw invalid(`url must be an absolute URL (got ${out.url})`);
    }
    if (NOT_LINKS.includes(parsed.protocol))
      throw invalid(`${parsed.protocol} URLs cannot be shared as links; use files`);
  }
  return out;
}
