import type { AppInfo, LibInfo } from "@akanjs/devkit";

interface Dict {
  appName: string;
}
export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: Dict) {
  return `
import type { AppConfig } from "@akanjs/config";

const config: AppConfig = {};

export default config;
  `;
}
