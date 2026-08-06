import { mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { $ } from "bun";

/**
 * Builds `@akanjs/cli` into the workspace `dist/` that `bun run akan` executes.
 *
 * Every `akan <command>` runs this first, and the output directory is shared, so two concurrent
 * commands used to destroy each other's bundle: the build opened with `rm -rf` of the whole output
 * directory, which can delete the `index.js` — or one of the lazily loaded chunks `splitting: true`
 * produces — that another invocation is about to execute. It never looked like a build problem from
 * the outside. A parallel run of the dev-stability suite failed its first test in all three shards
 * with `Timed out waiting for backend ready`, and the real cause was four levels down: `akan start`
 * exiting 1 on `cp: .../templates/appSample/lib/_noti/noti.store.ts: No such file or directory`.
 *
 * Two things make it safe, and they cover different cases:
 *
 * - **An input stamp**, so an invocation whose sources are already built does nothing at all. This is
 *   the steady state — every `akan` command after the first — and it is where the clobbering used to
 *   happen, since nothing about an up-to-date output needed rewriting in the first place.
 * - **A lock**, for the cold start where the stamp genuinely does not match and several invocations
 *   race (parallel CI shards against an empty `dist/`). Exactly one builds; the rest wait and then
 *   find the stamp matching.
 */
export class CliDistBuilder {
  static readonly #stampFile = ".build-stamp";
  /** Long enough to cover a cold build on a loaded machine, short enough that a lock leaked by a
   *  `kill -9` between `mkdir` and the owner write cannot wedge the CLI for a whole session. */
  static readonly #lockTimeoutMs = 120_000;
  static readonly #lockPollMs = 100;

  readonly #cliDir: string;
  readonly #devkitDir: string;
  readonly #outDir: string;

  constructor({ cliDir, outDir }: { cliDir: string; outDir?: string }) {
    this.#cliDir = cliDir;
    this.#devkitDir = path.resolve(cliDir, "../devkit");
    const workspaceRoot = process.env.WORKSPACE_ROOT ?? process.cwd();
    this.#outDir = outDir ?? process.env.DIST_DIR ?? `${workspaceRoot}/dist/pkgs/@akanjs/cli`;
  }

  async build(): Promise<"up-to-date" | "built" | "built-by-other"> {
    const stamp = await this.inputStamp();
    if (process.env.AKAN_CLI_FORCE_BUILD !== "1" && (await this.#stampMatches(stamp))) return "up-to-date";
    const releaseLock = await this.#acquireLock();
    try {
      if (await this.#stampMatches(stamp)) return "built-by-other";
      await this.#bundle();
      // Written last, so a build killed halfway leaves no stamp and the next invocation redoes it
      // rather than trusting a partial bundle.
      await Bun.write(path.join(this.#outDir, CliDistBuilder.#stampFile), stamp);
      return "built";
    } finally {
      await releaseLock();
    }
  }

  /**
   * Hash of every input the bundle depends on: each source file's path, mtime and size across the two
   * packages that get bundled, plus the Bun version that does the bundling. Deliberately conservative
   * — a stamp that misses an input serves a stale CLI, which is a far worse failure than an extra
   * 0.6s build, so this walks whole package trees rather than resolving the real import graph.
   *
   * Test files are the one exclusion, and only because nothing can reach them: no entrypoint imports a
   * `*.test.ts`, so including them would rebuild the bundle when a test changed — which then `rm -rf`s
   * the `dist/` that a suite already running against it is executing from.
   */
  static readonly #ignoredInputs = /\.(test|spec)\.(ts|tsx)$/;

  async inputStamp(): Promise<string> {
    const hasher = new Bun.CryptoHasher("sha256");
    hasher.update(`bun:${Bun.version}\n`);
    for (const dir of [this.#cliDir, this.#devkitDir]) {
      const relativePaths: string[] = [];
      for await (const relativePath of new Bun.Glob("**/*").scan({ cwd: dir, onlyFiles: true, dot: true }))
        if (!CliDistBuilder.#ignoredInputs.test(relativePath)) relativePaths.push(relativePath);
      for (const relativePath of relativePaths.sort()) {
        const info = await stat(path.join(dir, relativePath)).catch(() => null);
        if (info) hasher.update(`${path.basename(dir)}/${relativePath}:${info.mtimeMs}:${info.size}\n`);
      }
    }
    return hasher.digest("hex");
  }

  async #stampMatches(stamp: string): Promise<boolean> {
    const recorded = await Bun.file(path.join(this.#outDir, CliDistBuilder.#stampFile))
      .text()
      .catch(() => null);
    if (recorded?.trim() !== stamp) return false;
    // A stamp with no entrypoint beside it means someone removed part of `dist/` by hand.
    return await Bun.file(path.join(this.#outDir, "index.js")).exists();
  }

  /** Resolves once this process owns the lock; the returned callback releases it. */
  async #acquireLock(): Promise<() => Promise<void>> {
    const lockDir = `${this.#outDir}.lock`;
    await mkdir(path.dirname(lockDir), { recursive: true });
    const waitingSince = Date.now();
    for (;;) {
      const acquired = await mkdir(lockDir)
        .then(() => true)
        .catch(() => false);
      if (acquired) {
        await Bun.write(path.join(lockDir, "owner"), `${process.pid}`);
        return () => rm(lockDir, { recursive: true, force: true });
      }
      if (await CliDistBuilder.#lockIsAbandoned(lockDir, waitingSince))
        await rm(lockDir, { recursive: true, force: true });
      else await Bun.sleep(CliDistBuilder.#lockPollMs);
    }
  }

  static async #lockIsAbandoned(lockDir: string, waitingSince: number): Promise<boolean> {
    if (Date.now() - waitingSince > CliDistBuilder.#lockTimeoutMs) {
      console.warn(`[cli-build] taking over ${lockDir} after waiting ${CliDistBuilder.#lockTimeoutMs}ms`);
      return true;
    }
    const owner = Number(
      await Bun.file(path.join(lockDir, "owner"))
        .text()
        .catch(() => ""),
    );
    // Not yet written: the holder is between its `mkdir` and its owner write, which is not abandoned.
    if (!Number.isFinite(owner) || owner <= 0) return false;
    try {
      process.kill(owner, 0);
      return false;
    } catch (error) {
      // ESRCH is the only code that means gone — EPERM is a live process owned by someone else.
      return (error as { code?: string }).code === "ESRCH";
    }
  }

  async #bundle(): Promise<void> {
    const packageJson = await Bun.file(`${this.#cliDir}/package.json`).json();
    await rm(this.#outDir, { recursive: true, force: true });
    const buildResult = await Bun.build({
      entrypoints: [
        `${this.#cliDir}/index.ts`,
        `${this.#devkitDir}/incrementalBuilder/incrementalBuilder.proc.ts`,
        `${this.#devkitDir}/incrementalBuilder/buildBatch.proc.ts`,
        `${this.#devkitDir}/typecheck/typecheck.proc.ts`,
      ],
      // Required, not cosmetic: with `splitting: false` Bun inlines every dynamically imported module
      // into the entry and hoists its external `import` statements to the top of the file, so the
      // lazy imports that keep `typescript`, @trapezedev/project, @langchain/* and the tailwind stack
      // out of the dev host would all load eagerly anyway.
      splitting: true,
      target: "bun",
      outdir: this.#outDir,
      // Chunks must sit next to the entry, not in a subdirectory: code that resolves bundled assets
      // through `import.meta.dir` (e.g. the `templates/` and `guidelines/` lookups) would otherwise
      // look for them under `chunks/`.
      naming: { entry: "[name].js", chunk: "[name]-[hash].js" },
      external: Object.keys({ ...packageJson.dependencies, ...packageJson.peerDependencies }).filter(
        (name) => name !== "@akanjs/devkit",
      ),
      plugins: [],
    });
    if (!buildResult.success) throw new AggregateError(buildResult.logs, "CLI build failed");
    await $`rm -rf ${this.#outDir}/templates ${this.#outDir}/guidelines`;
    await $`cp -R ${this.#cliDir}/templates ${this.#outDir}/templates`;
    await $`cp -R ${this.#cliDir}/guidelines ${this.#outDir}/guidelines`;
    const distPackageJson = {
      ...packageJson,
      bin: { akan: "./index.js", akan2: "./index.js" },
      exports: {
        ".": { import: "./index.js", default: "./index.js" },
        "./package.json": "./package.json",
      },
    };
    await Bun.write(`${this.#outDir}/package.json`, JSON.stringify(distPackageJson, null, 2));
    // Generated here rather than at first run: without it the entry has to import every command module
    // to discover which one owns `argv[2]`, and a dev sandbox may only ever run `akan start` once.
    const { CommandManifest } = await import("./commandManifest");
    await Bun.write(`${this.#outDir}/${CommandManifest.fileName}`, JSON.stringify(await CommandManifest.generate()));
  }
}
