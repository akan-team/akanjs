import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import type { BunPlugin } from "bun";
import type {
  ApplicationBuildPhaseResult,
  ApplicationBuildProgressReporter,
  ApplicationBuildResult,
} from "./applicationBuildReporter";
import type { App } from "./commandDecorators";
import { AllRoutesBuilder, CsrArtifactBuilder, precompressArtifacts, SsrBaseArtifactBuilder } from "./frontendBuild";
import { Spinner } from "./spinner";

export interface TypecheckOptions {
  clean?: boolean;
  incremental?: boolean;
}

export type BuildPhaseId = "prepare" | "typecheck" | "backend" | "ssr" | "csr" | "compress" | "metadata";

export type BuildPhaseResult = ApplicationBuildPhaseResult & { id: BuildPhaseId };
export type BuildResult = ApplicationBuildResult;
export type BuildProgressReporter = ApplicationBuildProgressReporter;
export interface ApplicationBuildRunnerOptions {
  fast?: boolean;
  reporter?: BuildProgressReporter;
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

export const AKAN_OPTIONAL_BACKEND_EXTERNALS = [
  "@libsql/client",
  "bullmq",
  "croner",
  "ioredis",
  "postgres",
  "protobufjs",
] as const;

export class ApplicationBuildRunner {
  #app: App;
  #fast: boolean;
  #reporter?: BuildProgressReporter;
  #startedAt = Date.now();
  #phases: BuildPhaseResult[] = [];

  constructor(app: App, { fast = false, reporter }: ApplicationBuildRunnerOptions = {}) {
    this.#app = app;
    this.#fast = fast;
    this.#reporter = reporter;
  }

  async build({ spinner = false }: BuildOptions = {}): Promise<BuildResult> {
    // serial build is needed because of Bun.build is unstable for parallel build
    const phaseOptions = { spinner };
    await this.#runPhase("prepare", "Preparing output directory", () => this.#app.prepareCommand("build"), undefined, {
      spinner,
    });
    if (!this.#fast) await this.#runPhase("typecheck", "Typechecking", () => this.typecheck(), undefined, phaseOptions);
    await this.#runPhase(
      "backend",
      "Compiling backend",
      () => this.#buildBackend(),
      (result) => `${result.entrypoints} entrypoints, ${result.outputs} outputs`,
      phaseOptions,
    );
    await this.#runPhase(
      "ssr",
      "Building SSR route artifacts",
      () => this.#buildSsr(),
      (result) =>
        result
          ? `${result.allRoutes.manifest.routeIds.length} routes, ${result.allRoutes.manifest.knownEntries.length} entries`
          : "skipped",
      phaseOptions,
    );
    await this.#runPhase(
      "csr",
      "Building CSR assets",
      () => this.#buildCsr(),
      (result) => result?.outputDir ?? "skipped",
      phaseOptions,
    );
    await this.#runPhase(
      "compress",
      "Compressing static assets",
      () => precompressArtifacts(this.#app),
      (result) =>
        result.files > 0
          ? `${result.files} files, ${ApplicationBuildRunner.formatBytes(result.inputBytes)} -> ${ApplicationBuildRunner.formatBytes(result.outputBytes)}`
          : "no files",
      phaseOptions,
    );
    await this.#runPhase("metadata", "Writing production metadata", () => this.#buildAppMeta(), undefined, {
      spinner,
    });
    return {
      phases: this.#phases,
      durationMs: Date.now() - this.#startedAt,
      outputDir: this.#app.dist.cwdPath,
      artifactDir: path.join(this.#app.dist.cwdPath, ".akan/artifact"),
    };
  }

  async typecheck(options: TypecheckOptions = {}) {
    const { clean = false, incremental = true } = options;
    await this.#app.getPageKeys({ refresh: true });
    const { typecheckDir, tsconfigPath } = await this.#writeTypecheckTsconfig({ incremental });
    if (clean) await rm(path.join(typecheckDir, "tsconfig.tsbuildinfo"), { force: true });
    await this.#checkProjectInChildProcess(tsconfigPath);
  }

  async #runPhase<T>(
    id: BuildPhaseId,
    label: string,
    task: () => Promise<T>,
    summarize?: (result: T) => string | undefined,
    options: BuildPhaseRunOptions = {},
  ) {
    this.#reporter?.phaseStart?.({ id, label });
    const phaseStartedAt = Date.now();
    const spinner = options.spinner
      ? new Spinner(label, { prefix: `${BUILD_PHASE_EMOJIS[id]} ${id}` }).start()
      : undefined;
    try {
      const result = await task();
      const phase = { id, label, durationMs: Date.now() - phaseStartedAt, summary: summarize?.(result) };
      this.#phases.push(phase);
      const summary = phase.summary ? `: ${phase.summary}` : "";
      spinner?.succeed(`${label}${summary}`);
      this.#reporter?.phaseDone?.(phase);
      return result;
    } catch (error) {
      spinner?.fail(`${label} failed`);
      this.#reporter?.phaseFail?.({ id, label }, error);
      throw error;
    }
  }

  async #buildAppMeta() {
    const akanConfig = await this.#app.getConfig();
    await Promise.all([
      this.#app.dist.writeJson("package.json", akanConfig.getProductionPackageJson()),
      this.#app.dist.writeFile(`${this.#app.dist.cwdPath}/Dockerfile`, akanConfig.docker.content),
    ]);
  }

  async #buildBackend() {
    const akanConfig = await this.#app.getConfig();
    const backendExternals = [
      ...new Set([...akanConfig.externalLibs, ...SSR_RENDER_EXTERNALS, ...AKAN_OPTIONAL_BACKEND_EXTERNALS]),
    ];
    const backendEntryPoints = [`${this.#app.cwdPath}/main.ts`, `${this.#app.cwdPath}/server.ts`];
    for (const entrypoint of backendEntryPoints) {
      if (!(await Bun.file(entrypoint).exists())) throw new Error(`Backend entrypoint not found: ${entrypoint}`);
    }
    const backendResult = await this.#buildOrThrow("backend", {
      entrypoints: backendEntryPoints,
      outdir: this.#app.dist.cwdPath,
      target: "bun",
      minify: true,
      naming: { entry: "[name].[ext]", chunk: "chunk-[hash].[ext]" },
      define: { "process.env.NODE_ENV": JSON.stringify("production") },
      plugins: backendExternals.length > 0 ? [this.#createExternalSpecifiersPlugin(backendExternals)] : [],
    });
    const rscWorkerResult = await this.#buildOrThrow("rsc-worker", {
      entrypoints: [this.#resolveRscWorkerBuildEntry()],
      outdir: this.#app.dist.cwdPath,
      target: "bun",
      minify: true,
      naming: { entry: "[name].[ext]", chunk: "chunk-[hash].[ext]" },
      conditions: ["react-server"],
      // `akan build` must embed production react-server-dom regardless of the shell's NODE_ENV.
      define: { "process.env.NODE_ENV": JSON.stringify("production") },
      plugins: backendExternals.length > 0 ? [this.#createExternalSpecifiersPlugin(backendExternals)] : [],
    });
    const consoleRuntimeResult = await this.#buildOrThrow("console-runtime", {
      entrypoints: [this.#resolveConsoleRuntimeBuildEntry()],
      outdir: this.#app.dist.cwdPath,
      target: "bun",
      minify: true,
      naming: { entry: "console-runtime.[ext]", chunk: "chunk-[hash].[ext]" },
      define: { "process.env.NODE_ENV": JSON.stringify("production") },
    });
    await this.#writeConsoleShim();
    return {
      entrypoints: backendEntryPoints.length + 2,
      outputs: backendResult.outputs.length + rscWorkerResult.outputs.length + consoleRuntimeResult.outputs.length + 1,
    };
  }

  async #writeConsoleShim() {
    await Bun.write(
      path.join(this.#app.dist.cwdPath, "console.js"),
      `import { cnst, db, dict, option, server, sig, srv } from "./server.js";
import { assertAkanConsoleAllowed, startAkanConsole } from "./console-runtime.js";

const run = async () => {
  assertAkanConsoleAllowed(server.env);
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

  async #buildCsr() {
    return await new CsrArtifactBuilder(this.#app, "build").build();
  }

  async #buildSsr() {
    const pageKeys = await this.#app.getPageKeys();
    if (pageKeys.length === 0) {
      this.#app.log(`[cli] no route files under ${this.#app.cwdPath}/page — skipping SSR build`);
      return null;
    }
    const base = await new SsrBaseArtifactBuilder(this.#app, "build").build();
    const allRoutes = await new AllRoutesBuilder(this.#app, base.artifact, "build").build();
    return { base, allRoutes };
  }

  async #writeTypecheckTsconfig({ incremental = true }: TypecheckOptions = {}) {
    const typecheckDir = path.join(this.#app.cwdPath, ".akan", "typecheck");
    await mkdir(typecheckDir, { recursive: true });
    //* TypeScript's `include` globs do not cross a symlink, so synced lib pages need their real path.
    const libPageIncludes = (await this.#app.getPageRoots())
      .filter((root) => root.keyPrefix)
      .flatMap((root) => {
        const rel = path.relative(typecheckDir, root.realDir).split(path.sep).join("/");
        return [`${rel}/**/*.ts`, `${rel}/**/*.tsx`];
      });
    const tsconfig = {
      extends: "../../tsconfig.json",
      compilerOptions: {
        noEmit: true,
        incremental,
        tsBuildInfoFile: "./tsconfig.tsbuildinfo",
      },
      include: [
        "../../main.ts",
        "../../server.ts",
        "../../client.ts",
        "../../page/**/*.ts",
        "../../page/**/*.tsx",
        ...libPageIncludes,
        "../../../../pkgs/akanjs/*/types/**/*.d.ts",
      ],
      references: [],
    };
    const tsconfigPath = path.join(typecheckDir, "tsconfig.json");
    await Bun.write(tsconfigPath, `${JSON.stringify(tsconfig, null, 2)}\n`);
    return { typecheckDir, tsconfigPath };
  }

  async #checkProjectInChildProcess(tsconfigPath: string) {
    const entry = await this.#resolveTypecheckWorkerEntry();
    const proc = Bun.spawn([process.execPath, entry], {
      cwd: this.#app.workspace.workspaceRoot,
      env: this.#app.getCommandEnv({
        AKAN_COMMAND_TYPE: "typecheck",
        AKAN_TYPECHECK_TSCONFIG: tsconfigPath,
      }),
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    if (exitCode !== 0) throw new Error((stderr || stdout).trim() || `Typecheck failed with exit code ${exitCode}`);
  }

  async #resolveTypecheckWorkerEntry() {
    const candidates = [
      path.join(this.#app.workspace.workspaceRoot, "pkgs/@akanjs/devkit/typecheck/typecheck.proc.ts"),
      path.join(this.#app.workspace.workspaceRoot, "node_modules/@akanjs/devkit/typecheck/typecheck.proc.ts"),
      path.join(import.meta.dir, "typecheck.proc.js"),
      path.join(import.meta.dir, "typecheck.proc.ts"),
    ];
    for (const candidate of candidates) if (await Bun.file(candidate).exists()) return candidate;
    throw new Error(`[cli] typecheck worker entry not found; looked in: ${candidates.join(", ")}`);
  }

  async #buildOrThrow(label: string, config: Bun.BuildConfig): Promise<Bun.BuildOutput> {
    const result = await Bun.build(config);
    if (!result.success) throw new AggregateError(result.logs, `[${label}] Bun.build failed`);
    return result;
  }

  #createExternalSpecifiersPlugin(specifiers: readonly string[]): BunPlugin {
    const uniqueSpecifiers = [...new Set(specifiers)];
    const escaped = uniqueSpecifiers.map((specifier) => specifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const filter = new RegExp(`^(${escaped.join("|")})(?:/.*)?$`);

    return {
      name: "akan-backend-externalize-specifiers",
      setup(build) {
        build.onResolve({ filter }, (args) => ({ path: args.path, external: true }));
      },
    };
  }

  static formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  }
}
