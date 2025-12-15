import type { CapacitorConfig } from "@capacitor/cli";
import os from "os";

import { AppScanResult } from "./src/types";

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

export const withBase = (configImp: (config: CapacitorConfig) => CapacitorConfig, appData?: any) => {
  const ip = getLocalIP();
  const appInfo = appData as AppScanResult;
  const baseConfig: CapacitorConfig = {
    appId: `com.${appInfo.name}.${process.env.NEXT_PUBLIC_ENV}`,
    appName: appInfo.akanConfig.mobile.appName,
    webDir: `../../dist/apps/${appInfo.name}/csr`,
    server:
      process.env.APP_OPERATION_MODE !== "release"
        ? {
            androidScheme: "http",
            url: `http://${ip}:4201`,
            cleartext: true,
            allowNavigation: [`http://${ip}:8080/*`],
          }
        : {
            allowNavigation: ["*"],
          },
    plugins: {
      CapacitorCookies: { enabled: true },
      ...appInfo.akanConfig.mobile.plugins,
    },
    ...appInfo.akanConfig.mobile,
    android: {
      ...appInfo.akanConfig.mobile.android,
    },
    ios: {
      ...appInfo.akanConfig.mobile.ios,
    },
  };
  return baseConfig;
};
