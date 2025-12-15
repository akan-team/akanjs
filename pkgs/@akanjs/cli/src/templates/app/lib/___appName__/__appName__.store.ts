import type { AppInfo, LibInfo } from "@akanjs/devkit";

interface Dict {
  appName: string;
  AppName: string;
}
export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: Dict) {
  return `
import { store } from "@akanjs/store";

export class ${dict.AppName}Store extends store("${dict.appName}" as const, {
  // state
}) {
  // action
}
  `;
}
