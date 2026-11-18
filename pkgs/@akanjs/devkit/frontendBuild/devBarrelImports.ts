import path from "node:path";
import type { App } from "../commandDecorators";
import { BarrelAnalyzer, type PackageEntry } from "../transforms/barrelAnalyzer";
import { createTsconfigPackageResolver, rewriteBarrelImports } from "../transforms/barrelImportsPlugin";
import { ObjectMemberImports, type ObjectMemberRewrite } from "../transforms/objectMemberImports";
import { CsrDevPaths } from "./csrDevPaths";
import type { CsrDevBarrelStamp, CsrDevContext, CsrDevNarrowedImport } from "./csrDevTypes";

export interface DevBarrelRewrite {
  contents: string | null;
  narrowed: Record<string, CsrDevNarrowedImport>;
}

const CLIENT_SIDE = "@client";

//? An object import is keyed by the module that declares it; its names lead with the importer's side, which decides
//? whether a member past a `"use client"` boundary narrows.
const objectUsesOf = (objects: ObjectMemberRewrite | null): (readonly [string, string[]])[] => {
  if (!objects) return [];
  const members = new Map<string, Set<string>>();
  for (const entry of [...objects.narrowed, ...objects.kept]) {
    const key = ObjectMemberImports.keyOf(entry.file, entry.object);
    const set = members.get(key) ?? new Set<string>();
    if ("members" in entry) for (const member of entry.members) set.add(member);
    members.set(key, set);
  }
  const side = objects.clientImporter ? CLIENT_SIDE : "@server";
  return [...members].map(([key, set]) => [key, [side, ...[...set].sort()]] as const);
};

//* Targets are written as relative paths, which resolve against the disk with no resolution build: a save that adds a
//* barrel import stays a patch.
export class DevBarrelImports {
  readonly #barrels: string[];
  readonly #resolvePackage: (pkgName: string) => Promise<PackageEntry | null>;
  readonly #analyzer: BarrelAnalyzer;
  readonly #packages = new Map<string, Promise<PackageEntry | null>>();
  readonly #objects: ObjectMemberImports | null;

  constructor(
    barrels: readonly string[],
    resolvePackage: (pkgName: string) => Promise<PackageEntry | null>,
    { packageRoot }: { packageRoot?: string } = {},
  ) {
    this.#barrels = [...barrels];
    this.#resolvePackage = resolvePackage;
    this.#analyzer = new BarrelAnalyzer({ resolvePackage, ...(packageRoot ? { packageRoot } : {}) });
    this.#objects = packageRoot
      ? new ObjectMemberImports({
          resolve: ObjectMemberImports.resolverOf(resolvePackage),
          specifierOf: (file, importer) =>
            DevBarrelImports.#relativeFile(CsrDevPaths.realpath(file), path.dirname(CsrDevPaths.realpath(importer))),
          keepLines: true,
          barrels: { names: this.#barrels, analyzer: this.#analyzer },
        })
      : null;
  }

  static async create(
    app: App,
    { barrelImports = [], routeRuntime }: Pick<CsrDevContext, "barrelImports" | "routeRuntime">,
  ): Promise<DevBarrelImports | null> {
    if (barrelImports.length === 0) return null;
    return new DevBarrelImports(
      barrelImports,
      await createTsconfigPackageResolver(app),
      routeRuntime ? { packageRoot: app.workspace.workspaceRoot } : {},
    );
  }

  async rewrite(
    source: string,
    importer: string,
    { perModule = false }: { perModule?: boolean } = {},
  ): Promise<DevBarrelRewrite | null> {
    const named = this.#barrels.filter((barrel) => source.includes(barrel));
    if (named.length === 0 && !this.#objects) return null;
    const packages = await this.#packagesOf(named);
    const from = path.dirname(CsrDevPaths.realpath(importer));
    const names = new Map<string, Set<string>>();
    const rewritten =
      named.length === 0
        ? null
        : await rewriteBarrelImports(source, named, this.#analyzer, {
            keepLines: true,
            specifierOf: (subpath) => DevBarrelImports.#relative(subpath, from, packages),
            onImport: (barrel, imported) => names.set(barrel, new Set([...(names.get(barrel) ?? []), ...imported])),
            perModule,
            reexports: this.#objects !== null,
          });
    const objects = (await this.#objects?.rewrite(rewritten ?? source, importer)) ?? null;
    const uses = [...[...names].map(([barrel, set]) => [barrel, [...set].sort()] as const), ...objectUsesOf(objects)];
    if (named.length === 0 && uses.length === 0) return null;
    const narrowed = await Promise.all(
      uses.map(async ([key, sorted]) => [key, { names: sorted, hash: await this.fingerprint(key, sorted) }] as const),
    );
    return { contents: objects?.contents ?? rewritten, narrowed: Object.fromEntries(narrowed) };
  }

  //? Hashes what an import of these names alone narrows to, with each target as the file it resolves to: the same
  //? names in another importer narrow to the same files, and only a moved export or a moved file changes it.
  async fingerprint(barrel: string, names: string[]): Promise<string> {
    const object = ObjectMemberImports.parseKey(barrel);
    if (object) {
      const [side, ...members] = names;
      const hash = await this.#objects?.fingerprint(object.file, object.object, members, side === CLIENT_SIDE);
      return hash ?? "";
    }
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

  async stamps(barrels: Iterable<string>, idOf: (file: string) => string): Promise<Record<string, CsrDevBarrelStamp>> {
    const stamped = await Promise.all(
      [...barrels].map(async (barrel) => {
        const object = ObjectMemberImports.parseKey(barrel);
        const files = object
          ? ((await this.#objects?.filesOf(object.file)) ?? [object.file])
          : await this.#analyzer.filesOf(barrel);
        const read = [...new Set([...files, ...files.map((file) => path.dirname(file))])];
        const stamp: CsrDevBarrelStamp = {
          read: Object.fromEntries(read.map((file) => [idOf(file), CsrDevPaths.mtimeOf(file)])),
          digest: object ? ((await this.#objects?.digest(object.file)) ?? "") : await this.#digest(barrel),
        };
        return [barrel, stamp] as const;
      }),
    );
    return Object.fromEntries(stamped);
  }

  //? Every input of an importer's fingerprint: an importer is hashed again only once this moves, so a save that
  //? changes a component's body costs one analysis of its barrel, whatever the number of importers.
  async #digest(barrel: string): Promise<string> {
    const map = await this.#analyzer.analyze(barrel);
    const packages = await this.#packagesOf([barrel]);
    const files = new Map<string, string>();
    const fileOf = (subpath: string) => {
      let file = files.get(subpath);
      if (file === undefined) {
        file = DevBarrelImports.#fileOf(subpath, packages) ?? subpath;
        files.set(subpath, file);
      }
      return file;
    };
    const exports = [...(map ?? [])]
      .map(([name, target]) => [name, target.originalName, !!target.namespace, fileOf(target.subpath)] as const)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return Bun.hash(JSON.stringify([fileOf(barrel), map === null, exports])).toString(36);
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
    if (!pkg && !path.isAbsolute(subpath)) return null;
    const file = CsrDevPaths.resolveOnDisk(pkg ? path.join(pkg.pkgDir, subpath.slice(pkg.pkgName.length)) : subpath);
    return file ? CsrDevPaths.realpath(file) : null;
  }

  static #relative(subpath: string, from: string, packages: PackageEntry[]): string {
    const file = DevBarrelImports.#fileOf(subpath, packages);
    return file ? DevBarrelImports.#relativeFile(file, from) : subpath;
  }

  static #relativeFile(file: string, from: string): string {
    const relative = path.relative(from, file);
    //? A target on another Windows drive has no relative path: `path.relative` returns it absolute.
    if (path.isAbsolute(relative)) return file.split(path.sep).join("/");
    const posix = relative.split(path.sep).join("/");
    return posix.startsWith("../") ? posix : `./${posix}`;
  }
}
