import path from "node:path";
import type { BunPlugin } from "bun";
import type {
  ApplicationBuildPhaseResult,
  ApplicationBuildProgressReporter,
  ApplicationBuildResult,
} from "./applicationBuildReporter";
import type { App } from "./commandDecorators";
import {
  AllRoutesBuilder,
  CsrArtifactBuilder,
  FontPruner,
  precompressArtifacts,
  SsrBaseArtifactBuilder,
} from "./frontendBuild";
import { Spinner } from "./spinner";
import { createServerEnvPlugin } from "./transforms/serverEnvPlugin";
import { ServerEnvProfile } from "./transforms/serverEnvProfile";
import { ProjectTypecheck } from "./typecheck/projectTypecheck";

export interface TypecheckOptions {
  clean?: boolean;
  incremental?: boolean;
  /** The app's own tests and specs too (`akan typecheck`); a build leaves them out. */
  tests?: boolean;
}

export type BuildPhaseId = "prepare" | "typecheck" | "backend" | "ssr" | "csr" | "assets" | "compress" | "metadata";

export type BuildPhaseResult = ApplicationBuildPhaseResult & { id: BuildPhaseId };
export type BuildResult = ApplicationBuildResult;
export type BuildProgressReporter = ApplicationBuildProgressReporter;
export interface ApplicationBuildRunnerOptions {
  fast?: boolean;
  reporter?: BuildProgressReporter;
  /** The backend env the build is for, when it is not the workspace's own (a mobile or desktop build's `--env`). */
  environment?: string;
  /** Bundles `env/env.server.<environment>.<profile>.ts`, which may hold no secret, in place of the environment's file. */
  profile?: string;
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
  #reporter?: BuildProgressReporter;
  #environment?: string;
  #profile?: string;
  #spinner?: boolean;
  #startedAt = Date.now();
  #phases: BuildPhaseResult[] = [];

  constructor(app: App, { fast = false, reporter, environment, profile }: ApplicationBuildRunnerOptions = {}) {
    this.#app = app;
    this.#fast = fast;
    this.#reporter = reporter;
    this.#environment = environment;
    this.#profile = profile;
  }

  get #envDir() {
    return path.join(this.#app.cwdPath, "env");
  }

  async build({ spinner = false }: BuildOptions = {}): Promise<BuildResult> {
    // serial build is needed because of Bun.build is unstable for parallel build
    this.#spinner = spinner;
    const { web, assets, baseDevEnv } = await this.#app.getConfig();
    const environment = this.#environment ?? baseDevEnv.env;
    //? Bundles bake AKAN_PUBLIC_ENV from process.env, where the shell outranks the .env that picked the server env.
    process.env.AKAN_PUBLIC_ENV = environment;
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
    await this.#runPhase("metadata", "Writing production metadata", () => this.buildAppMeta());
    return {
      phases: this.#phases,
      durationMs: Date.now() - this.#startedAt,
      outputDir: this.#app.dist.cwdPath,
      artifactDir: path.join(this.#app.dist.cwdPath, ".akan/artifact"),
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
    const dockerfile = akanConfig.dockerfileFor(this.#environment ?? akanConfig.baseDevEnv.env);
    await Promise.all([
      this.#app.dist.writeJson("package.json", akanConfig.getProductionPackageJson()),
      this.#app.dist.writeFile(`${this.#app.dist.cwdPath}/Dockerfile`, dockerfile),
      this.#app.dist.writeJson("akan.build.json", {
        buildId: await this.#resolveBuildId(),
        akanVersion: akanConfig.akanVersion,
        builtAt: new Date().toISOString(),
      }),
    ]);
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
      //? The root .env wins over the shell in baseDevEnv, so a `--env` build names its own; a desktop app runs it.
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
      await this.#buildOrThrow("backend", { ...backendConfig, entrypoints: [backendEntryPoints[0]] }),
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
    const base = await new SsrBaseArtifactBuilder(this.#app, "build", {
      serverEnv: this.#serverEnvPlugin(baseDevEnv.env, branches),
    }).build();
    const allRoutes = await new AllRoutesBuilder(this.#app, base.artifact, "build").build();
    return { base, allRoutes };
  }

  async #buildOrThrow(label: string, config: Bun.BuildConfig): Promise<Bun.BuildOutput> {
    const result = await Bun.build(config);
    if (!result.success) throw new AggregateError(result.logs, `[${label}] Bun.build failed`);
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
