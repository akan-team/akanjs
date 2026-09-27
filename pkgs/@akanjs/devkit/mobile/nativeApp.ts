import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { AkanNativeConfig } from "@akanjs/native/config";
import type { App } from "../commandDecorators";
import {
  type DesktopPlatform,
  type MobilePlatform,
  type NativePlatform,
  type ResolvedMobileTarget,
  targetHtmlFilename,
} from "./mobileTarget";
import { NativeApi, type NativeBuildApiModule } from "./nativeApi";
import { NativeConfig } from "./nativeConfig";
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

  constructor(
    readonly app: App,
    readonly target: ResolvedMobileTarget,
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

  async config() {
    const [appConfig, plugins] = await Promise.all([this.app.getConfig(), this.app.collectPlugins()]);
    return NativeConfig.build({
      appPath: this.app.cwdPath,
      target: this.target.config,
      webDir: this.web.dir,
      contributions: plugins.flatMap((plugin) => (plugin.native ? [plugin.native] : [])),
      locales: appConfig.i18n.locales,
    });
  }

  /** The API and the config it is about to build, refused here when the runtime would refuse it later. */
  async prepare() {
    const [api, { config, warnings }] = await Promise.all([NativeApi.load(this.app.cwdPath), this.config()]);
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
    this.app.logger.info(`[${this.target.name}] ${line}`);
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
        else if (event.level === "tool") this.app.logger.verbose(event.message);
        else this.app.logger.info(event.message);
      },
    };
  }

  async build(platform: NativePlatform, { profile = "release" }: { profile?: "debug" | "release" } = {}) {
    await this.assembleWeb();
    const { api, config } = await this.prepare();
    return await api.build({ ...this.#task(platform, config), profile });
  }

  async run(
    platform: NativePlatform,
    { device, teamId, profile = "debug" }: NativeRunOptions & { profile?: "debug" | "release" } = {},
  ) {
    await this.assembleWeb();
    const { api, config } = await this.prepare();
    return await api.run({
      ...this.#task(platform, config),
      profile,
      onLine: this.#appLine,
      ...(device ? { device } : {}),
      ...(teamId ? { ios: { signing: { teamId } } } : {}),
    });
  }

  //* The gateway serves the page and its HMR socket on the app origin; API calls go to the dev server itself (baseEnv),
  //* which an Android device reaches through the reversed port.
  async dev(platform: NativePlatform, { upstream, lang, device, teamId }: NativeDevOptions) {
    await mkdir(this.web.dir, { recursive: true });
    const [{ api, config }, { api: routes }] = await Promise.all([this.prepare(), this.app.getConfig()]);
    return await api.dev({
      ...this.#task(platform, config),
      upstream,
      hmrPath: "/_akan/hmr",
      //? A dev page calls its own origin (akanjs baseEnv), so the gateway relays the socket it opens for the API too.
      wsPaths: [`${routes.prefix}${routes.websocketPrefix}`],
      onLine: this.#appLine,
      startPath: this.startPath(lang),
      ...(device ? { device } : {}),
      ...(teamId ? { ios: { signing: { teamId } } } : {}),
    });
  }

  async releaseIos({ teamId, adHoc = false }: { teamId?: string; adHoc?: boolean } = {}) {
    await this.assembleWeb();
    const { api, config } = await this.prepare();
    return await api.release({
      ...this.#task("ios", config),
      platform: "ios",
      signing: { ...(teamId ? { teamId } : {}), ...(adHoc ? { distribution: "ad-hoc" as const } : {}) },
    });
  }

  async releaseAndroid({ formats = ["aab"] }: { formats?: ("aab" | "apk")[] } = {}) {
    const signing = NativeApp.androidSigning();
    await this.assembleWeb();
    const { api, config } = await this.prepare();
    return await api.release({ ...this.#task("android", config), platform: "android", signing, formats });
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
