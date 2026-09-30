import path from "node:path";
import type { BunPlugin } from "bun";
import type { App } from "../commandDecorators";
import { CsrDevFactoryCheck } from "./csrDevFactoryCheck";
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
  static readonly #macroImport = /\b(?:with|assert)\s*\{\s*type\s*:\s*["']macro["']/;
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
      await this.#resolver.cover(frontier);
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
    const macroOutputs = vendor ? new Map<string, string>() : await this.#evaluateMacros(files);
    let result: Awaited<ReturnType<typeof Bun.build>>;
    try {
      result = await Bun.build({
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
        //? A factory runs as a classic script, where `import.meta` is a SyntaxError that takes the whole vendor file
        //? down, and Bun's cjs output keeps `import.meta.env` and spells `import.meta.url` as this disk's `file://` path.
        define: { ...this.#context.define, "import.meta": "__akanMeta" },
        optimizeImports: this.#context.optimizeImports,
        plugins: [this.#registryPlugin(vendor, misses, macroOutputs)],
      });
    } catch (error) {
      if (vendor && error instanceof AggregateError) return await this.#withoutFailed(files, error);
      throw error;
    }
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
      const built = CsrDevModuleCompiler.#factory(id, code);
      const problem = CsrDevFactoryCheck.problemOf(built.factory, built.helpers?.definition);
      if (problem && !vendor)
        throw new Error(`[csr-dev] ${id}: its factory does not parse as a classic script: ${problem}`);
      if (problem) {
        modules.push(this.#leftOut(file, problem));
        continue;
      }
      const sourceMap = sourceMaps.get(`${artifact.path}.map`);
      modules.push({
        id,
        file,
        vendor,
        ...built,
        sourceMap: sourceMap ? this.#rebaseSourceMap(await sourceMap.text()) : undefined,
        deps: this.#emittedDeps(code),
        mtimeMs: mtimes.get(file) ?? CsrDevPaths.mtimeOf(file),
        hash: hashes.get(file) ?? "",
      });
    }
    return { modules, misses, tangled };
  }

  //? A package file that cannot be a CommonJS factory would fail every module built beside it, and no save fixes a
  //? package: it is left out and named in the log, and the module requiring it gets the reason. App code still fails.
  async #withoutFailed(files: string[], error: AggregateError): Promise<BuildRound> {
    const reasons = new Map<string, string[]>();
    for (const message of error.errors as {
      message?: unknown;
      position?: { file?: unknown; line?: number } | null;
    }[]) {
      const file = message.position?.file;
      if (typeof file !== "string" || !path.isAbsolute(file)) continue;
      const real = CsrDevPaths.realpath(file);
      const at = message.position?.line ? `:${message.position.line}` : "";
      reasons.set(real, [...(reasons.get(real) ?? []), `${String(message.message)} (${this.#paths.idOf(real)}${at})`]);
    }
    const failed = new Set(files.filter((file) => reasons.has(CsrDevPaths.realpath(file))));
    if (failed.size === 0) throw error;
    const rest = files.filter((file) => !failed.has(file));
    const round = rest.length > 0 ? await this.#bunBuild(rest, true) : { modules: [], misses: [], tangled: [] };
    for (const file of failed) {
      const text = (reasons.get(CsrDevPaths.realpath(file)) ?? []).join("; ");
      const awaits = text.includes('"await" can only be used');
      round.modules.push(
        this.#leftOut(file, awaits ? `a top-level await, which a CommonJS factory cannot wait on: ${text}` : text),
      );
    }
    return round;
  }

  #leftOut(file: string, problem: string): CsrDevCompiledModule {
    const real = CsrDevPaths.realpath(file);
    const id = this.#paths.idOf(real);
    this.#app.logger.error(`[csr-dev] ${id} is left out of the dev registry: ${problem}`);
    return {
      id,
      file: real,
      vendor: true,
      factory: CsrDevFactoryCheck.thrower(id, problem),
      helpers: null,
      deps: [],
      mtimeMs: CsrDevPaths.mtimeOf(real),
      hash: "",
    };
  }

  //? Bun applies `define` to the modules a macro imports too, and runs them in this process, where the `import.meta`
  //? rewrite leaves a free `__akanMeta` that no factory header declares. So a file importing a macro has its macros run
  //? first by a build of its own, with every other import left as written, and the module build reads that output.
  async #evaluateMacros(files: string[]): Promise<Map<string, string>> {
    const sources = await Promise.all(files.map(async (file) => [file, await Bun.file(file).text()] as const));
    const importers = sources.filter(([, source]) => CsrDevModuleCompiler.#macroImport.test(source));
    const outputs = await Promise.all(
      importers.map(async ([file]) => {
        const result = await Bun.build({
          entrypoints: [file],
          target: "browser",
          format: "esm",
          plugins: [
            {
              name: "akan-csr-macro-pass",
              setup: (build) =>
                void build.onResolve({ filter: /.*/ }, (args) =>
                  args.importer ? { path: args.path, external: true } : undefined,
                ),
            },
          ],
        });
        const [output] = result.outputs;
        if (!output) throw new Error(`[csr-dev] ${this.#paths.idOf(file)}: its macro pass wrote no output`);
        const text = await output.text();
        return [
          [file, text],
          [CsrDevPaths.realpath(file), text],
        ] as const;
      }),
    );
    return new Map(outputs.flat());
  }

  #registryPlugin(vendor: boolean, misses: string[], macroOutputs: Map<string, string>): BunPlugin {
    return {
      name: "akan-csr-registry",
      setup: (build) => {
        build.onLoad({ filter: /\.css$/ }, () => ({ contents: "", loader: "js" }));
        if (macroOutputs.size > 0) {
          const exact = [...macroOutputs.keys()].map((file) => file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
          build.onLoad({ filter: new RegExp(`^(?:${exact.join("|")})$`) }, (args) => {
            const contents = macroOutputs.get(args.path);
            return contents === undefined ? undefined : { contents, loader: "js" };
          });
        }
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
          const target = this.#resolver.resolve(
            importer,
            args.path,
            args.kind === "require-call" || args.kind === "require-resolve" ? "require" : "import",
          );
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
    //? Bun keeps a package's `#!` line atop its output, where a script inside a function cannot have one.
    let patched = code
      .replace(/^#!/, "//")
      .replaceAll(`import("${prefix}`, `__akanImport("${prefix}`)
      .replace(/^\/\/# debugId=.*$/m, "");
    //? A file esbuild already bundled (mermaid's parser chunks) defines its own helper under the same name, below Bun's
    //? preamble, and Bun then emits none. Only a copy there is exempt: one in the preamble is Bun's own, changed.
    const marker = patched.search(/^\/\/ /m);
    const body = marker < 0 ? "" : patched.slice(marker);
    for (const [name, params, method] of CsrDevModuleCompiler.#helperPatches) {
      const definition = `var ${name} = ${params} => {`;
      if (patched.includes(definition))
        patched = patched.replace(definition, `var ${name} = __akan.${method}, __bun${name} = ${params} => {`);
      else if (patched.includes(`${name}(`) && !new RegExp(`\\b(?:var|let|const|function)\\s+${name}\\b`).test(body))
        throw new Error(
          `[csr-dev] ${id}: Bun's ${name} helper no longer reads "${definition}"; CsrDevModuleCompiler must follow`,
        );
    }
    // StoreRegistry.build merges into one global store instance, so every importer already holds the updated `st`:
    // re-running the store root is the whole update, and bubbling past it would only reach the page modules.
    if (CsrDevModuleCompiler.#storeRoot.test(id)) patched += "\nmodule.hot.accept();";
    const shared = CsrDevModuleCompiler.#shareHelpers(patched);
    //? What `import.meta` is in a browser module: a `url` and no `env`, so `import.meta.env` checks (jotai, zustand)
    //? branch as they do in the ESM bundle. On the header line, outside the preamble that modules share.
    const meta = /(?<![\w$.])__akanMeta(?![\w$])/.test(patched)
      ? ` var __akanMeta = { url: new URL(${JSON.stringify(id.startsWith("/") ? id : `/${id}`)}, self.location.href).href };`
      : "";
    return {
      factory: `function (require, module, exports, $RefreshReg$, $RefreshSig$, __akanImport) {${meta}\n${shared?.code ?? patched}\n}`,
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
