/** Where an SSR document links its root layout's `.manifest()`; the server answers it from that layout. */
export const webManifestHref = (basePath?: string | null) =>
  basePath ? `/${basePath}/manifest.webmanifest` : "/manifest.webmanifest";

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
