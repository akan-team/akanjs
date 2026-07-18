import path from "node:path";
import { type Exec, FileSys, type PackageJson, runner, type Workspace, WorkspaceExecutor } from "@akanjs/devkit";
import { getLatestPackageVersion, getNpmRegistryUrl } from "../npmRegistry";

const defaultWorkspacePeerDependencies = new Set([
  "@react-spring/web",
  "@use-gesture/react",
  "chance",
  "croner",
  "daisyui",
  "react",
  "react-dom",
  "react-icons",
  "react-refresh",
  "react-server-dom-webpack",
  "react-spring",
  "scheduler",
  "tailwind-scrollbar",
  "tailwindcss",
  "typescript",
]);

export class WorkspaceRunner extends runner("workspace") {
  async generateAgentRules(
    workspace: Workspace,
    { overwrite = false, cursorRules = true }: { overwrite?: boolean; cursorRules?: boolean } = {},
  ) {
    const [appNames] = await workspace.getExecs();
    const dict = {
      repoName: workspace.repoName,
      appName: appNames[0] ?? "app",
    };
    const created = await workspace.applyTemplate({
      basePath: ".",
      template: "workspaceRoot/AGENTS.md.template",
      dict,
      overwrite,
    });

    // CLAUDE.md only imports AGENTS.md so Claude Code shares the same source of truth.
    created.push(
      ...(await workspace.applyTemplate({
        basePath: ".",
        template: "workspaceRoot/CLAUDE.md.template",
        dict,
        overwrite,
      })),
    );

    if (!cursorRules) return created;

    return [
      ...created,
      ...(await workspace.applyTemplate({
        basePath: ".cursor/rules",
        template: "workspaceRoot/.cursor/rules/akan.mdc.template",
        dict,
        overwrite,
      })),
    ];
  }

  async createWorkspace(
    repoName: string,
    appName: string,
    {
      dirname = ".",
      init = true,
      akanVersion,
      registryUrl,
      owner = "",
    }: { dirname?: string; init?: boolean; akanVersion: string; registryUrl?: string; owner?: string },
  ) {
    const cwdPath = process.cwd();
    const workspaceRoot = path.join(cwdPath, dirname, repoName);
    const normalizedRegistryUrl = registryUrl ? getNpmRegistryUrl(registryUrl) : undefined;

    // 1. create root files
    const workspace = WorkspaceExecutor.fromRoot({ workspaceRoot, repoName });
    const templateSpinner = workspace.spinning(`Creating workspace template files in ${dirname}/${repoName}...`);
    const [latestBiomeVersion, latestTypesBunVersion] = await Promise.all([
      getLatestPackageVersion("@biomejs/biome", "latest", normalizedRegistryUrl),
      getLatestPackageVersion("@types/bun", "latest", normalizedRegistryUrl),
    ]);
    await workspace.applyTemplate({
      basePath: ".",
      template: "workspaceRoot",
      dict: { repoName, appName, serveDomain: "localhost", owner },
    });
    if (normalizedRegistryUrl) await workspace.writeFile(".npmrc", `registry=${normalizedRegistryUrl}/\n`);
    templateSpinner.succeed(`Workspace files created in ${dirname}/${repoName}`);
    // 2. update default package.json dependencies
    const [rootPackageJson, peerDependencies] = await Promise.all([
      workspace.getPackageJson(),
      this.#getAkanPeerDependencies(),
    ]);
    const { typescript, ...dependencies } = peerDependencies;
    const packageJson: PackageJson = {
      ...rootPackageJson,
      dependencies: {
        ...rootPackageJson.dependencies,
        ...dependencies,
        akanjs: akanVersion,
      },
      devDependencies: {
        ...rootPackageJson.devDependencies,
        "@biomejs/biome": latestBiomeVersion,
        "@types/bun": latestTypesBunVersion,
        "@akanjs/devkit": akanVersion,
        ...(typescript ? { typescript } : {}),
      },
    };
    await workspace.setPackageJson(packageJson);

    // 3. bun install
    if (init) {
      const installSpinner = workspace.spinning("Installing dependencies with bun...");
      await workspace.spawn("bun", ["install"]);
      installSpinner.succeed("Dependencies installed with bun");
    }

    return workspace;
  }

  async #getAkanPeerDependencies(): Promise<Record<string, string>> {
    const [packageJson, cliPackageJson] = await Promise.all([this.#getAkanPackageJson(), this.#getCliPackageJson()]);
    const dependencyVersions = {
      ...packageJson.dependencies,
      ...packageJson.peerDependencies,
      ...cliPackageJson.dependencies,
    };
    return Object.fromEntries(
      Object.entries(dependencyVersions).filter(([dependency]) => defaultWorkspacePeerDependencies.has(dependency)),
    );
  }

  async #getCliPackageJson(): Promise<PackageJson> {
    const packageJsonCandidates = [
      path.join(import.meta.dir, "../package.json"),
      path.join(import.meta.dir, "package.json"),
      path.join(path.dirname(Bun.main), "package.json"),
    ];
    try {
      packageJsonCandidates.unshift(Bun.resolveSync("@akanjs/cli/package.json", import.meta.dir));
    } catch {
      // Source builds can execute before the package is linked into node_modules.
    }
    for (const packageJsonPath of packageJsonCandidates) {
      if (!(await Bun.file(packageJsonPath).exists())) continue;
      const packageJson = await FileSys.readJson<PackageJson>(packageJsonPath);
      if (packageJson.name === "@akanjs/cli") return packageJson;
    }
    return { name: "@akanjs/cli", version: "0.0.0", description: "@akanjs/cli" };
  }

  async #getAkanPackageJson(): Promise<PackageJson> {
    const packageJsonCandidates = [
      path.join(import.meta.dir, "../../../akanjs/package.json"),
      path.join(process.cwd(), "pkgs/akanjs/package.json"),
      path.join(path.dirname(Bun.main), "node_modules/akanjs/package.json"),
    ];
    try {
      packageJsonCandidates.unshift(Bun.resolveSync("akanjs/package.json", import.meta.dir));
    } catch {
      // Source workspaces usually resolve Akan packages through tsconfig paths instead of node_modules.
    }
    for (const packageJsonPath of packageJsonCandidates) {
      if (!(await Bun.file(packageJsonPath).exists())) continue;
      const packageJson = await FileSys.readJson<PackageJson>(packageJsonPath);
      if (packageJson.name === "akanjs") return packageJson;
    }

    let current = import.meta.dir;
    for (let depth = 0; depth < 6; depth++) {
      const packageJsonPath = path.join(current, "package.json");
      if (await Bun.file(packageJsonPath).exists()) {
        const packageJson = await FileSys.readJson<PackageJson>(packageJsonPath);
        if (packageJson.name === "akanjs") return packageJson;
      }
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
    throw new Error(`[workspace] failed to locate akanjs package.json from ${import.meta.dir}`);
  }

  async lint(exec: Exec, workspace: Workspace, { fix = true }: { fix?: boolean } = {}) {
    await workspace.spawn("./node_modules/.bin/biome", [
      "check",
      ...(fix ? ["--write"] : []),
      "--no-errors-on-unmatched",
      exec.cwdPath,
    ]);
  }
  async writeTopLevelEnv(workspace: Workspace, devProjectId: string) {
    await workspace.writeFile(
      ".env",
      `AKAN_WORKSPACE_ID=${devProjectId}

# organization configuration, no need to change
AKAN_PUBLIC_REPO_NAME=${workspace.repoName}

# serve domain, it changes the domain of the server.
AKAN_PUBLIC_SERVE_DOMAIN=try.akanjs.com

# development branch, debug, develop, main, etc. mainly it changes databases.
AKAN_PUBLIC_ENV=local

# local, cloud, edge it changes the connection point of the clients.
AKAN_PUBLIC_OPERATION_MODE=local

# log level, debug, info, warn, error
AKAN_PUBLIC_LOG_LEVEL=debug
`,
    );
  }
}
