import { cp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AkanAppConfig, MobileEnv } from "../akanConfig";
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
  //? The RSC worker's and the akan console's bundles: an API-only server starts neither.
  static readonly skippedFiles = new Set(["rscWorker.js", "console.js", "console-runtime.js"]);
  //? Only the RSC worker loads it, and its peer webpack makes 35 of the 43 MB an install would add.
  static readonly rscRenderer = "react-server-dom-webpack";

  readonly dir: string;

  constructor(readonly app: App) {
    this.dir = path.join(app.cwdPath, ".akan", "desktop", "server");
  }

  static assertCarriable(config: AkanAppConfig) {
    if (!config.database.modes.includes("single"))
      throw new Error(
        `native.desktop.server puts the server in the app, where only database mode single runs (no Redis or Postgres); apps/${config.app.name}/akan.config.ts declares ${config.database.modes.join(", ")}.`,
      );
  }

  static env(config: AkanAppConfig, environment: MobileEnv): Record<string, string> {
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

  static packageJson(config: AkanAppConfig, built: PackageJson): PackageJson {
    const otherDrivers = new Set(
      config.database.modes
        .filter((mode) => mode !== "single")
        .flatMap((mode) => config.getDatabaseModeRuntimePackages(mode)),
    );
    const dependencies = Object.entries(built.dependencies ?? {}).filter(
      ([name]) =>
        config.externalLibs.includes(name) || (name !== DesktopServerStage.rscRenderer && !otherDrivers.has(name)),
    );
    return { ...built, dependencies: Object.fromEntries(dependencies) };
  }

  async prepare(environment: MobileEnv): Promise<DesktopServerBundle> {
    const config = await this.app.getConfig();
    DesktopServerStage.assertCarriable(config);
    const dist = this.app.dist.cwdPath;
    await rm(this.dir, { recursive: true, force: true });
    await mkdir(this.dir, { recursive: true });
    const entries = await readdir(dist, { withFileTypes: true });
    for (const entry of entries) {
      const carried =
        (entry.isFile() &&
          ((entry.name.endsWith(".js") && !DesktopServerStage.skippedFiles.has(entry.name)) ||
            entry.name === "akan.build.json")) ||
        (entry.isDirectory() && entry.name === "private");
      if (carried) await cp(path.join(dist, entry.name), path.join(this.dir, entry.name), { recursive: true });
    }
    const built = (await Bun.file(path.join(dist, "package.json")).json()) as PackageJson;
    await writeFile(
      path.join(this.dir, "package.json"),
      JSON.stringify(DesktopServerStage.packageJson(config, built), null, 2),
    );
    await this.app.spawn(process.execPath, ["install", "--production"], { cwd: this.dir });
    //? Launcher links only: a link out of the app bundle breaks its signature, and the server runs none of them.
    await rm(path.join(this.dir, "node_modules", ".bin"), { recursive: true, force: true });
    const scanInfo = this.app.getScanInfo({ allowEmpty: true }) ?? (await this.app.scan({ write: false }));
    const carried = [...DesktopBin.select(config, scanInfo.getLibs()).keys()];
    const notice = DesktopServerStage.imageStepsNotice(config, carried);
    if (notice) this.app.logger[notice.level](notice.message);
    return { dir: this.dir, entry: "main.js", env: DesktopServerStage.env(config, environment) };
  }
}
