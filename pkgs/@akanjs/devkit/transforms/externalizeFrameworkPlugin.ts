import path from "node:path";
import type { BunPlugin } from "bun";
import type { App } from "../commandDecorators";

export interface ExternalizeFrameworkOptions {
  app: App;
  /** Prefixes to bundle rather than externalize; defaults to `akanjs/`, `@apps/`, `@libs/`. */
  include?: string[];
  /** Bare specifiers to force-externalize, overriding `include`. */
  extra?: string[];
}

// Bundled so they pass the barrel and `"use client"` transforms; resolved at runtime they would drag
// react-dom/client side effects into the server graph.
const DEFAULT_INCLUDE = ["akanjs/", "@apps/", "@libs/"];

// Runtime hosts and singleton framework packages stay external; ordinary npm dependencies are bundled.
const DEFAULT_EXCLUDE_EXACT = new Set<string>(["akanjs/webkit", "@akanjs/cli", "@akanjs/devkit"]);
const DEFAULT_EXCLUDE_PREFIX = ["@akanjs/cli/", "@akanjs/devkit/"];
const OPTIONAL_BACKEND_EXTERNAL_EXACT = new Set<string>(["bullmq", "ioredis", "postgres", "protobufjs"]);
const RUNTIME_EXTERNAL_EXACT = new Set<string>([
  "react",
  "react-dom",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
  "react-server-dom-webpack",
  "react-server-dom-webpack/server.node",
  "react-server-dom-webpack/client.node",
  "react-server-dom-webpack/client.browser",
]);
const RUNTIME_EXTERNAL_PREFIX = ["react-dom/", "react-server-dom-webpack/"];

// TS before JS: workspace sources are authored in TypeScript.
const CANDIDATE_EXTS = [".tsx", ".ts", ".jsx", ".js", ".mjs", ".cjs"];

// Rejected `Bun.build` options: `external` also applies at macro time (ENOENT "react"), and `packages: "external"`
// externalizes workspace and npm packages the runtime does not install. onResolve shapes only the output graph.
export async function createExternalizeFrameworkPlugin(options: ExternalizeFrameworkOptions): Promise<BunPlugin> {
  const tsconfig = await options.app.getTsConfig();
  const includePrefixes = options.include ?? DEFAULT_INCLUDE;
  const extraExact = new Set(options.extra ?? []);
  const workspaceRoot = options.app.workspace.workspaceRoot;
  const tsconfigPaths = tsconfig.compilerOptions.paths ?? {};
  const rootEntries = Object.entries(tsconfigPaths)
    .filter(([k]) => !k.endsWith("/*"))
    .map(([k, v]) => ({ pkg: k, entryFile: v[0] ?? null }))
    .filter((e): e is { pkg: string; entryFile: string } => e.entryFile !== null);
  const wildcardEntries = Object.entries(tsconfigPaths)
    .filter(([k]) => k.endsWith("/*"))
    .map(([k, v]) => ({ prefix: k.slice(0, -1), replacements: v }))
    .sort((a, b) => b.prefix.length - a.prefix.length);

  async function resolveWorkspaceSubpath(spec: string): Promise<string | null> {
    if (!workspaceRoot) return null;
    for (const { prefix, replacements } of wildcardEntries) {
      if (!spec.startsWith(prefix)) continue;
      const suffix = spec.slice(prefix.length);
      for (const repl of replacements) {
        const replPath = repl?.endsWith("/*") ? repl.slice(0, -1) : (repl ?? "");
        if (!replPath) continue;
        const candidate = path.resolve(workspaceRoot, replPath + suffix);
        const hit = await firstExisting(candidate);
        if (hit) return hit;
      }
    }
    for (const { pkg, entryFile } of rootEntries) {
      if (!spec.startsWith(`${pkg}/`)) continue;
      const suffix = spec.slice(pkg.length + 1);
      const pkgDir = path.dirname(path.resolve(workspaceRoot, entryFile));
      const candidate = path.join(pkgDir, suffix);
      const hit = await firstExisting(candidate);
      if (hit) return hit;
    }
    return null;
  }

  return {
    name: "akan-externalize-framework",
    setup(build) {
      build.onResolve({ filter: /.*/ }, async (args) => {
        const spec = args.path;
        if (spec === "." || spec === ".." || spec.startsWith("./") || spec.startsWith("../") || spec.startsWith("/"))
          return undefined;
        if (extraExact.has(spec) || DEFAULT_EXCLUDE_EXACT.has(spec)) return { path: spec, external: true };
        for (const prefix of DEFAULT_EXCLUDE_PREFIX) {
          if (spec.startsWith(prefix)) return { path: spec, external: true };
        }
        if (OPTIONAL_BACKEND_EXTERNAL_EXACT.has(spec)) return { path: spec, external: true };
        if (RUNTIME_EXTERNAL_EXACT.has(spec)) return { path: spec, external: true };
        for (const prefix of RUNTIME_EXTERNAL_PREFIX) {
          if (spec.startsWith(prefix)) return { path: spec, external: true };
        }
        // Bun resolves only root tsconfig `paths`, so a rewritten `akanjs/client/cookie` would silently stay external.
        if (!includePrefixes.some((prefix) => spec.startsWith(prefix))) return undefined;
        const resolved = await resolveWorkspaceSubpath(spec);
        return resolved ? { path: resolved } : undefined;
      });
    },
  };
}

async function firstExisting(basePath: string): Promise<string | null> {
  if (await Bun.file(basePath).exists()) return basePath;
  for (const ext of CANDIDATE_EXTS) {
    const candidate = `${basePath}${ext}`;
    if (await Bun.file(candidate).exists()) return candidate;
  }
  for (const ext of CANDIDATE_EXTS) {
    const candidate = path.join(basePath, `index${ext}`);
    if (await Bun.file(candidate).exists()) return candidate;
  }
  return null;
}
