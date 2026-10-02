import { cp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AkanAppConfig, NativeEnv } from "../akanConfig";
import type { App } from "../commandDecorators";
import type { PackageJson } from "../types";
import { DesktopBin } from "./desktopBin";

/** What a desktop build hands the native runtime as `desktop.server`. */
export interface DesktopServerBundle {
  dir: string;
  entry: string;
  env: Record<string, string>;
}

//* A desktop app's carried server is the backend `akan build` wrote into dist, installed on its own as the image's
//* `bun install --production` does. It is staged outside dist: installing there would put host packages into the
//* image's `COPY . .`.
export class DesktopServerStage {
  //? An API-only server starts neither the RSC worker nor the akan console and serves no CSR, public/ or SSR artifact,
  //? and `install` wrote its own package.json. The rest of dist is the server's: its chunks, a `.node`, a `.wasm`.
  static readonly uncarried = new Set([
    "Dockerfile",
    "package.json",
    "rscWorker.js",
    "console.js",
    "console-runtime.js",
    "csr",
    "public",
    ".akan",
  ]);
  //? Only the RSC worker loads it, and its peer webpack makes 35 of the 43 MB an install would add.
  static readonly rscRenderer = "react-server-dom-webpack";

  readonly dir: string;

  constructor(readonly app: App) {
    this.dir = path.join(app.cwdPath, ".akan", "desktop", "server");
  }

  static assertCarriable(config: AkanAppConfig) {
    if (!config.database.modes.includes("single"))
      throw new Error(
        `desktop.server in native puts the server in the app, where only database mode single runs (no Redis or Postgres); apps/${config.app.name}/akan.config.ts declares ${config.database.modes.join(", ")}.`,
      );
  }

  static env(config: AkanAppConfig, environment: NativeEnv): Record<string, string> {
    //? The launcher picks the port, and the log file stays on: a user's computer has no log collector.
    const { PORT: _port, AKAN_LOG_TO_FILE: _fileLog, ...image } = config.getProductionEnv(environment);
    return {
      ...image,
      //? Neither the developer's machine (local, which derives a forgeable JWT secret) nor a deployment (cloud).
      AKAN_PUBLIC_OPERATION_MODE: "edge",
      AKAN_DATABASE_MODE: "single",
      AKAN_DATABASE_MODES: "single",
      //? API only: the shell serves the CSR bundle, and an RSC worker would need a bun on the user's PATH.
      AKAN_SSR: "false",
      AKAN_CSR: "false",
      AKAN_MCP: "false",
      //? Ahead of the launcher's 1.5 s grace before it signals, which sits inside the shell's 2 s quit budget.
      AKAN_SHUTDOWN_TIMEOUT_MS: "1000",
    };
  }

  //? The image's steps install into a Linux image the desktop app never runs in, so its server has none of it.
  static imageStepsNotice(
    config: Pick<AkanAppConfig, "app" | "docker">,
    carried: string[],
  ): { level: "warn" | "info"; message: string } | null {
    const steps =
      typeof config.docker === "string" ? null : config.docker.preRuns.length + config.docker.postRuns.length;
    if (steps === 0) return null;
    const image =
      steps === null
        ? `apps/${config.app.name}/akan.config.ts writes its own Dockerfile`
        : `The image runs ${steps} docker step${steps === 1 ? "" : "s"} from the app and its libs`;
    return carried.length
      ? {
          level: "info",
          message: `${image}; the desktop app's server runs none of them and carries only bin: ${carried.join(", ")}.`,
        }
      : {
          level: "warn",
          message: `${image}, and a desktop app's server runs none of them: declare in bin the executables its code spawns, or those calls fail on the user's computer.`,
        };
  }

  //? `omit` (the target's `desktop.server.omit`) wins over externalLibs: the image keeps those packages, the app does not.
  static packageJson(config: AkanAppConfig, built: PackageJson, omit: string[] = []): PackageJson {
    const otherDrivers = new Set(
      config.database.modes
        .filter((mode) => mode !== "single")
        .flatMap((mode) => config.getDatabaseModeRuntimePackages(mode)),
    );
    const dependencies = Object.entries(built.dependencies ?? {}).filter(
      ([name]) =>
        !omit.includes(name) &&
        (config.externalLibs.includes(name) || (name !== DesktopServerStage.rscRenderer && !otherDrivers.has(name))),
    );
    return { ...built, dependencies: Object.fromEntries(dependencies) };
  }

  /** The packages in `nodeModules` that depend on `name`: what still pulls an omitted package in. */
  static async dependentsOf(nodeModules: string, name: string): Promise<string[]> {
    const dependents = new Set<string>();
    for await (const manifest of new Bun.Glob("**/package.json").scan({ cwd: nodeModules, onlyFiles: true })) {
      const json = (await Bun.file(path.join(nodeModules, manifest))
        .json()
        .catch(() => null)) as PackageJson | null;
      if (!json?.name || json.name === name) continue;
      const declared = { ...json.dependencies, ...json.optionalDependencies, ...json.peerDependencies };
      if (name in declared) dependents.add(json.name);
    }
    return [...dependents].sort();
  }

  //? `--cpu` installs another CPU's optional packages: an addon's prebuilt binary for the app's CPU, not this computer's.
  static installArgs(arch?: "arm64" | "x64"): string[] {
    return ["install", "--production", "--prefer-offline", ...(arch && arch !== process.arch ? [`--cpu=${arch}`] : [])];
  }

  //* The packages come from the config alone, so they install before `akan build` runs: a machine that cannot install
  //* them stops at once instead of after the whole build.
  async install(arch?: "arm64" | "x64", omit: string[] = []) {
    const config = await this.app.getConfig();
    DesktopServerStage.assertCarriable(config);
    await rm(this.dir, { recursive: true, force: true });
    await mkdir(this.dir, { recursive: true });
    const built = config.getProductionPackageJson();
    for (const name of omit.filter((name) => !(name in (built.dependencies ?? {}))))
      this.app.logger.warn(`desktop.server.omit names ${name}, which the server does not depend on directly.`);
    await writeFile(
      path.join(this.dir, "package.json"),
      JSON.stringify(DesktopServerStage.packageJson(config, built, omit), null, 2),
    );
    try {
      await this.app.spawn(process.execPath, DesktopServerStage.installArgs(arch), { cwd: this.dir });
    } catch (error) {
      throw new Error(
        `The desktop app's server could not install its packages in ${this.dir}: it needs the npm registry, or a Bun cache that already holds every one of them.\n${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
    //? Launcher links only: a link out of the app bundle breaks its signature, and the server runs none of them.
    await rm(path.join(this.dir, "node_modules", ".bin"), { recursive: true, force: true });
    await this.#assertOmitted(omit);
  }

  //? Leaving a package out of package.json keeps out only what nothing else needs; another dependency still installs it.
  async #assertOmitted(omit: string[]) {
    const nodeModules = path.join(this.dir, "node_modules");
    const kept: string[] = [];
    for (const name of omit) {
      if (!(await Bun.file(path.join(nodeModules, name, "package.json")).exists())) continue;
      const dependents = await DesktopServerStage.dependentsOf(nodeModules, name);
      kept.push(`${name} (needed by ${dependents.join(", ") || "a package that names it"})`);
    }
    if (kept.length)
      throw new Error(
        `desktop.server.omit leaves out packages another dependency still installs: ${kept.join("; ")}. Omit those too, or keep the package.`,
      );
  }

  //? Copies the build beside what `install` put in the stage, so it runs after both.
  async prepare(environment: NativeEnv): Promise<DesktopServerBundle> {
    const config = await this.app.getConfig();
    const dist = this.app.dist.cwdPath;
    await mkdir(this.dir, { recursive: true });
    for (const name of await readdir(dist))
      if (!DesktopServerStage.uncarried.has(name))
        await cp(path.join(dist, name), path.join(this.dir, name), { recursive: true });
    const scanInfo = this.app.getScanInfo({ allowEmpty: true }) ?? (await this.app.scan({ write: false }));
    const carried = [...DesktopBin.select(config, scanInfo.getLibs()).keys()];
    const notice = DesktopServerStage.imageStepsNotice(config, carried);
    if (notice) this.app.logger[notice.level](notice.message);
    return { dir: this.dir, entry: "main.js", env: DesktopServerStage.env(config, environment) };
  }
}
