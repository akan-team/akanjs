import { existsSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import * as bundled from "@akanjs/language";

export type AkanCore = Pick<typeof bundled, "AkanIndex">;

export interface LoadedCore {
  core: AkanCore;
  source: string;
}

export const bundledCore: AkanCore = bundled;

const coreMethods = [
  "setFile",
  "removeFile",
  "definitionAt",
  "hoverAt",
  "referencesAt",
  "sourceKeysOf",
  "sourceKeyAt",
  "renameTargetAt",
  "renameAt",
] as const;

const fallback: LoadedCore = { core: bundledCore, source: "bundled" };

const isInside = (root: string, file: string) =>
  [root, realpathSync(root)].some((base) => {
    const relative = path.relative(base, file);
    return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
  });

//? The workspace copy is loaded only when built (`.cjs`/`.js`): inside the akanjs monorepo it is TypeScript source,
//? which the extension host's Node cannot require. Resolution walks up past the folder, so the hit must sit inside it.
export const loadCore = (root: string, trusted: boolean): LoadedCore => {
  if (!trusted || !existsSync(path.join(root, "package.json"))) return fallback;
  try {
    const requireFromRoot = createRequire(path.join(root, "package.json"));
    const entry = requireFromRoot.resolve("@akanjs/language");
    if (!/\.c?js$/.test(entry) || !isInside(root, entry)) return fallback;
    delete requireFromRoot.cache[entry];
    const workspace = requireFromRoot(entry) as Partial<AkanCore>;
    const prototype = workspace.AkanIndex?.prototype as Partial<Record<string, unknown>> | undefined;
    if (!prototype || !coreMethods.every((method) => typeof prototype[method] === "function")) return fallback;
    return { core: workspace as AkanCore, source: entry };
  } catch {
    return fallback;
  }
};
