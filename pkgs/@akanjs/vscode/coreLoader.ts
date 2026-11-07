import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import * as bundled from "@akanjs/language";

export type AkanCore = Pick<typeof bundled, "AkanIndex">;

export interface LoadedCore {
  core: AkanCore;
  source: string;
}

//? The workspace copy is loaded only when built (`.cjs`/`.js`): inside the akanjs monorepo it is TypeScript source,
//? which the extension host's Node cannot require.
export const loadCore = (root: string, trusted: boolean): LoadedCore => {
  if (!trusted || !existsSync(path.join(root, "package.json"))) return { core: bundled, source: "bundled" };
  try {
    const requireFromRoot = createRequire(path.join(root, "package.json"));
    const entry = requireFromRoot.resolve("@akanjs/language");
    if (!/\.c?js$/.test(entry)) return { core: bundled, source: "bundled" };
    const workspace = requireFromRoot(entry) as Partial<AkanCore>;
    if (typeof workspace.AkanIndex !== "function") return { core: bundled, source: "bundled" };
    return { core: workspace as AkanCore, source: entry };
  } catch {
    return { core: bundled, source: "bundled" };
  }
};
