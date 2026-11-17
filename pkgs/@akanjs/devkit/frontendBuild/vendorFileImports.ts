import fs from "node:fs";
import path from "node:path";
import type { BunPlugin } from "bun";
import ts from "typescript";
import { VendorNarrowing } from "./vendorNarrowing";
import { VENDOR_SPECIFIERS, type VendorSpecifier } from "./vendorSpecifiers";

const scriptExtensions = [".ts", ".tsx", ".js", ".jsx"];

//? A route build bundles a file of a vendor package reached by its path, beside the copy the vendor carries and the
//? state that copy holds; a file the vendor's barrel re-exports whole, under the same names, comes from the vendor.
export class VendorFileImports {
  readonly specifiers: readonly VendorSpecifier[];
  readonly #akanjsRoots: readonly string[];
  readonly #specifierByModule: ReadonlyMap<string, VendorSpecifier>;

  static async of(workspaceRoot: string): Promise<VendorFileImports> {
    const akanServerPath = await VendorFileImports.#akanServerPath(workspaceRoot);
    return akanServerPath
      ? new VendorFileImports(path.dirname(akanServerPath), VendorFileImports.#shippedIn(akanServerPath))
      : new VendorFileImports(null, VENDOR_SPECIFIERS);
  }

  static async specifiersIn(workspaceRoot: string): Promise<readonly VendorSpecifier[]> {
    const akanServerPath = await VendorFileImports.#akanServerPath(workspaceRoot);
    return akanServerPath ? VendorFileImports.#shippedIn(akanServerPath) : VENDOR_SPECIFIERS;
  }

  //? Only the vendors this akanjs ships an entry for: an older one has no `akanjs/client` vendor to import from.
  static #shippedIn(akanServerPath: string): VendorSpecifier[] {
    return VendorNarrowing.entriesIn(akanServerPath).map(({ specifier }) => specifier);
  }

  static async #akanServerPath(workspaceRoot: string): Promise<string | null> {
    try {
      return await VendorNarrowing.akanServerPath(workspaceRoot);
    } catch {
      return null;
    }
  }

  constructor(akanjsRoot: string | null, specifiers: readonly VendorSpecifier[]) {
    this.specifiers = specifiers;
    this.#akanjsRoots = akanjsRoot ? [...new Set([path.resolve(akanjsRoot), fs.realpathSync(akanjsRoot)])] : [];
    this.#specifierByModule = akanjsRoot ? this.#mapModules(akanjsRoot) : new Map();
  }

  #mapModules(akanjsRoot: string): Map<string, VendorSpecifier> {
    const specifierByModule = new Map<string, VendorSpecifier>();
    const packaged = this.specifiers
      .filter((specifier) => specifier.startsWith("akanjs/"))
      .sort((a, b) => b.length - a.length);
    for (const specifier of packaged) {
      const barrel = VendorFileImports.#fileOf(path.join(akanjsRoot, specifier.slice("akanjs/".length)));
      if (!barrel) continue;
      for (const file of [barrel, ...VendorFileImports.wholeReexports(barrel)])
        for (const root of this.#akanjsRoots)
          for (const key of VendorFileImports.#moduleKeys(path.join(root, path.relative(akanjsRoot, file))))
            if (!specifierByModule.has(key)) specifierByModule.set(key, specifier);
    }
    return specifierByModule;
  }

  vendorOf(request: string, importer: string): VendorSpecifier | null {
    const [akanjsRoot] = this.#akanjsRoots;
    if (!akanjsRoot) return null;
    const target = request.startsWith("akanjs/")
      ? path.join(akanjsRoot, request.slice("akanjs/".length))
      : request.startsWith(".") || path.isAbsolute(request)
        ? path.resolve(path.dirname(importer), request)
        : null;
    if (!target) return null;
    const extension = path.extname(target);
    return (
      this.#specifierByModule.get(scriptExtensions.includes(extension) ? target.slice(0, -extension.length) : target) ??
      null
    );
  }

  //? A dynamic import stays a lazy chunk of the route build: `import("akanjs/client")` would load the whole vendor.
  plugin(): BunPlugin {
    return {
      name: "akan-vendor-file-imports",
      setup: (build) => {
        build.onResolve({ filter: /^(\.|\/|akanjs\/)/ }, (args) => {
          if (args.kind !== "import-statement" || !args.importer) return undefined;
          const specifier = this.vendorOf(args.path, args.importer);
          return specifier && specifier !== args.path ? { path: specifier, external: true } : undefined;
        });
      },
    };
  }

  static wholeReexports(barrel: string): string[] {
    const source = ts.createSourceFile(barrel, fs.readFileSync(barrel, "utf8"), ts.ScriptTarget.Latest, false);
    const sourceOfName = new Map<string, string | null>();
    const starred = new Map<string, string | null>();
    const files = new Set<string>();
    for (const statement of source.statements) {
      if (!ts.isExportDeclaration(statement) || statement.isTypeOnly) continue;
      const { moduleSpecifier, exportClause } = statement;
      if (!moduleSpecifier || !ts.isStringLiteral(moduleSpecifier)) continue;
      const file = VendorFileImports.#fileOf(path.resolve(path.dirname(barrel), moduleSpecifier.text));
      if (!file) continue;
      files.add(file);
      if (!exportClause) {
        for (const name of VendorFileImports.#exportsOf(file) ?? [])
          if (name !== "default") starred.set(name, starred.has(name) && starred.get(name) !== file ? null : file);
        continue;
      }
      if (!ts.isNamedExports(exportClause)) continue;
      for (const element of exportClause.elements) {
        if (element.isTypeOnly) continue;
        const exported = element.name.text;
        sourceOfName.set(exported, (element.propertyName ?? element.name).text === exported ? file : null);
      }
    }
    const sourceOf = (name: string) => (sourceOfName.has(name) ? sourceOfName.get(name) : starred.get(name)) ?? null;
    return [...files].filter((file) => {
      const names = VendorFileImports.#exportsOf(file);
      return !!names && names.length > 0 && names.every((name) => sourceOf(name) === file);
    });
  }

  //? `null` for a file that re-exports with `export *`: its names are not all in its own source.
  static #exportsOf(file: string): string[] | null {
    const source = fs.readFileSync(file, "utf8");
    if (/^\s*export\s*\*/m.test(source)) return null;
    const loader = file.endsWith(".tsx") || file.endsWith(".jsx") ? "tsx" : "ts";
    return new Bun.Transpiler({ loader }).scan(source).exports;
  }

  static #fileOf(base: string): string | null {
    for (const candidate of [...scriptExtensions.map((ext) => `${base}${ext}`), path.join(base, "index.ts")])
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
    return null;
  }

  static #moduleKeys(file: string): string[] {
    const withoutExtension = file.slice(0, -path.extname(file).length);
    return path.basename(withoutExtension) === "index"
      ? [withoutExtension, path.dirname(withoutExtension)]
      : [withoutExtension];
  }
}
