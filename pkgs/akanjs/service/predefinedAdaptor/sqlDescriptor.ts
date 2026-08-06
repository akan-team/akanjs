export const quoteIdent = (identifier: string) => `"${identifier.replaceAll('"', '""')}"`;

export const jsonPath = (path: string) =>
  `$.${path
    .split(".")
    .map((part) => part.replaceAll('"', '\\"'))
    .join(".")}`;

export const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, val]) => `${JSON.stringify(key)}:${stableJson(val)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};

/** Stable hash of a schema descriptor, stored in `_akan_meta` so a changed definition is detected without migrations. */
export const descriptorHash = async (value: unknown) => {
  const bytes = new TextEncoder().encode(stableJson(value));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};
