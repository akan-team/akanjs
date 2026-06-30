import { existsSync, readdirSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { CapacitorConfig } from "@capacitor/cli";
import type { AkanMobileTargetConfig, AppScanResult } from "akanjs";
import { parseAkanI18nEnv } from "akanjs/common";

const getLocalIP = () => {
  const interfaces = os.networkInterfaces();
  for (const interfaceName in interfaces) {
    const iface = interfaces[interfaceName];
    if (!iface) continue;
    for (const alias of iface) {
      if (alias.family === "IPv4" && !alias.internal) return alias.address;
    }
  }
  return "127.0.0.1"; // fallback to localhost if no suitable IP found
};

const normalizeBasePath = (basePath: string | undefined) => basePath?.replace(/^\/+|\/+$/g, "");

const findAppsDir = (appName: string) => {
  let dir = process.cwd();
  while (dir !== path.dirname(dir)) {
    const appsDir = path.join(dir, "apps");
    if (existsSync(path.join(appsDir, appName, "akan.config.ts"))) return appsDir;
    if (path.basename(dir) === appName && existsSync(path.join(dir, "akan.config.ts"))) return path.dirname(dir);
    dir = path.dirname(dir);
  }
};

const getAppNames = (appsDir: string, maxDepth = 3, prefix = ""): string[] => {
  const appNames: string[] = [];
  for (const entry of readdirSync(path.join(appsDir, prefix))) {
    if (["node_modules", "dist", "public", "webkit"].includes(entry)) continue;
    const entryPath = path.join(appsDir, prefix, entry);
    if (!statSync(entryPath).isDirectory()) continue;
    const appName = path.join(prefix, entry).split(path.sep).join("/");
    if (existsSync(path.join(entryPath, "akan.config.ts"))) appNames.push(appName);
    if (maxDepth > 0) appNames.push(...getAppNames(appsDir, maxDepth - 1, appName));
  }
  return appNames;
};

const resolveLocalCsrPort = (appInfo: AppScanResult) => {
  const explicitPort = process.env.AKAN_PUBLIC_CLIENT_PORT ?? process.env.PORT;
  if (explicitPort) return explicitPort;
  const appsDir = findAppsDir(appInfo.name);
  const appNames = appsDir ? getAppNames(appsDir).sort((a, b) => a.localeCompare(b)) : [];
  const appIndex = Math.max(appNames.indexOf(appInfo.name), 0);
  const portOffset = Number.parseInt(process.env.PORT_OFFSET ?? "0");
  return (8282 + appIndex + portOffset).toString();
};

const routeBasePaths = (appInfo: AppScanResult) =>
  new Set(
    appInfo.routes
      .map((route) => route.replace(/^\.\//, "").split("/")[0])
      .filter((segment): segment is string => !!segment && !segment.startsWith("_") && !segment.startsWith("(")),
  );

const resolveTarget = (appInfo: AppScanResult, targetName = process.env.AKAN_MOBILE_TARGET) => {
  const targets = appInfo.akanConfig.mobile.targets;
  if (!targets || Object.keys(targets).length === 0) throw new Error("Akan mobile target metadata is missing.");
  if (targetName) {
    const target = targets[targetName];
    if (!target) {
      const basePath = normalizeBasePath(targetName);
      const [template] = Object.values(targets);
      if (basePath && template && routeBasePaths(appInfo).has(basePath))
        return { ...template, name: basePath, basePath };
      throw new Error(`Akan mobile target '${targetName}' was not found.`);
    }
    return target;
  }
  const entries = Object.entries(targets);
  if (entries.length !== 1) throw new Error("AKAN_MOBILE_TARGET is required when multiple mobile targets exist.");
  return entries[0]?.[1] as AkanMobileTargetConfig;
};

const localCsrUrl = (ip: string, target: AkanMobileTargetConfig, appInfo: AppScanResult) => {
  const basePath = normalizeBasePath(target.basePath);
  const locale = parseAkanI18nEnv().defaultLocale;
  const pathname = basePath ? `${locale}/${basePath}` : `${locale}/`;
  const port = resolveLocalCsrPort(appInfo);
  const params = new URLSearchParams({ csr: "true", akanMobileTarget: target.name });
  if (basePath) params.set("akanMobileBasePath", basePath);
  if (target.indexPath) params.set("akanMobileIndexPath", target.indexPath);
  return `http://${ip}:${port}/${pathname}?${params}`;
};

export const withBase = (
  configImp: (config: CapacitorConfig, target: AkanMobileTargetConfig) => CapacitorConfig = (config) => config,
  appData?: AppScanResult,
  targetName?: string,
) => {
  const ip = getLocalIP();
  const appInfo = appData;
  if (!appInfo) throw new Error("withBase requires apps/<app>/akan.app.json metadata.");
  const target = resolveTarget(appInfo, targetName);
  const {
    name: _name,
    basePath: _basePath,
    indexPath: _indexPath,
    version: _version,
    buildNum: _buildNum,
    assets: _assets,
    permissions: _permissions,
    deepLinks: _deepLinks,
    files: _files,
    ...capacitorTarget
  } = target;
  const baseConfig: CapacitorConfig = {
    ...capacitorTarget,
    appId: target.appId,
    appName: target.appName,
    webDir: "dist",
    server:
      process.env.APP_OPERATION_MODE !== "release"
        ? {
            androidScheme: "http",
            url: localCsrUrl(ip, target, appInfo),
            cleartext: true,
            allowNavigation: [ip, "localhost"],
          }
        : {
            allowNavigation: ["*"],
          },
    plugins: {
      CapacitorCookies: { enabled: true },
      ...target.plugins,
    },
    android: {
      ...target.android,
    },
    ios: {
      ...target.ios,
    },
  };
  return configImp(baseConfig, target);
};
