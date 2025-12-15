import type { AppInfo, LibInfo } from "@akanjs/devkit";

interface Dict {
  appName: string;
}
export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: Dict) {
  return {
    filename: "csr.tsx",
    content: `
import { bootCsr } from "@akanjs/next";

import { registerClient } from "../client";

void bootCsr(import.meta.glob("./**/*.tsx"), registerClient);
  `,
  };
}
