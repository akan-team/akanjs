import path from "node:path";
import { toError } from "akanjs/common";
import { BUILD_ENV_FILE } from "akanjs/server/lifecycle/buildEnv";
import type { BunPlugin } from "bun";
import { ProductionLockfile } from "../akanConfig/productionLockfile";
import type { App } from "../commandDecorators";
import { parseEnvFile, WorkspaceExecutor } from "../executors";
import {
  AllRoutesBuilder,
  CsrArtifactBuilder,
  FontPruner,
  NARROWABLE_VENDOR_SPECIFIERS,
  precompressArtifacts,
  SsrBaseArtifactBuilder,
  VendorImportScanner,
} from "../frontendBuild";
import { createServerEnvPlugin } from "../transforms/serverEnvPlugin";
import { ServerEnvProfile } from "../transforms/serverEnvProfile";
import { ProjectTypecheck } from "../typecheck/projectTypecheck";
import { Spinner } from "../util/spinner";
import type { BaseDevEnv, PackageJson } from "../workspace/types";
import type {
  ApplicationBuildPhaseResult,
  ApplicationBuildProgressReporter,
  ApplicationBuildResult,
} from "./applicationBuildReporter";
import { RouteJsBudget, type RouteJsBudgetMode, type RouteJsBudgetStatus, type RouteJsSize } from "./routeJsBudget";

export interface TypecheckOptions {
  clean?: boolean;
  incremental?: boolean;
  /** The app's own tests, specs and `script/` files too (`akan typecheck`); a build leaves them out. */
  tests?: boolean;
  report?: "pretty" | "records";
}

export type BuildPhaseId =
  | "prepare"
  | "typecheck"
  | "backend"
  | "ssr"
  | "csr"
  | "assets"
  | "compress"
  | "budget"
  | "metadata";

type RouteJsMeasure = RouteJsBudgetStatus & { sizes: RouteJsSize[] };

export type BuildPhaseResult = ApplicationBuildPhaseResult & { id: BuildPhaseId };
export type BuildResult = ApplicationBuildResult;
export type BuildProgressReporter = ApplicationBuildProgressReporter;
export interface ApplicationBuildRunnerOptions {
  fast?: boolean;
  /** `akan verify`'s build stops after the SSR route compile and the route JS budget, so its `dist/` is not deployable. */
  verify?: boolean;
  reporter?: BuildProgressReporter;
  /** The backend env the build is for, when it is not the workspace's own (a mobile or desktop build's `--env`). */
  environment?: string;
  /** Bundles `env/env.server.<environment>.<profile>.ts`, which may hold no secret, in place of the environment's file. */
  profile?: string;
  /**
   * `enforce` fails on an overage, a route with no entry, or a missing or unreadable akan.budget.json; `update` and
   * `raise` rewrite the file first; `report` only warns.
   */
  budget?: RouteJsBudgetMode;
}
export interface BuildOptions {
  spinner?: boolean;
}
export interface BuildPhaseRunOptions {
  spinner?: boolean;
}

const BUILD_PHASE_EMOJIS: Record<BuildPhaseId, string> = {
  prepare: "🧹",
  typecheck: "🔎",
  backend: "📦",
  ssr: "🧭",
  csr: "🎨",
  assets: "✂️",
  compress: "🗜️",
  budget: "📏",
  metadata: "📝",
};

const SSR_RENDER_EXTERNALS = [
  "react",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
  "react-dom",
  "react-dom/server.browser",
  "react-server-dom-webpack",
  "react-server-dom-webpack/server.node",
  "react-server-dom-webpack/client.node",
  "react-server-dom-webpack/client.browser",
] as const;

// Mangling renames classes, and `this.constructor.name` names loggers, exceptions and guards; `minify.keepNames`
// is a no-op as of Bun 1.4.2.
export const AKAN_BACKEND_MINIFY = { whitespace: true, syntax: true, identifiers: false } as const;

export const AKAN_OPTIONAL_BACKEND_EXTERNALS = ["bullmq", "ioredis", "postgres", "protobufjs"] as const;

export class ApplicationBuildRunner {
  #app: App;
  #fast: boolean;
  #verify: boolean;
  #reporter?: BuildProgressReporter;
  #environment?: string;
  #profile?: string;
  #budget: RouteJsBudgetMode;
  #modulesByRoute?: Record<string, string[]>;
  #spinner?: boolean;
  #startedAt = Date.now();
  #phases: BuildPhaseResult[] = [];

  constructor(
    app: App,
    {
      fast = false,
      verify = false,
      reporter,
      environment,
      profile,
      budget = "report",
    }: ApplicationBuildRunnerOptions = {},
  ) {
    this.#app = app;
    this.#fast = fast || verify;
    this.#verify = verify;
    this.#reporter = reporter;
    this.#environment = environment;
    this.#profile = profile;
    this.#budget = budget;
  }

  get #envDir() {
    return path.join(this.#app.cwdPath, "env");
  }

  //? Bundles bake AKAN_PUBLIC_* from process.env, which lacks `--env` and the defaults an unset repo name or serve
  //? domain takes: a page built otherwise drops the image's tokens as foreign or dials another serve domain.
  #pinImageEnv(baseDevEnv: BaseDevEnv, environment: string) {
    const imageEnv = {
      AKAN_PUBLIC_ENV: environment,
      AKAN_PUBLIC_REPO_NAME: baseDevEnv.repoName,
      AKAN_PUBLIC_SERVE_DOMAIN: baseDevEnv.serveDomain,
    };
    const dotenv = parseEnvFile(path.join(this.#app.workspace.workspaceRoot, ".env"));
    const overridden = Object.entries(imageEnv).filter(([key, value]) => {
      if (!dotenv[key] || dotenv[key] === value || WorkspaceExecutor.publicEnvPin?.[key]) return false;
      return !(key === "AKAN_PUBLIC_ENV" && this.#environment);
    });
    if (overridden.length)
      this.#app.logger.warn(
        `The shell (or a .env.local) outranks the workspace .env: the bundles and the image take ${overridden
          .map(([key, value]) => `${key}=${value} (.env: ${dotenv[key]})`)
          .join(", ")}. Unset it there to build what the .env says.`,
      );
    Object.assign(process.env, imageEnv);
  }

  async build({ spinner = false }: BuildOptions = {}): Promise<BuildResult> {
    // serial build is needed because of Bun.build is unstable for parallel build
    this.#spinner = spinner;
    const { web, assets, baseDevEnv } = await this.#app.getConfig();
    const environment = this.#environment ?? baseDevEnv.env;
    WorkspaceExecutor.assertDeployableEnv(baseDevEnv, environment, "akan build");
    this.#pinImageEnv(baseDevEnv, environment);
    //? Before any phase: a profile that would ship a secret stops the build, not the image after it.
    if (this.#profile)
      await ServerEnvProfile.assertShippable({ envDir: this.#envDir, environment, profile: this.#profile });
    await this.#runPhase("prepare", "Preparing output directory", () => this.#app.prepareCommand("build"));
    if (!this.#fast) await this.#runPhase("typecheck", "Typechecking", () => this.typecheck());
    await this.#runPhase(
      "backend",
      "Compiling backend",
      () => this.#buildBackend(),
      (result) => `${result.entrypoints} entrypoints, ${result.outputs} outputs`,
    );
    await this.#runPhase(
      "ssr",
      "Building SSR route artifacts",
      async () => (web.ssr ? await this.#buildSsr() : null),
      (result) =>
        result
          ? `${result.allRoutes.manifest.routeIds.length} routes, ${result.allRoutes.manifest.knownEntries.length} entries`
          : web.ssr
            ? "skipped"
            : "disabled by akan.config.ts web.ssr",
    );
    if (this.#verify) {
      const routeJs = await this.#runBudgetPhase(environment);
      await this.#app.dist.writeJson("akan.build.json", { profile: "verify", builtAt: new Date().toISOString() });
      return this.#resultOf(environment, routeJs);
    }
    await this.#runPhase(
      "csr",
      "Building CSR assets",
      async () => (web.csr ? await new CsrArtifactBuilder(this.#app, "build").build() : null),
      (result) => result?.outputDir ?? (web.csr ? "skipped" : "disabled by akan.config.ts web.csr"),
    );
    await this.#runPhase(
      "assets",
      "Trimming unread static assets",
      async () => (assets.pruneFonts ? await new FontPruner(this.#app, assets).prune() : null),
      (result) =>
        result
          ? `${result.removed.length} font file(s) dropped, ${ApplicationBuildRunner.formatBytes(result.freedBytes)} freed; ${result.kept.length} kept`
          : "disabled by akan.config.ts assets.pruneFonts",
    );
    await this.#runPhase(
      "compress",
      "Compressing static assets",
      () => precompressArtifacts(this.#app),
      (result) =>
        result.files > 0
          ? `${result.files} files, ${ApplicationBuildRunner.formatBytes(result.inputBytes)} -> gzip ${ApplicationBuildRunner.formatBytes(result.outputBytes)} / br ${ApplicationBuildRunner.formatBytes(result.brotliBytes)}`
          : "no files",
    );
    const routeJs = await this.#runBudgetPhase(environment);
    await this.#runPhase("metadata", "Writing production metadata", () => this.buildAppMeta());
    return this.#resultOf(environment, routeJs);
  }

  #runBudgetPhase(environment: string) {
    return this.#runPhase(
      "budget",
      "Measuring route JS",
      () => this.#measureRouteJs(environment),
      (result) => result?.summary ?? (this.#budget === "off" ? "off for this build" : "no server pages"),
    );
  }

  #resultOf(environment: string, routeJs: RouteJsMeasure | null): BuildResult {
    return {
      phases: this.#phases,
      ...(routeJs ? { routeJs: routeJs.sizes } : {}),
      ...(routeJs?.warnings ? { routeJsWarnings: routeJs.warnings } : {}),
      durationMs: Date.now() - this.#startedAt,
      outputDir: this.#app.dist.cwdPath,
      artifactDir: path.join(this.#app.dist.cwdPath, ".akan/artifact"),
      environment,
    };
  }

  async typecheck(options: TypecheckOptions = {}) {
    await this.#app.getPageKeys({ refresh: true });
    const typecheck = new ProjectTypecheck(
      this.#app.cwdPath,
      this.#app.workspace.workspaceRoot,
      this.#app.getCommandEnv(),
    );
    //* TypeScript's `include` globs do not cross a symlink, so synced lib pages need their real path.
    const libPageIncludes = (await this.#app.getPageRoots())
      .filter((root) => root.keyPrefix)
      .flatMap((root) => {
        const rel = path.relative(typecheck.typecheckDir, root.realDir).split(path.sep).join("/");
        return [`${rel}/**/*.ts`, `${rel}/**/*.tsx`];
      });
    await typecheck.run(
      [
        "../../main.ts",
        "../../server.ts",
        "../../client.ts",
        "../../page/**/*.ts",
        "../../page/**/*.tsx",
        ...libPageIncludes,
        ...(options.tests ? ["../../script/**/*.ts"] : []),
        "../../../../pkgs/akanjs/*/types/**/*.d.ts",
      ],
      options,
    );
  }

  async #runPhase<T>(
    id: BuildPhaseId,
    label: string,
    task: () => Promise<T>,
    summarize?: (result: T) => string | undefined,
  ) {
    this.#reporter?.phaseStart?.({ id, label });
    const phaseStartedAt = Date.now();
    const spinner = this.#spinner
      ? new Spinner(label, { prefix: `${BUILD_PHASE_EMOJIS[id]} ${id}` }).start()
      : undefined;
    try {
      const result = await task();
      const phase = { id, label, durationMs: Date.now() - phaseStartedAt, summary: summarize?.(result) };
      this.#phases.push(phase);
      spinner?.succeed(`${label}${phase.summary ? `: ${phase.summary}` : ""}`);
      this.#reporter?.phaseDone?.(phase);
      return result;
    } catch (error) {
      spinner?.fail(`${label} failed`);
      this.#reporter?.phaseFail?.({ id, label }, error);
      throw error;
    }
  }

  async buildAppMeta() {
    const akanConfig = await this.#app.getConfig();
    const environment = this.#environment ?? akanConfig.baseDevEnv.env;
    const packageJson = akanConfig.getProductionPackageJson();
    const lockfile = await this.#pruneLockfile(packageJson);
    const dockerfile = akanConfig.dockerfileFor(environment, { lockfile: lockfile !== null });
    await Promise.all([
      this.#app.dist.writeJson("package.json", packageJson),
      this.#app.dist.writeJson(BUILD_ENV_FILE, akanConfig.getProductionEnv(environment)),
      ...(lockfile !== null
        ? [this.#app.dist.writeFile(`${this.#app.dist.cwdPath}/${ProductionLockfile.fileName}`, lockfile)]
        : []),
      this.#app.dist.writeFile(`${this.#app.dist.cwdPath}/Dockerfile`, dockerfile),
      this.#app.dist.writeJson("akan.build.json", {
        buildId: await this.#resolveBuildId(),
        akanVersion: akanConfig.akanVersion,
        builtAt: new Date().toISOString(),
      }),
    ]);
  }

  async #pruneLockfile(packageJson: PackageJson): Promise<string | null> {
    try {
      return await ProductionLockfile.prune(this.#app.workspace.workspaceRoot, packageJson);
    } catch (error) {
      this.#app.logger.warn(
        `The image installs its dependencies unlocked, at the newest versions package.json allows: ${toError(error).message}`,
      );
      return null;
    }
  }

  //* Read back at runtime as `buildId` on the ops channel; a deployment's own AKAN_BUILD_ID still wins over it there.
  async #resolveBuildId() {
    const fromEnv = process.env.AKAN_BUILD_ID?.trim();
    if (fromEnv) return fromEnv;
    const root = this.#app.workspace.workspaceRoot;
    const sha = Bun.spawnSync(["git", "rev-parse", "--short=12", "HEAD"], { cwd: root, stderr: "ignore" });
    if (sha.exitCode !== 0) return null;
    const dirty = Bun.spawnSync(["git", "status", "--porcelain", "--untracked-files=no"], {
      cwd: root,
      stderr: "ignore",
    });
    const suffix = dirty.exitCode === 0 && dirty.stdout.toString().trim() ? "-dirty" : "";
    return `${sha.stdout.toString().trim()}${suffix}`;
  }

  #serverEnv: BunPlugin | null = null;
  #warnedLibEnvs = new Set<string>();
  //? One plugin for every server-side bundle of the build: the backend, the RSC worker and the SSR route bundle.
  #serverEnvPlugin(baseEnv: string, branches: Iterable<string>): BunPlugin {
    this.#serverEnv ??= createServerEnvPlugin({
      envDir: this.#envDir,
      environment: this.#environment ?? baseEnv,
      environments: ["local", "testing", ...branches],
      profile: this.#profile,
      onLibEnv: (file, { profileFile, stripped }) => {
        if (profileFile || !stripped.length || this.#warnedLibEnvs.has(file)) return;
        this.#warnedLibEnvs.add(file);
        const lib = path.relative(this.#app.workspace.workspaceRoot, file);
        this.#app.logger.warn(
          `${lib}: the "${this.#profile}" build leaves out ${stripped.join(", ")}. Give the lib ${path.basename(ServerEnvProfile.profileFileOf(file, this.#profile ?? ""))} to say what this profile runs with.`,
        );
      },
    });
    return this.#serverEnv;
  }

  //? `bun main.js` in dist/apps/<app> is a documented way to run a build, and a verify output has no CSR bundle or
  //? production env file, so its main.js refuses to boot before any app module runs.
  #verifyBanner() {
    const message = `dist/apps/${this.#app.name} holds the partial output of akan verify, not a build. Run \`akan build ${this.#app.name}\` first.`;
    return `console.error(${JSON.stringify(message)});process.exit(1);`;
  }

  async #buildBackend() {
    const { externalLibs, web, baseDevEnv, branches } = await this.#app.getConfig();
    const backendEntryPoints = [`${this.#app.cwdPath}/main.ts`, `${this.#app.cwdPath}/server.ts`];
    for (const entrypoint of backendEntryPoints) {
      if (!(await Bun.file(entrypoint).exists())) throw new Error(`Backend entrypoint not found: ${entrypoint}`);
    }
    const sharedConfig = {
      outdir: this.#app.dist.cwdPath,
      target: "bun",
      minify: AKAN_BACKEND_MINIFY,
      naming: { entry: "[name].[ext]", chunk: "chunk-[hash].[ext]" },
      // `akan build` must embed production react-server-dom regardless of the shell's NODE_ENV.
      define: { "process.env.NODE_ENV": JSON.stringify("production") },
    } satisfies Omit<Bun.BuildConfig, "entrypoints">;
    const serverEnvPlugin = this.#serverEnvPlugin(baseDevEnv.env, branches);
    const backendConfig = {
      ...sharedConfig,
      plugins: [this.#createExternalSpecifiersPlugin(externalLibs), serverEnvPlugin],
    };
    //* Built apart so main.js keeps its own module copies; splitting moves lazy vendor `import()`s out of the boot parse.
    const [mainResult, serverResult] = [
      await this.#buildOrThrow("backend", {
        ...backendConfig,
        entrypoints: [backendEntryPoints[0]],
        ...(this.#verify ? { banner: this.#verifyBanner() } : {}),
      }),
      await this.#buildOrThrow("backend", { ...backendConfig, entrypoints: [backendEntryPoints[1]], splitting: true }),
    ];
    // Nothing spawns the RSC worker without SSR, so an api-only image does not carry it.
    const rscWorkerResult = web.ssr
      ? await this.#buildOrThrow("rsc-worker", {
          ...backendConfig,
          entrypoints: [this.#resolveRscWorkerBuildEntry()],
          conditions: ["react-server"],
        })
      : null;
    const consoleRuntimeResult = await this.#buildOrThrow("console-runtime", {
      ...sharedConfig,
      entrypoints: [this.#resolveConsoleRuntimeBuildEntry()],
      naming: { entry: "console-runtime.[ext]", chunk: "chunk-[hash].[ext]" },
    });
    await this.#writeConsoleShim();
    const results = [mainResult, serverResult, rscWorkerResult, consoleRuntimeResult];
    return {
      entrypoints: backendEntryPoints.length + (rscWorkerResult ? 2 : 1),
      outputs: results.reduce((sum, result) => sum + (result?.outputs.length ?? 0), 1),
    };
  }

  async #writeConsoleShim() {
    await Bun.write(
      path.join(this.#app.dist.cwdPath, "console.js"),
      `process.env.AKAN_COMMAND_TYPE = "console";
const { cnst, db, dict, option, server, sig, srv } = await import("./server.js");
const { assertAkanConsoleAllowed, startAkanConsole } = await import("./console-runtime.js");

const run = async () => {
  assertAkanConsoleAllowed();
  await server.start({ listen: false, web: false });
  try {
    await startAkanConsole(server, { globals: { cnst, db, dict, option, sig, srv } });
  } finally {
    await server.stop();
  }
};

void run().catch((error) => {
  console.error(error);
  process.exit(1);
});
`,
    );
  }

  #resolveRscWorkerBuildEntry(): string {
    try {
      return Bun.resolveSync("akanjs/server/rsc-worker", import.meta.dir);
    } catch {
      return path.join(this.#app.workspace.workspaceRoot, "pkgs/akanjs/server/rscWorker.tsx");
    }
  }

  #resolveConsoleRuntimeBuildEntry(): string {
    try {
      return path.join(path.dirname(Bun.resolveSync("akanjs/server", import.meta.dir)), "console.ts");
    } catch {
      return path.join(this.#app.workspace.workspaceRoot, "pkgs/akanjs/server/console.ts");
    }
  }

  async #buildSsr() {
    const pageKeys = await this.#app.getPageKeys();
    if (pageKeys.length === 0) {
      this.#app.log(`[cli] no route files under ${this.#app.cwdPath}/page — skipping SSR build`);
      return null;
    }
    const { baseDevEnv, branches } = await this.#app.getConfig();
    //? Routes first: the vendor entries export only the names the route bundles import.
    const routes = new AllRoutesBuilder(this.#app, "build");
    const allRoutes = await routes.build();
    const vendorExports = await VendorImportScanner.exportsUsedIn(
      path.join(this.#app.dist.cwdPath, ".akan/artifact/client"),
      NARROWABLE_VENDOR_SPECIFIERS,
      Object.values(allRoutes.manifest.clientManifest).map(({ id }) => id),
    );
    const base = await new SsrBaseArtifactBuilder(this.#app, "build", {
      serverEnv: this.#serverEnvPlugin(baseDevEnv.env, branches),
      vendorExports,
    }).build();
    this.#modulesByRoute = (await routes.writeModulePreloads(base.runtimeChunks)).modulesByRoute();
    return { base, allRoutes };
  }

  //? After `compress`: a route is measured by the brotli bytes it is served as, read from the `.br` sidecars, which a
  //? verify build skips writing and measures in memory instead.
  async #measureRouteJs(environment: string): Promise<RouteJsMeasure | null> {
    if (this.#budget === "off" || !this.#modulesByRoute) return null;
    const sizes = await RouteJsBudget.measure(
      path.join(this.#app.dist.cwdPath, ".akan/artifact"),
      this.#modulesByRoute,
      { precompressed: !this.#verify },
    );
    const budgetPath = path.join(this.#app.cwdPath, RouteJsBudget.fileName);
    const { summary: status, warnings } = await RouteJsBudget.check(sizes, {
      mode: this.#budget,
      app: this.#app.name,
      budgetPath,
      source: path.relative(this.#app.workspace.workspaceRoot, budgetPath),
      environment,
    });
    const largest = sizes[0];
    const { formatBytes } = ApplicationBuildRunner;
    return {
      sizes,
      summary: largest
        ? `${sizes.length} routes, largest ${largest.routeId} ${formatBytes(largest.brotliBytes)} brotli (${formatBytes(largest.rawBytes)} raw); ${status}`
        : status,
      ...(warnings ? { warnings } : {}),
    };
  }

  //? Opt-in and outside `dist/`: a metafile is the size of the module graph, and `dist/` is what the image copies.
  async #buildOrThrow(label: string, config: Bun.BuildConfig): Promise<Bun.BuildOutput> {
    const flag = process.env.AKAN_BUILD_METAFILE;
    const metafileDir =
      flag && flag !== "0" && flag !== "false"
        ? path.join(this.#app.workspace.workspaceRoot, "local", "build-meta", path.basename(this.#app.cwdPath))
        : null;
    const result = await Bun.build(metafileDir ? { ...config, metafile: true } : config);
    if (!result.success) throw new AggregateError(result.logs, `[${label}] Bun.build failed`);
    if (metafileDir && result.metafile) {
      const entry = path.parse(String(config.entrypoints[0] ?? label)).name;
      await Bun.write(path.join(metafileDir, `${entry}.json`), JSON.stringify(result.metafile));
    }
    return result;
  }

  #createExternalSpecifiersPlugin(externalLibs: readonly string[]): BunPlugin {
    const specifiers = new Set([...externalLibs, ...SSR_RENDER_EXTERNALS, ...AKAN_OPTIONAL_BACKEND_EXTERNALS]);
    const escaped = [...specifiers].map((specifier) => specifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const filter = new RegExp(`^(${escaped.join("|")})(?:/.*)?$`);
    return {
      name: "akan-backend-externalize-specifiers",
      setup(build) {
        build.onResolve({ filter }, (args) => ({ path: args.path, external: true }));
      },
    };
  }

  static formatBytes = FontPruner.formatBytes;
}
