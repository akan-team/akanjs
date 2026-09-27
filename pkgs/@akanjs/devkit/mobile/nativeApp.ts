import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { AkanNativeConfig } from "@akanjs/native/config";
import type { App } from "../commandDecorators";
import { type MobilePlatform, type ResolvedMobileTarget, targetHtmlFilename } from "./mobileTarget";
import { NativeApi, type NativeBuildApiModule } from "./nativeApi";
import { NativeConfig } from "./nativeConfig";
import { NativeWebDir } from "./nativeWebDir";

type TaskOptions = Parameters<NativeBuildApiModule["build"]>[0];
type DeviceSelector = NonNullable<Parameters<NativeBuildApiModule["run"]>[0]["device"]>;
type ReleaseOptions = Parameters<NativeBuildApiModule["release"]>[0];
type Signing = Pick<ReleaseOptions, "signing">["signing"];

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

/** One mobile target of an app on the native runtime: where it builds, what it ships, and the calls into the API. */
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

  outDir(platform: MobilePlatform) {
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

  //* `AKAN_PUBLIC_*` is already inlined into the CSR bundle, so the runtime reads no .env file of its own.
  #task(platform: MobilePlatform, config: AkanNativeConfig): TaskOptions {
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

  async build(platform: MobilePlatform, { profile = "release" }: { profile?: "debug" | "release" } = {}) {
    await this.assembleWeb();
    const { api, config } = await this.prepare();
    return await api.build({ ...this.#task(platform, config), profile });
  }

  async run(
    platform: MobilePlatform,
    { device, teamId, profile = "debug" }: NativeRunOptions & { profile?: "debug" | "release" } = {},
  ) {
    await this.assembleWeb();
    const { api, config } = await this.prepare();
    return await api.run({
      ...this.#task(platform, config),
      profile,
      ...(device ? { device } : {}),
      ...(teamId ? { ios: { signing: { teamId } } } : {}),
    });
  }

  //* The gateway proxies the akan dev server, so the page keeps the app's origin and its HMR and API sockets relay.
  async dev(platform: MobilePlatform, { upstream, lang, device, teamId }: NativeDevOptions) {
    await mkdir(this.web.dir, { recursive: true });
    const [{ api, config }, appConfig] = await Promise.all([this.prepare(), this.app.getConfig()]);
    return await api.dev({
      ...this.#task(platform, config),
      upstream,
      hmrPath: "/_akan/hmr",
      wsPaths: [`${appConfig.api.prefix}${appConfig.api.websocketPrefix}`],
      startPath: this.startPath(lang),
      ...(device ? { device } : {}),
      ...(teamId ? { ios: { signing: { teamId } } } : {}),
    });
  }

  async release(platform: MobilePlatform, signing: Signing) {
    await this.assembleWeb();
    const { api, config } = await this.prepare();
    return await api.release({ ...this.#task(platform, config), signing } as ReleaseOptions);
  }

  /** The first page of a dev build: the dev server answers the CSR shell only for `?csr=true`. */
  startPath(lang: string) {
    const basePath = this.target.config.basePath?.replace(/^\/+|\/+$/g, "");
    const params = new URLSearchParams({ csr: "true", akanMobileTarget: this.target.name });
    if (basePath) params.set("akanMobileBasePath", basePath);
    if (this.target.config.indexPath) params.set("akanMobileIndexPath", this.target.config.indexPath);
    return `/${basePath ? `${lang}/${basePath}` : lang}?${params}`;
  }

  static async devices(appDir: string, platform: MobilePlatform) {
    return await (await NativeApi.load(appDir)).devices({ platform });
  }

  static async doctor(appDir: string, platforms: MobilePlatform[]) {
    return await (await NativeApi.load(appDir)).doctor({ platforms });
  }
}
