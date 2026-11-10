import path from "node:path";
import type { App } from "../commandDecorators";
import { BarrelAnalyzer, type PackageEntry } from "../transforms/barrelAnalyzer";
import { createTsconfigPackageResolver, rewriteBarrelImports } from "../transforms/barrelImportsPlugin";
import { CsrDevPaths } from "./csrDevPaths";
import type { CsrDevNarrowedImport } from "./csrDevTypes";

export interface DevBarrelRewrite {
  contents: string | null;
  narrowed: Record<string, CsrDevNarrowedImport>;
}

//* A dev registry narrows the workspace barrels `akan build` narrows, so a module UI file runs in dev only where a
//* production page runs it. Targets are written as relative paths, which resolve against the disk with no resolution
//* build: a save that adds a barrel import stays a patch.
export class DevBarrelImports {
  readonly #barrels: string[];
  readonly #resolvePackage: (pkgName: string) => Promise<PackageEntry | null>;
  readonly #analyzer: BarrelAnalyzer;
  readonly #packages = new Map<string, Promise<PackageEntry | null>>();

  constructor(barrels: readonly string[], resolvePackage: (pkgName: string) => Promise<PackageEntry | null>) {
    this.#barrels = [...barrels];
    this.#resolvePackage = resolvePackage;
    this.#analyzer = new BarrelAnalyzer({ resolvePackage });
  }

  static async create(app: App, barrels: readonly string[]): Promise<DevBarrelImports | null> {
    if (barrels.length === 0) return null;
    return new DevBarrelImports(barrels, await createTsconfigPackageResolver(app));
  }

  async rewrite(source: string, importer: string): Promise<DevBarrelRewrite | null> {
    const named = this.#barrels.filter((barrel) => source.includes(barrel));
    if (named.length === 0) return null;
    const packages = await this.#packagesOf(named);
    const from = path.dirname(CsrDevPaths.realpath(importer));
    const names = new Map<string, Set<string>>();
    const contents = await rewriteBarrelImports(source, named, this.#analyzer, {
      keepLines: true,
      specifierOf: (subpath) => DevBarrelImports.#relative(subpath, from, packages),
      onImport: (barrel, imported) => names.set(barrel, new Set([...(names.get(barrel) ?? []), ...imported])),
    });
    const narrowed = await Promise.all(
      [...names].map(async ([barrel, set]) => {
        const sorted = [...set].sort();
        return [barrel, { names: sorted, hash: await this.fingerprint(barrel, sorted) }] as const;
      }),
    );
    return { contents, narrowed: Object.fromEntries(narrowed) };
  }

  //? Hashes what an import of these names alone narrows to, with each target as the file it resolves to: the same
  //? names in another importer narrow to the same files, and only a moved export or a moved file changes it.
  async fingerprint(barrel: string, names: string[]): Promise<string> {
    const packages = await this.#packagesOf([barrel]);
    const aliased = names.map((name, index) => `${name} as _${index}`).join(", ");
    const narrowed = await rewriteBarrelImports(
      `import { ${aliased} } from ${JSON.stringify(barrel)};`,
      [barrel],
      this.#analyzer,
      { specifierOf: (subpath) => DevBarrelImports.#fileOf(subpath, packages) ?? subpath },
    );
    return Bun.hash(narrowed ?? "").toString(36);
  }

  async stamps(
    barrels: Iterable<string>,
    idOf: (file: string) => string,
  ): Promise<Record<string, Record<string, number>>> {
    const stamped = await Promise.all(
      [...barrels].map(async (barrel) => {
        const files = await this.#analyzer.filesOf(barrel);
        const read = [...new Set([...files, ...files.map((file) => path.dirname(file))])];
        return [barrel, Object.fromEntries(read.map((file) => [idOf(file), CsrDevPaths.mtimeOf(file)]))] as const;
      }),
    );
    return Object.fromEntries(stamped);
  }

  async #packagesOf(barrels: string[]): Promise<PackageEntry[]> {
    return (await Promise.all(barrels.map((barrel) => this.#packageOf(barrel))))
      .filter((pkg): pkg is PackageEntry => pkg !== null)
      .sort((a, b) => b.pkgName.length - a.pkgName.length);
  }

  #packageOf(barrel: string): Promise<PackageEntry | null> {
    let pkg = this.#packages.get(barrel);
    if (!pkg) {
      pkg = this.#resolvePackage(barrel);
      this.#packages.set(barrel, pkg);
    }
    return pkg;
  }

  static #fileOf(subpath: string, packages: PackageEntry[]): string | null {
    const pkg = packages.find(({ pkgName }) => subpath === pkgName || subpath.startsWith(`${pkgName}/`));
    if (!pkg) return null;
    const file = CsrDevPaths.resolveOnDisk(path.join(pkg.pkgDir, subpath.slice(pkg.pkgName.length)));
    return file ? CsrDevPaths.realpath(file) : null;
  }

  static #relative(subpath: string, from: string, packages: PackageEntry[]): string {
    const file = DevBarrelImports.#fileOf(subpath, packages);
    if (!file) return subpath;
    const relative = path.relative(from, file);
    //? A target on another Windows drive has no relative path: `path.relative` returns it absolute.
    if (path.isAbsolute(relative)) return file.split(path.sep).join("/");
    const posix = relative.split(path.sep).join("/");
    return posix.startsWith("../") ? posix : `./${posix}`;
  }
}
