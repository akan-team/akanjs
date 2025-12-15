import type { AppInfo, LibInfo } from "@akanjs/devkit";

interface Dict {
  appName: string;
}
export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: Dict) {
  return `
import { registerClient } from "./client";

export const register = async () => {
  await registerClient();
};`;
}
