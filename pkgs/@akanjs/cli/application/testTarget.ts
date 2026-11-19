import { readdirSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { AkanWorkers } from "@akanjs/devkit/akanConfig";
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

export const testOwnerOf = (fromRoot: string) => {
  const [kind, first = "", second = ""] = fromRoot.split("/");
  if (kind === "apps" || kind === "libs") return first || null;
  if (kind !== "pkgs") return null;
  return (first.startsWith("@") ? second && `${first}/${second}` : first) || null;
};

export const signalTestEnv = async (exec: AppExecutor | LibExecutor) => {
  //? The spawned `bun test` inherits `process.env`, where the config's load left every workspace lib's workers.
  if (exec.hasScanInfo()) AkanWorkers.publish(await exec.selectWorkers());
  return {
    AKAN_TEST_SIGNAL: "1",
    AKAN_TEST_TARGET_TYPE: exec.type,
    AKAN_TEST_TARGET_NAME: exec.name,
    AKAN_TEST_LIBS: exec.getScanInfo({ allowEmpty: true })?.getLibs().join(",") ?? "",
    //? The suite runs from the app or lib folder, where the cwd-relative default `local/` breaks the next sync.
    AKAN_RUNTIME_DIR: path.join(exec.workspace.workspaceRoot, "local", `${exec.type}s`, exec.name, "runtime"),
  };
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
