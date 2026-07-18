import path from "node:path";
import {
  FileSys,
  type PackageJson,
  type Pkg,
  PkgExecutor,
  runner,
  TypeScriptDependencyScanner,
  type Workspace,
} from "@akanjs/devkit";
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

  async verifyDistPackage(pkg: Pkg): Promise<{ name: string; version: string; files: number; size: number }> {
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
    const results = [];
    for (const pkgName of PackageRunner.publishableAkanPackages) {
      results.push(await this.verifyDistPackage(PkgExecutor.from(workspace, pkgName)));
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
