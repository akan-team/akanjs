import withAnalyze from "@next/bundle-analyzer";
import type { NextConfig } from "next";
import pwa from "next-pwa";
import runtimeCaching from "next-pwa/cache.js";

export type NextConfigFn = (phase: string, context?: any) => Promise<NextConfig> | NextConfig;

export type NextPlugin = (config: NextConfig) => NextConfig;

export type NextPluginThatReturnsConfigFn = (config: NextConfig) => NextConfigFn;

export const composePlugins = (
  ...plugins: (NextPlugin | NextPluginThatReturnsConfigFn)[]
): ((baseConfig: NextConfig) => NextConfigFn) => {
  return function (baseConfig: NextConfig) {
    return async function combined(phase: string, context: any): Promise<NextConfig> {
      let config = baseConfig;
      for (const plugin of plugins) {
        const fn = plugin;
        const configOrFn = fn(config);
        if (typeof configOrFn === "function") config = await configOrFn(phase, context);
        else config = configOrFn;
      }
      return config;
    };
  };
};

const commandType = process.env.AKAN_COMMAND_TYPE?.includes("start")
  ? "start"
  : process.env.AKAN_COMMAND_TYPE?.includes("build")
    ? "build"
    : "deploy";

const devDomain = process.env.NEXT_PUBLIC_SERVE_DOMAIN ?? "akanjs.com";

export const withBase = (
  appName: string,
  config: NextConfig,
  optimizeLibs: string[],
  routes: { basePath?: string; domains: { main?: string[]; develop?: string[]; debug?: string[] } }[] = []
) => {
  const withPWA = pwa({
    dest: "public",
    register: true,
    skipWaiting: true,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    runtimeCaching,
    disable: commandType === "start",
  });
  return composePlugins(
    withAnalyze({ enabled: process.env.ANALYZE === "true" }) as unknown as NextPlugin,
    ...(commandType !== "start" || process.env.USE_PWA === "true" ? [withPWA as unknown as NextPlugin] : [])
  )({
    ...config,
    // eslint: { ...config.eslint, ignoreDuringBuilds: true },
    env: {
      ...config.env,
      basePaths: [...new Set(routes.map(({ basePath }) => basePath))].join(","),
    },
    transpilePackages: ["swiper", "ssr-window", "dom7"],
    reactStrictMode: commandType === "start" ? false : true,
    experimental: {
      ...(config.experimental ?? {}),
      optimizePackageImports: [
        ...[appName, ...optimizeLibs]
          .map((lib) => [`@${lib}/ui`, `@${lib}/next`, `@${lib}/common`, `@${lib}/client`])
          .flat(),
        "@akanjs/next",
        "@akanjs/common",
        "@akanjs/ui",
      ],
    },
    images: {
      formats: ["image/avif", "image/webp"],
      ...(config.images ?? {}),
      remotePatterns: [
        ...(config.images?.remotePatterns ?? []),
        ...routes
          .map(({ domains }) => [
            ...(domains.main?.map((domain) => ({ protocol: "https", hostname: `**.${domain}` })) ?? []),
            ...(domains.develop?.map((domain) => ({ protocol: "https", hostname: `**.${domain}` })) ?? []),
            ...(domains.debug?.map((domain) => ({ protocol: "https", hostname: `**.${domain}` })) ?? []),
          ])
          .flat(),
        { protocol: "https", hostname: `**.${devDomain}` },
      ],
    },
    webpack: (config: NextConfig) => {
      // react-pdf error fix
      const watchOptions = config.watchOptions as unknown as { ignored?: string | string[] } | undefined;
      // config.resolve.alias.canvas = false;
      // config.resolve.alias.encoding = false;
      const ignored = watchOptions?.ignored
        ? typeof watchOptions.ignored === "string"
          ? [watchOptions.ignored]
          : Array.isArray(watchOptions.ignored)
            ? watchOptions.ignored.filter((ignore) => typeof ignore === "string")
            : []
        : [];
      config.watchOptions = {
        ...(config.watchOptions ?? {}),
        ...{ ignored: [...ignored, "**/node_modules/**", "**/.git/**", "**/.next/**", "**/dist/**", "**/local/**"] },
      };
      return config;
    },
    turbopack: {
      ...(config.turbopack ?? {}),
      resolveAlias: {
        // canvas: false,
        // encoding: false,
        ...(process.env.USE_AKANJS_PKGS === "true" ? { "@akanjs/config": "../../pkgs/@akanjs/config" } : {}),
        ...(config.turbopack?.resolveAlias ?? {}),
      },
    },
    redirects() {
      return routes
        .map(({ basePath, domains }) => [
          { basePath, domain: `${basePath}-debug.${devDomain}` },
          { basePath, domain: `${basePath}-develop.${devDomain}` },
          { basePath, domain: `${basePath}-main.${devDomain}` },
          ...(domains.main?.map((domain) => ({ basePath, domain })) ?? []),
          ...(domains.develop?.map((domain) => ({ basePath, domain })) ?? []),
          ...(domains.debug?.map((domain) => ({ basePath, domain })) ?? []),
        ])
        .flat()
        .map(({ basePath, domain }) => ({
          source: `/:locale/${basePath}/:path*`,
          has: [{ type: "host", value: domain }],
          permanent: true,
          destination: "/:locale/:path*",
        }));
    },
    rewrites() {
      return routes
        .map(({ basePath, domains }) => [
          { basePath, domain: `${basePath}-debug.${devDomain}` },
          { basePath, domain: `${basePath}-develop.${devDomain}` },
          { basePath, domain: `${basePath}-main.${devDomain}` },
          ...(domains.main?.map((domain) => ({ basePath, domain })) ?? []),
          ...(domains.develop?.map((domain) => ({ basePath, domain })) ?? []),
          ...(domains.debug?.map((domain) => ({ basePath, domain })) ?? []),
        ])
        .flat()
        .map(({ basePath, domain }) => [
          {
            source: "/:locale",
            has: [{ type: "host", value: domain }],
            destination: `/:locale/${basePath}`,
          },
          {
            source: `/:locale/:path((?!${basePath}$)(?!admin(?:/|$)).*)`,
            has: [{ type: "host", value: domain }],
            destination: `/:locale/${basePath}/:path*`,
          },
        ])
        .flat();
    },
  } as unknown as NextConfig);
};

export const defaultNextConfigFile = `import "tsconfig-paths/register.js";

import { getNextConfig } from "${process.env.USE_AKANJS_PKGS === "true" ? "../../pkgs/@akanjs/config" : "@akanjs/config"}";

import appInfo from "./akan.app.json";
import config from "./akan.config";

export default getNextConfig(config, appInfo);
`;
