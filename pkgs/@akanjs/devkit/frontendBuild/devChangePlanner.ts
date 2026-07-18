import path from "node:path";
import type { ChangeKind, DevChangeAction, DevChangePlan, DevChangeRole } from "akanjs/server";

const SOURCE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const CONFIG_BASENAMES = new Set(["akan.config.ts", "bunfig.toml", "tsconfig.json", "package.json"]);
const BARREL_FACETS = new Set(["common", "srvkit", "ui", "webkit"]);
const CLIENT_SUFFIXES = [".Template.tsx", ".Unit.tsx", ".Util.tsx", ".View.tsx", ".Zone.tsx", ".store.ts"];
const SHARED_SUFFIXES = [".constant.ts", ".dictionary.ts", ".signal.ts"];
const SERVER_SUFFIXES = [".service.ts", ".document.ts"];
const RUNTIME_METADATA_BASENAMES = new Set(["dict.ts", "sig.ts", "useClient.ts", "useServer.ts"]);

export interface DevChangePlannerOptions {
  workspaceRoot: string;
}

export interface DevChangePlanInput {
  generation: number;
  files: string[];
  kinds: Iterable<Exclude<ChangeKind, "ignore">>;
  generatedFiles?: string[];
}

export class DevChangePlanner {
  readonly #workspaceRoot: string;

  constructor({ workspaceRoot }: DevChangePlannerOptions) {
    this.#workspaceRoot = path.resolve(workspaceRoot);
  }

  plan({ generation, files, kinds, generatedFiles = [] }: DevChangePlanInput): DevChangePlan {
    const fileList = uniqueResolved([...files, ...generatedFiles]);
    const generatedSet = new Set(generatedFiles.map((file) => path.resolve(file)));
    const kindSet = new Set(kinds);
    const roles = new Set<DevChangeRole>();
    const actions = new Set<DevChangeAction>();
    const reasonByFile: Record<string, string[]> = {};

    for (const kind of kindSet) {
      if (kind === "css") {
        roles.add("css");
        actions.add("rebuild-css");
      }
      if (kind === "config") {
        roles.add("config");
        actions.add("restart-dev-host");
      }
    }

    for (const file of fileList) {
      const reasons = new Set<string>();
      const fileRoles = this.#rolesForFile(file, { isGenerated: generatedSet.has(path.resolve(file)), reasons });
      for (const role of fileRoles) roles.add(role);
      if (reasons.has("runtime-metadata")) actions.add("restart-builder");
      if (reasons.size > 0) reasonByFile[path.resolve(file)] = [...reasons].sort();
    }

    if (roles.has("barrel")) actions.add("sync-generated");
    if (roles.has("server") || roles.has("shared")) actions.add("restart-backend");
    if (roles.has("client") || roles.has("shared")) actions.add("rebuild-client");
    if (roles.has("css")) actions.add("rebuild-css");

    return {
      generation,
      files: fileList,
      generatedFiles: uniqueResolved(generatedFiles),
      roles: [...roles].sort(),
      actions: [...actions].sort(),
      reasonByFile,
    };
  }

  #rolesForFile(
    file: string,
    { isGenerated, reasons }: { isGenerated: boolean; reasons: Set<string> },
  ): Set<DevChangeRole> {
    const roles = new Set<DevChangeRole>();
    const abs = path.resolve(file);
    const base = path.basename(abs);
    const ext = path.extname(abs).toLowerCase();
    const isSource = SOURCE_EXTS.has(ext);
    const rel = path.relative(this.#workspaceRoot, abs);
    const parts = rel.split(path.sep).filter(Boolean);

    if (CONFIG_BASENAMES.has(base)) {
      roles.add("config");
      reasons.add("config-file");
    }
    if (ext === ".css") {
      roles.add("css");
      reasons.add("css-file");
    }
    if (isGenerated || (isSource && this.#isBarrelFacetChild(parts))) {
      roles.add("barrel");
      reasons.add(isGenerated ? "generated-index" : "barrel-facet-child");
    }
    if (isSource && this.#isServerBiased(abs, parts)) {
      roles.add("server");
      reasons.add("server-path");
    }
    if (isSource && this.#isClientBiased(abs, parts)) {
      roles.add("client");
      reasons.add("client-path");
    }
    if (isSource && this.#isSharedBiased(abs, parts)) {
      roles.add("shared");
      reasons.add("shared-path");
    }
    if (isSource && this.#isRuntimeMetadataFile(parts, base)) {
      reasons.add("runtime-metadata");
    }

    if (roles.has("server") && roles.has("client")) {
      roles.delete("server");
      roles.delete("client");
      roles.add("shared");
      reasons.add("server-client-overlap");
    }
    if (roles.size === 0 && SOURCE_EXTS.has(ext) && this.#isWorkspaceSource(rel)) {
      roles.add("shared");
      reasons.add("workspace-source-fallback");
    }

    return roles;
  }

  #isServerBiased(abs: string, parts: string[]): boolean {
    const base = path.basename(abs);
    return (
      parts.includes("srvkit") ||
      SERVER_SUFFIXES.some((suffix) => base.endsWith(suffix)) ||
      base === "main.ts" ||
      base === "server.ts"
    );
  }

  #isClientBiased(abs: string, parts: string[]): boolean {
    const base = path.basename(abs);
    return (
      parts.includes("ui") ||
      parts.includes("webkit") ||
      parts.includes("page") ||
      CLIENT_SUFFIXES.some((suffix) => base.endsWith(suffix))
    );
  }

  #isSharedBiased(abs: string, parts: string[]): boolean {
    const base = path.basename(abs);
    return (
      parts.includes("common") ||
      SHARED_SUFFIXES.some((suffix) => base.endsWith(suffix)) ||
      RUNTIME_METADATA_BASENAMES.has(base)
    );
  }

  #isRuntimeMetadataFile(parts: string[], base: string): boolean {
    const parent = parts.at(-2);
    if (parent === "lib" && RUNTIME_METADATA_BASENAMES.has(base)) return true;
    const libIndex = parts.lastIndexOf("lib");
    if (libIndex < 0 || parts.length <= libIndex + 1) return false;
    return base.endsWith(".dictionary.ts") || base.endsWith(".signal.ts");
  }

  #isBarrelFacetChild(parts: string[]): boolean {
    if (parts.length < 4) return false;
    const [scope, , facet, child] = parts;
    if (scope !== "apps" && scope !== "libs") return false;
    if (!facet || !BARREL_FACETS.has(facet)) return false;
    if (!child || child.startsWith(".") || child === "index.ts" || child === "index.tsx") return false;
    return true;
  }

  #isWorkspaceSource(rel: string): boolean {
    if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return false;
    const [scope] = rel.split(path.sep);
    return scope === "apps" || scope === "libs" || scope === "pkgs";
  }
}

const uniqueResolved = (files: string[]) => [...new Set(files.map((file) => path.resolve(file)))].sort();
