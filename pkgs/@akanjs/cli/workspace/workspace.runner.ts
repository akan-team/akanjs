import path from "node:path";
import { collectScopeRecipeSources, extractAgentBlock, renderScopeAgentBlock } from "@akanjs/devkit/agentsIndex";
import { biomeVersion } from "@akanjs/devkit/biomeBase";
import { type Exec, runner, type Workspace } from "@akanjs/devkit/commandDecorators";
import { SysExecutor, WorkspaceExecutor } from "@akanjs/devkit/executors";
import { FileSys } from "@akanjs/devkit/fileSys";
import {
  countBlocking,
  formatStyleContract,
  type StyleContractViolations,
} from "@akanjs/devkit/frontendBuild/styleContract";
import { ThemeValidator } from "@akanjs/devkit/frontendBuild/themeValidator";
import { Linter } from "@akanjs/devkit/linter";
import { collectRecipeSources, type RecipeSource, scanRecipes } from "@akanjs/devkit/recipeScanner";
import type { PackageJson } from "@akanjs/devkit/types";
import { getLatestPackageVersion, getNpmRegistryUrl } from "../npmRegistry";

const defaultWorkspacePeerDependencies = new Set([
  "@react-spring/web",
  "@use-gesture/react",
  "chance",
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

/** High enough that a real cleanup pass sees every finding at once; `0` on the CLI lifts the cap entirely. */
export const defaultMaxDiagnostics = 200;

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

    if (cursorRules)
      created.push(
        ...(await workspace.applyTemplate({
          basePath: ".cursor/rules",
          template: "workspaceRoot/.cursor/rules/akan.mdc.template",
          dict,
          overwrite,
        })),
      );

    return created;
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
    const latestTypesBunVersion = await getLatestPackageVersion("@types/bun", "latest", normalizedRegistryUrl);
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
        "@biomejs/biome": biomeVersion,
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

  async lint(
    exec: Exec,
    workspace: Workspace,
    { fix = true, maxDiagnostics = defaultMaxDiagnostics }: { fix?: boolean; maxDiagnostics?: number } = {},
  ) {
    const configPath = await WorkspaceRunner.resolveBiomeConfigPath(workspace);
    await workspace.spawn(`./node_modules/.bin/${Linter.biomeBinName}`, [
      "check",
      ...(fix ? ["--write"] : []),
      "--no-errors-on-unmatched",
      //? Biome caps output at 20 diagnostics by default, which reads as "only 20 problems left" while the
      //? rest are hidden — a shrinking list then looks like progress when the mix of findings merely changed.
      `--max-diagnostics=${maxDiagnostics > 0 ? maxDiagnostics : "none"}`,
      //? Pinning the config makes a malformed biome.json fail as a parse error on the offending line. Without
      //? it Biome 2.5.12 falls back to discovery and reports whatever nested config the walk finds first —
      //? typically inside a directory `files.includes` excludes, which names the wrong file entirely.
      ...(configPath ? ["--config-path", configPath] : []),
      exec.cwdPath,
    ]);
    await this.#enforceStyleContract(exec);
    await this.#enforceRecipeGate(exec);
    await this.#enforceAgentsIndex(exec);
  }

  /** `biome.json` first, mirroring Biome's own precedence; `biome.jsonc` is the one that may carry comments. */
  static async resolveBiomeConfigPath(workspace: Workspace): Promise<string | null> {
    for (const fileName of ["biome.json", "biome.jsonc"]) {
      const configPath = path.join(workspace.workspaceRoot, fileName);
      if (await Bun.file(configPath).exists()) return configPath;
    }
    return null;
  }

  /**
   * 스코프 에이전트 색인 신선도: 소스 재스캔 결과와 apps|libs/<name>/AGENTS.md 의 managed block 이
   * 다르면 실패시킨다. 색인이 소스와 어긋난 채 커밋되면 에이전트가 색인을 믿고 틀리므로("추가했는데
   * 목록에 없어 안 씀"), 조용한 어긋남을 CI 에서 시끄러운 진단으로 바꾸는 것이 이 게이트의 존재 이유다.
   */
  async #enforceAgentsIndex(exec: Exec) {
    if (!(exec instanceof SysExecutor)) return;
    const scope = { type: exec.type, name: exec.name };
    const scanInfo = await exec.scan({ write: false });
    const sources = await collectScopeRecipeSources(
      exec.workspace.workspaceRoot,
      scope,
      scanInfo.getScanResult().libDeps,
    );
    const expected = renderScopeAgentBlock(scope, scanRecipes(sources));
    const existing = (await exec.exists("AGENTS.md")) ? await exec.readFile("AGENTS.md") : null;
    const actual = existing ? extractAgentBlock(existing) : null;
    if (actual === expected.trim()) return;
    throw new Error(
      `[agentsIndex] ${scope.type}s/${scope.name}/AGENTS.md 의 recipe 색인이 소스와 다릅니다(stale). ` +
        `\`akan sync ${scope.name}\` 을 실행해 재생성하세요.`,
    );
  }

  /**
   * recipe 자격 게이트: 고를 옵션(값 2개 이상인 variant 축, 또는 불리언 플래그)이 없는 look 은 recipe 가
   * 아니다 — 함수로 감쌀 이유가 없어 간접층만 늘고, 컴포넌트/상수와의 경계가 무너진다(docsList 사례).
   * 자기 마크업이 있으면 컴포넌트로, 남의 컴포넌트 className 에 주입하면 공유 클래스 상수로 승격시킨다.
   */
  async #enforceRecipeGate(exec: Exec) {
    const cwdPath = exec.cwdPath;
    if (!cwdPath) return;
    const uiDir = path.join(cwdPath, "ui");
    const sources: RecipeSource[] = [
      ...(await collectRecipeSources(uiDir, "ui/Recipe")),
      ...(await collectRecipeSources(uiDir, "ui/recipe", "recipe")),
    ];
    if (sources.length === 0) return;
    const offenders = scanRecipes(sources).filter(
      (recipe) =>
        !Object.values(recipe.variants).some(
          (values) => values.length >= 2 || (values.length === 1 && values[0] === "true"),
        ),
    );
    if (offenders.length === 0) return;
    throw new Error(
      `[recipeGate] variant-less recipe(s): ${offenders.map((recipe) => recipe.name).join(", ")}\n` +
        "고를 옵션 없는 look 은 recipe 로 두지 마세요 — 자기 마크업이 있으면 컴포넌트로 승격하고, " +
        "다른 컴포넌트의 className 에 주입하는 스킨이면 공유 클래스 상수로 두세요.",
    );
  }

  /**
   * Enforces the WCAG contrast contract, at error level, as part of lint.
   *
   * Only contrast. The vocabulary closure is caught by the grit plugins in the biome run above, so it is
   * not re-scanned here; contrast is arithmetic over resolved token values, which no lint pattern can
   * express, so this is its only home.
   */
  async #enforceStyleContract(exec: Exec) {
    const cwdPath = exec.cwdPath;
    if (!cwdPath) return;
    const stylesCssPath = path.join(cwdPath, "page", "styles.css");
    if (!(await Bun.file(stylesCssPath).exists())) return;
    const violations: StyleContractViolations = {
      theme: new ThemeValidator().validate(await Bun.file(stylesCssPath).text()),
    };
    const blocking = countBlocking(violations);
    if (blocking === 0) return;
    throw new Error(
      `[themeValidator] ${blocking} blocking contrast violation(s):\n${formatStyleContract(violations)}\n\n` +
        "Raise the foreground/background contrast of these theme token values to the WCAG threshold.",
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
