// desktop.server (config.ts): the server a desktop app carries. The builders copy `dir` into the
// app's resources (platforms/desktop.ts); packages/desktop/src/server.ts starts it at launch.

import { existsSync, statSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { LAUNCHER_ENV_KEYS } from "../../../desktop/src/server.ts";
import type { AkanNativeConfig } from "../config.ts";

export interface DesktopServerConfig {
  /** Absolute. */
  dir: string;
  entry: string;
  env: Record<string, string>;
}

const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function validateDesktopServer(
  desktop: AkanNativeConfig["desktop"],
  appDir: string,
  problems: string[],
): DesktopServerConfig | null {
  const server = desktop?.server;
  if (server === undefined) return null;
  if (!server || typeof server !== "object") {
    problems.push("desktop.server must be an object with dir and entry");
    return null;
  }
  const before = problems.length;
  const dir = typeof server.dir === "string" && server.dir ? resolve(appDir, server.dir) : null;
  if (!dir) problems.push("desktop.server.dir is required: the folder the server runs from");
  else if (!existsSync(dir) || !statSync(dir).isDirectory())
    problems.push(`desktop.server.dir: ${dir} is not a folder`);
  const entry = typeof server.entry === "string" ? server.entry : "";
  if (!entry || isAbsolute(entry) || entry.split(/[\\/]/).includes(".."))
    problems.push(
      `desktop.server.entry must be a file inside desktop.server.dir (got ${JSON.stringify(server.entry)})`,
    );
  else if (dir && existsSync(dir) && !existsSync(join(dir, entry)))
    problems.push(`desktop.server.entry: ${join(dir, entry)} not found`);
  const env: Record<string, string> = {};
  if (server.env !== undefined && (!server.env || typeof server.env !== "object" || Array.isArray(server.env)))
    problems.push("desktop.server.env must be an object of strings");
  else
    for (const [key, value] of Object.entries(server.env ?? {})) {
      if (!ENV_NAME.test(key)) problems.push(`desktop.server.env: ${JSON.stringify(key)} is not a variable name`);
      else if ((LAUNCHER_ENV_KEYS as readonly string[]).includes(key))
        problems.push(`desktop.server.env.${key}: the launcher sets it at every start`);
      else if (typeof value !== "string") problems.push(`desktop.server.env.${key} must be a string`);
      else env[key] = value;
    }
  return problems.length === before && dir ? { dir, entry, env } : null;
}
