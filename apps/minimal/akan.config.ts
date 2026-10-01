import type { AppConfig } from "akanjs";

const config: AppConfig = {
  secrets: ["secrets/**"],
  bin: {
    "probe-tool": {
      "darwin-arm64": { path: "native/probe/tool/probe-tool" },
      "darwin-x64": { path: "native/probe/tool/probe-tool" },
      "linux-arm64": { path: "native/probe/tool/probe-tool" },
      "linux-x64": { path: "native/probe/tool/probe-tool" },
      "win32-arm64": { path: "native/probe/tool/probe-tool.cmd" },
      "win32-x64": { path: "native/probe/tool/probe-tool.cmd" },
    },
  },

  native: {
    appName: "minimal",
    appId: "com.minimal.dev.app",
    version: "0.0.1",
    buildNum: 1,
    indexPath: "/explore",
    permissions: ["push"],
    deepLinks: { schemes: ["minimal"], domains: ["example.com"] },
    ios: { teamId: "TEAMID" },
    android: {
      googleServices: "secrets/google-services.json",
      sha256CertFingerprints: [
        "00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00",
      ],
    },
    desktop: { server: true },
  },
};

export default config;
