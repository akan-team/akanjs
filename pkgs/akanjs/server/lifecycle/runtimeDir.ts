import { existsSync } from "node:fs";
import path from "node:path";

const isWorkspaceRoot = (dir: string) =>
  ["package.json", "tsconfig.json"].every((file) => existsSync(path.join(dir, file))) &&
  ["apps", "libs", "pkgs"].some((member) => existsSync(path.join(dir, member)));

// An app or lib root may hold no `local/`, so a run from inside one (a direct `bun test`) writes where `akan test` does.
const resolveDevRuntimeDir = (cwd: string, appName: string) => {
  for (let dir = cwd; dir !== path.dirname(dir); dir = path.dirname(dir)) {
    if (!isWorkspaceRoot(dir)) continue;
    const [type, name] = path.relative(dir, cwd).split(path.sep);
    if ((type === "apps" || type === "libs") && name) return path.join(dir, "local", type, name, "runtime");
    break;
  }
  return path.resolve(cwd, "local", "apps", appName, "runtime");
};

// Shared by the gateway and a solo server: switching modes must not move the child sockets or the rotating log.
export const resolveRuntimeDir = (runtimeDir?: string): string =>
  path.resolve(
    runtimeDir ??
      process.env.AKAN_RUNTIME_DIR ??
      (process.env.NODE_ENV === "production"
        ? path.resolve(process.cwd(), "runtime")
        : resolveDevRuntimeDir(process.cwd(), process.env.AKAN_PUBLIC_APP_NAME ?? "unknown")),
  );
