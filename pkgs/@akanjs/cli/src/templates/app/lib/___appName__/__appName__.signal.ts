import type { AppInfo, LibInfo } from "@akanjs/devkit";

interface Dict {
  appName: string;
  AppName: string;
}
export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: Dict) {
  return `
import { endpoint, internal } from "@akanjs/signal";

import * as srv from "../srv";

export class ${dict.AppName}Internal extends internal(srv.${dict.appName}, () => ({})) {}

export class ${dict.AppName}Endpoint extends endpoint(srv.${dict.appName}, () => ({})) {}
  `;
}
