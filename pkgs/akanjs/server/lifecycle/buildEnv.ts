import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

//? `akan build` writes it beside main.js: the env the image's Dockerfile sets, for a host that runs the build without it.
export const BUILD_ENV_FILE = "akan.env.json";

export const applyBuildEnv = (dir: string = path.dirname(Bun.main), env: NodeJS.ProcessEnv = process.env): void => {
  const file = path.join(dir, BUILD_ENV_FILE);
  if (!existsSync(file)) return;
  const defaults = JSON.parse(readFileSync(file, "utf8")) as Record<string, string>;
  for (const [key, value] of Object.entries(defaults)) env[key] ??= value;
};
