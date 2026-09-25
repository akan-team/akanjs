import type { AkanWebConfig } from "akanjs";
import type { PromiseOrObject } from "akanjs/base";
import type { AkanI18nConfig } from "akanjs/common";
import type { ClientManifest } from "./artifact";
import type { SsrManifest } from "./ssrTypes";

export type WebsocketRoute = (
  ws: Bun.ServerWebSocket<unknown>,
  data: unknown[],
  event?: "message" | "subscribe" | "unsubscribe",
) => PromiseOrObject<unknown>;

export type WebsocketRoutes = Record<string, WebsocketRoute>;

export type HttpRoutes = Bun.Serve.Options<unknown>["routes"];

export type LocalPublish = (roomId: string, data: object | object[] | Uint8Array) => void;

export interface SignalRouteOptions {
  globalPrefix?: false;
}

export type SignalRoutes = {
  routes: HttpRoutes;
  wsRoutes: WebsocketRoutes;
  routeOptions?: Record<string, SignalRouteOptions>;
};

export interface LocalFile {
  filename: string;
  mimetype: string;
  encoding: string;
  localPath: string;
}

export type AkanImageFormat = "image/avif" | "image/webp";

export interface AkanImagePattern {
  protocol?: "http" | "https";
  hostname?: string;
  port?: string;
  pathname?: string;
  search?: string;
}

export interface AkanImageConfig {
  deviceSizes: number[];
  imageSizes: number[];
  formats: AkanImageFormat[];
  qualities: number[];
  minimumCacheTTL: number;
  remotePatterns: AkanImagePattern[];
  localPatterns: Pick<AkanImagePattern, "pathname" | "search">[];
  dangerouslyAllowSVG: boolean;
  maximumRedirects: number;
  fetchTimeoutMs: number;
  maxRemoteBytes: number;
}

export const defaultAkanImageConfig: AkanImageConfig = {
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

export function mergeAkanImageConfig(config: Partial<AkanImageConfig> = {}): AkanImageConfig {
  return {
    ...defaultAkanImageConfig,
    ...config,
    deviceSizes: config.deviceSizes ?? defaultAkanImageConfig.deviceSizes,
    imageSizes: config.imageSizes ?? defaultAkanImageConfig.imageSizes,
    formats: config.formats ?? defaultAkanImageConfig.formats,
    qualities: config.qualities ?? defaultAkanImageConfig.qualities,
    remotePatterns: config.remotePatterns ?? defaultAkanImageConfig.remotePatterns,
    localPatterns: config.localPatterns ?? defaultAkanImageConfig.localPatterns,
  };
}

export function getAkanImageWidths(config: Pick<AkanImageConfig, "deviceSizes" | "imageSizes">) {
  return [...new Set([...config.deviceSizes, ...config.imageSizes])].sort((a, b) => a - b);
}

export type BaseBuildArtifact = {
  rscClientUrl: string;
  rscRuntimeClientManifest?: ClientManifest;
  rscRuntimeSsrManifest?: SsrManifest;
  vendorMap: Record<string, string>;
  pagesBundlePath: string;
  pagesBundleBuildId: number;
  cssAssets: Record<string, CssAsset>;
  domains: string[];
  subRoutes: { [key: string]: string[] };
  basePaths: string[];
  branches: string[];
  i18n: AkanI18nConfig;
  imageConfig: AkanImageConfig;
  deepLinkAssociations?: MobileDeepLinkAssociation[];
  /**
   * Which surfaces this artifact was built for. Absent on an artifact written before the option existed,
   * which is read as both on — the shape every such build actually has.
   */
  web?: AkanWebConfig;
};

export const resolveWebConfig = (web: Partial<AkanWebConfig> | undefined): AkanWebConfig => ({
  ssr: web?.ssr ?? true,
  csr: web?.csr ?? true,
});

/**
 * `AKAN_SSR` / `AKAN_CSR`, both on unless the env says otherwise — the same shape `AKAN_MCP` uses, because a
 * switch a deployment has to find before anything works is a switch most deployments never find. Read by the
 * gateway and by every replica, so both agree on what the pod serves.
 */
export const getWebConfigFromEnv = (): AkanWebConfig => {
  const off = (name: string) => process.env[name] === "false" || process.env[name] === "0";
  const ssr = !off("AKAN_SSR");
  // The CSR bundle inlines the stylesheet the SSR build compiles, so a csr-only process has no artifact.
  return { ssr, csr: ssr && !off("AKAN_CSR") };
};

export interface MobileDeepLinkAssociation {
  targetName: string;
  appId: string;
  domains: string[];
  iosTeamId?: string;
  androidSha256CertFingerprints?: string[];
}

export interface CssAsset {
  cssUrl: string;
  cssRelPath: string;
}

export interface RenderState {
  buildId: number;
  cssAssets: Record<string, CssAsset>;
  cssBytesByUrl: Record<string, Uint8Array>;
}
