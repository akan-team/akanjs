import fs from "node:fs";
import path from "node:path";
import type { SsrManifest, SsrManifestEntry } from "akanjs/server";
import type { BunPlugin } from "bun";
import { toClientReferencePath } from "../transforms/rscUseClientTransform";
import {
  type BundleClientEntriesInternalOptions,
  type BundleClientEntriesResult,
  CLIENT_BUNDLE_NAMING,
  type ClientManifest,
  type MetafileOutput,
  type OpaqueEntryAliases,
} from "./clientBuildTypes";

/**
 * Low-level primitive shared by the eager base build and the lazy per-route
 * builds. Takes a flat entrypoints list, runs `Bun.build`, and extracts a
 * `ClientManifest` / `SsrManifest` covering only those entries.
 */
export class ClientEntriesBundler {
  #app: BundleClientEntriesInternalOptions["app"];
  #entries: string[];
  #plugins: BunPlugin[];
  #external: readonly string[];
  #externalSubpaths: readonly string[];
  #externalAliases: Partial<Record<string, string>>;
  #command: "build" | "start";
  #outputSubdir: string;
  #reactFastRefresh: boolean;
  #artifactDir: string;
  #outdir: string;
  #servePrefix: string;
  #manifest: ClientManifest = {};
  #ssrManifest: SsrManifest = { moduleLoading: null, moduleMap: {} };
  #entryUrlsByAbsPath = new Map<string, string>();
  #entryOutputAbsByAbsPath = new Map<string, string>();
  #entryDepsByAbsPath = new Map<string, string[]>();
  #clientReferenceIdByAbsPath = new Map<string, string>();
  #opaqueEntries: OpaqueEntryAliases | null = null;
  #metafileOutputsByAbs = new Map<string, MetafileOutput>();

  constructor(options: BundleClientEntriesInternalOptions) {
    this.#app = options.app;
    this.#entries = options.entries;
    this.#plugins = options.plugins ?? [];
    this.#external = options.external ?? [];
    this.#externalSubpaths = options.externalSubpaths ?? [];
    this.#externalAliases = options.externalAliases ?? {};
    this.#command = options.command ?? "start";
    this.#outputSubdir = options.outputSubdir ?? "client";
    this.#reactFastRefresh = options.reactFastRefresh ?? false;
    this.#artifactDir = `${this.#command === "build" ? this.#app.dist.cwdPath : this.#app.cwdPath}/.akan/artifact`;
    this.#outdir = `${this.#artifactDir}/${this.#outputSubdir}`;
    this.#servePrefix = `/_akan/${this.#outputSubdir}`;
  }

  async bundle(): Promise<BundleClientEntriesResult> {
    const akanConfig = await this.#app.getConfig();
    this.#opaqueEntries = await this.#createOpaqueEntryAliases();
    const result = await Bun.build({
      entrypoints: this.#opaqueEntries.entries,
      outdir: this.#outdir,
      splitting: true,
      target: "browser",
      format: "esm",
      naming: CLIENT_BUNDLE_NAMING,
      metafile: true,
      define: this.#getDefine(),
      minify: this.#command === "build",
      optimizeImports: akanConfig.optimizeImports,
      reactFastRefresh: this.#command === "start" && this.#outputSubdir === "client" && this.#reactFastRefresh,
      plugins:
        this.#external.length > 0 || this.#externalSubpaths.length > 0 || Object.keys(this.#externalAliases).length > 0
          ? [...this.#plugins, this.#createExternalSpecifiersPlugin()]
          : this.#plugins,
    });
    if (!result.success) throw new AggregateError(result.logs, "[ClientEntriesBundler] Bun.build failed");
    await this.#rewriteExternalImportSpecifiers(result.outputs);

    const metafile = result.metafile;
    if (!metafile) throw new Error("[ClientEntriesBundler] metafile is missing");

    this.#metafileOutputsByAbs = new Map<string, MetafileOutput>(
      Object.entries(metafile.outputs).map(([k, v]) => [this.#absFromOutdir(k), v as MetafileOutput]),
    );

    for (const artifact of result.outputs.filter((a) => a.kind === "entry-point"))
      this.#addEntryArtifact(artifact.path);

    return {
      manifest: this.#manifest,
      ssrManifest: this.#ssrManifest,
      entryUrlsByAbsPath: this.#entryUrlsByAbsPath,
      entryOutputAbsByAbsPath: this.#entryOutputAbsByAbsPath,
      entryDepsByAbsPath: this.#entryDepsByAbsPath,
      clientReferenceIdByAbsPath: this.#clientReferenceIdByAbsPath,
    };
  }

  #getDefine(): Record<string, string> {
    const nodeEnv = this.#command === "build" ? "production" : (process.env.NODE_ENV ?? "development");
    return {
      "process.env.NODE_ENV": JSON.stringify(nodeEnv),
      "process.env.AKAN_PUBLIC_RENDER_ENV": JSON.stringify("ssr"),
      ...Object.fromEntries(
        Object.entries(this.#app.getPublicEnv()).map(([key, value]) => [`process.env.${key}`, JSON.stringify(value)]),
      ),
    };
  }

  async #createOpaqueEntryAliases(): Promise<OpaqueEntryAliases> {
    const aliasDir = path.join(this.#app.cwdPath, ".akan", "generated", "client-entry-alias", this.#outputSubdir);
    fs.mkdirSync(aliasDir, { recursive: true });
    const originalByAlias = new Map<string, string>();
    const aliasedEntries = await Promise.all(
      this.#entries.map(async (entry) => {
        const absEntry = path.resolve(entry);
        const hash = Bun.hash(`${this.#app.name}\n${this.#outputSubdir}\n${absEntry}`).toString(36);
        const aliasPath = path.join(aliasDir, `${hash}.tsx`);
        await Bun.write(
          aliasPath,
          this.#createOpaqueEntryAliasSource(absEntry, await this.#scanEntryExportNames(absEntry)),
        );
        originalByAlias.set(path.resolve(aliasPath), absEntry);
        return aliasPath;
      }),
    );
    return { entries: aliasedEntries, originalByAlias, aliasDir };
  }

  #createOpaqueEntryAliasSource(absEntry: string, exportNames: string[]): string {
    const entryLit = JSON.stringify(path.resolve(absEntry));
    if (exportNames.length === 0) return `export * from ${entryLit};\n`;
    const namedExports = exportNames.filter((name) => name !== "default");
    const lines = namedExports.length > 0 ? [`export { ${namedExports.join(", ")} } from ${entryLit};`] : [];
    if (exportNames.includes("default")) lines.push(`export { default } from ${entryLit};`);
    return `${lines.join("\n")}\n`;
  }

  async #scanEntryExportNames(absEntry: string): Promise<string[]> {
    const source = await Bun.file(absEntry).text();
    const transpiler = new Bun.Transpiler({ loader: this.#loaderForEntry(absEntry) });
    return transpiler.scan(source).exports;
  }

  #loaderForEntry(absPath: string): "ts" | "tsx" | "js" | "jsx" {
    if (absPath.endsWith(".tsx")) return "tsx";
    if (absPath.endsWith(".jsx")) return "jsx";
    if (absPath.endsWith(".ts")) return "ts";
    return "js";
  }

  /**
   * Build a BunPlugin that marks a fixed set of bare specifiers as external via `onResolve`,
   * as opposed to `Bun.build({ external })`, so macro-time imports still resolve normally.
   */
  #createExternalSpecifiersPlugin(): BunPlugin {
    const set = new Set(this.#external);
    const subpathSet = new Set(this.#externalSubpaths);
    const aliases = this.#externalAliases;
    const specifiers = [...new Set([...this.#external, ...this.#externalSubpaths, ...Object.keys(aliases)])];
    const escaped = specifiers.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const filter = new RegExp(`^(${escaped.join("|")})(?:/.*)?$`);
    return {
      name: "akan-externalize-specifiers",
      setup(build) {
        build.onResolve({ filter }, (args) => {
          const alias = aliases[args.path];
          if (alias) return { path: alias, external: true };
          if (!ClientEntriesBundler.#matchesExternalSpecifier(args.path, set, subpathSet)) return undefined;
          return { path: args.path, external: true };
        });
      },
    };
  }

  static #matchesExternalSpecifier(
    specifier: string,
    exactExternals: Set<string>,
    subpathExternals: Set<string>,
  ): boolean {
    if (exactExternals.has(specifier)) return true;
    if (subpathExternals.has(specifier)) return true;
    for (const external of subpathExternals) {
      if (specifier.startsWith(`${external}/`)) return true;
    }
    return false;
  }

  async #rewriteExternalImportSpecifiers(outputs: Bun.BuildOutput["outputs"]): Promise<void> {
    if (Object.keys(this.#externalAliases).length === 0) return;
    await Promise.all(
      outputs
        .filter((output) => output.path.endsWith(".js"))
        .map(async (output) => {
          const source = await Bun.file(output.path).text();
          const rewritten = ClientEntriesBundler.rewriteExternalImportSpecifiers(source, this.#externalAliases);
          if (rewritten !== source) await Bun.write(output.path, rewritten);
        }),
    );
  }

  static rewriteExternalImportSpecifiers(source: string, aliases: Partial<Record<string, string>>): string {
    let rewritten = source;
    for (const [specifier, alias] of Object.entries(aliases)) {
      if (!alias) continue;
      const escaped = specifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      rewritten = rewritten
        .replace(new RegExp(`(\\bfrom\\s*["'])${escaped}(["'])`, "g"), (_match, prefix, suffix) => {
          return `${prefix}${alias}${suffix}`;
        })
        .replace(new RegExp(`(\\bimport\\s*["'])${escaped}(["'])`, "g"), (_match, prefix, suffix) => {
          return `${prefix}${alias}${suffix}`;
        });
    }
    return rewritten;
  }

  #toServeUrl(absOutPath: string): string {
    const rel = path.relative(this.#outdir, absOutPath).split(path.sep).join("/");
    return `${this.#servePrefix}/${rel}`;
  }

  // Bun's metafile paths are relative to `outdir`, while entry points are relative to build cwd.
  #absFromOutdir(p: string): string {
    return path.isAbsolute(p) ? p : path.resolve(this.#outdir, p);
  }

  #absFromEntryPoint(p: string): string {
    if (path.isAbsolute(p)) return path.resolve(p);
    const candidates = [path.resolve(process.cwd(), p), path.resolve(this.#app.cwdPath, p)];
    return candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[0];
  }

  // Walk only static chunk imports. Dynamic imports stay lazy and outside eager manifest chunks.
  #collectChunkUrls(absOutPath: string, visited = new Set<string>()): string[] {
    if (visited.has(absOutPath)) return [];
    visited.add(absOutPath);
    const info = this.#metafileOutputsByAbs.get(absOutPath);
    if (!info) return [this.#toServeUrl(absOutPath)];
    const urls: string[] = [this.#toServeUrl(absOutPath)];
    for (const imp of info.imports) {
      if (imp.kind === "dynamic-import") continue;
      const absImp = this.#absFromOutdir(imp.path);
      if (!absImp.endsWith(".js")) continue;
      urls.push(...this.#collectChunkUrls(absImp, visited));
    }
    return urls;
  }

  #collectClientDeps(absOutPath: string, visited = new Set<string>()): Set<string> {
    if (visited.has(absOutPath)) return new Set();
    visited.add(absOutPath);
    const deps = new Set<string>();
    const info = this.#metafileOutputsByAbs.get(absOutPath);
    if (!info) return deps;
    if (!this.#opaqueEntries) throw new Error("[ClientEntriesBundler] opaque entries are missing");

    for (const input of Object.keys(info.inputs ?? {})) {
      const absInput = this.#absFromEntryPoint(input);
      if (!absInput.includes("node_modules") && !absInput.startsWith(this.#opaqueEntries.aliasDir)) deps.add(absInput);
    }

    for (const imp of info.imports) {
      if (imp.kind === "dynamic-import") continue;
      const absImp = this.#absFromOutdir(imp.path);
      if (!absImp.endsWith(".js")) continue;
      for (const dep of this.#collectClientDeps(absImp, visited)) deps.add(dep);
    }
    return deps;
  }

  #addEntryArtifact(absOut: string): void {
    if (!this.#opaqueEntries) throw new Error("[ClientEntriesBundler] opaque entries are missing");
    const info = this.#metafileOutputsByAbs.get(absOut);
    const buildEntryPointAbs = info?.entryPoint ? this.#absFromEntryPoint(info.entryPoint) : null;
    const entryPointAbs = buildEntryPointAbs
      ? (this.#opaqueEntries.originalByAlias.get(buildEntryPointAbs) ?? buildEntryPointAbs)
      : null;
    if (!entryPointAbs) return;

    const chunkUrls = this.#collectChunkUrls(absOut);
    const entryUrl = chunkUrls[0] ?? this.#toServeUrl(absOut);
    this.#entryUrlsByAbsPath.set(entryPointAbs, entryUrl);
    this.#entryOutputAbsByAbsPath.set(entryPointAbs, absOut);
    this.#entryDepsByAbsPath.set(entryPointAbs, [...this.#collectClientDeps(absOut)].sort());
    const clientReferenceId = toClientReferencePath(entryPointAbs, this.#app.workspace.workspaceRoot);
    this.#clientReferenceIdByAbsPath.set(entryPointAbs, clientReferenceId);

    // react-server-dom-webpack expects flat [chunkId, chunkUrl, ...] pairs.
    const flatChunks: string[] = [];
    for (const url of chunkUrls) flatChunks.push(url, url);

    const exportNames = info?.exports && info.exports.length > 0 ? info.exports : ["default"];
    const ssrEntriesByName: Record<string, SsrManifestEntry> = {};
    for (const name of exportNames) {
      const key = `${clientReferenceId}#${name}`;
      this.#manifest[key] = { id: entryUrl, chunks: flatChunks, name, async: true };
      ssrEntriesByName[name] = { id: absOut, chunks: [absOut, absOut], name, async: true };
    }
    this.#ssrManifest.moduleMap[entryUrl] = ssrEntriesByName;
  }
}
