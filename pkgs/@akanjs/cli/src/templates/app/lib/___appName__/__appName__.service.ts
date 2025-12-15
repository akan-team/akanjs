import type { AppInfo, LibInfo } from "@akanjs/devkit";

interface Dict {
  appName: string;
  AppName: string;
}
export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: Dict) {
  return `
import { serve } from "@akanjs/service";

export class ${dict.AppName}Service extends serve("${dict.appName}" as const, { serverMode: "batch" }, () => ({})) {}
`;
}
