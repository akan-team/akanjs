import type { AppInfo, LibInfo } from "@akanjs/devkit";

interface Dict {
  appName: string;
}
export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: Dict) {
  return `
import { createNestApp } from "@akanjs/server";

import { env } from "./env/env.server";
import { registerModules, registerMiddlewares } from "./server";

const bootstrap = async () => {
  const serverMode = process.env.SERVER_MODE as "federation" | "batch" | "all" | null;
  if (!serverMode) throw new Error("SERVER_MODE environment variable is not defined");
  await createNestApp({ registerModules, registerMiddlewares, serverMode, env });
};
void bootstrap();
  `;
}
