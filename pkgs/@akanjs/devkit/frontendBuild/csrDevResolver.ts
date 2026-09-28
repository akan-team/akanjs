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
  #prepassDone = false;

  constructor({ paths, context, entryFiles, resolution = {} }: CsrDevResolverOptions) {
    this.#paths = paths;
    this.#context = context;
    this.#entryFiles = entryFiles;
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
        if (fs.existsSync(target)) this.#remember(importer, record.original, CsrDevPaths.realpath(target));
      }
    }
    this.#prepassDone = true;
  }

  resolve(importer: string, specifier: string): string | null {
    if (this.#isInlineSpecifier(specifier)) return CsrDevResolver.inline;
    const known = this.#resolution.get(importer)?.get(specifier);
    const usable = known && (CsrDevPaths.isStub(known) || fs.existsSync(known)) ? known : null;
    const target = usable ?? this.#resolveUnknown(importer, specifier);
    if (target === null || CsrDevPaths.isStub(target)) return target;
    if (!CsrDevPaths.isScript(target)) return CsrDevResolver.inline;
    if (!usable) this.#remember(importer, specifier, target);
    return target;
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

  serialize(): Record<string, Record<string, string>> {
    return Object.fromEntries(
      [...this.#resolution].map(([importer, bySpecifier]) => [
        this.#paths.idOf(importer),
        Object.fromEntries(
          [...bySpecifier].map(([specifier, target]) => [
            specifier,
            CsrDevPaths.isStub(target) ? target : this.#paths.idOf(target),
          ]),
        ),
      ]),
    );
  }

  #resolveUnknown(importer: string, specifier: string): string | null {
    if (specifier.startsWith("node:")) return `${CsrDevPaths.stubPrefix}${specifier}`;
    const relative = specifier.startsWith(".") || path.isAbsolute(specifier);
    if (!relative && !this.#prepassDone) return null;
    if (!relative) {
      const sibling = this.#resolvedBySibling(importer, specifier);
      if (sibling) return sibling;
    }
    const resolved = CsrDevPaths.tryResolve(specifier, path.dirname(importer));
    if (!resolved) throw new Error(`[csr-dev] cannot resolve "${specifier}" from ${this.#paths.idOf(importer)}`);
    if (!path.isAbsolute(resolved)) return `${CsrDevPaths.stubPrefix}${specifier}`;
    if (!relative) this.#fallbacks.add(specifier);
    return CsrDevPaths.realpath(resolved);
  }

  //? The browser build tree-shakes the unused re-exports of a side-effect-free barrel, so their imports have no
  //? recorded resolution; a file of the same package resolves a bare specifier to the same target, conditions included.
  #resolvedBySibling(importer: string, specifier: string): string | null {
    const scope = CsrDevResolver.#packageScopeOf(importer);
    for (const [other, bySpecifier] of this.#resolution) {
      const target = bySpecifier.get(specifier);
      if (target && CsrDevResolver.#packageScopeOf(other) === scope) return target;
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
