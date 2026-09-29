import fs from "node:fs";
import path from "node:path";
import { CsrDevPaths } from "./csrDevPaths";
import type { CsrDevContext } from "./csrDevTypes";
import { PagesBundleBuilder } from "./pagesBundleBuilder";

interface MetafileImport {
  path: string;
  kind: string;
  original?: string;
  external?: boolean;
}

interface PrepassMetafile {
  inputs: Record<string, { imports: MetafileImport[] }>;
}

interface BrowserMap {
  /** What the `browser` object maps to `false`: an empty module in a browser build. */
  offFiles: Set<string>;
  offNames: Set<string>;
}

export interface CsrDevResolverOptions {
  paths: CsrDevPaths;
  context: CsrDevContext;
  entryFiles: string[];
  resolution?: Record<string, Record<string, string>>;
  /** Specifiers per importer id whose recorded resolution came from Bun's runtime resolver, not the browser build. */
  runtimeResolved?: Record<string, string[]>;
  /** When this process began: a package installed after it is one Bun's resolver here has not seen. */
  startedAt?: number;
}

//* Resolution comes from a plain browser build: Bun's runtime resolver ignores the `browser` condition and picks Node
//* builds (`@firebase/util` resolves to its node-esm entry), which the registry build would then ship.
export class CsrDevResolver {
  static readonly inline = "inline";
  readonly #paths: CsrDevPaths;
  readonly #context: CsrDevContext;
  readonly #entryFiles: string[];
  readonly #resolution = new Map<string, Map<string, string>>();
  readonly #fallbacks = new Set<string>();
  readonly #runtimeResolved = new Map<string, Set<string>>();
  readonly #browserMaps = new Map<string, BrowserMap | null>();
  /** Files a browser build loaded, so every import they make has its browser resolution recorded. */
  readonly #loaded = new Set<string>();
  readonly #startedAt: number;
  #prepassDone = false;

  constructor({
    paths,
    context,
    entryFiles,
    resolution = {},
    runtimeResolved = {},
    startedAt = Date.now() - process.uptime() * 1000,
  }: CsrDevResolverOptions) {
    this.#paths = paths;
    this.#startedAt = startedAt;
    this.#context = context;
    this.#entryFiles = entryFiles;
    for (const [importer, specifiers] of Object.entries(runtimeResolved))
      this.#runtimeResolved.set(paths.fileOf(importer), new Set(specifiers));
    for (const [importer, bySpecifier] of Object.entries(resolution))
      this.#resolution.set(
        paths.fileOf(importer),
        new Map(
          Object.entries(bySpecifier).map(([specifier, target]) => [
            specifier,
            CsrDevPaths.isStub(target) ? target : paths.fileOf(target),
          ]),
        ),
      );
  }

  get prepassDone(): boolean {
    return this.#prepassDone;
  }

  get fallbacks(): ReadonlySet<string> {
    return this.#fallbacks;
  }

  async prepass(): Promise<void> {
    const result = await Bun.build({
      entrypoints: [...this.#entryFiles, ...(this.#context.refreshFile ? [this.#context.refreshFile] : [])],
      target: "browser",
      metafile: true,
      external: [...(this.#context.externals ?? [])],
      env: "AKAN_PUBLIC_*",
      define: this.#context.define,
      optimizeImports: this.#context.optimizeImports,
      plugins: [PagesBundleBuilder.createCssStubPlugin()],
    });
    this.#record((result.metafile as unknown as PrepassMetafile).inputs);
    this.#prepassDone = true;
  }

  //? The browser build drops a side-effect-free barrel's unused re-exports without loading them, yet the registry
  //? compiles every file an import names. Such a file's own imports are resolved by a browser build of its own, one
  //? level deep, not by the runtime resolver's Node conditions (vfile's `#minpath` would reach `node:path`).
  async cover(files: string[]): Promise<void> {
    if (!this.#prepassDone) return;
    const pending = files.filter((file) => CsrDevPaths.isScript(file) && !this.#loaded.has(file));
    if (pending.length === 0) return;
    for (const file of pending) this.#loaded.add(file);
    const entries = new Set(pending);
    const result = await Bun.build({
      entrypoints: pending,
      target: "browser",
      metafile: true,
      throw: false,
      external: [...(this.#context.externals ?? [])],
      env: "AKAN_PUBLIC_*",
      define: this.#context.define,
      plugins: [
        {
          name: "akan-csr-cover",
          //? What an entry imports is resolved, never parsed: a CommonJS stub, since an empty ESM module fails a named
          //? import ("No matching export") and a failed build hands back no metafile at all.
          setup: (build) => {
            build.onLoad({ filter: /.*/ }, (args) =>
              entries.has(CsrDevPaths.realpath(args.path))
                ? undefined
                : { contents: "module.exports = {};", loader: "js" },
            );
          },
        },
      ],
    });
    //? Left unrecorded when the build fails: those imports keep the runtime resolver's answer, as before.
    if (result.metafile) this.#record((result.metafile as unknown as PrepassMetafile).inputs, entries);
  }

  #record(inputs: PrepassMetafile["inputs"], only?: Set<string>): void {
    for (const [input, { imports }] of Object.entries(inputs)) {
      const importer = CsrDevPaths.realpath(path.resolve(input));
      if (only && !only.has(importer)) continue;
      //? A re-export the build tree-shook keeps no specifier, so its file is resolved again as an entry of its own.
      if (imports.every((record) => record.original)) this.#loaded.add(importer);
      for (const record of imports) {
        if (!record.original) continue;
        if (record.external) {
          if (record.original.startsWith("node:"))
            this.#remember(importer, record.original, `${CsrDevPaths.stubPrefix}${record.original}`);
          continue;
        }
        const target = path.resolve(record.path);
        if (!fs.existsSync(target)) continue;
        this.#remember(importer, record.original, CsrDevPaths.realpath(target));
        this.#runtimeResolved.get(importer)?.delete(record.original);
      }
    }
  }

  resolve(importer: string, specifier: string, kind: "import" | "require" = "import"): string | null {
    if (this.#isInlineSpecifier(specifier)) return CsrDevResolver.inline;
    const disabled = this.#disabledInBrowser(importer, specifier, kind);
    if (disabled) return disabled;
    const known = this.#resolution.get(importer)?.get(specifier);
    const usable = known && this.#stillAnswers(importer, specifier, known, kind) ? known : null;
    const target = usable ?? this.#resolveUnknown(importer, specifier, kind);
    if (target === null || CsrDevPaths.isStub(target)) return target;
    if (!CsrDevPaths.isScript(target)) return CsrDevResolver.inline;
    if (!usable) this.#remember(importer, specifier, target);
    return target;
  }

  //? A relative record in app code stands while the disk still resolves it to the same file, as Bun would: a sibling
  //? with a stronger extension (`x.tsx` beside `x.ts`), a file beside the folder it went into, or a record a CommonJS
  //? re-export folded onto another file (`./a` → `x.js`) resolves anew. A package's files, and app code under a
  //? package.json that maps files with a `browser` object, keep the prepass's answer, which a disk lookup would only
  //? approximate.
  #stillAnswers(importer: string, specifier: string, known: string, kind: "import" | "require"): boolean {
    if (CsrDevPaths.isStub(known)) return true;
    if (!fs.existsSync(known)) return false;
    if (!specifier.startsWith(".") || CsrDevPaths.isVendorFile(importer)) return true;
    if (this.#hasBrowserMap(path.dirname(importer))) return true;
    const onDisk = CsrDevPaths.resolveRelative(path.dirname(importer), specifier, kind);
    return onDisk !== null && CsrDevPaths.realpath(onDisk) === known;
  }

  isRegistryModule(file: string): boolean {
    if (!CsrDevPaths.isScript(file)) return false;
    const packageName = CsrDevResolver.#packageNameOf(file);
    if (packageName === null) return true;
    return !this.#context.optimizeImports.some((pattern) => {
      const base = CsrDevResolver.#patternBase(pattern);
      return base === packageName || base.startsWith(`${packageName}/`);
    });
  }

  //? `false` in a package's `browser` object is an empty module to a browser build (object-inspect's
  //? `./util.inspect.js`, which requires `util`). Its record carries no specifier, so the field is read here.
  #disabledInBrowser(importer: string, specifier: string, kind: "import" | "require"): string | null {
    const map = this.#browserMapOf(path.dirname(importer));
    if (!map || (map.offFiles.size === 0 && map.offNames.size === 0)) return null;
    if (!specifier.startsWith(".") && !path.isAbsolute(specifier))
      return map.offNames.has(specifier) ? `${CsrDevPaths.emptyStubPrefix}${specifier}` : null;
    const target = CsrDevPaths.resolveRelative(path.dirname(importer), specifier, kind);
    return target && map.offFiles.has(CsrDevPaths.realpath(target))
      ? `${CsrDevPaths.emptyStubPrefix}${this.#paths.idOf(target)}`
      : null;
  }

  #hasBrowserMap(dir: string): boolean {
    return this.#browserMapOf(dir) !== null;
  }

  #browserMapOf(dir: string): BrowserMap | null {
    const cached = this.#browserMaps.get(dir);
    if (cached !== undefined) return cached;
    const pkgFile = path.join(dir, "package.json");
    const parent = path.dirname(dir);
    let map: BrowserMap | null = null;
    if (fs.existsSync(pkgFile)) {
      try {
        const browser = (JSON.parse(fs.readFileSync(pkgFile, "utf8")) as { browser?: unknown }).browser;
        if (typeof browser === "object" && browser !== null) {
          const off = Object.entries(browser)
            .filter(([, target]) => target === false)
            .map(([key]) => key);
          const files = off
            .filter((key) => key.startsWith("."))
            .map((key) => CsrDevPaths.resolveRelative(dir, key))
            .filter((file): file is string => !!file);
          map = {
            offFiles: new Set(files.map((file) => CsrDevPaths.realpath(file))),
            offNames: new Set(off.filter((key) => !key.startsWith("."))),
          };
        }
      } catch {
        // An unreadable package.json maps nothing; Bun's build fails on it anyway.
      }
    } else if (parent !== dir) map = this.#browserMapOf(parent);
    this.#browserMaps.set(dir, map);
    return map;
  }

  /** A module that left the graph takes its records with it. */
  forget(importer: string): void {
    this.#resolution.delete(importer);
    this.#runtimeResolved.delete(importer);
  }

  serializeRuntimeResolved(): Record<string, string[]> {
    return Object.fromEntries(
      [...this.#runtimeResolved]
        .filter(([, specifiers]) => specifiers.size > 0)
        .map(([importer, specifiers]) => [this.#paths.idOf(importer), [...specifiers].sort()]),
    );
  }

  // A target moved away is left out, so the graph does not carry it past a builder restart.
  serialize(): Record<string, Record<string, string>> {
    return Object.fromEntries(
      [...this.#resolution].map(([importer, bySpecifier]) => [
        this.#paths.idOf(importer),
        Object.fromEntries(
          [...bySpecifier]
            .filter(([, target]) => CsrDevPaths.isStub(target) || fs.existsSync(target))
            .map(([specifier, target]) => [specifier, CsrDevPaths.isStub(target) ? target : this.#paths.idOf(target)]),
        ),
      ]),
    );
  }

  //? Bun.resolveSync keeps what it found per directory until a build walks that directory again, so in the resident
  //? builder it may hand back a file moved away since (`Foo.tsx` → `Foo/index.tsx`, `.ts` → `.tsx`). A relative import
  //? is therefore looked up on the disk as it is now, and a bare one it names a missing file for goes to a fresh worker.
  #resolveUnknown(importer: string, specifier: string, kind: "import" | "require"): string | null {
    if (specifier.startsWith("node:")) return `${CsrDevPaths.stubPrefix}${specifier}`;
    const relative = specifier.startsWith(".") || path.isAbsolute(specifier);
    const cannotResolve = () => new Error(`[csr-dev] cannot resolve "${specifier}" from ${this.#paths.idOf(importer)}`);
    if (relative) {
      const onDisk =
        CsrDevPaths.resolveRelative(path.dirname(importer), specifier, kind) ??
        CsrDevResolver.#onDisk(CsrDevPaths.tryResolve(specifier, path.dirname(importer)));
      if (!onDisk) throw cannotResolve();
      return CsrDevPaths.realpath(onDisk);
    }
    //? Ahead of the prepass too: a new file's bare imports (`akanjs/ui`, `@apps/<app>/client`) are ones its package
    //? already resolved, and asking for the prepass would hand every such save to a build worker.
    const sibling = this.#resolvedBySibling(importer, specifier);
    if (sibling) return sibling;
    const resolved = CsrDevPaths.tryResolve(specifier, path.dirname(importer));
    const moved = resolved !== null && path.isAbsolute(resolved) && !fs.existsSync(resolved);
    //? Bun keeps a process's node_modules listings: a package installed while the builder runs (`bun add`) resolves only
    //? in a fresh process, so one installed since this process began goes to a worker. Any other miss, a subpath typo
    //? of a package installed long ago included, fails here as the worker would.
    const installed =
      resolved === null && CsrDevPaths.installedSince(specifier, path.dirname(importer), this.#startedAt);
    if (!this.#prepassDone || moved) {
      //? A specifier no resolver finds in the user's own code is a typo, failed here like a missing relative file: the
      //? resolution build a worker would run for it fails the same way. A package's `browser` field may map one away.
      if (resolved === null && !installed && !CsrDevPaths.isVendorFile(importer)) throw cannotResolve();
      return null;
    }
    if (!resolved) {
      if (installed) return null;
      throw cannotResolve();
    }
    if (!path.isAbsolute(resolved)) return `${CsrDevPaths.stubPrefix}${specifier}`;
    this.#fallbacks.add(specifier);
    this.#runtimeResolved.set(importer, (this.#runtimeResolved.get(importer) ?? new Set<string>()).add(specifier));
    return CsrDevPaths.realpath(resolved);
  }

  static #onDisk(resolved: string | null): string | null {
    return resolved && path.isAbsolute(resolved) && fs.existsSync(resolved) ? resolved : null;
  }

  //? The browser build tree-shakes the unused re-exports of a side-effect-free barrel, so their imports have no
  //? recorded resolution; a file of the same package resolves a bare specifier to the same target, conditions included.
  //? Not one the runtime resolver found (it ignores the `browser` condition the prepass exists to honour), not the
  //? importer's own record, and not a target moved away since.
  #resolvedBySibling(importer: string, specifier: string): string | null {
    const scope = CsrDevResolver.#packageScopeOf(importer);
    for (const [other, bySpecifier] of this.#resolution) {
      const target = bySpecifier.get(specifier);
      if (!target || other === importer || this.#runtimeResolved.get(other)?.has(specifier)) continue;
      if (!CsrDevPaths.isStub(target) && !fs.existsSync(target)) continue;
      if (CsrDevResolver.#packageScopeOf(other) === scope) return target;
    }
    return null;
  }

  #remember(importer: string, specifier: string, target: string): void {
    const byImporter = this.#resolution.get(importer) ?? new Map<string, string>();
    this.#resolution.set(importer, byImporter.set(specifier, target));
  }

  //? Only the barrel a bare import names is inlined, so its icons tree-shake per importer; what the barrel itself
  //? imports stays a registry module, keeping shared state such as react-icons' IconContext a single instance.
  #isInlineSpecifier(specifier: string): boolean {
    if (specifier.startsWith(".") || path.isAbsolute(specifier) || specifier.startsWith("node:")) return false;
    return this.#context.optimizeImports.some((pattern) => {
      const base = CsrDevResolver.#patternBase(pattern);
      return specifier === base || specifier.startsWith(`${base}/`);
    });
  }

  static #patternBase(pattern: string): string {
    return pattern.endsWith("/*") ? pattern.slice(0, -2) : pattern;
  }

  static #packageNameOf(file: string): string | null {
    const marker = `${path.sep}node_modules${path.sep}`;
    const index = file.lastIndexOf(marker);
    if (index < 0) return null;
    const [scope, name] = file.slice(index + marker.length).split(path.sep);
    return (scope?.startsWith("@") ? `${scope}/${name}` : scope) || null;
  }

  static #packageScopeOf(file: string): string {
    const marker = `${path.sep}node_modules${path.sep}`;
    const index = file.lastIndexOf(marker);
    if (index < 0) return "";
    const [scope, name] = file.slice(index + marker.length).split(path.sep);
    return file.slice(0, index + marker.length) + (scope?.startsWith("@") ? `${scope}${path.sep}${name}` : scope);
  }
}
