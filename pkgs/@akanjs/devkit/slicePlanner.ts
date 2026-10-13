import type { AppExecutor, WorkspaceExecutor } from "./executors";
import { AppInfo } from "./scanInfo";
import type { PackageJson } from "./types";

export interface SlicePlan {
  app: string;
  /** Transitive lib closure, in mount order. */
  libs: string[];
  appFiles: string[];
  libFiles: Record<string, string[]>;
  rootFiles: string[];
  /** Root manifest for a workspace holding only this slice, with the dependencies it does not use pruned. */
  packageJson: PackageJson;
  /** What this slice imports, so a caller serving several apps can union them before pruning. */
  requiredDependencies: string[];
  /** Root dependencies nothing in the slice imports — left out of `packageJson`. */
  unusedDependencies: string[];
  warnings: string[];
}

export class SlicePlanner {
  /** Root entries owned by an app, a lib or an in-tree package rather than by the workspace shell. */
  static readonly memberDirs = ["apps", "libs", "pkgs"];
  /** Never pruned: the toolchain a workspace runs on, which no source file imports. */
  static readonly toolchainDependencies = [
    "@akanjs/cli",
    "@akanjs/devkit",
    "@biomejs/biome",
    "@types/bun",
    "akanjs",
    "tailwindcss",
    "typescript",
  ];
  static readonly akanPackages = ["akanjs", "@akanjs/devkit", "@akanjs/cli"];

  // The akan packages' peerDependencies (react, the RSC runtime, ioredis, postgres, bullmq): the framework imports
  // them but no workspace source names them, so no scan can find them.
  static async #frameworkPeers(workspace: WorkspaceExecutor) {
    const peers = new Set<string>();
    let found = false;
    for (const akanPackage of SlicePlanner.akanPackages) {
      for (const prefix of ["node_modules", "pkgs"]) {
        const manifestPath = `${prefix}/${akanPackage}/package.json`;
        if (!(await workspace.exists(manifestPath))) continue;
        const manifest = (await workspace.readJson(manifestPath)) as PackageJson;
        for (const peer of Object.keys(manifest.peerDependencies ?? {})) peers.add(peer);
        found = true;
        break;
      }
    }
    return found ? peers : null;
  }

  static rootEntriesOf(rootFiles: string[]) {
    return [...new Set(rootFiles.map((file) => file.split("/")[0] ?? file))].sort();
  }

  /** DefinitelyTyped's name for a package: `lodash` -> `@types/lodash`, `@scope/x` -> `@types/scope__x`. */
  static typesPackageOf(dependency: string) {
    return dependency.startsWith("@") ? `@types/${dependency.slice(1).replace("/", "__")}` : `@types/${dependency}`;
  }

  // `@types/x` is kept alongside `x` since nothing imports it by name; `workspaces` is dropped because a slice
  // consumes akanjs from the registry.
  static async pruneDependencies(
    workspace: WorkspaceExecutor,
    rootPackageJson: PackageJson,
    required: Iterable<string>,
  ) {
    const peers = await SlicePlanner.#frameworkPeers(workspace);
    const { workspaces: _workspaces, ...rest } = rootPackageJson;
    //* Without the peer list every peer looks unused, and pruning it breaks the server at its first redis or
    //* postgres call.
    if (!peers)
      return {
        packageJson: rest as PackageJson,
        pruned: [],
        warnings: [`dependencies carried whole — none of ${SlicePlanner.akanPackages.join(", ")} is installed`],
      };
    const keep = new Set([...SlicePlanner.toolchainDependencies, ...peers, ...required]);
    for (const dependency of [...keep]) keep.add(SlicePlanner.typesPackageOf(dependency));
    const pick = (entries: Record<string, string> | undefined) =>
      Object.fromEntries(Object.entries(entries ?? {}).filter(([name]) => keep.has(name)));
    const patched = (rootPackageJson.patchedDependencies ?? {}) as Record<string, string>;
    const packageJson = {
      ...rest,
      dependencies: pick(rootPackageJson.dependencies),
      devDependencies: pick(rootPackageJson.devDependencies),
      //? A key here is `name@version`, and bun fails the install when a patch names a package the
      //? manifest no longer asks for.
      ...(Object.keys(patched).length
        ? {
            patchedDependencies: Object.fromEntries(
              Object.entries(patched).filter(([spec]) => keep.has(spec.slice(0, spec.lastIndexOf("@")))),
            ),
          }
        : {}),
    } as PackageJson;
    const pruned = Object.keys({ ...rootPackageJson.dependencies, ...rootPackageJson.devDependencies })
      .filter((name) => !keep.has(name))
      .sort();
    return { packageJson, pruned, warnings: [] as string[] };
  }

  #app: AppExecutor;
  constructor(app: AppExecutor) {
    this.#app = app;
  }

  async #untrackedFiles(paths: string[]) {
    const [tracked, all] = await Promise.all([
      this.#app.workspace.listGitFiles(paths),
      this.#app.workspace.listGitFiles(paths, { untracked: true }),
    ]);
    const trackedSet = new Set(tracked);
    return all.filter((file) => !trackedSet.has(file));
  }

  #isMemberFile(file: string) {
    return SlicePlanner.memberDirs.includes(file.split("/")[0] ?? "");
  }

  static #requiredDependencies(appInfo: AppInfo) {
    const scanResults = [
      appInfo.getScanResult(),
      ...[...appInfo.getLibInfos().values()].map((lib) => lib.getScanResult()),
    ];
    return new Set([
      ...scanResults.flatMap((scanResult) => [
        ...scanResult.dependencies,
        ...scanResult.devDependencies,
        ...scanResult.pkgDeps,
      ]),
    ]);
  }

  async #patchWarnings(packageJson: PackageJson) {
    const patchedDependencies = (packageJson.patchedDependencies ?? {}) as Record<string, string>;
    const missing = (
      await Promise.all(
        Object.entries(patchedDependencies).map(async ([spec, patchPath]) =>
          (await this.#app.workspace.exists(patchPath)) ? null : `${spec} -> ${patchPath}`,
        ),
      )
    ).filter((entry): entry is string => !!entry);
    return missing.length ? [`patchedDependencies references a missing patch file: ${missing.join(", ")}`] : [];
  }

  async plan(): Promise<SlicePlan> {
    const appInfo = await AppInfo.fromExecutor(this.#app);
    const libs = appInfo.getLibs();
    const slicePaths = [`apps/${this.#app.name}`, ...libs.map((lib) => `libs/${lib}`)];

    const [appFiles, allTracked, untracked, rootPackageJson] = await Promise.all([
      this.#app.workspace.listGitFiles([`apps/${this.#app.name}`]),
      this.#app.workspace.listGitFiles(["."]),
      this.#untrackedFiles(slicePaths),
      this.#app.workspace.getPackageJson(),
    ]);

    const libFiles = Object.fromEntries(
      await Promise.all(
        libs.map(async (lib) => [lib, await this.#app.workspace.listGitFiles([`libs/${lib}`])] as const),
      ),
    );
    const rootFiles = allTracked.filter((file) => !this.#isMemberFile(file));

    const required = SlicePlanner.#requiredDependencies(appInfo);
    const {
      packageJson,
      pruned,
      warnings: manifestWarnings,
    } = await SlicePlanner.pruneDependencies(this.#app.workspace, rootPackageJson, required);

    const warnings = [
      ...(untracked.length
        ? [`${untracked.length} untracked file(s) under the slice paths: ${untracked.join(", ")}`]
        : []),
      ...(rootPackageJson.workspaces ? ["root `workspaces` dropped — a slice consumes akanjs from the registry"] : []),
      ...manifestWarnings,
      ...(await this.#patchWarnings(rootPackageJson)),
    ];

    return {
      app: this.#app.name,
      libs,
      appFiles,
      libFiles,
      rootFiles,
      packageJson,
      requiredDependencies: [...required].sort(),
      unusedDependencies: pruned,
      warnings,
    };
  }
}

export function formatSlicePlan(plan: SlicePlan) {
  const libCounts = Object.entries(plan.libFiles).map(([lib, files]) => `  - libs/${lib}: ${files.length} files`);
  const sections = [
    "Akan Slice Plan",
    `app: ${plan.app} (apps/${plan.app}: ${plan.appFiles.length} files)`,
    `libs: ${plan.libs.length ? plan.libs.join(", ") : "(none)"}`,
    ...libCounts,
    `workspace shell: ${plan.rootFiles.length} files across ${SlicePlanner.rootEntriesOf(plan.rootFiles).join(", ")}`,
    "",
    `Root dependencies this slice does not use (${plan.unusedDependencies.length}) — pruned:`,
    "",
    ...(plan.unusedDependencies.length ? plan.unusedDependencies.map((dep) => `  - ${dep}`) : ["  (none)"]),
    "",
    `Warnings (${plan.warnings.length}):`,
    "",
    ...(plan.warnings.length ? plan.warnings.map((warning) => `  - ${warning}`) : ["  (none)"]),
  ];
  return sections.join("\n");
}
