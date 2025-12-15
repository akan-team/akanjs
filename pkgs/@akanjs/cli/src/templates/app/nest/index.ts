import type { AppInfo, LibInfo } from "@akanjs/devkit";

interface Dict {
  [key: string]: string;
}
export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: Dict = {}) {
  return `
export * from "./backendLogic";
  `;
}
