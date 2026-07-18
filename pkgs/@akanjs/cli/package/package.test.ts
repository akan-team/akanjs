import { afterEach, describe, expect, mock, test } from "bun:test";
import { CommandContainer } from "@akanjs/devkit";
import {
  cleanupCliTempWorkspace,
  createCallRecorder,
  createFakeExecutor,
  createTempPackage,
  writeJson,
  writeText,
} from "../testHelpers";
import { PackageRunner } from "./package.runner";
import { PackageScript } from "./package.script";

const tempRoots: string[] = [];

afterEach(async () => {
  CommandContainer.clear();
  mock.restore();
  await Promise.all(tempRoots.splice(0).map((root) => cleanupCliTempWorkspace(root)));
});

describe("PackageScript", () => {
  test("returns package version through runner", async () => {
    const script = CommandContainer.get(PackageScript);
    const workspace = createFakeExecutor("workspace");
    script.packageRunner.version = mock(async () => "2.0.0-beta.0") as never;

    await expect(script.version(workspace as never, { log: false })).resolves.toBe("2.0.0-beta.0");
    expect(script.packageRunner.version).toHaveBeenCalledWith(workspace, { log: false });
  });

  test("wraps package runner calls with spinner lifecycle", async () => {
    const script = CommandContainer.get(PackageScript);
    const recorder = createCallRecorder();
    const pkg = createFakeExecutor("tool", {}, recorder);
    script.packageRunner.buildPackage = async (...args) => recorder.record("buildPackage", ...args);
    script.packageRunner.verifyDistPackage = (async (...args: unknown[]) => {
      recorder.record("verifyDistPackage", ...args);
      return { name: "tool", version: "1.0.0", files: 2, size: 100 };
    }) as never;
    script.packageRunner.scanSync = (async (...args: unknown[]) => {
      recorder.record("scanSync", ...args);
      return { name: "tool" };
    }) as never;

    await script.buildPackage(pkg as never);
    await script.verifyDistPackage(pkg as never);
    const scanResult = (await script.syncPackage(pkg as never)) as unknown as { name: string };

    expect(scanResult).toEqual({ name: "tool" });
    expect(recorder.names()).toEqual([
      "tool.spinning",
      "buildPackage",
      "spinner.succeed",
      "tool.spinning",
      "verifyDistPackage",
      "spinner.succeed",
      "tool.spinning",
      "scanSync",
      "spinner.succeed",
    ]);
  });
});

describe("PackageRunner", () => {
  test("builds package without build.ts by copying source and generating package metadata", async () => {
    const { root, pkg } = await createTempPackage("@sample/tool");
    tempRoots.push(root);
    await writeJson(`${root}/package.json`, {
      name: "repo",
      version: "1.0.0",
      description: "repo",
      dependencies: {
        lodash: "4.0.0",
        "react-icons": "5.0.0",
        "tailwind-scrollbar": "4.0.0",
      },
      devDependencies: {
        commander: "14.0.0",
        typescript: "6.0.0",
      },
    });
    await writeText(
      `${root}/pkgs/@sample/tool/index.ts`,
      [
        'import "lodash";',
        'import { AiOutlineApi } from "react-icons/ai";',
        'import type { Config } from "typescript";',
        'import type { DebouncedFunc } from "lodash";',
        'import "node:path";',
        'import "@sample/tool/client";',
        "export const value = AiOutlineApi;",
        "export type ToolConfig = Config & { debounced?: DebouncedFunc<() => void> };",
        "",
      ].join("\n"),
    );
    await writeText(`${root}/pkgs/@sample/tool/styles.css`, '@plugin "tailwind-scrollbar";\n');
    await writeText(`${root}/pkgs/@sample/tool/index.test.ts`, 'import "commander";\n');
    const runner = new PackageRunner();

    await runner.buildPackage(pkg);

    expect(await Bun.file(`${root}/dist/pkgs/@sample/tool/package.json`).exists()).toBe(true);
    expect(await Bun.file(`${root}/dist/pkgs/@sample/tool/index.ts`).exists()).toBe(true);
    const distPackageJson = (await Bun.file(`${root}/dist/pkgs/@sample/tool/package.json`).json()) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    expect(Object.keys(distPackageJson.dependencies)).toEqual(["lodash", "react-icons", "tailwind-scrollbar"]);
    expect(distPackageJson.dependencies).toEqual({
      lodash: "4.0.0",
      "react-icons": "5.0.0",
      "tailwind-scrollbar": "4.0.0",
    });
    expect(distPackageJson.devDependencies).toEqual({ typescript: "6.0.0" });
  });

  test("updates source package metadata before running custom build.ts", async () => {
    const { root, pkg } = await createTempPackage("@sample/tool");
    tempRoots.push(root);
    await writeJson(`${root}/package.json`, {
      name: "repo",
      version: "1.0.0",
      description: "repo",
      dependencies: { lodash: "4.0.0" },
      devDependencies: { commander: "14.0.0" },
    });
    await writeText(
      `${root}/pkgs/@sample/tool/build.ts`,
      [
        'import type { Command } from "commander";',
        'const pkgJson = await Bun.file(import.meta.dir + "/package.json").json();',
        'if (pkgJson.devDependencies?.commander !== "14.0.0") throw new Error("commander was not synced");',
        'const commandName: keyof Command = "name";',
        'if (commandName !== "name") throw new Error("unexpected command type");',
        'await Bun.write(process.cwd() + "/dist/pkgs/@sample/tool/custom-build.txt", "ok");',
        "",
      ].join("\n"),
    );
    await writeText(`${root}/pkgs/@sample/tool/index.ts`, 'import "lodash";\nexport const value = 1;\n');
    await writeText(`${root}/pkgs/@sample/tool/README.md`, "# Tool\n");
    await writeText(`${root}/pkgs/@sample/tool/README.ko.md`, "# Tool KO\n");
    const runner = new PackageRunner();

    await runner.buildPackage(pkg);

    expect(await Bun.file(`${root}/dist/pkgs/@sample/tool/custom-build.txt`).text()).toBe("ok");
    expect(await Bun.file(`${root}/dist/pkgs/@sample/tool/README.md`).text()).toBe("# Tool\n");
    expect(await Bun.file(`${root}/dist/pkgs/@sample/tool/README.ko.md`).text()).toBe("# Tool KO\n");
    const sourcePackageJson = (await Bun.file(`${root}/pkgs/@sample/tool/package.json`).json()) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    expect(sourcePackageJson.dependencies).toEqual({ lodash: "4.0.0" });
    expect(sourcePackageJson.devDependencies).toEqual({ commander: "14.0.0" });
  });

  test("keeps framework optional peers out of generated runtime dependencies", async () => {
    const { root, pkg } = await createTempPackage("akanjs");
    tempRoots.push(root);
    await writeJson(`${root}/package.json`, {
      name: "repo",
      version: "1.0.0",
      description: "repo",
      dependencies: { lodash: "4.0.0" },
      devDependencies: { "@biomejs/biome": "2.3.5", "@types/bun": "1.3.14", typescript: "6.0.0" },
    });
    await writeJson(`${root}/pkgs/akanjs/package.json`, {
      name: "akanjs",
      version: "0.1.0",
      description: "tool",
      exports: {},
      peerDependencies: {
        daisyui: "5.5.20",
        "react-icons": "5.0.0",
        "tailwind-scrollbar": "4.0.0",
      },
      peerDependenciesMeta: {
        daisyui: { optional: true },
        "react-icons": { optional: true },
        "tailwind-scrollbar": { optional: true },
      },
    });
    await writeText(
      `${root}/pkgs/akanjs/index.ts`,
      [
        'import "lodash";',
        'import { AiOutlineApi } from "react-icons/ai";',
        "export const value = AiOutlineApi;",
        "",
      ].join("\n"),
    );
    await writeText(`${root}/pkgs/akanjs/styles.css`, '@plugin "tailwind-scrollbar";\n');
    const runner = new PackageRunner();

    await runner.buildPackage(pkg);

    const distPackageJson = (await Bun.file(`${root}/dist/pkgs/akanjs/package.json`).json()) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
      peerDependencies: Record<string, string>;
      peerDependenciesMeta: Record<string, { optional: boolean }>;
    };
    expect(distPackageJson.dependencies).toEqual({ lodash: "4.0.0" });
    expect(distPackageJson.devDependencies).toEqual({ "@biomejs/biome": "2.3.5", "@types/bun": "1.3.14" });
    expect(distPackageJson.peerDependencies).toEqual({
      daisyui: "5.5.20",
      "react-icons": "5.0.0",
      "tailwind-scrollbar": "4.0.0",
    });
    expect(distPackageJson.peerDependenciesMeta).toEqual({
      daisyui: { optional: true },
      "react-icons": { optional: true },
      "tailwind-scrollbar": { optional: true },
    });
  });

  test("fails when a scanned dependency is missing from the root package.json", async () => {
    const { root, pkg } = await createTempPackage("@sample/tool");
    tempRoots.push(root);
    await writeText(`${root}/pkgs/@sample/tool/index.ts`, 'import "missing-package";\nexport const value = 1;\n');
    const runner = new PackageRunner();

    await expect(runner.buildPackage(pkg)).rejects.toThrow(
      "Missing dependency versions in root package.json: missing-package",
    );
  });

  test("verifies dist package metadata with npm pack dry-run", async () => {
    const { root, pkg } = await createTempPackage("@sample/tool");
    tempRoots.push(root);
    await writeJson(`${root}/dist/pkgs/@sample/tool/package.json`, {
      name: "@sample/tool",
      version: "1.2.3",
      publishConfig: { access: "public" },
      bin: { tool: "./index.js" },
    });
    await writeText(`${root}/dist/pkgs/@sample/tool/README.md`, "# Tool\n");
    await writeText(`${root}/dist/pkgs/@sample/tool/README.ko.md`, "# Tool KO\n");
    pkg.workspace.spawn = (async (...args: unknown[]) => {
      expect(args).toEqual(["npm", ["pack", "--dry-run", "--json", `${root}/dist/pkgs/@sample/tool`], { cwd: root }]);
      return JSON.stringify([{ files: [{ path: "package.json" }, { path: "index.js" }], size: 1234 }]);
    }) as never;

    const result = await new PackageRunner().verifyDistPackage(pkg);

    expect(result).toEqual({ name: "@sample/tool", version: "1.2.3", files: 2, size: 1234 });
  });

  test("rejects dist package bins that still point at TypeScript sources", async () => {
    const { root, pkg } = await createTempPackage("@sample/tool");
    tempRoots.push(root);
    await writeJson(`${root}/dist/pkgs/@sample/tool/package.json`, {
      name: "@sample/tool",
      version: "1.2.3",
      publishConfig: { access: "public" },
      bin: { tool: "./index.ts" },
    });
    await writeText(`${root}/dist/pkgs/@sample/tool/README.md`, "# Tool\n");
    await writeText(`${root}/dist/pkgs/@sample/tool/README.ko.md`, "# Tool KO\n");

    await expect(new PackageRunner().verifyDistPackage(pkg)).rejects.toThrow(
      "dist bin entries must not point at TypeScript sources",
    );
  });
});
