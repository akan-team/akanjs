import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AkanPlugin } from "akanjs";
import { type AkanI18nConfig, resolveAkanI18nConfig } from "akanjs/common";
import type { AkanImageConfig } from "akanjs/server";
import type { App, Lib } from "../commandDecorators";
import { WorkspaceExecutor } from "../executors";
import type { BaseDevEnv, PackageJson } from "../types";
import {
  type AkanMobileConfig,
  type AkanMobileTargetConfig,
  type AkanRouteConfig,
  type AppConfigResult,
  type Arch,
  archs,
  type DatabaseMode,
  type DeepPartial,
  type DockerConfig,
  type LibConfigResult,
} from "./types";

const DEFAULT_BARREL_IMPORTS = ["akanjs/webkit", "akanjs/common", "akanjs/ui", "akanjs/server"];
const DEFAULT_OPTIMIZE_IMPORTS = [
  "lucide-react",
  "date-fns",
  "lodash-es",
  "ramda",
  "antd",
  "react-bootstrap",
  "ahooks",
  "@ant-design/icons",
  "@headlessui/react",
  "@headlessui-float/react",
  "@heroicons/react/20/solid",
  "@heroicons/react/24/solid",
  "@heroicons/react/24/outline",
  "@visx/visx",
  "@tremor/react",
  "rxjs",
  "@mui/material",
  "@mui/icons-material",
  "recharts",
  "react-use",
  "@material-ui/core",
  "@material-ui/icons",
  "@tabler/icons-react",
  "mui-core",
  "react-icons/*",
];
const WORKSPACE_BARREL_FACETS = ["ui", "webkit", "common", "client", "server"] as const;
const SSR_RUNTIME_PACKAGES = ["react", "react-dom", "react-server-dom-webpack"] as const;
const NATIVE_RUNTIME_PACKAGES = ["sharp"] as const;
const DEFAULT_BACKEND_RUNTIME_PACKAGES = ["croner"] as const;
// The firebase client (push tokens) and the Capacitor toolchain — `@capacitor/cli` (`npx cap`),
// `@capacitor/assets` (`npx @capacitor/assets`) plus the `@capacitor/core`/`ios`/`android` runtime
// and native-platform packages that `npx cap add`/`sync` resolve from the workspace node_modules.
// All are declared only as optional peers, so a fresh workspace never auto-installs them; the mobile
// preflight installs them (together with MOBILE_APP_CAPACITOR_PLUGINS) at the workspace root.
const MOBILE_RUNTIME_PACKAGES = [
  "@capacitor/cli",
  "@capacitor/core",
  "@capacitor/ios",
  "@capacitor/android",
  "@capacitor/assets",
] as const;
// Capacitor plugins that must additionally be declared in the *app's* package.json
// (apps/<app>/package.json): `npx cap sync` discovers plugins by scanning the app directory's
// dependencies and registers their native code into the iOS/Android projects; packages present only
// at the workspace root are never registered, so the JS bridge throws
// `Capacitor plugin "Device" is not available.` at runtime. They are installed at the workspace root
// alongside MOBILE_RUNTIME_PACKAGES (pinned via optional peers) and declared in the app with a "*"
// range so bun dedupes them to that hoisted version instead of pinning a second source of truth.
const MOBILE_APP_CAPACITOR_PLUGINS = [
  "@capacitor/app",
  "@capacitor/browser",
  "@capacitor/camera",
  "@capacitor/core",
  "@capacitor/device",
  "@capacitor/geolocation",
  "@capacitor/haptics",
  "@capacitor/inappbrowser",
  "@capacitor/keyboard",
  "@capacitor/preferences",
  "@capacitor/push-notifications",
  "capacitor-plugin-safe-area",
] as const;
const DATABASE_MODE_RUNTIME_PACKAGES = {
  single: [],
  multiple: ["@libsql/client", "bullmq", "ioredis", "protobufjs"],
  cluster: ["bullmq", "ioredis", "postgres", "protobufjs"],
} satisfies Record<DatabaseMode, readonly string[]>;
const AKAN_RUNTIME_PACKAGES = new Set<string>([
  ...SSR_RUNTIME_PACKAGES,
  ...NATIVE_RUNTIME_PACKAGES,
  ...DEFAULT_BACKEND_RUNTIME_PACKAGES,
  ...MOBILE_RUNTIME_PACKAGES,
  ...Object.values(DATABASE_MODE_RUNTIME_PACKAGES).flat(),
]);
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

// Reduce a free-form name to a valid reverse-DNS / Android package segment: lowercase, alphanumerics
// only (hyphens/spaces dropped), never empty, never starting with a digit.
const sanitizeAppIdSegment = (value: string): string => {
  const cleaned = value.toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (!cleaned) return "app";
  return /^[a-z]/.test(cleaned) ? cleaned : `app${cleaned}`;
};

// The default mobile bundle id for an app that has not pinned `mobile.appId`. Uses the workspace
// (repo) name as the org segment so the default is far less collision-prone than a bare
// `com.<appName>.app`, which Apple's portal routinely already has claimed. Apps that ship pin an
// explicit appId, so this only affects unconfigured/dev apps.
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

const normalizeDeepLinks = (deepLinks: DeepPartial<AkanMobileTargetConfig["deepLinks"]> | undefined) => {
  if (!deepLinks) return undefined;
  const schemes = normalizeStringList(deepLinks.schemes as string[] | undefined);
  const domains = normalizeStringList((deepLinks.domains as string[] | undefined)?.map(normalizeDeepLinkDomain));
  const teamId = (deepLinks.ios?.teamId as string | undefined)?.trim();
  const sha256CertFingerprints = normalizeStringList(deepLinks.android?.sha256CertFingerprints as string[] | undefined);
  if (!schemes && !domains && !teamId && !sha256CertFingerprints) return undefined;
  return {
    ...(schemes ? { schemes } : {}),
    ...(domains ? { domains } : {}),
    ...(teamId ? { ios: { teamId } } : {}),
    ...(sha256CertFingerprints ? { android: { sha256CertFingerprints } } : {}),
  } satisfies AkanMobileTargetConfig["deepLinks"];
};

export class AkanAppConfig implements AppConfigResult {
  app: App;
  rootPackageJson: PackageJson;
  docker: DockerConfig;
  defaultDatabaseMode: DatabaseMode;
  externalLibs: string[];
  barrelImports: string[];
  optimizeImports: string[];
  images: AkanImageConfig;
  i18n: AkanI18nConfig;
  publicEnv: string[];
  mobile: AkanMobileConfig;
  /** True only when the app's akan.config.ts explicitly declares a `mobile` section (vs. the synthesized default). */
  hasMobileConfig: boolean;
  secrets: string[];
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
    config: DeepPartial<AppConfigResult>,
    baseDevEnv: BaseDevEnv,
    plugins: AkanPlugin[] = [],
  ) {
    this.app = app;
    this.rootPackageJson = rootPackageJson;
    this.libs = libs;
    this.baseDevEnv = baseDevEnv;
    this.plugins = plugins;
    this.#applyRoutes(config?.routes);
    this.defaultDatabaseMode = config?.defaultDatabaseMode ?? "single";
    this.externalLibs = config?.externalLibs ?? [];
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
    this.publicEnv = (config?.publicEnv as string[] | undefined) ?? ([] as string[]);
    this.secrets = (config?.secrets as string[] | undefined) ?? ([] as string[]);
    this.hasMobileConfig = Boolean(config.mobile);
    this.mobile = this.#resolveMobileConfig(config.mobile);
    this.docker = this.#makeDockerContent(config?.docker ?? {});
  }
  #resolveMobileConfig(mobile: DeepPartial<AkanMobileConfig> | undefined): AkanMobileConfig {
    const {
      targets: rawTargets,
      indexPath: _indexPath,
      ...rawMobile
    } = (mobile ?? {}) as DeepPartial<AkanMobileConfig> & { indexPath?: unknown };
    const appName = rawMobile.appName ?? this.app.name;
    const appId = rawMobile.appId ?? deriveDefaultAppId(this.baseDevEnv.repoName, this.app.name);
    const version = rawMobile.version ?? "0.0.1";
    const buildNum = rawMobile.buildNum ?? 1;
    const defaultTargetName = this.#defaultMobileTargetName(rawTargets);
    const targetEntries = Object.entries(
      rawTargets ?? {
        [defaultTargetName]: {},
      },
    );
    const targets = Object.fromEntries(
      targetEntries.map(([name, rawTarget]) => {
        const target = rawTarget as DeepPartial<AkanMobileTargetConfig>;
        const fallbackBasePath = !rawTargets && this.basePaths.has(name) ? name : undefined;
        const basePath = (target.basePath ?? fallbackBasePath)?.replace(/^\/+|\/+$/g, "") || undefined;
        const indexPath = normalizeIndexPath(target.indexPath as string | undefined);
        const deepLinks = normalizeDeepLinks(target.deepLinks);
        if (basePath && !this.basePaths.has(basePath)) {
          throw new Error(
            `Mobile target '${name}' uses unknown basePath '${basePath}' in apps/${this.app.name}/akan.config.ts`,
          );
        }
        const resolved = {
          ...rawMobile,
          ...target,
          name,
          basePath,
          indexPath,
          deepLinks,
          appName: target.appName ?? appName,
          appId: target.appId ?? appId,
          version: target.version ?? version,
          buildNum: target.buildNum ?? buildNum,
          plugins: {
            ...rawMobile.plugins,
            ...target.plugins,
          },
          android: {
            ...rawMobile.android,
            ...target.android,
          },
          ios: {
            ...rawMobile.ios,
            ...target.ios,
          },
        } satisfies AkanMobileTargetConfig;
        return [name, resolved];
      }),
    );
    return {
      ...rawMobile,
      appName,
      appId,
      version,
      buildNum,
      targets,
      plugins: rawMobile.plugins,
    } as AkanMobileConfig;
  }
  #defaultMobileTargetName(rawTargets: DeepPartial<AkanMobileConfig>["targets"] | undefined) {
    if (rawTargets && Object.keys(rawTargets).length > 0) return Object.keys(rawTargets)[0] as string;
    return this.basePaths.has(this.app.name) ? this.app.name : "default";
  }
  #applyRoutes(routes: AkanRouteConfig[] = []) {
    for (const route of routes) {
      if (route.basePath) {
        const basePath = route.basePath.replace(/^\/+|\/+$/g, "");
        this.basePaths.add(basePath);
        const domains = this.subRoutes.getOrInsert(basePath, new Set());
        Object.keys(route.domains).forEach((branch) => void this.branches.add(branch));
        Object.values(route.domains)
          .flat()
          .forEach((domain) => {
            if (domain) domains.add(domain.toLowerCase().replace(/:\d+$/, ""));
          });
      } else {
        Object.keys(route.domains).forEach((branch) => void this.branches.add(branch));
        Object.values(route.domains)
          .flat()
          .forEach((domain) => {
            if (domain) this.domains.add(domain.toLowerCase().replace(/:\d+$/, ""));
          });
      }
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
  #getDockerRunScripts(runs: (string | { [key in Arch]?: string })[]) {
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
  #makeDockerContent(docker: DeepPartial<DockerConfig>): DockerConfig {
    if (docker.content)
      return {
        content: docker.content,
        image: {},
        preRuns: [],
        postRuns: [],
        command: [],
      };
    const preRunScripts = this.#getDockerRunScripts(docker.preRuns ?? []);
    const postRunScripts = this.#getDockerRunScripts(docker.postRuns ?? []);

    const imageScript = docker.image
      ? this.#getDockerImageScript(docker.image, "oven/bun:1-slim")
      : "FROM oven/bun:1-slim";
    const command = docker.command ?? ["bun", "main.js"];
    const content = `${imageScript}
RUN ln -sf /usr/share/zoneinfo/Asia/Seoul /etc/localtime
RUN apt-get update && apt-get upgrade -y
RUN apt-get install -y --no-install-recommends git redis build-essential python3 ca-certificates fonts-liberation libappindicator3-1 libasound2 libatk-bridge2.0-0 libatk1.0-0 libc6 libcairo2 libcups2 libdbus-1-3 libexpat1 libfontconfig1 libgbm1 libgcc1 libglib2.0-0 libgtk-3-0 libnspr4 libnss3 libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 lsb-release wget xdg-utils udev ffmpeg
ARG TARGETARCH
${preRunScripts.join("\n")}
RUN mkdir -p /workspace
WORKDIR /workspace
COPY ./package.json ./package.json
RUN bun install --production
${postRunScripts.join("\n")}
COPY . .
ENV PORT=8282
ENV NODE_ENV=production
ENV AKAN_PUBLIC_REPO_NAME=${this.baseDevEnv.repoName}
ENV AKAN_PUBLIC_SERVE_DOMAIN=${this.baseDevEnv.serveDomain}
ENV AKAN_PUBLIC_APP_NAME=${this.app.name}
ENV AKAN_PUBLIC_ENV=${this.baseDevEnv.env}
${this.basePaths.size ? `ENV AKAN_PUBLIC_BASE_PATHS=${[...this.basePaths].join(",")}` : ""}
ENV AKAN_PUBLIC_DEFAULT_LOCALE=${this.i18n.defaultLocale}
ENV AKAN_PUBLIC_LOCALES=${this.i18n.locales.join(",")}
ENV AKAN_PUBLIC_OPERATION_MODE=cloud

CMD [${command.map((c) => `"${c}"`).join(",")}]`;
    return {
      content,
      image: imageScript,
      preRuns: docker.preRuns ?? [],
      postRuns: docker.postRuns ?? [],
      command,
    };
  }
  static #importGeneration = 0;
  /**
   * Bun caches dynamic imports by path, so a plain re-import after the user edits the config file
   * returns the stale module. `bustImportCache` appends a fresh query string to force re-evaluation
   * of the config module itself; modules it imports keep their cached instances.
   */
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
    const { plugins, ...config } = (resolved ?? {}) as DeepPartial<AppConfigResult> & { plugins?: AkanPlugin[] };
    return new AkanAppConfig(app, libs, rootPackageJson, config, baseDevEnv, plugins ?? []);
  }
  #resolveProductionDependencyVersion(lib: string) {
    const rootVersion = this.rootPackageJson.dependencies?.[lib] ?? this.rootPackageJson.devDependencies?.[lib];
    if (rootVersion) return rootVersion;
    // Fall back to the framework package's own (peer)dependencies so plugin-declared runtime
    // packages (e.g. firebase for the push plugin) resolve a version without the framework
    // hardcoding a per-feature package list.
    const akanPackageJson = getAkanPackageJson();
    return akanPackageJson.dependencies?.[lib] ?? akanPackageJson.peerDependencies?.[lib];
  }
  #getProductionRuntimePackages() {
    return [
      ...this.externalLibs,
      ...SSR_RUNTIME_PACKAGES,
      ...NATIVE_RUNTIME_PACKAGES,
      ...DEFAULT_BACKEND_RUNTIME_PACKAGES,
      ...this.getDatabaseModeRuntimePackages(),
    ];
  }
  getDatabaseModeRuntimePackages(databaseMode: DatabaseMode = this.defaultDatabaseMode) {
    return [...DATABASE_MODE_RUNTIME_PACKAGES[databaseMode]];
  }
  getMissingDatabaseModeDependencySpecs(databaseMode: DatabaseMode = this.defaultDatabaseMode) {
    return this.#getMissingDependencySpecs(this.getDatabaseModeRuntimePackages(databaseMode));
  }
  getMobileRuntimePackages() {
    // The app Capacitor plugins are installed at the workspace root too, so bun can resolve the
    // app's "*" declarations to a hoisted, peer-pinned version instead of fetching latest.
    return [...new Set([...MOBILE_RUNTIME_PACKAGES, ...MOBILE_APP_CAPACITOR_PLUGINS])];
  }
  getMissingMobileDependencySpecs() {
    return this.#getMissingDependencySpecs(this.getMobileRuntimePackages());
  }
  getMobileAppCapacitorPlugins() {
    return [...MOBILE_APP_CAPACITOR_PLUGINS];
  }
  #getMissingDependencySpecs(libs: readonly string[]) {
    const rootDependencies = {
      ...this.rootPackageJson.dependencies,
      ...this.rootPackageJson.devDependencies,
    };
    return libs
      .filter((lib) => !rootDependencies[lib])
      .map((lib) => {
        const version = this.#resolveProductionDependencyVersion(lib);
        if (!version) throw new Error(`Dependency ${lib} not found in package.json`);
        return `${lib}@${version}`;
      });
  }
  getProductionPackageJson(data: Partial<PackageJson> = {}): PackageJson {
    return {
      name: this.app.name,
      description: this.app.name,
      version: "1.0.0",
      main: "./main.js",
      dependencies: Object.fromEntries(
        [...new Set(this.#getProductionRuntimePackages())].map((lib) => {
          const version = this.#resolveProductionDependencyVersion(lib);
          if (!version) throw new Error(`Dependency ${lib} not found in package.json`);
          return [lib, version];
        }),
      ),
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
  /** Live-only: plugins declared in this lib's `akan.config.ts` (never serialized). */
  plugins: AkanPlugin[];
  constructor(lib: Lib, config: DeepPartial<LibConfigResult>, plugins: AkanPlugin[] = []) {
    this.lib = lib;
    this.externalLibs = config?.externalLibs ?? [];
    this.plugins = plugins;
  }
  static async from(lib: Lib) {
    const [configImp] = await Promise.all([import(`${lib.cwdPath}/akan.config.ts`).then((mod) => mod.default)]);
    const resolved = typeof configImp === "function" ? configImp(lib) : configImp;
    const { plugins, ...config } = (resolved ?? {}) as DeepPartial<LibConfigResult> & { plugins?: AkanPlugin[] };
    return new AkanLibConfig(lib, config, plugins ?? []);
  }
}

// export const getCapacitorConfig = (configImp: AppConfig, appInfo: AppScanResult, tsconfig: TsConfigJson) => {
//   const props: RunnerProps = {
//     type: "app",
//     name: appInfo.name,
//     repoName: appInfo.repoName,
//     serveDomain: appInfo.serveDomain,
//     env: (process.env.AKAN_PUBLIC_ENV ?? "debug") as "testing" | "local" | "debug" | "develop" | "main",
//     libs: appInfo.libDeps,
//     tsconfig,
//   };
//   const config = typeof configImp === "function" ? configImp(props) : configImp;
//   const akanConfig = makeAppConfig(config, props);
//   return akanConfig;
// };

//! need to refactor
export const increaseBuildNum = async (app: App) => {
  const appConfig = await AkanAppConfig.from(app);
  const akanConfigPath = path.join(app.cwdPath, "akan.config.ts");
  const akanConfig = fs.readFileSync(akanConfigPath, "utf8");
  const akanConfigContent = akanConfig.replace(
    `buildNum: ${appConfig.mobile.buildNum}`,
    `buildNum: ${appConfig.mobile.buildNum + 1}`,
  );
  //? 개선할 여지가 있는지 확인
  fs.writeFileSync(akanConfigPath, akanConfigContent);
};

export const decreaseBuildNum = async (app: App) => {
  const appConfig = await AkanAppConfig.from(app);
  const akanConfigPath = path.join(app.cwdPath, "akan.config.ts");
  const akanConfig = fs.readFileSync(akanConfigPath, "utf8");
  const akanConfigContent = akanConfig.replace(
    `buildNum: ${appConfig.mobile.buildNum}`,
    `buildNum: ${appConfig.mobile.buildNum - 1}`,
  );
  fs.writeFileSync(akanConfigPath, akanConfigContent);
};
