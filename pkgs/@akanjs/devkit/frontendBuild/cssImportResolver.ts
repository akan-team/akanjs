import path from "node:path";
import type { App } from "../commandDecorators";

const CSS_IMPORT_EXTS = ["", ".css", "/styles.css", "/index.css"] as const;

export class CssImportResolver {
  #workspaceRoot: string;
  #paths: Record<string, string[]>;
  #wildcardEntries: { prefix: string; replacements: string[] }[];

  constructor(workspaceRoot: string, paths: Record<string, string[]> = {}) {
    this.#workspaceRoot = workspaceRoot;
    this.#paths = paths;
    this.#wildcardEntries = Object.entries(paths)
      .filter(([key]) => key.endsWith("/*"))
      .map(([key, replacements]) => ({ prefix: key.slice(0, -1), replacements }))
      .sort((a, b) => b.prefix.length - a.prefix.length);
  }

  static async create(app: App): Promise<CssImportResolver> {
    const tsconfig = await app.getTsConfig();
    return new CssImportResolver(app.workspace.workspaceRoot, tsconfig.compilerOptions.paths ?? {});
  }

  async resolve(id: string, fromBase: string): Promise<string | null> {
    for (const resolve of [
      () => this.#resolveWithTsconfig(id),
      () => this.#resolveWithBun(id, fromBase),
      () => this.#resolveWithRequire(id, fromBase),
      () => this.#resolvePackageStyle(id, fromBase),
    ]) {
      const resolved = await resolve();
      if (resolved) return resolved;
    }
    return null;
  }

  #resolveWithBun(id: string, fromBase: string): string | null {
    for (const base of this.#resolutionBases(fromBase)) {
      try {
        const resolved = Bun.resolveSync(id, base);
        if (CssImportResolver.isCssFile(resolved)) return resolved;
      } catch {
        // Try the next known package resolution root.
      }
    }
    return null;
  }

  #resolveWithRequire(id: string, fromBase: string): string | null {
    for (const base of this.#resolutionBases(fromBase)) {
      try {
        const resolved = require.resolve(id, { paths: [base] });
        if (CssImportResolver.isCssFile(resolved)) return resolved;
      } catch {
        // Try the next known package resolution root.
      }
    }
    return null;
  }

  async #resolveWithTsconfig(id: string): Promise<string | null> {
    const exact = this.#paths[id];
    if (exact) {
      for (const repl of exact) {
        const resolved = await this.#firstExisting(path.resolve(this.#workspaceRoot, repl));
        if (resolved) return resolved;
      }
    }

    for (const { prefix, replacements } of this.#wildcardEntries) {
      if (!id.startsWith(prefix)) continue;
      const suffix = id.slice(prefix.length);
      for (const repl of replacements) {
        const replPath = repl.endsWith("/*") ? repl.slice(0, -1) : repl;
        const resolved = await this.#firstExisting(path.resolve(this.#workspaceRoot, replPath + suffix));
        if (resolved) return resolved;
      }
    }
    return null;
  }

  async #resolvePackageStyle(id: string, fromBase: string): Promise<string | null> {
    const pkgName = CssImportResolver.getPackageName(id);
    if (!pkgName) return null;
    for (const base of this.#resolutionBases(fromBase)) {
      try {
        const pkgPath = require.resolve(`${pkgName}/package.json`, { paths: [base] });
        const resolved = await this.#resolvePackageStyleFromPackageJson(id, pkgName, pkgPath);
        if (resolved) return resolved;
      } catch {
        // Try the next known package resolution root.
      }
    }
    for (const pkgPath of this.#packageJsonCandidates(pkgName)) {
      const resolved = await this.#resolvePackageStyleFromPackageJson(id, pkgName, pkgPath);
      if (resolved) return resolved;
    }
    return null;
  }

  async #resolvePackageStyleFromPackageJson(id: string, pkgName: string, pkgPath: string): Promise<string | null> {
    try {
      if (!(await Bun.file(pkgPath).exists())) return null;
      const pkgDir = path.dirname(pkgPath);
      const pkg = await Bun.file(pkgPath).json();
      const subpath = id === pkgName ? "." : `.${id.slice(pkgName.length)}`;
      const exportValue = pkg.exports?.[subpath];
      const styleEntry =
        (typeof exportValue === "string"
          ? exportValue
          : exportValue?.style || exportValue?.import || exportValue?.default) ||
        pkg.exports?.["."]?.style ||
        pkg.style ||
        "index.css";
      return await this.#firstExisting(path.resolve(pkgDir, styleEntry));
    } catch {
      return null;
    }
  }

  #resolutionBases(fromBase: string): string[] {
    return [fromBase, this.#workspaceRoot, path.dirname(Bun.main), path.resolve(path.dirname(Bun.main), "../..")];
  }

  #packageJsonCandidates(pkgName: string): string[] {
    return [
      path.join(this.#workspaceRoot, "pkgs", pkgName, "package.json"),
      path.join(this.#workspaceRoot, "node_modules", pkgName, "package.json"),
      path.join(path.dirname(Bun.main), "node_modules", pkgName, "package.json"),
      path.join(path.dirname(Bun.main), "../../", pkgName, "package.json"),
    ];
  }

  async #firstExisting(basePath: string): Promise<string | null> {
    for (const suffix of CSS_IMPORT_EXTS) {
      const candidate = `${basePath}${suffix}`;
      if (await Bun.file(candidate).exists()) return candidate;
    }
    return null;
  }

  static getPackageName(id: string): string | null {
    const parts = id.split("/");
    if (id.startsWith("@")) return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : null;
    return parts[0] ?? null;
  }

  static isCssFile(filePath: string): boolean {
    return path.extname(filePath) === ".css";
  }
}
