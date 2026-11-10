import { readdirSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import type { Exec } from "@akanjs/devkit/commandDecorators";
import { AppExecutor, LibExecutor, PkgExecutor, SysExecutor } from "@akanjs/devkit/executors";
import { Logger } from "akanjs/common";

const testFileName = /[._](test|spec)\.[cm]?[jt]sx?$/i;

//? `bun test` skips a dot folder and node_modules but follows a linked folder, such as a synced `page/(libs)` link.
const hasTestFile = (dir: string, seen = new Set<string>()): boolean => {
  const real = realpathSync(dir);
  if (seen.has(real)) return false;
  seen.add(real);
  return readdirSync(dir, { withFileTypes: true }).some((entry) => {
    const entryPath = path.join(dir, entry.name);
    const isDir =
      entry.isDirectory() || (entry.isSymbolicLink() && statSync(entryPath, { throwIfNoEntry: false })?.isDirectory());
    if (!isDir) return testFileName.test(entry.name);
    return !entry.name.startsWith(".") && entry.name !== "node_modules" && hasTestFile(entryPath, seen);
  });
};

export const testTargetOf = (exec: Exec) => {
  const root =
    exec instanceof SysExecutor || exec instanceof PkgExecutor ? exec.workspace.workspaceRoot : process.cwd();
  return { root, target: path.relative(root, exec.cwdPath).split(path.sep).join("/") };
};

export const reportsNoTestFile = (exec: Exec) => {
  if (hasTestFile(exec.cwdPath)) return false;
  const hint =
    exec instanceof AppExecutor || exec instanceof LibExecutor
      ? " A signal test goes beside its module, as lib/<model>/<model>.signal.test.ts."
      : "";
  Logger.rawLog(`No *.test.ts or *.spec.ts file in ${testTargetOf(exec).target}, so no test ran.${hint}`);
  return true;
};
