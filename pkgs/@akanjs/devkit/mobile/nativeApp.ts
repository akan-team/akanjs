import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { AkanNativeConfig } from "@akanjs/native/config";
import type { MobileEnv } from "akanjs";
import type { App } from "../commandDecorators";
import { Executor } from "../executors";
import { DesktopBin } from "./desktopBin";
import type { DesktopServerBundle } from "./desktopServerStage";
import {
  type DesktopPlatform,
  type MobilePlatform,
  type NativePlatform,
  type ResolvedMobileTarget,
  targetHtmlFilename,
} from "./mobileTarget";
import { NativeApi, type NativeBuildApiModule } from "./nativeApi";
import { NativeAppLine, type NativeAppLineRead } from "./nativeAppLine";
import { NativeConfig } from "./nativeConfig";
import { NativePluginFolders } from "./nativePluginFolders";
import { NativeWebDir } from "./nativeWebDir";

type TaskOptions = Parameters<NativeBuildApiModule["build"]>[0];
type DeviceSelector = NonNullable<Parameters<NativeBuildApiModule["run"]>[0]["device"]>;
type ReleaseOptions = Parameters<NativeBuildApiModule["release"]>[0];
type AndroidSigning = Extract<ReleaseOptions, { platform: "android" }>["signing"];

export interface NativeRunOptions {
  device?: DeviceSelector;
  /** Narrows the iPhone signing to one Apple team. */
  teamId?: string;
}

interface NativeDevBoot {
  steps: string[];
  lines: NativeAppLineRead[];
}

export interface NativeBuildOptions {
  profile?: "debug" | "release";
  /** The server a desktop app carries (`--server`), staged by DesktopServerStage. */
  server?: DesktopServerBundle;
  /** Windows: an NSIS setup program beside the app folder. */
  installer?: boolean;
}

export interface NativeDevOptions extends NativeRunOptions {
  /** The akan dev server the gateway proxies. */
  upstream: string;
  lang: string;
}

/** One mobile target of an app on the native runtime (a phone, or this computer as a desktop app): where it builds,
 * what it ships, and the calls into the API. */
export class NativeApp {
  readonly targetRoot: string;
  readonly web: NativeWebDir;
  //? A dev boot holds its steps and the app's first lines back: one line says it is up, all of it when it failed.
  #boot: NativeDevBoot | null = null;

  constructor(
    readonly app: App,
    readonly target: ResolvedMobileTarget,
    readonly env?: MobileEnv,
  ) {
    this.targetRoot = path.join(app.cwdPath, ".akan", "mobile", target.name);
    this.web = new NativeWebDir(path.join(this.targetRoot, "web"));
  }

  outDir(platform: NativePlatform) {
    return path.join(this.targetRoot, "native", platform);
  }

  /** The web root, from the production build the mobile commands run first. */
  async assembleWeb() {
    const dist = this.app.dist.cwdPath;
    return await this.web.assemble(this.target.config, {
      html: path.join(dist, "csr", targetHtmlFilename(this.target.config)),
      publicDir: path.join(dist, "public"),
      fontsDir: path.join(dist, ".akan", "artifact", "fonts"),
    });
  }

  /** Where a desktop build stages the executables it carries (akan.config.ts `bin`). */
  get binDir() {
    return path.join(this.targetRoot, "bin");
  }

  /** `stageBin: false` for a config nothing is built from (the update key's): staging downloads the `bin` sources. */
  async config({
    server,
    platform,
    stageBin = true,
  }: {
    server?: DesktopServerBundle;
    platform: NativePlatform;
    stageBin?: boolean;
  }) {
    const [appConfig, plugins, nativePlugins] = await Promise.all([
      this.app.getConfig(),
      this.app.collectPlugins(),
      NativePluginFolders.of(this.app),
    ]);
    const desktop = platform === "macos" || platform === "windows" || platform === "linux";
    const carried = desktop && stageBin ? await new DesktopBin(this.app, appConfig).stage(this.binDir) : [];
    return NativeConfig.build({
      appPath: this.app.cwdPath,
      target: this.target.config,
      webDir: this.web.dir,
      contributions: plugins.flatMap((plugin) => (plugin.native ? [plugin.native] : [])),
      locales: appConfig.i18n.locales,
      env: this.env,
      platform,
      nativePlugins,
      ...(server ? { desktopServer: server } : {}),
      ...(carried.length ? { desktopBin: this.binDir } : {}),
    });
  }

  /** The API and the config it is about to build, refused here when the runtime would refuse it later. */
  async prepare(platform: NativePlatform, server?: DesktopServerBundle) {
    const [api, { config, warnings }] = await Promise.all([
      NativeApi.load(this.app.cwdPath),
      this.config({ platform, ...(server ? { server } : {}) }),
    ]);
    for (const warning of warnings) this.app.logger.warn(warning);
    const problems = api.validateConfig(config, { appDir: this.app.cwdPath });
    if (problems.length)
      throw new Error(
        `Mobile target '${this.target.name}' makes an invalid native config:\n- ${problems.join("\n- ")}`,
      );
    return { api, config };
  }

  //? The app's own output: its console (mirrored by a dev build), the simulator log stream or logcat.
  #appLine = (line: string) => {
    const read = NativeAppLine.read(line, { verbose: Executor.verbose });
    if (this.#boot) this.#boot.lines.push(read);
    else this.app.logger[read.level](read.message);
  };

  //* `AKAN_PUBLIC_*` is already inlined into the CSR bundle, so the runtime reads no .env file of its own.
  #task(platform: NativePlatform, config: AkanNativeConfig): TaskOptions {
    return {
      appDir: this.app.cwdPath,
      config,
      platform,
      outDir: this.outDir(platform),
      envFiles: false,
      skipWebBuild: true,
      log: (event) => {
        if (event.level === "error") this.app.logger.error(event.message);
        else if (event.level === "warn") this.app.logger.warn(event.message);
        else if (this.#boot) this.#boot.steps.push(event.message);
        else if (event.level === "tool") this.app.logger.verbose(event.message);
        else this.app.logger.info(event.message);
      },
    };
  }

  async build(platform: NativePlatform, { profile = "release", server, installer = false }: NativeBuildOptions = {}) {
    NativeApp.#assertServerPlatform(platform, server);
    if (installer && platform !== "windows") throw new Error(`An installer is built for Windows, not for ${platform}.`);
    await this.assembleWeb();
    const { api, config } = await this.prepare(platform, server);
    return await api.build({
      ...this.#task(platform, config),
      profile,
      ...(installer ? { windows: { installer } } : {}),
    });
  }

  async run(
    platform: NativePlatform,
    { device, teamId, profile = "debug", server }: NativeRunOptions & NativeBuildOptions = {},
  ) {
    NativeApp.#assertServerPlatform(platform, server);
    await this.assembleWeb();
    const { api, config } = await this.prepare(platform, server);
    return await api.run({
      ...this.#task(platform, config),
      profile,
      onLine: this.#appLine,
      ...(device ? { device } : {}),
      ...(teamId ? { ios: { signing: { teamId } } } : {}),
    });
  }

  //* The gateway serves the page, its HMR socket and its API calls on the app origin. The dev server's own port is
  //* reversed too: a browser the app hands off to (auth-session) opens it directly (baseEnv getServerOrigin).
  async dev(platform: NativePlatform, { upstream, lang, device, teamId }: NativeDevOptions) {
    const startedAt = performance.now();
    const boot: NativeDevBoot = { steps: [], lines: [] };
    this.#boot = boot;
    try {
      await mkdir(this.web.dir, { recursive: true });
      const [{ api, config }, { api: routes }] = await Promise.all([this.prepare(platform), this.app.getConfig()]);
      const session = await api.dev({
        ...this.#task(platform, config),
        upstream,
        hmrPath: "/_akan/hmr",
        //? A dev page calls its own origin (akanjs baseEnv), so the gateway relays the socket it opens for the API too.
        wsPaths: [`${routes.prefix}${routes.websocketPrefix}`],
        reversePorts: [Number(new URL(upstream).port)],
        onLine: this.#appLine,
        startPath: this.startPath(lang),
        ...(device ? { device } : {}),
        ...(teamId ? { ios: { signing: { teamId } } } : {}),
      });
      this.#boot = null;
      this.app.logger.info(this.readyLine(platform, { upstream, device: session.device, startedAt }));
      for (const step of [...boot.steps, `pages through ${session.gateway}`]) this.app.logger.debug(step);
      for (const line of boot.lines) this.app.logger[line.level](line.message);
      return session;
    } catch (error) {
      this.#boot = null;
      for (const step of boot.steps) this.app.logger.info(step);
      for (const line of boot.lines) this.app.logger[line.level === "debug" ? "info" : line.level](line.message);
      throw error;
    }
  }

  /** What a dev boot that came up says, and all it says: `cmdc ios ready · iPhone 16 · http://localhost:8283 · 12.4s`. */
  readyLine(
    platform: NativePlatform,
    { upstream, device, startedAt }: { upstream: string; device?: { name: string }; startedAt: number },
  ) {
    const label = platform === "ios" || platform === "android" ? platform : "desktop";
    const target = this.target.name === "default" ? "" : `/${this.target.name}`;
    const seconds = ((performance.now() - startedAt) / 1000).toFixed(1);
    return [`${this.app.name}${target} ${label} ready`, ...(device ? [device.name] : []), upstream, `${seconds}s`].join(
      " · ",
    );
  }

  async releaseIos({ teamId, adHoc = false }: { teamId?: string; adHoc?: boolean } = {}) {
    await this.assembleWeb();
    const { api, config } = await this.prepare("ios");
    return await api.release({
      ...this.#task("ios", config),
      platform: "ios",
      signing: { ...(teamId ? { teamId } : {}), ...(adHoc ? { distribution: "ad-hoc" as const } : {}) },
    });
  }

  /** Where publishUpdate writes: upload this folder as the target's updates.url. */
  get updatesDir() {
    return path.join(this.targetRoot, "updates");
  }

  /** A signed release installed apps take through the updates plugin, from a release build of this bundle. */
  async publishUpdate(
    platform: NativePlatform,
    { channel, server }: { channel?: string; server?: DesktopServerBundle } = {},
  ) {
    NativeApp.#assertServerPlatform(platform, server);
    if (!this.target.config.updates)
      throw new Error(
        `Mobile target '${this.target.name}' has no updates: { url, publicKey } in akan.config.ts; \`akan update-keygen ${this.app.name}\` prints the key.`,
      );
    await this.assembleWeb();
    const { api, config } = await this.prepare(platform, server);
    return await api.publishUpdate({
      ...this.#task(platform, config),
      platform,
      out: this.updatesDir,
      ...(channel ? { channel } : {}),
    });
  }

  /** The key update releases of this target's app id on `platform` are signed with: made once, then read. */
  async updateKeygen(platform: NativePlatform) {
    const [api, { config }] = await Promise.all([
      NativeApi.load(this.app.cwdPath),
      this.config({ platform, stageBin: false }),
    ]);
    return api.updateKeygen({ config });
  }

  async releaseAndroid({ formats = ["aab"] }: { formats?: ("aab" | "apk")[] } = {}) {
    const signing = NativeApp.androidSigning();
    await this.assembleWeb();
    const { api, config } = await this.prepare("android");
    return await api.release({ ...this.#task("android", config), platform: "android", signing, formats });
  }

  /** An unsigned OTA update of this target's web bundle for `platform`, and the channel its binary follows. */
  async packUpdate(platform: MobilePlatform, { out }: { out?: string } = {}) {
    await this.assembleWeb();
    const { api, config } = await this.prepare(platform);
    if (!config.updates)
      throw new Error(
        `Mobile target '${this.target.name}' takes no updates: add mobile.updates: { url, publicKey } to akan.config.ts first.`,
      );
    const packed = await api.packUpdate({
      ...this.#task(platform, config),
      platform,
      out: out ?? path.join(this.targetRoot, "updates", platform),
    });
    return { ...packed, channel: config.updates.channel ?? "production" };
  }

  static async compareBundles(appDir: string, shipped: string, bundle: string) {
    return (await NativeApi.load(appDir)).compareBundles(shipped, bundle);
  }

  //* The names the Gradle build read, so a CI that already holds these secrets keeps working.
  static androidSigning(env: Record<string, string | undefined> = process.env): AndroidSigning {
    const keystore = env.MYAPP_RELEASE_STORE_FILE;
    const storePassword = env.MYAPP_RELEASE_STORE_PASSWORD;
    const alias = env.MYAPP_RELEASE_KEY_ALIAS;
    const keyPassword = env.MYAPP_RELEASE_KEY_PASSWORD;
    if (!keystore || !storePassword || !alias) {
      const missing = Object.entries({
        MYAPP_RELEASE_STORE_FILE: keystore,
        MYAPP_RELEASE_STORE_PASSWORD: storePassword,
        MYAPP_RELEASE_KEY_ALIAS: alias,
      }).flatMap(([key, value]) => (value ? [] : [key]));
      throw new Error(
        `An Android release is signed with the upload key; set ${missing.join(", ")} in the environment.`,
      );
    }
    return { keystore, storePassword, alias, ...(keyPassword ? { keyPassword } : {}) };
  }

  /** The first page of a dev build, the target's home as a release bundle opens it; the dev server answers the CSR
   * shell only for `?csr=true`. */
  startPath(lang: string) {
    const basePath = this.target.config.basePath?.replace(/^\/+|\/+$/g, "");
    const params = new URLSearchParams({ csr: "true", akanMobileTarget: this.target.name });
    if (basePath) params.set("akanMobileBasePath", basePath);
    if (this.target.config.indexPath) params.set("akanMobileIndexPath", this.target.config.indexPath);
    const home = [lang, basePath, this.target.config.indexPath]
      .flatMap((part) => (part ?? "").split("/"))
      .filter((segment) => segment.length > 0);
    return `/${home.join("/")}?${params}`;
  }

  //? A phone runs no Bun, so only a desktop app can carry the server.
  static #assertServerPlatform(platform: NativePlatform, server: DesktopServerBundle | undefined) {
    if (server && (platform === "ios" || platform === "android"))
      throw new Error(`Only a desktop app carries its server; ${platform} cannot run one.`);
  }

  //* A desktop app builds only on its own OS, so the platform is this computer's.
  static desktopPlatform(host: NodeJS.Platform = process.platform): DesktopPlatform {
    if (host === "darwin") return "macos";
    if (host === "win32") return "windows";
    if (host === "linux") return "linux";
    throw new Error(`A desktop app builds on macOS, Windows or Linux, not on ${host}.`);
  }

  static async devices(appDir: string, platform: MobilePlatform) {
    return await (await NativeApi.load(appDir)).devices({ platform });
  }

  static async doctor(appDir: string, platforms: NativePlatform[]) {
    return await (await NativeApi.load(appDir)).doctor({ platforms });
  }
}
