import type { AppConfig } from "akanjs";

const config: AppConfig = {
  externalLibs: ["shiki"],
  secrets: ["secrets/**/*"],
  clientRuntime: "route",
};

export default config;
