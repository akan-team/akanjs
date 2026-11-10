import { mkdir, realpath, rm, stat } from "node:fs/promises";
import path from "node:path";
import { $ } from "bun";

interface PackageManifest {
  name?: string;
  workspaces?: string[] | { packages?: string[] };
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

// Every `akan` invocation runs this against a shared `dist/`, and a rebuild's `rm -rf` deletes chunks another one is
// executing: an input stamp makes an up-to-date build a no-op, and a lock lets one of several cold starts build.
export class CliDistBuilder {
  static readonly #stampFile = ".build-stamp";
  /** Covers a cold build on a loaded machine; short enough that a lock leaked by `kill -9` cannot wedge the CLI. */
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
    const force = process.env.AKAN_CLI_FORCE_BUILD === "1";
    if (!force && (await this.#stampMatches(stamp))) return "up-to-date";
    const recordedBefore = await this.#recordedStamp();
    const releaseLock = await this.#acquireLock();
    try {
      // A forced build yields to one that finished during the wait: that build's process is running from `dist/`.
      if ((await this.#stampMatches(stamp)) && (!force || (await this.#recordedStamp()) !== recordedBefore))
        return "built-by-other";
      await this.#bundle();
      // Written last, so a build killed halfway leaves no stamp to trust a partial bundle by. The nonce, not the
      // file's mtime, tells a waiting forced build that this one finished: kernel timestamps can trail its clock.
      await Bun.write(path.join(this.#outDir, CliDistBuilder.#stampFile), `${stamp}\n${crypto.randomUUID()}\n`);
      return "built";
    } finally {
      await releaseLock();
    }
  }

  // Whole package trees, not the import graph: a missed input serves a stale CLI. Tests are excluded because no entry
  // imports them, and a rebuild on a test edit would `rm -rf` the `dist/` a running suite executes from.
  static readonly #ignoredInputs = /\.(test|spec)\.(ts|tsx)$/;

  async inputStamp(): Promise<string> {
    const hasher = new Bun.CryptoHasher("sha256");
    hasher.update(`bun:${Bun.version}\n`);
    for (const dir of await this.bundledPackageDirs()) {
      const relativePaths: string[] = [];
      for await (const relativePath of new Bun.Glob("**/*").scan({ cwd: dir, onlyFiles: true, dot: true }))
        if (!CliDistBuilder.#ignoredInputs.test(relativePath)) relativePaths.push(relativePath);
      for (const relativePath of relativePaths.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) {
        const info = await stat(path.join(dir, relativePath)).catch(() => null);
        if (info) hasher.update(`${path.basename(dir)}/${relativePath}:${info.mtimeMs}:${info.size}\n`);
      }
    }
    return hasher.digest("hex");
  }

  async bundledPackageDirs(): Promise<string[]> {
    const externals = new Set(CliDistBuilder.#externalsOf(await CliDistBuilder.#manifestOf(this.#cliDir)));
    const workspaceRoot = await this.#workspaceRoot();
    const workspaces = workspaceRoot
      ? await CliDistBuilder.#workspacePackages(workspaceRoot)
      : new Map<string, string>();
    const dirs = new Set(await Promise.all([this.#cliDir, this.#devkitDir].map((dir) => realpath(dir))));
    for (const dir of dirs) {
      const manifest = await CliDistBuilder.#manifestOf(dir);
      for (const [name, spec] of Object.entries({ ...manifest.dependencies, ...manifest.peerDependencies })) {
        if (externals.has(name)) continue;
        const target = CliDistBuilder.#aliasTargetOf(spec);
        const packageDir =
          (target && workspaces.get(target)) ??
          workspaces.get(name) ??
          (await CliDistBuilder.#linkedPackageDirOf(name, dir));
        if (packageDir) dirs.add(packageDir);
      }
    }
    return [...dirs];
  }

  static async #manifestOf(dir: string): Promise<PackageManifest> {
    return (await Bun.file(path.join(dir, "package.json")).json()) as PackageManifest;
  }

  static #externalsOf(manifest: PackageManifest): string[] {
    return Object.keys({ ...manifest.dependencies, ...manifest.peerDependencies });
  }

  async #workspaceRoot(): Promise<string | null> {
    for (let dir = await realpath(this.#cliDir); dir !== path.dirname(dir); dir = path.dirname(dir)) {
      const manifest = await CliDistBuilder.#manifestOf(dir).catch(() => null);
      if (manifest?.workspaces) return dir;
    }
    return null;
  }

  static async #workspacePackages(root: string): Promise<Map<string, string>> {
    const { workspaces } = await CliDistBuilder.#manifestOf(root);
    const patterns = (Array.isArray(workspaces) ? workspaces : workspaces?.packages) ?? [];
    const packages = new Map<string, string>();
    for (const pattern of patterns)
      for await (const manifestPath of new Bun.Glob(`${pattern.replace(/\/+$/, "")}/package.json`).scan({
        cwd: root,
      })) {
        const dir = await realpath(path.join(root, path.dirname(manifestPath)));
        const { name } = await CliDistBuilder.#manifestOf(dir).catch(() => ({ name: undefined }));
        if (name && !packages.has(name)) packages.set(name, dir);
      }
    return packages;
  }

  static #aliasTargetOf(spec: string): string | null {
    const target = spec.replace(/^(?:npm|workspace):((?:@[\w.-]+\/)?[\w.-]+)(?:@.*)?$/, "$1");
    return target === spec ? null : target;
  }

  //? Looked up in `node_modules` rather than resolved: a package's `exports` may not list its `package.json` or `.`.
  static async #linkedPackageDirOf(name: string, fromDir: string): Promise<string | null> {
    for (let dir = fromDir; dir !== path.dirname(dir); dir = path.dirname(dir)) {
      const linked = path.join(dir, "node_modules", name);
      if (!(await Bun.file(path.join(linked, "package.json")).exists())) continue;
      const packageDir = await realpath(linked);
      return packageDir.split(path.sep).includes("node_modules") ? null : packageDir;
    }
    return null;
  }

  async #recordedStamp(): Promise<string | null> {
    return await Bun.file(path.join(this.#outDir, CliDistBuilder.#stampFile))
      .text()
      .catch(() => null);
  }

  async #stampMatches(stamp: string): Promise<boolean> {
    const [recorded] = (await this.#recordedStamp())?.split("\n") ?? [];
    if (recorded?.trim() !== stamp) return false;
    // A stamp with no entrypoint beside it means someone removed part of `dist/` by hand.
    return await Bun.file(path.join(this.#outDir, "index.js")).exists();
  }

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
    const packageJson = await CliDistBuilder.#manifestOf(this.#cliDir);
    await rm(this.#outDir, { recursive: true, force: true });
    const buildResult = await Bun.build({
      entrypoints: [
        `${this.#cliDir}/index.ts`,
        // A second published entry; `naming.entry` is the bare basename, hence not `index.ts`.
        `${this.#cliDir}/code/akanCode.ts`,
        `${this.#devkitDir}/incrementalBuilder/incrementalBuilder.proc.ts`,
        `${this.#devkitDir}/incrementalBuilder/buildBatch.proc.ts`,
        `${this.#devkitDir}/typecheck/typecheck.proc.ts`,
      ],
      // Required: without it Bun inlines dynamic imports and hoists their externals, loading the lazy stacks eagerly.
      splitting: true,
      target: "bun",
      outdir: this.#outDir,
      // Chunks sit next to the entry, or `import.meta.dir` lookups of `templates/` and `guidelines/` miss.
      naming: { entry: "[name].js", chunk: "[name]-[hash].js" },
      // devkit is bundled in rather than resolved at runtime, which it already is by being absent here.
      external: CliDistBuilder.#externalsOf(packageJson),
      plugins: [],
    });
    if (!buildResult.success) throw new AggregateError(buildResult.logs, "CLI build failed");
    await $`rm -rf ${this.#outDir}/templates ${this.#outDir}/guidelines ${this.#outDir}/skills`;
    await $`cp -R ${this.#cliDir}/templates ${this.#outDir}/templates`;
    await $`cp -R ${this.#cliDir}/guidelines ${this.#outDir}/guidelines`;
    await $`cp -R ${this.#devkitDir}/codeAgent/skills ${this.#outDir}/skills`;
    const distPackageJson = {
      ...packageJson,
      bin: { akan: "./index.js" },
      exports: {
        ".": { import: "./index.js", default: "./index.js" },
        "./code": { import: "./akanCode.js", default: "./akanCode.js" },
        "./package.json": "./package.json",
      },
    };
    await Bun.write(`${this.#outDir}/package.json`, `${JSON.stringify(distPackageJson, null, 2)}\n`);
    // Generated here, not at first run: a dev sandbox may run `akan start` only once.
    const { CommandManifest } = await import("./commandManifest");
    await Bun.write(`${this.#outDir}/${CommandManifest.fileName}`, JSON.stringify(await CommandManifest.generate()));
  }
}
