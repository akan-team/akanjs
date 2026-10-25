import { afterAll, describe, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { biomeBaseConfig } from "./biomeBase";
import { Linter, parseBiomeReport } from "./linter";

const devkitDir = import.meta.dir;
const biomeBin = path.resolve(devkitDir, "../../../node_modules/.bin", Linter.biomeBinName);

const hookProbe = `export const Early = ({ id }: { id?: string }) => {
  if (!id) return null;
  const [count] = useState(0);
  return <p>{count}</p>;
};
export const Branch = ({ open }: { open: boolean }) => {
  if (open) useEffect(() => {}, []);
  return null;
};
`;

const tempDirs: string[] = [];

afterAll(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const runBiome = (args: string[], cwd: string) =>
  new Promise<string>((resolve, reject) => {
    const proc = spawn(biomeBin, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    proc.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    proc.on("error", reject);
    proc.on("close", () => resolve(stdout || stderr));
  });

const lintWorkspace = async (files: string[]) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "biome-base-"));
  tempDirs.push(dir);
  //? The base config names its plugins as `./node_modules/@akanjs/devkit/…`, resolved from the extending config's
  //? folder. A junction needs no privilege on Windows, and the type is ignored elsewhere.
  await mkdir(path.join(dir, "node_modules", "@akanjs"), { recursive: true });
  await symlink(devkitDir, path.join(dir, "node_modules", "@akanjs", "devkit"), "junction");
  await writeFile(path.join(dir, "biome.json"), JSON.stringify({ extends: [biomeBaseConfig] }));
  for (const file of files) {
    await mkdir(path.dirname(path.join(dir, file)), { recursive: true });
    await writeFile(path.join(dir, file), hookProbe);
  }
  const output = await runBiome(["lint", "--reporter=json", "--max-diagnostics=none", ...files], dir);
  return parseBiomeReport(output).diagnostics ?? [];
};

describe("biome.base.json", () => {
  test("reports a conditional React hook in app and lib components, not in their tests or in packages", async () => {
    const diagnostics = await lintWorkspace([
      "apps/demo/ui/Probe.tsx",
      "libs/demo/ui/Probe.tsx",
      "apps/demo/ui/Probe.test.tsx",
      "pkgs/demo/Probe.tsx",
    ]);
    const hookReports = diagnostics
      .filter((diagnostic) => diagnostic.category === "lint/correctness/useHookAtTopLevel")
      .map(
        (diagnostic) =>
          `${diagnostic.location?.path?.replaceAll("\\", "/")}:${diagnostic.location?.start?.line} ${diagnostic.severity}`,
      )
      .sort();
    expect(hookReports).toEqual([
      "apps/demo/ui/Probe.tsx:3 error",
      "apps/demo/ui/Probe.tsx:7 error",
      "libs/demo/ui/Probe.tsx:3 error",
      "libs/demo/ui/Probe.tsx:7 error",
    ]);
  });
});
