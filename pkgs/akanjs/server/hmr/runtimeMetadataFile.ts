import path from "node:path";

const APP_RUNTIME_METADATA_BASENAMES = new Set(["dict.ts", "sig.ts", "useClient.ts"]);

export function isAkanRuntimeMetadataFile(file: string): boolean {
  const resolved = path.resolve(file);
  const parts = resolved.split(/[\\/]+/).filter(Boolean);
  const base = parts.at(-1);
  if (!base) return false;

  const parent = parts.at(-2);
  if (parent === "lib" && APP_RUNTIME_METADATA_BASENAMES.has(base)) return true;

  const libIndex = parts.lastIndexOf("lib");
  if (libIndex < 0 || parts.length <= libIndex + 1) return false;
  return base.endsWith(".dictionary.ts") || base.endsWith(".signal.ts");
}
