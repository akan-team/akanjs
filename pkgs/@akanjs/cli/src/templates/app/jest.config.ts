import type { AppInfo, LibInfo } from "@akanjs/devkit";

interface Dict {
  appName: string;
}
export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: Dict) {
  return `
//! will be replaced with akan.config.ts
import "tsconfig-paths/register";

import { withBase } from "@akanjs/test/jest.config.base";

const config = withBase("${dict.appName}");

export default config;
  `;
}
