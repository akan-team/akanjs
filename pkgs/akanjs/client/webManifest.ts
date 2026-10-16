import { trimSlashes } from "akanjs/common";

/** Where an SSR document links its root layout's `.manifest()`; the server answers it from that layout. */
export const webManifestHref = (basePath?: string | null) =>
  basePath ? `/${basePath}/manifest.webmanifest` : "/manifest.webmanifest";

const trimBasePath = (value: string) => trimSlashes(value.trim());

/** The basePath a `/manifest.webmanifest` request asks for: by a visible prefix, else by the request's basePath. */
export const getWebManifestBasePath = (
  pathname: string,
  basePaths: readonly string[],
  headerBasePath?: string | null,
): string | null | undefined => {
  const segments = pathname.trim().split("/").filter(Boolean);
  if (segments.at(-1) !== "manifest.webmanifest" || segments.length > 2) return undefined;
  const known = basePaths.map(trimBasePath);
  if (segments.length === 2) return known.includes(segments[0] ?? "") ? (segments[0] ?? null) : undefined;
  const fromHeader = trimBasePath(headerBasePath ?? "");
  return known.includes(fromHeader) ? fromHeader : null;
};

const camelToSnake = (key: string) => key.replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`);
const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Object.prototype.toString.call(value) === "[object Object]";

/** A `.manifest()` object in the browser's own snake_case keys, at every depth. */
export const toManifestJson = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(toManifestJson);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entryValue]) => entryValue !== undefined)
      .map(([key, entryValue]) => [camelToSnake(key), toManifestJson(entryValue)]),
  );
};
