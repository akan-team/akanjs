import path from "node:path";
import { type Pkg, runner, type Workspace } from "@akanjs/devkit/commandDecorators";
import { TypeScriptDependencyScanner } from "@akanjs/devkit/dependencyScanner";
import { PkgExecutor } from "@akanjs/devkit/executors";
import { FileSys } from "@akanjs/devkit/fileSys";
import { PackageExportsMap } from "@akanjs/devkit/packageExportsMap";
import type { PackageJson } from "@akanjs/devkit/types";
import { Logger } from "akanjs/common";
import { $ } from "bun";

export class PackageRunner extends runner("package") {
  static readonly publishableAkanPackages = [
    "akanjs",
    "@akanjs/cli",
    "@akanjs/devkit",
    "create-akan-workspace",
  ] as const;

  async version(workspace: Workspace | null, { log = true }: { log?: boolean } = {}) {
    const pkgJson =
      process.env.USE_AKANJS_PKGS === "true"
        ? await FileSys.readJson<PackageJson>(`${workspace?.workspaceRoot ?? process.cwd()}/pkgs/akanjs/package.json`)
        : await this.#getInstalledPackageJson();
    const version = pkgJson.name === "akanjs" ? pkgJson.version : (pkgJson.dependencies?.akanjs ?? pkgJson.version);
    if (log) Logger.rawLog(`akanjs@${version}`);
    return version;
  }

  async #getInstalledPackageJson(): Promise<PackageJson> {
    const packageJsonCandidates = [
      `${path.dirname(Bun.main)}/package.json`,
      `${process.cwd()}/node_modules/akanjs/package.json`,
    ];
    try {
      packageJsonCandidates.unshift(Bun.resolveSync("akanjs/package.json", path.dirname(Bun.main)));
    } catch {
      // The bundled CLI can still report the matching runtime version from its own package.json dependency.
    }
    for (const packageJsonPath of packageJsonCandidates) {
      if (!(await Bun.file(packageJsonPath).exists())) continue;
      const packageJson = await FileSys.readJson<PackageJson>(packageJsonPath);
      if (packageJson.name === "akanjs" || packageJson.name === "@akanjs/cli") return packageJson;
    }
    throw new Error(`[package] failed to locate akanjs package.json from ${path.dirname(Bun.main)}`);
  }
  async createPackage(workspace: Workspace, pkgName: string) {
    await workspace.applyTemplate({ basePath: `pkgs/${pkgName}`, template: "pkgRoot", dict: { pkgName } });
    await workspace.setPkgTsPaths(pkgName);
  }
  async removePackage(pkg: Pkg) {
    await pkg.workspace.exec(`rm -rf pkgs/${pkg.name}`);
    await pkg.workspace.unsetPkgTsPaths(pkg.name);
  }
  async scanSync(pkg: Pkg) {
    const scanResult = await pkg.scan();
    return scanResult;
  }
  async buildPackage(pkg: Pkg) {
    await $`rm -rf ${pkg.dist.cwdPath}`;
    await pkg.dist.mkdir(pkg.dist.cwdPath);
    const scanner = await TypeScriptDependencyScanner.from(pkg);
    const { npmDeps, npmDevDeps, missingDeps } = await scanner.getPackageBuildDependencies(pkg.name);
    const packageRuntimeDependencies: Record<string, string[]> = {
      "@akanjs/devkit": ["daisyui", "tailwind-scrollbar"],
    };
    const packageRuntimeDevDependencies: Record<string, string[]> = { akanjs: ["@biomejs/biome", "@types/bun"] };
    if (pkg.name === "@akanjs/cli") {
      const devkitPackageJson = await pkg.workspace.readJson("pkgs/@akanjs/devkit/package.json");
      packageRuntimeDependencies[pkg.name] = [
        ...Object.keys(((devkitPackageJson as PackageJson).dependencies ?? {}) as Record<string, string>),
        "daisyui",
        "tailwind-scrollbar",
      ].filter((dep) => dep !== "akanjs" && dep !== "@akanjs/devkit");
    }
    const bundledRuntimeDeps = new Set(pkg.name === "@akanjs/cli" ? ["@akanjs/devkit"] : []);
    const forcedRuntimeDeps = packageRuntimeDependencies[pkg.name] ?? [];
    const forcedRuntimeDevDeps = packageRuntimeDevDependencies[pkg.name] ?? [];
    const [rootPackageJson, pkgJson] = await Promise.all([pkg.workspace.getPackageJson(), pkg.getPackageJson()]);
    const optionalPeerDeps = new Set(
      Object.entries(pkgJson.peerDependenciesMeta ?? {})
        .filter(([, meta]) => meta.optional)
        .map(([dep]) => dep),
    );
    const packageRuntimeDeps = [...new Set([...npmDeps, ...forcedRuntimeDeps])].filter(
      (dep) => !optionalPeerDeps.has(dep) && !bundledRuntimeDeps.has(dep),
    );
    const packageRuntimeDevDeps = [...new Set([...npmDevDeps, ...forcedRuntimeDevDeps])].filter(
      (dep) => !optionalPeerDeps.has(dep),
    );
    const rootDeps = { ...rootPackageJson.dependencies, ...rootPackageJson.devDependencies };
    const missingForcedDeps = forcedRuntimeDeps.filter((dep) => !rootDeps[dep]);
    const missingForcedDevDeps = forcedRuntimeDevDeps.filter((dep) => !rootDeps[dep]);
    const requiredMissingDeps = missingDeps.filter((dep) => !optionalPeerDeps.has(dep));
    const allMissingDeps = [...new Set([...requiredMissingDeps, ...missingForcedDeps, ...missingForcedDevDeps])].sort();
    if (allMissingDeps.length > 0)
      throw new Error(`Missing dependency versions in root package.json: ${allMissingDeps.join(", ")}`);

    await pkg.updatePackageJsonDependencies(packageRuntimeDeps, packageRuntimeDevDeps);

    const hasBuildFile = await Bun.file(`${pkg.cwdPath}/build.ts`).exists();
    if (hasBuildFile) {
      await pkg.workspace.spawn(process.execPath, [`${pkg.cwdPath}/build.ts`], {
        env: {
          ...process.env,
          ...(pkg.name === "akanjs" ? { AKAN_BUILD_DECLARATION_DIAGNOSTICS: "error" } : {}),
        },
        stdio: "inherit",
      });
    } else {
      await $`cp -r ${pkg.cwdPath}/. ${pkg.dist.cwdPath}`;
      await Promise.all([
        pkg.generateDistPackageJson(packageRuntimeDeps, packageRuntimeDevDeps),
        pkg.generateTsconfigJson(),
      ]);
    }
    await this.#copyPackageReadmes(pkg);
  }

  /** Dist files worth scanning for imports; `.d.ts` is excluded as type-only. */
  static readonly #scannableDistFiles = "**/*.{ts,tsx,js,jsx,mjs,cjs}";
  /** Matches the tail of the text preceding a specifier when that specifier is actually imported. */
  static readonly #importPosition = /(?:\bfrom\s*|\brequire\s*\(\s*|\bimport\s*\(\s*|\bimport\s+)$/;

  /** Splits `akanjs/server/akanApp` into the package name and the `exports` subpath to look up. */
  static #splitSpecifier(specifier: string) {
    const segments = specifier.split("/");
    const name = specifier.startsWith("@") ? segments.slice(0, 2).join("/") : segments[0];
    const subpath = specifier.slice(name.length).replace(/^\//, "");
    return { name, subpath: subpath ? `./${subpath}` : "." };
  }

  /**
   * Collects every specifier the dist tree imports from `packageNames`, mapped to the importing files.
   *
   * Only import positions in non-test files count. Test files are skipped because the transform suites
   * carry specifiers as fixture *data* (`"akanjs/server/akanApp"`, `"akanjs/ui/*"`) that never resolve
   * and never run for a consumer, and whole-line comments are skipped because this package documents
   * subpath imports in prose.
   */
  async #collectDistAkanImports(distPath: string, packageNames: Iterable<string>) {
    const alternatives = [...new Set(packageNames)].map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const specifierPattern = new RegExp(`["'](${alternatives.join("|")})((?:/[^"'\\s]*)?)["']`, "g");
    const glob = new Bun.Glob(PackageRunner.#scannableDistFiles);
    const imports = new Map<string, Set<string>>();
    for await (const relative of glob.scan({ cwd: distPath })) {
      if (relative.includes("node_modules/") || relative.endsWith(".d.ts")) continue;
      if (/\.(test|spec)\.[a-z]+$/.test(relative)) continue;
      const source = await Bun.file(`${distPath}/${relative}`).text();
      for (const line of source.split("\n")) {
        const trimmed = line.trimStart();
        if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) continue;
        for (const match of line.matchAll(specifierPattern)) {
          if (!PackageRunner.#importPosition.test(line.slice(0, match.index))) continue;
          const specifier = `${match[1]}${match[2] ?? ""}`;
          const importers = imports.get(specifier) ?? new Set<string>();
          imports.set(specifier, importers.add(relative));
        }
      }
    }
    return imports;
  }

  /**
   * Fails when the dist tree imports a subpath of itself, or of a sibling akan package, that the
   * corresponding `exports` map cannot reach.
   *
   * This is the check that `"exports": { "./*": "./*" }` in `@akanjs/devkit` needed and did not have.
   * Exports targets are matched exactly — no extension appended, no `index.ts` probed — so every
   * subpath import in the published package failed at runtime while `tsc`, the bundle, and the whole
   * test suite stayed green, because inside the monorepo those specifiers resolve through tsconfig
   * `paths` instead. Nothing short of resolving against the built manifest can see the difference.
   */
  async #verifyDistExportsReachable(pkg: Pkg, peerExportsMaps: Map<string, PackageExportsMap>) {
    const exportsMaps = new Map(peerExportsMaps).set(pkg.name, await PackageExportsMap.from(pkg.dist.cwdPath));
    const imports = await this.#collectDistAkanImports(pkg.dist.cwdPath, exportsMaps.keys());
    const failures: string[] = [];
    for (const [specifier, importers] of imports) {
      const { name, subpath } = PackageRunner.#splitSpecifier(specifier);
      const exportsMap = exportsMaps.get(name);
      if (!exportsMap) continue; // that package was not built in this run, so its manifest is unknown
      const [unreachable] = exportsMap.findUnreachable([subpath]);
      if (!unreachable) continue;
      const reason = unreachable.target
        ? `its exports map yields ${unreachable.target}, which is not a file`
        : "no exports entry matches it";
      const files = [...importers].sort();
      const shown = files.slice(0, 3).join(", ") + (files.length > 3 ? ` (+${files.length - 3} more)` : "");
      failures.push(`  ${specifier} — ${reason}; imported by ${shown}`);
    }
    if (!failures.length) return;
    throw new Error(
      `[package] ${pkg.name} dist imports ${failures.length} subpath(s) no consumer can resolve:\n` +
        `${failures.sort().join("\n")}\n` +
        `Add the missing "exports" entries: a bare file facet needs "./*": "./*.ts", a directory facet ` +
        `needs its own "./name": "./name/index.ts", and "./*.ts": "./*.ts" keeps an already-suffixed ` +
        `specifier from gaining a second extension.`,
    );
  }

  async verifyDistPackage(
    pkg: Pkg,
    {
      peerExportsMaps = new Map<string, PackageExportsMap>(),
    }: { peerExportsMaps?: Map<string, PackageExportsMap> } = {},
  ): Promise<{ name: string; version: string; files: number; size: number }> {
    const distPackageJsonPath = `${pkg.dist.cwdPath}/package.json`;
    if (!(await Bun.file(distPackageJsonPath).exists())) {
      throw new Error(`[package] dist package not found for ${pkg.name}. Run build-package first.`);
    }
    const pkgJson = await FileSys.readJson<PackageJson>(distPackageJsonPath);
    if (pkgJson.name !== pkg.name) {
      throw new Error(`[package] dist package name mismatch: expected ${pkg.name}, got ${pkgJson.name ?? "(missing)"}`);
    }
    if (!pkgJson.version) throw new Error(`[package] dist package version is missing for ${pkg.name}`);
    if (!pkgJson.publishConfig || pkgJson.publishConfig.access !== "public") {
      throw new Error(`[package] ${pkg.name} must publish with publishConfig.access=public`);
    }
    if (!(await Bun.file(`${pkg.dist.cwdPath}/README.md`).exists())) {
      throw new Error(`[package] README.md is missing from dist package ${pkg.name}`);
    }
    if (!(await Bun.file(`${pkg.dist.cwdPath}/README.ko.md`).exists())) {
      throw new Error(`[package] README.ko.md is missing from dist package ${pkg.name}`);
    }
    const binEntries =
      typeof pkgJson.bin === "string" ? [pkgJson.bin] : Object.values((pkgJson.bin ?? {}) as Record<string, string>);
    if (binEntries.some((binPath) => binPath.endsWith(".ts"))) {
      throw new Error(`[package] ${pkg.name} dist bin entries must not point at TypeScript sources`);
    }
    if (pkg.name === "akanjs") {
      const exports = pkgJson.exports as Record<string, unknown> | undefined;
      const rootExport = exports?.["."] as { types?: string } | undefined;
      if (!rootExport?.types?.startsWith("./types/")) {
        throw new Error("[package] akanjs dist exports must point type declarations at ./types");
      }
    }
    await this.#verifyDistExportsReachable(pkg, peerExportsMaps);
    const packOutput = await pkg.workspace.spawn("npm", ["pack", "--dry-run", "--json", pkg.dist.cwdPath], {
      cwd: pkg.workspace.workspaceRoot,
    });
    const [packResult] = JSON.parse(packOutput) as Array<{ files?: unknown[]; size?: number }>;
    return {
      name: pkg.name,
      version: pkgJson.version,
      files: packResult?.files?.length ?? 0,
      size: packResult?.size ?? 0,
    };
  }

  async verifyAkanPublishPackages(workspace: Workspace) {
    const pkgs = PackageRunner.publishableAkanPackages.map((pkgName) => PkgExecutor.from(workspace, pkgName));
    // Built up front so each package can resolve specifiers that point at its siblings, not just itself.
    const peerExportsMaps = new Map<string, PackageExportsMap>();
    for (const pkg of pkgs) {
      if (!(await Bun.file(`${pkg.dist.cwdPath}/package.json`).exists())) continue;
      peerExportsMaps.set(pkg.name, await PackageExportsMap.from(pkg.dist.cwdPath));
    }
    const results = [];
    for (const pkg of pkgs) {
      results.push(await this.verifyDistPackage(pkg, { peerExportsMaps }));
    }
    return results;
  }

  async #copyPackageReadmes(pkg: Pkg) {
    await Promise.all(
      ["README.md", "README.ko.md"].map((fileName) => pkg.cp(fileName, `${pkg.dist.cwdPath}/${fileName}`)),
    );
  }

  async updateWorskpaceRootPackageJson(workspace: Workspace, rootPackageJson: PackageJson) {
    const templatePath = "pkgs/@akanjs/cli/templates/workspaceRoot/package.json.template";
    const pkgJsonTemplate = (await workspace.readJson(templatePath)) as PackageJson;
    const { dependencies = {}, devDependencies = {} } = pkgJsonTemplate;
    const newRootPackageJson = {
      ...pkgJsonTemplate,
      dependencies: Object.fromEntries(
        Object.entries(dependencies).map(([key, value]) => [key, rootPackageJson.dependencies?.[key] ?? value]),
      ),
      devDependencies: Object.fromEntries(
        Object.entries(devDependencies).map(([key, value]) => [key, rootPackageJson.devDependencies?.[key] ?? value]),
      ),
    };
    await workspace.writeJson(templatePath, newRootPackageJson);
  }
}
