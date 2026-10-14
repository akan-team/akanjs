import { mkdir, writeFile } from "node:fs/promises";
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
import { Ed25519Key } from "akanjs/server/ed25519Key";
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
  //* The private key never reaches stdout: a terminal's scrollback and an agent's transcript both keep what it prints.
  async machineKeygen(workspace: Workspace, out: string) {
    const file = path.resolve(workspace.workspaceRoot, out);
    const { privatePem, publicKey } = Ed25519Key.generate();
    await mkdir(path.dirname(file), { recursive: true });
    try {
      await writeFile(file, privatePem, { mode: 0o600, flag: "wx" });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST")
        throw new Error(`${file} exists; machine-keygen never overwrites a key. Name another file.`);
      throw error;
    }
    return { file, publicKey };
  }

  async generateAgentRules(
    workspace: Workspace,
    { overwrite = false, cursorRules = true }: { overwrite?: boolean; cursorRules?: boolean } = {},
  ) {
    const [appNames] = await workspace.getExecs();
    const dict = { repoName: workspace.repoName, appName: appNames[0] ?? "app" };
    const templates = [
      [".", "workspaceRoot/AGENTS.md.template"],
      [".", "workspaceRoot/CLAUDE.md.template"],
      ...(cursorRules ? [[".cursor/rules", "workspaceRoot/.cursor/rules/akan.mdc.template"]] : []),
    ];
    const created = [];
    for (const [basePath, template] of templates)
      created.push(...(await workspace.applyTemplate({ basePath, template, dict, overwrite })));
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
    const found = await this.#findPackageJson("@akanjs/cli", [
      path.join(import.meta.dir, "../package.json"),
      path.join(import.meta.dir, "package.json"),
      path.join(path.dirname(Bun.main), "package.json"),
    ]);
    return found ?? { name: "@akanjs/cli", version: "0.0.0", description: "@akanjs/cli" };
  }

  async #getAkanPackageJson(): Promise<PackageJson> {
    const ancestors: string[] = [];
    for (let current = import.meta.dir, depth = 0; depth < 6; depth++) {
      ancestors.push(path.join(current, "package.json"));
      if (path.dirname(current) === current) break;
      current = path.dirname(current);
    }
    const found = await this.#findPackageJson("akanjs", [
      path.join(import.meta.dir, "../../../akanjs/package.json"),
      path.join(process.cwd(), "pkgs/akanjs/package.json"),
      path.join(path.dirname(Bun.main), "node_modules/akanjs/package.json"),
      ...ancestors,
    ]);
    if (!found) throw new Error(`[workspace] failed to locate akanjs package.json from ${import.meta.dir}`);
    return found;
  }

  async #findPackageJson(name: string, candidates: string[]): Promise<PackageJson | null> {
    try {
      candidates.unshift(Bun.resolveSync(`${name}/package.json`, import.meta.dir));
    } catch {
      // Source builds can run before the package is linked into node_modules.
    }
    for (const packageJsonPath of candidates) {
      if (!(await Bun.file(packageJsonPath).exists())) continue;
      const packageJson = await FileSys.readJson<PackageJson>(packageJsonPath);
      if (packageJson.name === name) return packageJson;
    }
    return null;
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
      //? Biome caps output at 20 by default, so a list whose mix merely changed reads as progress.
      `--max-diagnostics=${maxDiagnostics > 0 ? maxDiagnostics : "none"}`,
      //? Pinned: without it a malformed biome.json makes Biome fall back to discovery and name the wrong file.
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

  // Agents trust the committed index, so a silent drift from the sources becomes a loud diagnostic here.
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

  // A look with nothing to pick (no 2+ value axis, no boolean flag) is not a recipe, only an indirection.
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

  // Contrast only: the vocabulary closure is the grit plugins' job, but contrast is arithmetic no lint pattern expresses.
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
