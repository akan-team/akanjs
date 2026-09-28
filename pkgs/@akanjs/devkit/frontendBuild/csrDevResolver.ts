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

export interface CsrDevResolverOptions {
  paths: CsrDevPaths;
  context: CsrDevContext;
  entryFiles: string[];
  resolution?: Record<string, Record<string, string>>;
  /** Specifiers per importer id whose recorded resolution came from Bun's runtime resolver, not the browser build. */
  runtimeResolved?: Record<string, string[]>;
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
  #prepassDone = false;

  constructor({ paths, context, entryFiles, resolution = {}, runtimeResolved = {} }: CsrDevResolverOptions) {
    this.#paths = paths;
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
    const { inputs } = result.metafile as unknown as PrepassMetafile;
    for (const [input, { imports }] of Object.entries(inputs)) {
      const importer = CsrDevPaths.realpath(path.resolve(input));
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
    this.#prepassDone = true;
  }

  resolve(importer: string, specifier: string, kind: "import" | "require" = "import"): string | null {
    if (this.#isInlineSpecifier(specifier)) return CsrDevResolver.inline;
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
  //? re-export folded onto another file (`./a` → `x.js`) resolves anew. A package's files keep the prepass's answer,
  //? which a disk lookup would only approximate (the `browser` object form, export conditions).
  #stillAnswers(importer: string, specifier: string, known: string, kind: "import" | "require"): boolean {
    if (CsrDevPaths.isStub(known)) return true;
    if (!fs.existsSync(known)) return false;
    if (!specifier.startsWith(".") || CsrDevPaths.isVendorFile(importer)) return true;
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
    if (!this.#prepassDone || moved) {
      //? A specifier no resolver finds in the user's own code is a typo, failed here like a missing relative file: the
      //? resolution build a worker would run for it fails the same way. A package's `browser` field may map one away.
      if (resolved === null && !CsrDevPaths.isVendorFile(importer)) throw cannotResolve();
      return null;
    }
    if (!resolved) throw cannotResolve();
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
