import { describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { AppExecutor, Executor, WorkspaceExecutor } from "../executors";
import { isolateEnv, tempDirs, writeText as write } from "../test/testHelpers";
import { formatSlicePlan, SlicePlanner } from "./slicePlanner";
import type { PackageJson } from "./types";

isolateEnv({ AKAN_PUBLIC_REPO_NAME: "workspace", AKAN_PUBLIC_SERVE_DOMAIN: "example.com", AKAN_PUBLIC_ENV: "local" });
const makeTempRoot = tempDirs("akan-slice-");

const gitignore = [
  "node_modules",
  "apps/*/lib/cnst.ts",
  "libs/*/common/index.ts",
  "**/env.server.local.ts",
  "**/akan.app.json",
].join("\n");

// `AppExecutor.from` and `AppInfo.fromExecutor` both memoise by name, so each fixture needs a fresh one.
const makeWorkspace = async (appName: string, libName: string) => {
  const root = await makeTempRoot();
  const rootPackageJson: PackageJson = {
    name: "workspace",
    version: "0.0.1",
    description: "workspace",
    workspaces: ["pkgs/*"],
    dependencies: { lodash: "4.0.0", "unused-dep": "1.0.0", ioredis: "5.0.0" },
    devDependencies: { typescript: "6.0.0", "@types/lodash": "4.1.0", "@types/qrcode": "1.0.0" },
    patchedDependencies: {
      "lodash@4.0.0": "patches/lodash@4.0.0.patch",
      "unused-dep@1.0.0": "patches/unused-dep@1.0.0.patch",
    },
  };
  await write(path.join(root, "package.json"), `${JSON.stringify(rootPackageJson, null, 2)}\n`);
  await write(path.join(root, ".gitignore"), `${gitignore}\n`);
  await write(path.join(root, "biome.json"), "{}\n");
  //? The framework's peers are declared by akanjs, not by any import, so the planner reads them here.
  await write(
    path.join(root, "node_modules/akanjs/package.json"),
    '{ "name": "akanjs", "version": "3.0.0", "peerDependencies": { "react": "19.0.0", "ioredis": "5.0.0" } }\n',
  );
  await write(path.join(root, "patches/lodash@4.0.0.patch"), "");
  await write(path.join(root, "patches/unused-dep@1.0.0.patch"), "");

  await write(path.join(root, `apps/${appName}/akan.config.ts`), "export default {};\n");
  await write(path.join(root, `apps/${appName}/tsconfig.json`), "{}\n");
  await write(
    path.join(root, `apps/${appName}/lib/task/task.constant.ts`),
    [
      `import { helper } from "@libs/${libName}/common";`,
      'import lodash from "lodash";',
      "",
      "export { helper, lodash };",
      "",
    ].join("\n"),
  );
  await write(path.join(root, `apps/${appName}/lib/cnst.ts`), "export {};\n");
  await write(path.join(root, `apps/${appName}/env/env.server.local.ts`), "export const env = {};\n");

  await write(path.join(root, `libs/${libName}/akan.config.ts`), "export default {};\n");
  await write(path.join(root, `libs/${libName}/tsconfig.json`), "{}\n");
  await mkdir(path.join(root, `libs/${libName}/lib`), { recursive: true });
  await write(path.join(root, `libs/${libName}/common/helper.ts`), "export const helper = 1;\n");
  await write(path.join(root, `libs/${libName}/common/index.ts`), 'export * from "./helper";\n');

  await write(path.join(root, "pkgs/in-tree/package.json"), '{ "name": "in-tree" }\n');

  const git = new Executor("fixture", root);
  await git.spawn("git", ["init", "--quiet"]);
  await git.spawn("git", ["add", "-A"]);
  await git.spawn("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "--quiet", "-m", "fixture"]);

  const workspace = WorkspaceExecutor.fromRoot({ workspaceRoot: root, repoName: `workspace-${appName}` });
  return { root, plan: async () => await new SlicePlanner(AppExecutor.from(workspace, appName)).plan() };
};

describe("SlicePlanner", () => {
  test("resolves the lib closure and lists only git-tracked slice files", async () => {
    const { plan } = await makeWorkspace("slice-app", "slice-lib");
    const result = await plan();

    expect(result.app).toBe("slice-app");
    expect(result.libs).toEqual(["slice-lib"]);
    expect(result.appFiles).toContain("apps/slice-app/lib/task/task.constant.ts");
    expect(result.libFiles["slice-lib"]).toContain("libs/slice-lib/common/helper.ts");
  });

  test("leaves out generated barrels, env values and every other workspace member", async () => {
    const { plan } = await makeWorkspace("ignore-app", "ignore-lib");
    const result = await plan();

    expect(result.appFiles).not.toContain("apps/ignore-app/lib/cnst.ts");
    expect(result.appFiles).not.toContain("apps/ignore-app/env/env.server.local.ts");
    expect(result.libFiles["ignore-lib"]).not.toContain("libs/ignore-lib/common/index.ts");
    expect(result.rootFiles).toEqual(expect.arrayContaining(["package.json", ".gitignore", "biome.json"]));
    expect(result.rootFiles.filter((file) => file.startsWith("pkgs/"))).toEqual([]);
    expect(result.rootFiles.filter((file) => /^(apps|libs)\//.test(file))).toEqual([]);
  });

  test("drops `workspaces` from the slice manifest and reports it", async () => {
    const { plan } = await makeWorkspace("manifest-app", "manifest-lib");
    const result = await plan();

    expect(result.packageJson.workspaces).toBeUndefined();
    expect(result.warnings.join("\n")).toContain("workspaces");
  });

  test("prunes what the slice does not import, keeping the toolchain and the type packages", async () => {
    const { plan } = await makeWorkspace("deps-app", "deps-lib");
    const result = await plan();

    expect(result.requiredDependencies).toContain("lodash");
    //? `ioredis` is an akanjs peer: nothing imports it, and pruning it would break the server at runtime.
    expect(result.packageJson.dependencies).toEqual({ lodash: "4.0.0", ioredis: "5.0.0" });
    //? Nothing imports `@types/lodash` by name, so only its companion keeps it.
    expect(result.packageJson.devDependencies).toEqual({ typescript: "6.0.0", "@types/lodash": "4.1.0" });
    expect(result.packageJson.patchedDependencies).toEqual({ "lodash@4.0.0": "patches/lodash@4.0.0.patch" });
    expect(result.unusedDependencies).toEqual(["@types/qrcode", "unused-dep"]);
  });

  test("carries the dependencies whole when there is no akanjs manifest to read the peers from", async () => {
    const { root, plan } = await makeWorkspace("nopeer-app", "nopeer-lib");
    await rm(path.join(root, "node_modules"), { recursive: true, force: true });
    const result = await plan();

    expect(result.unusedDependencies).toEqual([]);
    expect(result.packageJson.dependencies).toEqual({ lodash: "4.0.0", "unused-dep": "1.0.0", ioredis: "5.0.0" });
    expect(result.warnings.join("\n")).toContain("carried whole");
  });

  test("names a type package the way DefinitelyTyped does", () => {
    expect(SlicePlanner.typesPackageOf("lodash")).toBe("@types/lodash");
    expect(SlicePlanner.typesPackageOf("@capacitor/core")).toBe("@types/capacitor__core");
  });

  test("warns about untracked files under the slice paths", async () => {
    const { root, plan } = await makeWorkspace("untracked-app", "untracked-lib");
    await write(path.join(root, "apps/untracked-app/lib/task/task.service.ts"), "export {};\n");
    const result = await plan();

    expect(result.warnings.join("\n")).toContain("apps/untracked-app/lib/task/task.service.ts");
  });
});

describe("formatSlicePlan", () => {
  test("collapses the workspace shell to its top-level entries", () => {
    const text = formatSlicePlan({
      app: "demo",
      libs: ["util"],
      appFiles: ["apps/demo/main.ts"],
      libFiles: { util: ["libs/util/index.ts"] },
      rootFiles: ["package.json", "infra/app/values/main.yaml", "infra/app/templates/app.yaml"],
      packageJson: { name: "demo", version: "0.0.1", description: "demo" },
      requiredDependencies: [],
      unusedDependencies: [],
      warnings: [],
    });

    expect(text).toContain("app: demo (apps/demo: 1 files)");
    expect(text).toContain("3 files across infra, package.json");
    expect(text).toContain("(none)");
  });
});
