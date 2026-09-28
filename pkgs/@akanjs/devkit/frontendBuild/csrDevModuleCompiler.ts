import path from "node:path";
import type { BunPlugin } from "bun";
import type { App } from "../commandDecorators";
import { CsrDevPaths } from "./csrDevPaths";
import { CsrDevResolver } from "./csrDevResolver";
import type { CsrDevCompiledModule, CsrDevContext, CsrDevSharedHelpers } from "./csrDevTypes";
import { RouteClientBuilder } from "./routeClientBuilder";

interface OutputMetafile {
  outputs: Record<string, { entryPoint?: string; inputs: Record<string, unknown> }>;
}

interface BuildRound {
  modules: CsrDevCompiledModule[];
  misses: string[];
  tangled: string[];
}

export interface CsrDevModuleCompilerOptions {
  app: App;
  paths: CsrDevPaths;
  resolver: CsrDevResolver;
  context: CsrDevContext;
  outDir: string;
  /** Where the dev server serves `outDir`: an imported asset's URL starts with it. */
  routePrefix: string;
}

export interface CsrDevCompileOptions {
  /** Stop before building an npm module the graph does not know yet, and name it instead. */
  refuseNewVendor?: boolean;
  /** Stop at an import no recorded resolution answers, instead of running the resolution build (a whole-app build). */
  refusePrepass?: boolean;
}

export interface CsrDevCompileResult {
  modules: CsrDevCompiledModule[];
  refusedVendors: string[];
  unresolved: string[];
}

//* Every module becomes its own CJS factory: one Bun.build with each import external, so a save re-runs only the
//* modules it changed instead of reloading one scope-hoisted file.
export class CsrDevModuleCompiler {
  static readonly #storeRoot = /(?:^|\/)lib\/st\.ts$/;
  static readonly #factoryArgument =
    /(?<![\w$.])(?:require|module|exports|__akanImport|\$RefreshReg\$|\$RefreshSig\$)(?![\w$]|\s*:)/;
  static readonly #helperPatches = [
    ["__toESM", "(mod, isNodeMode, target)", "toESM"],
    ["__reExport", "(target, mod, secondTarget)", "reExport"],
  ] as const;
  readonly #app: App;
  readonly #paths: CsrDevPaths;
  readonly #resolver: CsrDevResolver;
  readonly #context: CsrDevContext;
  readonly #outDir: string;
  readonly #routePrefix: string;
  readonly #assets = new Set<string>();

  constructor({ app, paths, resolver, context, outDir, routePrefix }: CsrDevModuleCompilerOptions) {
    this.#app = app;
    this.#paths = paths;
    this.#resolver = resolver;
    this.#context = context;
    this.#outDir = outDir;
    this.#routePrefix = routePrefix;
  }

  /** Every asset file this compiler wrote into the registry directory. */
  get assets(): string[] {
    return [...this.#assets];
  }

  async compile(
    startFiles: string[],
    known: Set<string>,
    { refuseNewVendor = false, refusePrepass = false }: CsrDevCompileOptions = {},
  ): Promise<CsrDevCompileResult> {
    const compiled = new Map<string, CsrDevCompiledModule>();
    const seen = new Set([...known, ...startFiles]);
    let frontier = [...new Set(startFiles)];
    while (frontier.length > 0) {
      const refusedVendors = refuseNewVendor ? frontier.filter((file) => CsrDevPaths.isVendorFile(file)) : [];
      if (refusedVendors.length > 0) return { modules: [...compiled.values()], refusedVendors, unresolved: [] };
      const round = await this.#compileRound(frontier);
      if (round.misses.length > 0 && !this.#resolver.prepassDone && refusePrepass)
        return { modules: [...compiled.values()], refusedVendors: [], unresolved: round.misses };
      if (round.misses.length > 0 && !this.#resolver.prepassDone) {
        this.#app.verbose(`[csr-dev] ${round.misses.length} unresolved import(s); rerunning the resolution build`);
        await this.#resolver.prepass();
        continue;
      }
      const next: string[] = [];
      for (const module of round.modules) {
        compiled.set(module.file, module);
        for (const dep of module.deps) {
          if (CsrDevPaths.isStub(dep) || seen.has(dep)) continue;
          seen.add(dep);
          next.push(dep);
        }
      }
      frontier = next;
    }
    const { fallbacks } = this.#resolver;
    if (fallbacks.size > 0)
      this.#app.verbose(
        `[csr-dev] ${fallbacks.size} import(s) outside the browser build's graph resolved with Bun's runtime resolver: ${[...fallbacks].slice(0, 5).join(", ")}${fallbacks.size > 5 ? ", ..." : ""}`,
      );
    return { modules: [...compiled.values()], refusedVendors: [], unresolved: [] };
  }

  async #compileRound(files: string[]): Promise<Omit<BuildRound, "tangled">> {
    const appFiles = files.filter((file) => !CsrDevPaths.isVendorFile(file));
    const vendorFiles = files.filter((file) => CsrDevPaths.isVendorFile(file));
    const rounds = await Promise.all([
      appFiles.length > 0 ? this.#bunBuild(appFiles, false) : null,
      vendorFiles.length > 0 ? this.#bunBuild(vendorFiles, true) : null,
    ]);
    const modules = rounds.flatMap((round) => round?.modules ?? []);
    const misses = rounds.flatMap((round) => round?.misses ?? []);
    // One entrypoint per build cannot inline another: Bun ignores an external for an absolute import of an entrypoint.
    for (const file of rounds.flatMap((round) => round?.tangled ?? [])) {
      const single = await this.#bunBuild([file], CsrDevPaths.isVendorFile(file));
      if (single.tangled.length > 0)
        throw new Error(`[csr-dev] ${this.#paths.idOf(file)} kept inlining another module`);
      modules.push(...single.modules);
      misses.push(...single.misses);
    }
    return { modules, misses };
  }

  async #bunBuild(files: string[], vendor: boolean): Promise<BuildRound> {
    //? Keyed as the output is: by the disk's spelling, which a case-only rename leaves apart from the requested path.
    const mtimes = new Map(files.map((file) => [CsrDevPaths.realpath(file), CsrDevPaths.mtimeOf(file)]));
    const hashes = new Map(
      await Promise.all(
        files.map(async (file) => [CsrDevPaths.realpath(file), vendor ? "" : await CsrDevPaths.hashOf(file)] as const),
      ),
    );
    const misses: string[] = [];
    const result = await Bun.build({
      entrypoints: files,
      root: this.#paths.root,
      target: "browser",
      format: "cjs",
      reactFastRefresh: !vendor,
      sourcemap: vendor ? "none" : "external",
      naming: { entry: "[dir]/[name].[ext]", asset: "assets/[name]-[hash].[ext]" },
      publicPath: this.#routePrefix,
      metafile: true,
      env: "AKAN_PUBLIC_*",
      define: this.#context.define,
      optimizeImports: this.#context.optimizeImports,
      plugins: [this.#registryPlugin(vendor, misses)],
    });
    const { outputs } = result.metafile as unknown as OutputMetafile;
    const sourceMaps = new Map(
      result.outputs.filter((artifact) => artifact.kind === "sourcemap").map((artifact) => [artifact.path, artifact]),
    );
    const modules: CsrDevCompiledModule[] = [];
    const tangled: string[] = [];
    for (const artifact of result.outputs) {
      if (artifact.kind === "asset") {
        const assetPath = path.join(this.#outDir, artifact.path);
        await Bun.write(assetPath, artifact);
        this.#assets.add(assetPath);
        continue;
      }
      if (artifact.kind !== "entry-point") continue;
      const meta = outputs[artifact.path];
      if (!meta?.entryPoint) throw new Error(`[csr-dev] no entry point recorded for ${artifact.path}`);
      const file = CsrDevPaths.realpath(path.resolve(meta.entryPoint));
      const inputs = Object.keys(meta.inputs).map((input) => CsrDevPaths.realpath(path.resolve(input)));
      if (inputs.some((input) => input !== file && this.#resolver.isRegistryModule(input))) {
        tangled.push(file);
        continue;
      }
      const code = await artifact.text();
      const id = this.#paths.idOf(file);
      const sourceMap = sourceMaps.get(`${artifact.path}.map`);
      modules.push({
        id,
        file,
        vendor,
        ...CsrDevModuleCompiler.#factory(id, code),
        sourceMap: sourceMap ? this.#rebaseSourceMap(await sourceMap.text()) : undefined,
        deps: this.#emittedDeps(code),
        mtimeMs: mtimes.get(file) ?? CsrDevPaths.mtimeOf(file),
        hash: hashes.get(file) ?? "",
      });
    }
    return { modules, misses, tangled };
  }

  #registryPlugin(vendor: boolean, misses: string[]): BunPlugin {
    return {
      name: "akan-csr-registry",
      setup: (build) => {
        build.onLoad({ filter: /\.css$/ }, () => ({ contents: "", loader: "js" }));
        if (!vendor)
          build.onLoad({ filter: /\.tsx$/ }, async (args) => {
            if (CsrDevPaths.isVendorFile(args.path)) return undefined;
            const normalized = RouteClientBuilder.normalizeNamedDefaultFunctionForFastRefresh(
              await Bun.file(args.path).text(),
              { path: args.path },
            );
            return normalized ? { contents: normalized, loader: "tsx" } : undefined;
          });
        build.onResolve({ filter: /.*/ }, (args) => {
          if (args.kind === "entry-point-build" || !args.importer) return undefined;
          if (this.#context.externals?.includes(args.path))
            return { path: `${CsrDevPaths.vendorPrefix}${args.path}`, external: true };
          const importer = CsrDevPaths.realpath(args.importer);
          const target = this.#resolver.resolve(importer, args.path);
          if (target === CsrDevResolver.inline) return undefined;
          if (target === null) {
            misses.push(`${args.path} from ${this.#paths.idOf(importer)}`);
            return { path: `akan-miss:${args.path}`, external: true };
          }
          const external = CsrDevPaths.isStub(target)
            ? target
            : `${CsrDevPaths.modulePrefix}${this.#paths.idOf(target)}`;
          return { path: external, external: true };
        });
      },
    };
  }

  //? Bun writes sources relative to the working directory; the page shows them by workspace path instead. A package
  //? barrel inlined into its importer (react-icons) would carry its whole text into every importer's map.
  #rebaseSourceMap(text: string): string {
    const map = JSON.parse(text) as { sources: string[]; sourcesContent?: (string | null)[] };
    const files = map.sources.map((source) => path.resolve(source));
    map.sources = files.map((file) => `/${this.#paths.idOf(file)}`);
    map.sourcesContent = files.map((file, index) =>
      CsrDevPaths.isVendorFile(file) ? null : (map.sourcesContent?.[index] ?? null),
    );
    return JSON.stringify(map);
  }

  // Read off the emitted code rather than onResolve: Bun resolves both arms of `NODE_ENV ? require(a) : require(b)`
  // before dropping the dead one, and following it would pull every package's production build in too.
  #emittedDeps(code: string): string[] {
    const deps = new Set<string>();
    const references = /\b(?:require|import|__akanImport)\("((?:akan-module|stub):[^"]+)"\)/g;
    for (const [, reference] of code.matchAll(references)) {
      if (!reference) continue;
      deps.add(
        CsrDevPaths.isStub(reference)
          ? reference
          : this.#paths.fileOf(reference.slice(CsrDevPaths.modulePrefix.length)),
      );
    }
    return [...deps];
  }

  // Every rewrite keeps the line count, so a module's source map still lines up inside the factory.
  static #factory(id: string, code: string): { factory: string; helpers: CsrDevSharedHelpers | null } {
    const prefix = CsrDevPaths.modulePrefix;
    let patched = code.replaceAll(`import("${prefix}`, `__akanImport("${prefix}`).replace(/^\/\/# debugId=.*$/m, "");
    for (const [name, params, method] of CsrDevModuleCompiler.#helperPatches) {
      const definition = `var ${name} = ${params} => {`;
      if (patched.includes(definition))
        patched = patched.replace(definition, `var ${name} = __akan.${method}, __bun${name} = ${params} => {`);
      else if (patched.includes(`${name}(`))
        throw new Error(
          `[csr-dev] ${id}: Bun's ${name} helper no longer reads "${definition}"; CsrDevModuleCompiler must follow`,
        );
    }
    // StoreRegistry.build merges into one global store instance, so every importer already holds the updated `st`:
    // re-running the store root is the whole update, and bubbling past it would only reach the page modules.
    if (CsrDevModuleCompiler.#storeRoot.test(id)) patched += "\nmodule.hot.accept();";
    const shared = CsrDevModuleCompiler.#shareHelpers(patched);
    return {
      factory: `function (require, module, exports, $RefreshReg$, $RefreshSig$, __akanImport) {\n${shared?.code ?? patched}\n}`,
      helpers: shared?.helpers ?? null,
    };
  }

  //? Bun's interop helpers are everything before its first `// <path>` comment. One naming a factory argument would
  //? bind to whichever module ran it first, so only a self-contained preamble is shared.
  static #shareHelpers(code: string): { code: string; helpers: CsrDevSharedHelpers } | null {
    const marker = code.search(/^\/\/ /m);
    if (marker <= 0) return null;
    const preamble = code.slice(0, marker);
    const names = [...preamble.matchAll(/^(?:var|let|const|function)\s+([\w$]+)/gm)]
      .map(([, name]) => name)
      .filter((name): name is string => !!name);
    if (names.length === 0 || CsrDevModuleCompiler.#factoryArgument.test(preamble)) return null;
    const hash = Bun.hash(preamble).toString(36);
    const binding = `var { ${names.join(", ")} } = __akan.helpers(${JSON.stringify(hash)});`;
    return {
      code: `${binding}${"\n".repeat(CsrDevPaths.lineCount(preamble))}${code.slice(marker)}`,
      helpers: {
        hash,
        definition: `__akan.defineHelpers(${JSON.stringify(hash)}, function () {\n${preamble}return { ${names.join(", ")} };\n});\n`,
      },
    };
  }
}
