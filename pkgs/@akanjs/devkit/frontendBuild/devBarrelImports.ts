import path from "node:path";
import type { App } from "../commandDecorators";
import { BarrelAnalyzer, type PackageEntry } from "../transforms/barrelAnalyzer";
import { createTsconfigPackageResolver, rewriteBarrelImports } from "../transforms/barrelImportsPlugin";
import { CsrDevPaths } from "./csrDevPaths";

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

  async rewrite(source: string, importer: string): Promise<string | null> {
    const named = this.#barrels.filter((barrel) => source.includes(barrel));
    if (named.length === 0) return null;
    const packages = (await Promise.all(named.map((barrel) => this.#packageOf(barrel))))
      .filter((pkg): pkg is PackageEntry => pkg !== null)
      .sort((a, b) => b.pkgName.length - a.pkgName.length);
    const from = path.dirname(CsrDevPaths.realpath(importer));
    return await rewriteBarrelImports(source, named, this.#analyzer, {
      keepLines: true,
      specifierOf: (subpath) => DevBarrelImports.#relative(subpath, from, packages),
    });
  }

  #packageOf(barrel: string): Promise<PackageEntry | null> {
    let pkg = this.#packages.get(barrel);
    if (!pkg) {
      pkg = this.#resolvePackage(barrel);
      this.#packages.set(barrel, pkg);
    }
    return pkg;
  }

  static #relative(subpath: string, from: string, packages: PackageEntry[]): string {
    const pkg = packages.find(({ pkgName }) => subpath === pkgName || subpath.startsWith(`${pkgName}/`));
    if (!pkg) return subpath;
    const file = CsrDevPaths.resolveOnDisk(path.join(pkg.pkgDir, subpath.slice(pkg.pkgName.length)));
    if (!file) return subpath;
    const relative = path.relative(from, CsrDevPaths.realpath(file)).split(path.sep).join("/");
    return relative.startsWith("../") ? relative : `./${relative}`;
  }
}
