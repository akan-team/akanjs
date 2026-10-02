import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AkanPlugin } from "akanjs";
import { DatabaseModes, normalizeRoutePrefix } from "akanjs/base";
import { type AkanI18nConfig, resolveAkanI18nConfig } from "akanjs/common";
import type { AkanImageConfig } from "akanjs/server";
import type { App, Lib } from "../commandDecorators";
import { LibExecutor, WorkspaceExecutor } from "../executors";
import type { BaseDevEnv, PackageJson } from "../types";
import { AkanBin } from "./akanBin";
import {
  type AkanApiConfig,
  type AkanAssetsConfig,
  type AkanBinConfig,
  type AkanDatabaseConfig,
  type AkanNativeAppConfig,
  type AkanNativeAppResult,
  type AkanNativeDeepLinks,
  type AkanNativeDesktopConfig,
  type AkanNativeSettings,
  type AkanNativeTarget,
  type AkanNativeUpdatesConfig,
  type AkanRouteConfig,
  type AkanWebConfig,
  type AkanWebOption,
  type AppConfigResult,
  type Arch,
  archs,
  type DatabaseMode,
  type DeepPartial,
  type DockerConfig,
  type DockerOption,
  type DockerRun,
  type LibAssetsConfig,
  type LibConfigResult,
  type LibDockerConfig,
} from "./types";

const DEFAULT_BARREL_IMPORTS = ["akanjs/webkit", "akanjs/common", "akanjs/ui", "akanjs/server"];
const DEFAULT_OPTIMIZE_IMPORTS = [
  "lucide-react date-fns lodash-es ramda antd react-bootstrap ahooks @ant-design/icons @headlessui/react",
  "@headlessui-float/react @heroicons/react/20/solid @heroicons/react/24/solid @heroicons/react/24/outline",
  "@visx/visx @tremor/react rxjs @mui/material @mui/icons-material recharts react-use @material-ui/core",
  "@material-ui/icons @tabler/icons-react mui-core react-icons/*",
].flatMap((line) => line.split(" "));
const WORKSPACE_BARREL_FACETS = ["ui", "webkit", "common", "client", "server"] as const;
const DEFAULT_DOCKER_IMAGE = "oven/bun:1-slim";
const SSR_RUNTIME_PACKAGES = ["react", "react-dom", "react-server-dom-webpack"] as const;
const DEFAULT_AKAN_IMAGE_CONFIG: AkanImageConfig = {
  deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
  imageSizes: [32, 48, 64, 96, 128, 256, 384],
  formats: ["image/webp"],
  qualities: [75],
  minimumCacheTTL: 14400,
  remotePatterns: [],
  localPatterns: [{ pathname: "/**" }],
  dangerouslyAllowSVG: false,
  maximumRedirects: 3,
  fetchTimeoutMs: 7000,
  maxRemoteBytes: 25 * 1024 * 1024,
  maxConcurrency: 0,
};

const normalizeIndexPath = (indexPath: string | undefined): string | undefined => {
  const normalized = indexPath?.trim();
  if (!normalized) return undefined;
  const path = `/${normalized.replace(/^\/+|\/+$/g, "")}`;
  return path === "/" ? "/" : path;
};

const normalizeStringList = (values: string[] | undefined) => {
  const normalized = values?.map((value) => value.trim()).filter(Boolean) ?? [];
  return normalized.length > 0 ? [...new Set(normalized)] : undefined;
};

// A reverse-DNS / Android package segment: lowercase alphanumerics, never empty, never starting with a digit.
const sanitizeAppIdSegment = (value: string): string => {
  const cleaned = value.toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (!cleaned) return "app";
  return /^[a-z]/.test(cleaned) ? cleaned : `app${cleaned}`;
};

// The repo name is the org segment: a bare `com.<appName>.app` is routinely already claimed on Apple's portal.
export const deriveDefaultAppId = (orgName: string, appName: string): string =>
  `com.${sanitizeAppIdSegment(orgName)}.${sanitizeAppIdSegment(appName)}`;

const normalizeDeepLinkDomain = (domain: string) => {
  const normalized = domain.trim();
  if (!normalized) return "";
  try {
    const url = new URL(normalized.includes("://") ? normalized : `https://${normalized}`);
    return url.host.toLowerCase();
  } catch {
    return normalized
      .replace(/^https?:\/\//, "")
      .replace(/\/+$/g, "")
      .toLowerCase();
  }
};

const normalizeDeepLinks = (deepLinks: AkanNativeDeepLinks | undefined): AkanNativeDeepLinks | undefined => {
  const schemes = normalizeStringList(deepLinks?.schemes);
  const domains = normalizeStringList(deepLinks?.domains?.map(normalizeDeepLinkDomain));
  if (!schemes && !domains) return undefined;
  return { ...(schemes ? { schemes } : {}), ...(domains ? { domains } : {}) };
};

type AppConfigDeclaration = Omit<DeepPartial<AppConfigResult>, "docker" | "web" | "bin" | "native"> & {
  docker?: DockerOption;
  web?: AkanWebOption;
  bin?: AkanBinConfig;
  native?: AkanNativeAppConfig;
};

type LibConfigDeclaration = Omit<DeepPartial<LibConfigResult>, "bin"> & { bin?: AkanBinConfig };

export interface LibContributions {
  externalLibs: string[];
  trustedDependencies?: string[];
  /** Per lib, since an app carries only the entries of the libs it depends on. */
  bin?: { lib: string; bin: AkanBinConfig }[];
  docker: LibDockerConfig;
  /** Keep globs rewritten to the app's own `public/`, where `akan sync` mounts each lib's assets. */
  keepFonts?: string[];
}

const emptyLibContributions = (): LibContributions => ({
  externalLibs: [],
  trustedDependencies: [],
  bin: [],
  docker: { preRuns: [], postRuns: [] },
  keepFonts: [],
});

const normalizePackageNames = (names: unknown, owner: string): string[] => {
  if (names === undefined) return [];
  if (!Array.isArray(names) || names.some((name) => typeof name !== "string" || !name.trim()))
    throw new Error(`${owner}: trustedDependencies lists package names`);
  return [...new Set(names.map((name: string) => name.trim()))];
};

const normalizeKeepFonts = (keepFonts: string[] | undefined) => [
  ...new Set((keepFonts ?? []).map((glob) => glob.trim().replace(/^\/+/, "")).filter(Boolean)),
];

/** First occurrence wins, so a step a lib and its app both declare becomes one layer. */
const dedupeDockerRuns = (runs: DockerRun[]): DockerRun[] => {
  const byKey = new Map<string, DockerRun>();
  for (const run of runs) byKey.set(typeof run === "string" ? run : JSON.stringify(run), run);
  return [...byKey.values()];
};

export class AkanAppConfig implements AppConfigResult {
  app: App;
  rootPackageJson: PackageJson;
  docker: DockerConfig;
  /** The Dockerfile `akan build` writes: the declared string verbatim, or one assembled from the parts. */
  dockerfile: string;
  database: AkanDatabaseConfig;
  web: AkanWebConfig;
  externalLibs: string[];
  trustedDependencies: string[];
  /** The app's own entries; the libs' are in `libBins`. */
  bin: AkanBinConfig;
  libBins: { lib: string; bin: AkanBinConfig }[];
  barrelImports: string[];
  optimizeImports: string[];
  images: AkanImageConfig;
  i18n: AkanI18nConfig;
  api: AkanApiConfig;
  publicEnv: string[];
  native: AkanNativeAppResult;
  /** True only when the app's akan.config.ts declares a `native` section (vs. the synthesized default target). */
  hasNativeConfig: boolean;
  secrets: string[];
  assets: AkanAssetsConfig;
  /** Raw setting, resolved against the app's lib deps at sync time. */
  syncPageLibs: string[] | boolean;
  baseDevEnv: BaseDevEnv;
  libs: string[];
  /** Live-only: plugins declared in this app's `akan.config.ts` (never serialized). */
  plugins: AkanPlugin[];
  domains = new Set<string>();
  subRoutes = new Map<string, Set<string>>();
  basePaths = new Set<string>();
  branches = new Set<string>(["debug", "develop", "main"]);
  constructor(
    app: App,
    libs: string[],
    rootPackageJson: PackageJson,
    config: AppConfigDeclaration,
    baseDevEnv: BaseDevEnv,
    plugins: AkanPlugin[] = [],
    libContributions: LibContributions = emptyLibContributions(),
  ) {
    this.app = app;
    this.rootPackageJson = rootPackageJson;
    this.libs = libs;
    this.baseDevEnv = baseDevEnv;
    this.plugins = plugins;
    this.#applyRoutes(config?.routes);
    this.database = AkanAppConfig.#database(app, config);
    this.externalLibs = [...new Set([...(config?.externalLibs ?? []), ...libContributions.externalLibs])];
    const owner = `apps/${app.name}/akan.config.ts`;
    this.trustedDependencies = [
      ...new Set([
        ...normalizePackageNames(config?.trustedDependencies, owner),
        ...(libContributions.trustedDependencies ?? []),
      ]),
    ];
    this.bin = AkanBin.parse(config?.bin, owner, app.cwdPath);
    this.libBins = libContributions.bin ?? [];
    this.barrelImports = [
      ...DEFAULT_BARREL_IMPORTS,
      ...WORKSPACE_BARREL_FACETS.map((facet) => `@apps/${app.name}/${facet}`),
      ...libs.flatMap((lib) => WORKSPACE_BARREL_FACETS.map((facet) => `@libs/${lib}/${facet}`)),
      ...(config?.barrelImports ?? []),
    ];
    this.optimizeImports = [...new Set([...DEFAULT_OPTIMIZE_IMPORTS, ...(config?.optimizeImports ?? [])])];
    this.images = mergeImageConfig(config?.images as Partial<AkanImageConfig> | undefined);
    this.i18n = resolveAkanI18nConfig(config?.i18n);
    process.env.AKAN_PUBLIC_DEFAULT_LOCALE = this.i18n.defaultLocale;
    process.env.AKAN_PUBLIC_LOCALES = this.i18n.locales.join(",");
    this.api = {
      prefix: normalizeRoutePrefix(config?.api?.prefix) ?? "/api",
      websocketPrefix: normalizeRoutePrefix(config?.api?.websocketPrefix) ?? "/ws",
    };
    process.env.AKAN_PUBLIC_API_PREFIX = this.api.prefix;
    process.env.AKAN_PUBLIC_WS_PREFIX = this.api.websocketPrefix;
    this.publicEnv = (config?.publicEnv as string[] | undefined) ?? ([] as string[]);
    this.secrets = (config?.secrets as string[] | undefined) ?? ([] as string[]);
    this.assets = {
      pruneFonts: config?.assets?.pruneFonts ?? true,
      keepFonts: [
        ...normalizeKeepFonts(config?.assets?.keepFonts as string[] | undefined),
        ...(libContributions.keepFonts ?? []),
      ],
    };
    this.syncPageLibs = (config?.syncPageLibs as string[] | boolean | undefined) ?? false;
    if ((config as { mobile?: unknown }).mobile !== undefined)
      throw new Error(
        `apps/${this.app.name}/akan.config.ts declares \`mobile\`, which is now \`native\`: the platform settings sit in native.ios, native.android and native.desktop, and a target overrides them under native.targets.<name>.`,
      );
    this.hasNativeConfig = Boolean(config.native);
    this.native = this.#resolveNativeConfig(config.native);
    this.web = this.#resolveWebConfig(config.web);
    this.docker = AkanAppConfig.#resolveDocker(config.docker, libContributions.docker);
    this.dockerfile = this.#makeDockerfile();
  }
  #resolveWebConfig(web: AkanWebOption | undefined): AkanWebConfig {
    const resolved = typeof web === "object" ? { ssr: true, csr: web.csr } : { ssr: web ?? true, csr: web ?? true };
    // `akan build-ios` / `build-android` copy `dist/apps/<app>/csr/<target>.html` into the native project.
    if (!resolved.csr && this.hasNativeConfig)
      throw new Error(
        `apps/${this.app.name}/akan.config.ts turns the CSR bundle off but declares a native section; the native apps ship that bundle. Drop the native section or leave CSR on.`,
      );
    return resolved;
  }
  #resolveNativeConfig(native: AkanNativeAppConfig | undefined): AkanNativeAppResult {
    const configPath = `apps/${this.app.name}/akan.config.ts`;
    const { targets: rawTargets, ...root } = native ?? {};
    AkanAppConfig.#assertNativeKeys(root, "native", configPath);
    AkanAppConfig.#assertFiles(root, "native", configPath);
    const appName = root.appName ?? this.app.name;
    const appId = root.appId ?? deriveDefaultAppId(this.baseDevEnv.repoName, this.app.name);
    const version = root.version ?? "0.0.1";
    const buildNum = root.buildNum ?? 1;
    const named = rawTargets !== undefined && Object.keys(rawTargets).length > 0;
    const entries: [string, AkanNativeSettings][] = named
      ? Object.entries(rawTargets)
      : [[this.basePaths.has(this.app.name) ? this.app.name : "default", {}]];
    const targets = Object.fromEntries(
      entries.map(([name, own]) => {
        const where = named ? `native.targets.${name}` : "native";
        AkanAppConfig.#assertNativeKeys(own ?? {}, where, configPath);
        const merged = AkanAppConfig.#overlay(root, own ?? {});
        const fallbackBasePath = !named && this.basePaths.has(name) ? name : undefined;
        const basePath = (merged.basePath ?? fallbackBasePath)?.replace(/^\/+|\/+$/g, "") || undefined;
        if (basePath && !this.basePaths.has(basePath))
          throw new Error(`Native target '${name}' uses unknown basePath '${basePath}' in ${configPath}`);
        const { updates } = merged;
        if (updates && (!updates.url || !updates.publicKey))
          throw new Error(
            `${where}.updates in ${configPath} has no url or publicKey${named ? "; give them in native.updates or the target's own" : ""}.`,
          );
        AkanAppConfig.#assertFiles(own ?? {}, where, configPath);
        const {
          basePath: _basePath,
          indexPath: rawIndexPath,
          deepLinks: rawDeepLinks,
          updates: _updates,
          ...rest
        } = merged;
        const indexPath = normalizeIndexPath(rawIndexPath);
        const deepLinks = normalizeDeepLinks(rawDeepLinks);
        const { teamId: rawTeamId, ...iosRest } = AkanAppConfig.#platformIndexPath(merged.ios ?? {});
        const teamId = rawTeamId?.trim();
        const { sha256CertFingerprints: rawFingerprints, ...androidRest } = AkanAppConfig.#platformIndexPath(
          merged.android ?? {},
        );
        const fingerprints = normalizeStringList(rawFingerprints);
        const target: AkanNativeTarget = {
          ...rest,
          name,
          ...(basePath ? { basePath } : {}),
          ...(indexPath ? { indexPath } : {}),
          ...(deepLinks ? { deepLinks } : {}),
          ...(merged.ios ? { ios: { ...iosRest, ...(teamId ? { teamId } : {}) } } : {}),
          ...(merged.android
            ? { android: { ...androidRest, ...(fingerprints ? { sha256CertFingerprints: fingerprints } : {}) } }
            : {}),
          ...(merged.desktop
            ? {
                desktop: AkanAppConfig.#desktopServer(
                  AkanAppConfig.#platformIndexPath(merged.desktop),
                  `${where}.desktop.server`,
                  configPath,
                ),
              }
            : {}),
          appName: merged.appName ?? this.app.name,
          appId: merged.appId ?? appId,
          version: merged.version ?? version,
          buildNum: merged.buildNum ?? buildNum,
          ...(updates ? { updates: updates as AkanNativeUpdatesConfig } : {}),
        };
        return [name, target];
      }),
    );
    return { appName, appId, ...(root.fileName ? { fileName: root.fileName } : {}), version, buildNum, targets };
  }
  //? `true` or `{ omit }`: each omitted name trimmed once, so two targets that omit the same packages stage one server.
  static #desktopServer<T extends { server?: AkanNativeDesktopConfig["server"] }>(
    desktop: T,
    where: string,
    configPath: string,
  ): T {
    const { server } = desktop;
    if (server === undefined || typeof server === "boolean") return desktop;
    if (!AkanAppConfig.#isPlainObject(server))
      throw new Error(`${where} in ${configPath} must be true or { omit: string[] }.`);
    const omit = server.omit;
    if (omit !== undefined && (!Array.isArray(omit) || omit.some((name) => typeof name !== "string" || !name.trim())))
      throw new Error(`${where}.omit in ${configPath} must be a list of package names.`);
    const names = [...new Set((omit ?? []).map((name) => name.trim()))].sort();
    return { ...desktop, server: { omit: names } };
  }
  static #platformIndexPath<T extends { indexPath?: string }>(section: T): T {
    const { indexPath: rawIndexPath, ...rest } = section;
    const indexPath = normalizeIndexPath(rawIndexPath);
    return { ...rest, ...(indexPath ? { indexPath } : {}) } as T;
  }
  /** `own` over `base`: plain objects merge key by key, and any other value, a list included, replaces. */
  static #overlay(base: AkanNativeSettings, own: AkanNativeSettings): AkanNativeSettings {
    const merge = (kept: unknown, value: unknown, top: boolean, key: string): unknown => {
      if (!AkanAppConfig.#isPlainObject(kept) || !AkanAppConfig.#isPlainObject(value)) return value;
      //? An icon or splash given as an object is one value: its image and color go together.
      if (top && (key === "icon" || key === "splash")) return value;
      const out: Record<string, unknown> = { ...kept };
      for (const [inner, next] of Object.entries(value))
        if (next !== undefined) out[inner] = merge(out[inner], next, false, inner);
      return out;
    };
    const out: Record<string, unknown> = { ...base };
    for (const [key, value] of Object.entries(own))
      if (value !== undefined) out[key] = merge(out[key], value, true, key);
    return out as AkanNativeSettings;
  }
  static #isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  static readonly #nativeKeys = {
    native: [
      "basePath",
      "indexPath",
      "appName",
      "appId",
      "fileName",
      "version",
      "buildNum",
      "icon",
      "splash",
      "permissions",
      "plugins",
      "deepLinks",
      "updates",
      "ios",
      "android",
      "desktop",
    ],
    ios: ["indexPath", "teamId", "infoPlist", "entitlements", "privacy", "files"],
    android: [
      "indexPath",
      "sha256CertFingerprints",
      "googleServices",
      "push",
      "autoplay",
      "manifest",
      "application",
      "activity",
      "files",
    ],
    desktop: ["indexPath", "server", "recovery", "window", "screenCapture", "entitlements"],
    desktopServer: ["omit"],
    deepLinks: ["schemes", "domains"],
  } as const;
  //* Settings that moved when `mobile` became `native` are named with where they went, instead of "unknown".
  static readonly #movedKeys: Readonly<Record<string, string>> = {
    native: "the platform sections and plugins sit directly in the native section: ios, android, desktop, plugins",
    assets: "icon and splash sit directly in the native section",
    files:
      "ios.files (keyed by the path in the app bundle) or android.files (keyed res/<type>/<file> or assets/<path>)",
    push: "android.push",
    privacy: "ios.privacy",
    "deepLinks.ios": "ios.teamId",
    "deepLinks.android": "android.sha256CertFingerprints",
  };
  static #assertNativeKeys(section: object, where: string, configPath: string) {
    const check = (value: unknown, known: readonly string[], at: string, kind: string) => {
      if (!AkanAppConfig.#isPlainObject(value)) return;
      for (const key of Object.keys(value)) {
        if (known.includes(key)) continue;
        const moved = AkanAppConfig.#movedKeys[kind === "native" ? key : `${kind}.${key}`];
        throw new Error(
          moved
            ? `${at}.${key} in ${configPath} has moved: ${moved}.`
            : `${at}.${key} in ${configPath} is not a native setting. Known: ${known.join(", ")}.`,
        );
      }
    };
    check(section, AkanAppConfig.#nativeKeys.native, where, "native");
    const settings = section as AkanNativeSettings;
    check(settings.ios, AkanAppConfig.#nativeKeys.ios, `${where}.ios`, "ios");
    check(settings.android, AkanAppConfig.#nativeKeys.android, `${where}.android`, "android");
    check(settings.desktop, AkanAppConfig.#nativeKeys.desktop, `${where}.desktop`, "desktop");
    check(
      settings.desktop?.server,
      AkanAppConfig.#nativeKeys.desktopServer,
      `${where}.desktop.server`,
      "desktopServer",
    );
    check(settings.deepLinks, AkanAppConfig.#nativeKeys.deepLinks, `${where}.deepLinks`, "deepLinks");
  }
  static readonly #androidFilePattern = /^(?:res\/[^/]+\/[^/]+|assets\/.+)$/;
  static #assertFiles(settings: AkanNativeSettings, where: string, configPath: string) {
    const check = (
      files: Record<string, string> | undefined,
      at: string,
      valid: (to: string) => boolean,
      shape: string,
    ) => {
      for (const [to, from] of Object.entries(files ?? {})) {
        if (typeof from !== "string")
          throw new Error(
            `${at}["${to}"] in ${configPath} must name its source file, relative to the app folder, e.g. { "${shape}": "assets/chime.mp3" }.`,
          );
        if (!valid(to)) throw new Error(`${at}["${to}"] in ${configPath} must land at ${shape}.`);
      }
    };
    check(
      settings.ios?.files,
      `${where}.ios.files`,
      (to) => to.length > 0 && !to.startsWith("/") && !to.split("/").includes(".."),
      "<path in the app bundle>",
    );
    check(
      settings.android?.files,
      `${where}.android.files`,
      (to) => AkanAppConfig.#androidFilePattern.test(to),
      "res/<type>/<file> or assets/<path>",
    );
  }
  #applyRoutes(routes: AkanRouteConfig[] = []) {
    for (const route of routes) {
      const basePath = route.basePath ? route.basePath.replace(/^\/+|\/+$/g, "") : null;
      if (basePath !== null) this.basePaths.add(basePath);
      const domains = basePath !== null ? this.subRoutes.getOrInsert(basePath, new Set()) : this.domains;
      for (const branch of Object.keys(route.domains)) this.branches.add(branch);
      for (const domain of Object.values(route.domains).flat())
        if (domain) domains.add(domain.toLowerCase().replace(/:\d+$/, ""));
    }
    const appName = this.app.name.toLowerCase();
    const serveDomain = this.baseDevEnv.serveDomain.toLowerCase();
    if (this.subRoutes.size === 0)
      this.branches.forEach((branch) => void this.domains.add(`${appName}-${branch}.${serveDomain}`));
    else
      Array.from(this.subRoutes.entries()).forEach(([basePath, domains]) => {
        this.branches.forEach((domain) => void domains.add(`${basePath}-${domain}.${serveDomain}`));
      });
  }
  #getDockerRunScripts(runs: DockerRun[]) {
    return runs.map((run) => {
      if (typeof run === "string") return `RUN ${run}`;
      else
        return Object.entries(run)
          .map(
            ([arch, script]) => `RUN if [ "$TARGETARCH" = "${arch}" ]; then \
    ${script}; \
  fi`,
          )
          .join("\n");
    });
  }
  #getDockerImageScript(image: string | { [key in Arch]?: string }, defaultImage: string) {
    if (typeof image === "string") return `FROM ${image}`;
    else return archs.map((arch) => `FROM ${image[arch] ?? defaultImage} AS ${arch}`).join("\n");
  }
  /** A declared Dockerfile string is verbatim, so a lib's steps are dropped rather than silently unapplied. */
  static #resolveDocker(docker: DockerOption | undefined, libDocker: LibDockerConfig): DockerConfig {
    if (typeof docker === "string") return docker;
    return {
      image: docker?.image ?? DEFAULT_DOCKER_IMAGE,
      preRuns: dedupeDockerRuns([...libDocker.preRuns, ...(docker?.preRuns ?? [])]),
      postRuns: dedupeDockerRuns([...libDocker.postRuns, ...(docker?.postRuns ?? [])]),
      command: docker?.command ?? ["bun", "main.js"],
    };
  }
  /** What the built server runs with in its image; a desktop app's carried server starts from the same values. */
  getProductionEnv(environment: string = this.baseDevEnv.env): Record<string, string> {
    return {
      PORT: "8282",
      NODE_ENV: "production",
      AKAN_PUBLIC_REPO_NAME: this.baseDevEnv.repoName,
      AKAN_PUBLIC_SERVE_DOMAIN: this.baseDevEnv.serveDomain,
      AKAN_PUBLIC_APP_NAME: this.app.name,
      AKAN_PUBLIC_ENV: environment,
      ...(this.basePaths.size ? { AKAN_PUBLIC_BASE_PATHS: [...this.basePaths].join(",") } : {}),
      AKAN_PUBLIC_DEFAULT_LOCALE: this.i18n.defaultLocale,
      AKAN_PUBLIC_LOCALES: this.i18n.locales.join(","),
      AKAN_PUBLIC_API_PREFIX: this.api.prefix,
      AKAN_PUBLIC_WS_PREFIX: this.api.websocketPrefix,
      AKAN_PUBLIC_OPERATION_MODE: "cloud",
      AKAN_DATABASE_MODES: this.database.modes.join(","),
      // File logging is off: a container's writable layer is ephemeral and stdout is the collection path.
      AKAN_LOG_TO_FILE: "0",
      // The web env matches what was built (a deployment can only narrow it).
      ...(this.web.ssr ? {} : { AKAN_SSR: "false" }),
      ...(this.web.csr ? {} : { AKAN_CSR: "false" }),
    };
  }
  dockerfileFor(environment: string): string {
    return this.#makeDockerfile(environment);
  }
  #makeDockerfile(environment?: string): string {
    if (typeof this.docker === "string") return this.docker;
    const { image, preRuns, postRuns, command } = this.docker;
    const preRunScripts = this.#getDockerRunScripts(preRuns);
    const postRunScripts = this.#getDockerRunScripts(postRuns);
    const imageScript = this.#getDockerImageScript(image, DEFAULT_DOCKER_IMAGE);
    const envLines = Object.entries(this.getProductionEnv(environment)).map(([key, value]) => `ENV ${key}=${value}`);
    return `${imageScript}
RUN apt-get update && apt-get upgrade -y && apt-get install -y --no-install-recommends ca-certificates tzdata && rm -rf /var/lib/apt/lists/*
RUN ln -sf /usr/share/zoneinfo/Asia/Seoul /etc/localtime
ARG TARGETARCH
${preRunScripts.join("\n")}
RUN mkdir -p /workspace
WORKDIR /workspace
COPY ./package.json ./package.json
RUN bun install --production
${postRunScripts.join("\n")}
COPY . .
${envLines.join("\n")}
CMD [${command.map((c) => `"${c}"`).join(",")}]`;
  }
  static #importGeneration = 0;
  // Bun caches dynamic imports by path; a fresh query string re-evaluates the config module (its imports stay cached).
  static async importConfigModule<T = unknown>(
    cwdPath: string,
    { bustImportCache = false }: { bustImportCache?: boolean } = {},
  ): Promise<T> {
    const configPath = `${cwdPath}/akan.config.ts`;
    const importPath = bustImportCache
      ? `${configPath}?akanConfigGeneration=${++AkanAppConfig.#importGeneration}`
      : configPath;
    return (await import(importPath).then((mod: { default: T }) => mod.default)) as T;
  }

  static async from(app: App, { bustImportCache = false }: { bustImportCache?: boolean } = {}) {
    const [configImp, baseDevEnv, libs, rootPackageJson] = await Promise.all([
      AkanAppConfig.importConfigModule(app.cwdPath, { bustImportCache }),
      WorkspaceExecutor.getBaseDevEnv(path.join(app.workspace.workspaceRoot, ".env")),
      app.workspace.getLibs(),
      app.workspace.getPackageJson(),
    ]);
    const resolved = typeof configImp === "function" ? configImp(app) : configImp;
    const { plugins, ...config } = (resolved ?? {}) as AppConfigDeclaration & { plugins?: AkanPlugin[] };
    const libContributions = await AkanAppConfig.#collectLibContributions(app, libs, bustImportCache);
    return new AkanAppConfig(app, libs, rootPackageJson, config, baseDevEnv, plugins ?? [], libContributions);
  }
  //* Every workspace lib is read, not just this app's lib deps: narrowing the set needs the dependency
  //* scan, and the incremental page rebundle re-reads this config on every file change.
  static async #collectLibContributions(app: App, libs: string[], bustImportCache: boolean): Promise<LibContributions> {
    const libConfigs = await Promise.all(
      libs.map(async (libName) =>
        LibExecutor.from(app, libName)
          .getConfig({ refresh: bustImportCache })
          .catch((error: unknown) => {
            app.logger.warn(`Skipped libs/${libName}/akan.config.ts contributions: ${String(error)}`);
            return null;
          }),
      ),
    );
    return {
      externalLibs: libConfigs.flatMap((libConfig) => libConfig?.externalLibs ?? []),
      trustedDependencies: libConfigs.flatMap((libConfig) => libConfig?.trustedDependencies ?? []),
      bin: libConfigs.flatMap((libConfig) =>
        libConfig && Object.keys(libConfig.bin).length ? [{ lib: libConfig.lib.name, bin: libConfig.bin }] : [],
      ),
      docker: {
        preRuns: libConfigs.flatMap((libConfig) => libConfig?.docker.preRuns ?? []),
        postRuns: libConfigs.flatMap((libConfig) => libConfig?.docker.postRuns ?? []),
      },
      //* A lib writes the glob against its own `public/`; `akan sync` mounts that at `public/libs/<lib>`.
      keepFonts: libConfigs.flatMap((libConfig) =>
        (libConfig?.assets.keepFonts ?? []).map((glob) => `libs/${libConfig?.lib.name}/${glob}`),
      ),
    };
  }
  #resolveProductionDependencyVersion(lib: string) {
    const rootVersion = this.rootPackageJson.dependencies?.[lib] ?? this.rootPackageJson.devDependencies?.[lib];
    if (rootVersion) return rootVersion;
    // The framework's own (peer)dependencies resolve plugin runtime packages without a hardcoded list.
    const akanPackageJson = getAkanPackageJson();
    const version = akanPackageJson.dependencies?.[lib] ?? akanPackageJson.peerDependencies?.[lib];
    if (!version) throw new Error(`Dependency ${lib} not found in package.json`);
    return version;
  }
  #getProductionRuntimePackages() {
    return [
      ...this.externalLibs,
      ...SSR_RUNTIME_PACKAGES,
      ...this.database.modes.flatMap((mode) => this.getDatabaseModeRuntimePackages(mode)),
    ];
  }
  getDatabaseModeRuntimePackages(databaseMode: DatabaseMode) {
    return [...DatabaseModes.drivers[databaseMode]];
  }
  getMissingDatabaseModeDependencySpecs(databaseMode: DatabaseMode) {
    return this.#getMissingDependencySpecs(this.getDatabaseModeRuntimePackages(databaseMode));
  }
  /** The mode a CLI command runs this app in: the shell's `AKAN_DATABASE_MODE` if the app declares it, else the first. */
  resolveDatabaseMode() {
    return DatabaseModes.resolve({
      requested: process.env.AKAN_DATABASE_MODE,
      declared: this.database.modes.join(","),
      local: true,
    });
  }
  static #database(app: App, config: AppConfigDeclaration): AkanDatabaseConfig {
    const declared = config?.database?.modes?.filter((mode): mode is DatabaseMode => !!mode);
    const modes = declared?.length ? declared : ["single"];
    return { modes: DatabaseModes.parseList(modes.join(","), `database.modes in apps/${app.name}/akan.config.ts`) };
  }
  #getMissingDependencySpecs(libs: readonly string[]) {
    const rootDependencies = {
      ...this.rootPackageJson.dependencies,
      ...this.rootPackageJson.devDependencies,
    };
    return libs
      .filter((lib) => !rootDependencies[lib])
      .map((lib) => `${lib}@${this.#resolveProductionDependencyVersion(lib)}`);
  }
  get akanVersion() {
    return getAkanPackageJson().version;
  }
  getProductionPackageJson(data: Partial<PackageJson> = {}): PackageJson {
    return {
      name: this.app.name,
      description: this.app.name,
      version: "1.0.0",
      main: "./main.js",
      dependencies: Object.fromEntries(
        [...new Set(this.#getProductionRuntimePackages())].map((lib) => [
          lib,
          this.#resolveProductionDependencyVersion(lib),
        ]),
      ),
      ...(this.trustedDependencies.length ? { trustedDependencies: this.trustedDependencies } : {}),
      ...data,
    };
  }
}

let akanPackageJson: PackageJson | null = null;

function getAkanPackageJson() {
  if (akanPackageJson) return akanPackageJson;
  const sourceDir = path.dirname(fileURLToPath(import.meta.url));
  const packageJsonPaths = [
    path.join(sourceDir, "../../../akanjs/package.json"),
    path.join(process.cwd(), "pkgs/akanjs/package.json"),
    path.join(path.dirname(Bun.main), "node_modules/akanjs/package.json"),
  ];
  try {
    packageJsonPaths.unshift(Bun.resolveSync("akanjs/package.json", sourceDir));
  } catch {
    // Monorepo source execution usually resolves Akan packages through tsconfig paths, not node_modules.
  }
  for (const packageJsonPath of packageJsonPaths) {
    try {
      akanPackageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as PackageJson;
      return akanPackageJson;
    } catch {
      // Try the next known layout: source package first, bundled CLI package second.
    }
  }
  akanPackageJson = {
    name: "akanjs",
    version: "0.0.0",
    description: "akanjs",
    dependencies: {},
  };
  return akanPackageJson;
}

function mergeImageConfig(config: Partial<AkanImageConfig> = {}): AkanImageConfig {
  return {
    ...DEFAULT_AKAN_IMAGE_CONFIG,
    ...config,
    deviceSizes: config.deviceSizes ?? DEFAULT_AKAN_IMAGE_CONFIG.deviceSizes,
    imageSizes: config.imageSizes ?? DEFAULT_AKAN_IMAGE_CONFIG.imageSizes,
    formats: config.formats ?? DEFAULT_AKAN_IMAGE_CONFIG.formats,
    qualities: config.qualities ?? DEFAULT_AKAN_IMAGE_CONFIG.qualities,
    remotePatterns: config.remotePatterns ?? DEFAULT_AKAN_IMAGE_CONFIG.remotePatterns,
    localPatterns: config.localPatterns ?? DEFAULT_AKAN_IMAGE_CONFIG.localPatterns,
  };
}

export class AkanLibConfig implements LibConfigResult {
  lib: Lib;
  externalLibs: string[];
  trustedDependencies: string[];
  bin: AkanBinConfig;
  docker: LibDockerConfig;
  assets: LibAssetsConfig;
  /** Live-only: plugins declared in this lib's `akan.config.ts` (never serialized). */
  plugins: AkanPlugin[];
  constructor(lib: Lib, config: LibConfigDeclaration, plugins: AkanPlugin[] = []) {
    this.lib = lib;
    this.externalLibs = config?.externalLibs ?? [];
    const owner = `libs/${lib.name}/akan.config.ts`;
    this.trustedDependencies = normalizePackageNames(config?.trustedDependencies, owner);
    this.bin = AkanBin.parse(config?.bin, owner, lib.cwdPath);
    this.docker = { preRuns: config?.docker?.preRuns ?? [], postRuns: config?.docker?.postRuns ?? [] };
    this.assets = { keepFonts: normalizeKeepFonts(config?.assets?.keepFonts as string[] | undefined) };
    this.plugins = plugins;
  }
  static async from(lib: Lib, { bustImportCache = false }: { bustImportCache?: boolean } = {}) {
    const configImp = await AkanAppConfig.importConfigModule(lib.cwdPath, { bustImportCache });
    const resolved = typeof configImp === "function" ? configImp(lib) : configImp;
    const { plugins, ...config } = (resolved ?? {}) as LibConfigDeclaration & { plugins?: AkanPlugin[] };
    return new AkanLibConfig(lib, config, plugins ?? []);
  }
}

//! need to refactor
const shiftBuildNum = async (app: App, delta: number) => {
  const { buildNum } = (await AkanAppConfig.from(app)).native;
  const akanConfigPath = path.join(app.cwdPath, "akan.config.ts");
  const akanConfig = fs.readFileSync(akanConfigPath, "utf8");
  fs.writeFileSync(akanConfigPath, akanConfig.replace(`buildNum: ${buildNum}`, `buildNum: ${buildNum + delta}`));
};

export const increaseBuildNum = async (app: App) => await shiftBuildNum(app, 1);

export const decreaseBuildNum = async (app: App) => await shiftBuildNum(app, -1);
