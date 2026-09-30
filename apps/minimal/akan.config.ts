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

  mobile: {
    appName: "minimal",
    appId: "com.minimal.dev.app",
    version: "0.0.1",
    buildNum: 1,
    targets: {
      default: {
        indexPath: "/explore",
        permissions: ["push"],
        native: {
          android: { googleServices: "secrets/google-services.json" },
          desktop: { server: true },
        },
        deepLinks: {
          schemes: ["minimal"],
          domains: ["example.com"],
          ios: {
            teamId: "TEAMID",
          },
          android: {
            sha256CertFingerprints: [
              "00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00",
            ],
          },
        },
      },
    },
  },
};

export default config;
