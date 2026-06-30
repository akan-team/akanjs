import type { AppConfig } from "akanjs";

const config: AppConfig = {
  mobile: {
    appName: "minimal",
    appId: "com.minimal.dev.app",
    version: "0.0.1",
    buildNum: 1,
    targets: {
      default: {
        indexPath: "/explore",
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
