import type { AppInfo, LibInfo } from "@akanjs/devkit";

interface Dict {
  appName: string;
}
export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: Dict) {
  return `
import { createNextMiddleware } from "@akanjs/next";

export const config = {
  unstable_allowDynamic: ["/node_modules/reflect-metadata/**"],
  matcher: ["/((?!api|_next|.*\\\\..*).*)"],
};
export const proxy = createNextMiddleware();
  `;
}
