import { existsSync } from "node:fs";
import path from "node:path";

export const devInstallCommand = (workspaceRoot: string, spec: string) =>
  existsSync(path.join(workspaceRoot, "package-lock.json")) && !existsSync(path.join(workspaceRoot, "bun.lock"))
    ? ["npm", "install", "-D", spec]
    : ["bun", "add", "-d", spec];
