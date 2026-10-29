import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { PackageJson } from "../types";

export class ProductionLockfile {
  static readonly fileName = "bun.lock";

  //? Beside a copy of the workspace lockfile, Bun keeps each version it locked and drops what the package.json no
  //? longer reaches; only a package the workspace never locked is resolved from the registry.
  static async prune(workspaceRoot: string, packageJson: PackageJson): Promise<string> {
    const workspaceLock = Bun.file(path.join(workspaceRoot, ProductionLockfile.fileName));
    if (!(await workspaceLock.exists())) throw new Error(`the workspace root has no ${ProductionLockfile.fileName}`);
    const dir = await mkdtemp(path.join(os.tmpdir(), "akan-production-lock-"));
    try {
      await Promise.all([
        Bun.write(path.join(dir, "package.json"), JSON.stringify(packageJson, null, 2)),
        Bun.write(path.join(dir, ProductionLockfile.fileName), workspaceLock),
      ]);
      const install = Bun.spawn([process.execPath, "install", "--lockfile-only", "--no-progress"], {
        cwd: dir,
        stdout: "ignore",
        stderr: "pipe",
      });
      const [exitCode, stderr] = await Promise.all([install.exited, new Response(install.stderr).text()]);
      if (exitCode !== 0) throw new Error(stderr.trim() || `bun install --lockfile-only exited with ${exitCode}`);
      return await Bun.file(path.join(dir, ProductionLockfile.fileName)).text();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}
