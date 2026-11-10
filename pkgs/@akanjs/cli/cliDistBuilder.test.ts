import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, realpath, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { CliDistBuilder } from "./cliDistBuilder";

const roots: string[] = [];
afterEach(async () => {
  delete process.env.AKAN_CLI_FORCE_BUILD;
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const write = async (file: string, content: string) => {
  await mkdir(path.dirname(file), { recursive: true });
  await Bun.write(file, content);
};

const workspace = async () => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), "cli-dist-builder-")));
  roots.push(root);
  const pkg = (dir: string, manifest: object) => write(path.join(root, dir, "package.json"), JSON.stringify(manifest));
  await pkg(".", { name: "fixture", workspaces: ["pkgs/*", "pkgs/@akanjs/*", "pkgs/@sample/*"] });
  await pkg("pkgs/@akanjs/cli", { name: "@akanjs/cli", dependencies: { akanjs: "1.0.0" } });
  await pkg("pkgs/@akanjs/devkit", {
    name: "@akanjs/devkit",
    dependencies: {
      "@sample/lang": "1.0.0",
      akanjs: "1.0.0",
      "lang-alias": "npm:@sample/subpaths@1.0.0",
      "@sample/vendored": "1.0.0",
    },
  });
  await pkg("pkgs/@sample/lang", { name: "@sample/lang", dependencies: { akanjs: "1.0.0" } });
  await pkg("pkgs/@sample/subpaths", { name: "@sample/subpaths", exports: { "./x": "./x.ts" } });
  await pkg("pkgs/akanjs", { name: "akanjs" });
  await pkg("vendor/vendored", { name: "@sample/vendored", main: "./dist/index.ts" });
  await write(path.join(root, "vendor/vendored/dist/package.json"), JSON.stringify({ type: "module" }));
  for (const file of [
    "pkgs/@akanjs/cli/index.ts",
    "pkgs/@akanjs/cli/code/akanCode.ts",
    "pkgs/@akanjs/devkit/incrementalBuilder/incrementalBuilder.proc.ts",
    "pkgs/@akanjs/devkit/incrementalBuilder/buildBatch.proc.ts",
    "pkgs/@akanjs/devkit/typecheck/typecheck.proc.ts",
    "pkgs/@sample/lang/index.ts",
    "pkgs/@sample/subpaths/x.ts",
    "pkgs/akanjs/index.ts",
    "vendor/vendored/dist/index.ts",
  ])
    await write(path.join(root, file), "export const value = 1;\n");
  for (const dir of [
    "pkgs/@akanjs/cli/templates",
    "pkgs/@akanjs/cli/guidelines",
    "pkgs/@akanjs/devkit/codeAgent/skills",
  ])
    await write(path.join(root, dir, "README.md"), "\n");
  await mkdir(path.join(root, "node_modules/@sample"), { recursive: true });
  await symlink(path.join(root, "vendor/vendored"), path.join(root, "node_modules/@sample/vendored"));
  const builder = new CliDistBuilder({
    cliDir: path.join(root, "pkgs/@akanjs/cli"),
    outDir: path.join(root, "dist/pkgs/@akanjs/cli"),
  });
  return { root, builder };
};

describe("CliDistBuilder", () => {
  test("stamps the workspace packages the bundle compiles in, and not the ones it leaves external", async () => {
    const { root, builder } = await workspace();
    expect(await builder.bundledPackageDirs()).toEqual(
      ["pkgs/@akanjs/cli", "pkgs/@akanjs/devkit", "pkgs/@sample/lang", "pkgs/@sample/subpaths", "vendor/vendored"].map(
        (dir) => path.join(root, dir),
      ),
    );
    const stamp = await builder.inputStamp();
    await write(path.join(root, "pkgs/akanjs/index.ts"), "export const value = 2;\n");
    await write(path.join(root, "pkgs/@sample/lang/index.test.ts"), "export {};\n");
    expect(await builder.inputStamp()).toBe(stamp);
    await write(path.join(root, "pkgs/@sample/lang/index.ts"), "export const value = 22;\n");
    expect(await builder.inputStamp()).not.toBe(stamp);
  });

  test("reaches the language package from this repository's CLI", async () => {
    const builder = new CliDistBuilder({ cliDir: import.meta.dir, outDir: path.join(tmpdir(), "unused") });
    const dirs = await builder.bundledPackageDirs();
    expect(dirs).toContain(await realpath(path.resolve(import.meta.dir, "../language")));
    expect(dirs).not.toContain(await realpath(path.resolve(import.meta.dir, "../../akanjs")));
  });

  describe("AKAN_CLI_FORCE_BUILD", () => {
    const holdLock = async (root: string, { buildMeanwhile }: { buildMeanwhile: boolean }) => {
      const outDir = path.join(root, "dist/pkgs/@akanjs/cli");
      await write(path.join(`${outDir}.lock`, "owner"), `${process.pid}`);
      return Bun.sleep(300).then(async () => {
        if (buildMeanwhile) {
          const stampFile = path.join(outDir, ".build-stamp");
          await Bun.write(stampFile, await Bun.file(stampFile).text());
        }
        await rm(`${outDir}.lock`, { recursive: true, force: true });
      });
    };

    test("rebuilds an up-to-date dist, and after a wait in which no build finished", async () => {
      const { root, builder } = await workspace();
      expect(await builder.build()).toBe("built");
      expect(await builder.build()).toBe("up-to-date");
      process.env.AKAN_CLI_FORCE_BUILD = "1";
      expect(await builder.build()).toBe("built");
      const released = holdLock(root, { buildMeanwhile: false });
      expect(await builder.build()).toBe("built");
      await released;
    }, 60_000);

    test("leaves the dist a build finished while it waited for the lock", async () => {
      const { root, builder } = await workspace();
      expect(await builder.build()).toBe("built");
      process.env.AKAN_CLI_FORCE_BUILD = "1";
      const released = holdLock(root, { buildMeanwhile: true });
      expect(await builder.build()).toBe("built-by-other");
      await released;
    }, 60_000);
  });
});
