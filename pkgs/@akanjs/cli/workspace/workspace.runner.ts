import path from "node:path";
import {
  AppExecutor,
  countBlocking,
  type Exec,
  FileSys,
  formatStyleContract,
  type PackageJson,
  runner,
  type StyleContractViolations,
  StyleGuard,
  ThemeValidator,
  type Workspace,
  WorkspaceExecutor,
} from "@akanjs/devkit";
import { getLatestPackageVersion, getNpmRegistryUrl } from "../npmRegistry";

const defaultWorkspacePeerDependencies = new Set([
  "@react-spring/web",
  "@use-gesture/react",
  "chance",
  "croner",
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
    await this.#enforceStyleContract(exec);
  }

  /**
   * CI=error: 어휘 폐쇄(styleGuard) + WCAG 콘트라스트(themeValidator) 계약을 lint 에서 강제한다.
   * 순수 함수라 CSS 파이프라인 없이 타깃 소스를 직접 스캔한다. 위반 시 throw 로 lint 를 실패시킨다.
   */
  async #enforceStyleContract(exec: Exec) {
    const cwdPath = exec.cwdPath;
    if (!cwdPath) return;
    // 앱 단위 opt-out: 어휘 폐쇄 미도입 앱(daisyUI 존치 등)은 skip. lib/pkg 는 공유 코드라 항상 강제.
    if (exec instanceof AppExecutor) {
      const config = await exec.getConfig();
      if (!config.vocabularyClosure) return;
    }
    const files: { path: string; content: string }[] = [];
    try {
      const glob = new Bun.Glob("**/*.{tsx,ts,jsx,js}");
      for await (const abs of glob.scan({ cwd: cwdPath, absolute: true })) {
        if (/[\\/](node_modules|\.akan|dist)[\\/]/.test(abs) || /\.(test|spec)\.[jt]sx?$/.test(abs)) continue;
        files.push({
          path: abs,
          content: await Bun.file(abs)
            .text()
            .catch(() => ""),
        });
      }
    } catch {
      return; // 경로 없음/스캔 불가 → 스킵
    }
    const style = new StyleGuard().run(files.filter((file) => file.content.length > 0));
    const stylesCssPath = path.join(cwdPath, "page", "styles.css");
    const theme = (await Bun.file(stylesCssPath).exists())
      ? new ThemeValidator().validate(await Bun.file(stylesCssPath).text())
      : [];
    const violations: StyleContractViolations = { style, theme };
    const blocking = countBlocking(violations);
    if (blocking === 0) return;
    throw new Error(
      `[styleGuard] ${blocking} blocking style-contract violation(s):\n${formatStyleContract(violations)}\n\n` +
        "시맨틱 토큰으로 교체하거나, 정당한 경우 사유와 함께 styleguard-disable 지시어로 예외 처리하세요.",
    );
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
