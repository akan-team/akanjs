import path from "node:path";
import type { BunPlugin } from "bun";
import type { App } from "../commandDecorators";

/**
 * Keep framework/runtime singletons external while bundling authored
 * workspace sources and ordinary npm dependencies into the pages bundle.
 *
 * Why a plugin instead of `Bun.build({ external })` or
 * `Bun.build({ packages: "external" })`:
 *   - `packages: "external"` externalizes every bare specifier, including
 *     `@apps/*` / `@libs/*` — workspace packages that must stay bundled
 *     so the `"use client"` plugin can rewrite their exports — and ordinary
 *     npm dependencies like `dayjs` / `clsx`, which the production runtime
 *     package.json does not install for the SSR pages artifact.
 *   - Top-level `external: [...]` applies to macro-time module resolution
 *     too; any `with { type: "macro" }` import chain that transitively
 *     resolves `react` during build then fails with `ENOENT "react"`.
 *
 * An `onResolve` plugin only participates in the output-graph walk, so
 * macros evaluate against the real modules in node_modules while the
 * emitted bundle keeps bare specifiers only for runtime singletons that
 * are installed in the generated production package.json.
 *
 * Externalization rules (applied in order):
 *   1. Relative specifiers (`./`, `../`) are NEVER externalized — they
 *      always resolve to the current package's source tree and must be
 *      inlined so transitive `"use client"` stubs work.
 *   2. Specifiers listed in `include` (workspace aliases like
 *      `@apps/*`, `@libs/*`) are NEVER externalized.
 *   3. React / RSC runtime packages and build-time tooling packages are
 *      externalized so the runtime supplies a single shared instance.
 *   4. Other bare npm packages are bundled so the Docker runtime does not
 *      need to install every transitive page dependency separately.
 */
export interface ExternalizeFrameworkOptions {
  app: App;
  /**
   * Prefixes that should be BUNDLED (kept internal). Defaults to
   * `@apps/` and `@libs/` which are the workspace aliases used by the
   * framework's app template.
   */
  include?: string[];
  /**
   * Extra bare specifiers to force-externalize beyond the allowlist
   * defaults. Not commonly needed since the default rule already
   * externalizes every non-workspace specifier.
   */
  extra?: string[];
}

// Workspace package prefixes that must be BUNDLED so their sources go
// through the barrel-imports + `"use client"` transforms. Without this
// the RSC worker would resolve them at runtime — skipping the
// transforms entirely, which re-introduces the react-dom/client
// side-effects we wanted to strip from the server graph.
const DEFAULT_INCLUDE = ["akanjs/", "@apps/", "@libs/"];

// Packages that must stay external even when a broad allowlist would
// otherwise bundle them. These are runtime hosts or shared singleton
// framework packages; ordinary npm dependencies intentionally fall through
// to Bun's resolver and get bundled.
const DEFAULT_EXCLUDE_EXACT = new Set<string>(["akanjs/webkit", "@akanjs/cli", "@akanjs/devkit"]);
const DEFAULT_EXCLUDE_PREFIX = ["@akanjs/cli/", "@akanjs/devkit/"];
const OPTIONAL_BACKEND_EXTERNAL_EXACT = new Set<string>([
  "@libsql/client",
  "bullmq",
  "croner",
  "ioredis",
  "postgres",
  "protobufjs",
]);
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

// File extensions Bun can load when a bare subpath points at an
// extensionless path. Ordered to prefer TS over JS, since workspace
// sources are authored in TypeScript.
const CANDIDATE_EXTS = [".tsx", ".ts", ".jsx", ".js", ".mjs", ".cjs"];

export async function createExternalizeFrameworkPlugin(options: ExternalizeFrameworkOptions): Promise<BunPlugin> {
  const tsconfig = await options.app.getTsConfig();
  const includePrefixes = options.include ?? DEFAULT_INCLUDE;
  const extraExact = new Set(options.extra ?? []);
  const workspaceRoot = options.app.workspace.workspaceRoot;
  const tsconfigPaths = tsconfig.compilerOptions.paths ?? {};
  // Pre-compute the tsconfig root-only entries (`akanjs/client` → …)
  // so we can resolve their subpaths by concatenating the remainder.
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
    // Wildcard `@apps/*` / `@libs/*` → direct filesystem path.
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
    // Root-only tsconfig entries — resolve the subpath against the
    // package directory. E.g. `akanjs/client` → `pkgs/akanjs/client/index.ts`
    // so `akanjs/client/cookie` → `pkgs/akanjs/client/cookie`.
    for (const { pkg, entryFile } of rootEntries) {
      if (spec !== pkg && !spec.startsWith(`${pkg}/`)) continue;
      if (spec === pkg) continue; // the package root itself — let Bun's tsconfig resolver handle it
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
        // Relative imports always stay inlined — they anchor to the
        // current package's source tree and cannot leak cross-package.
        // `.` and `..` (without trailing slash) are valid relative
        // specifiers too (equivalent to `./index` / `../index`).
        if (spec === "." || spec === ".." || spec.startsWith("./") || spec.startsWith("../") || spec.startsWith("/"))
          return undefined;
        // Force-external first (overrides the include allowlist).
        if (extraExact.has(spec) || DEFAULT_EXCLUDE_EXACT.has(spec)) return { path: spec, external: true };
        for (const prefix of DEFAULT_EXCLUDE_PREFIX) {
          if (spec.startsWith(prefix)) return { path: spec, external: true };
        }
        if (OPTIONAL_BACKEND_EXTERNAL_EXACT.has(spec)) return { path: spec, external: true };
        if (RUNTIME_EXTERNAL_EXACT.has(spec)) return { path: spec, external: true };
        for (const prefix of RUNTIME_EXTERNAL_PREFIX) {
          if (spec.startsWith(prefix)) return { path: spec, external: true };
        }
        // Workspace allowlist — resolve the subpath to an absolute
        // on-disk file so Bun.build can read it. Without this, bare
        // specifiers like `akanjs/client/cookie` (produced by the
        // barrel rewriter) fail Bun's default resolution (only root
        // tsconfig-paths entry exists for `akanjs/client`) and get
        // silently left as externals.
        for (const prefix of includePrefixes) {
          if (!spec.startsWith(prefix)) continue;
          const resolved = await resolveWorkspaceSubpath(spec);
          if (resolved) return { path: resolved };
          // Fall through to let Bun attempt its own resolution for the
          // package root (`akanjs/client`) — tsconfig `paths` handles
          // that case directly.
          return undefined;
        }
        // Everything else (ordinary npm dependencies like dayjs / clsx /
        // immer) is bundled into the pages artifact.
        return undefined;
      });
    },
  };
}

async function firstExisting(basePath: string): Promise<string | null> {
  // Direct file with its own extension.
  if (await Bun.file(basePath).exists()) return basePath;
  // Try each candidate extension.
  for (const ext of CANDIDATE_EXTS) {
    const candidate = `${basePath}${ext}`;
    if (await Bun.file(candidate).exists()) return candidate;
  }
  // Directory with `index.<ext>` inside.
  for (const ext of CANDIDATE_EXTS) {
    const candidate = path.join(basePath, `index${ext}`);
    if (await Bun.file(candidate).exists()) return candidate;
  }
  return null;
}
