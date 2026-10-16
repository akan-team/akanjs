import { describe, expect, test } from "bun:test";
import { realpath } from "node:fs/promises";
import path from "node:path";
import { ApplicationBuildReporter } from "./applicationBuildReporter";
import { resolveSignalTestPreloadPath } from "./applicationTestPreload";
import { TypeScriptDependencyScanner } from "./dependencyScanner";
import { AppExecutor, WorkspaceExecutor } from "./executors";
import { tempDirs, writeText as write } from "./testHelpers";
import type { PackageJson, TsConfigJson } from "./types";

const makeTempRoot = tempDirs("akan-devkit-utils-");

describe("resolveSignalTestPreloadPath", () => {
  test("resolves the preload file from an installed akanjs package", async () => {
    const root = await makeTempRoot();
    const libDir = path.join(root, "libs/shared");
    await write(
      path.join(root, "node_modules/akanjs/package.json"),
      JSON.stringify({
        name: "akanjs",
        version: "0.0.0",
        exports: { "./package.json": "./package.json" },
      }),
    );
    await write(path.join(root, "node_modules/akanjs/test/signalTest.preload.ts"), "export {};\n");

    await expect(resolveSignalTestPreloadPath({ cwdPath: libDir })).resolves.toContain(
      path.join("node_modules/akanjs/test/signalTest.preload.ts"),
    );
  });
});

describe("TypeScriptDependencyScanner", () => {
  test("separates monorepo package, lib, runtime, and type-only dependencies", async () => {
    const root = await makeTempRoot();
    const appDir = path.join(root, "apps/demo");
    await write(
      path.join(appDir, "index.ts"),
      [
        'import React from "react";',
        'import { helper } from "@libs/shared/helper";',
        'import { tool } from "akanjs/tool";',
        'import type { Config } from "typescript";',
        'import { local } from "./local";',
        "console.log(React, helper, tool, local);",
        "",
      ].join("\n"),
    );
    await write(path.join(appDir, "local.ts"), 'import "lodash";\nexport const local = 1;\n');
    await write(path.join(appDir, "node_modules/ignored.ts"), 'import "ignored";\n');
    await write(path.join(root, ".gitignore"), "ignored-dir\n");

    const rootPackageJson: PackageJson = {
      name: "repo",
      version: "1.0.0",
      description: "repo",
      dependencies: {
        react: "19.0.0",
        lodash: "4.0.0",
      },
      devDependencies: {
        typescript: "6.0.0",
      },
    };
    const tsconfig: TsConfigJson = { compilerOptions: { target: "ESNext" } };
    const scanner = new TypeScriptDependencyScanner(appDir, {
      workspaceRoot: root,
      tsconfig,
      rootPackageJson,
      gitignorePatterns: ["ignored-dir"],
    });

    const deps = await scanner.getMonorepoDependencies("demo", {
      pkgs: ["akanjs/tool"],
      libs: ["shared"],
    });
    expect(deps.pkgDeps).toEqual(["akanjs/tool"]);
    expect(deps.libDeps).toEqual(["shared"]);
    expect(deps.npmDeps.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))).toEqual(["lodash", "react"]);
    expect(deps.npmDevDeps).toEqual(["typescript"]);

    const graph = scanner.generateDependencyGraph();
    expect(graph).toContain("index.ts");
    expect(graph).toContain("@libs/shared/helper");
  });

  test("scans package build dependencies with normalized imports and css plugins", async () => {
    const root = await makeTempRoot();
    const pkgDir = path.join(root, "pkgs/akanjs");
    await write(
      path.join(pkgDir, "index.ts"),
      [
        "#!/usr/bin/env bun",
        'import "lodash/fp";',
        'import { AiOutlineApi } from "react-icons/ai";',
        'import type { Config } from "typescript";',
        'import type { DebouncedFunc } from "lodash";',
        'import "node:path";',
        'import "bun:test";',
        'import "akanjs/client";',
        "export const value = AiOutlineApi;",
        "export type ToolConfig = Config & { debounced?: DebouncedFunc<() => void> };",
        "",
      ].join("\n"),
    );
    await write(path.join(pkgDir, "styles.css"), '@plugin "tailwind-scrollbar";\n');
    await write(path.join(pkgDir, "index.test.ts"), 'import "commander";\n');
    await write(path.join(pkgDir, "build.ts"), 'import { Command } from "commander";\n');
    await write(path.join(pkgDir, "commented.ts"), '// import type { Linter } from "eslint";\n');

    const rootPackageJson: PackageJson = {
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
    };
    const tsconfig: TsConfigJson = { compilerOptions: { target: "ESNext" } };
    const scanner = new TypeScriptDependencyScanner(pkgDir, {
      workspaceRoot: root,
      tsconfig,
      rootPackageJson,
    });

    const deps = await scanner.getPackageBuildDependencies("akanjs");

    expect(deps.npmDeps).toEqual(["lodash", "react-icons", "tailwind-scrollbar"]);
    expect(deps.npmDevDeps).toEqual(["commander", "typescript"]);
    expect(deps.missingDeps).toEqual([]);
  });
});

describe("scan convention", () => {
  test("allows module abstract markdown files", async () => {
    const root = await makeTempRoot();
    const appName = "scanAbstractDemo";
    const appDir = path.join(root, `apps/${appName}`);
    await write(path.join(root, ".gitignore"), "");
    await write(
      path.join(root, ".env"),
      ["AKAN_PUBLIC_REPO_NAME=repo", 'AKAN_PUBLIC_SERVE_DOMAIN="localhost"', "AKAN_PUBLIC_ENV=local", ""].join("\n"),
    );
    await write(
      path.join(root, "package.json"),
      JSON.stringify({
        name: "repo",
        version: "1.0.0",
        description: "repo",
        dependencies: {},
        devDependencies: {},
      }),
    );
    await write(path.join(root, "tsconfig.json"), JSON.stringify({ compilerOptions: { target: "ESNext", paths: {} } }));
    await write(path.join(appDir, "package.json"), JSON.stringify({ name: appName, version: "1.0.0" }));
    await write(path.join(appDir, "tsconfig.json"), JSON.stringify({ compilerOptions: { target: "ESNext" } }));
    await write(path.join(appDir, "akan.config.ts"), "export default {};\n");
    await write(path.join(appDir, "main.ts"), "export {};\n");
    await write(path.join(appDir, "lib/post/post.abstract.md"), "# Post Abstract\n");
    await write(path.join(appDir, "lib/post/post.constant.ts"), "export class Post {}\n");
    await write(path.join(appDir, "lib/_payment/payment.abstract.md"), "# Payment Service Abstract\n");
    await write(path.join(appDir, "lib/_payment/payment.service.ts"), "export const payment = {};\n");
    await write(path.join(appDir, "lib/__scalar/money/money.abstract.md"), "# Money Scalar Abstract\n");
    await write(path.join(appDir, "lib/__scalar/money/money.constant.ts"), "export class Money {}\n");

    const workspace = WorkspaceExecutor.fromRoot({ workspaceRoot: root, repoName: "repo" });
    const app = AppExecutor.from(workspace, appName);

    await expect(app.scan({ write: false })).resolves.toBeDefined();
  });
});

describe("ApplicationBuildReporter", () => {
  test("formats duration, phase lines, and nested errors", () => {
    expect(ApplicationBuildReporter.formatDuration(999)).toBe("999ms");
    expect(ApplicationBuildReporter.formatDuration(1234)).toBe("1.2s");
    expect(ApplicationBuildReporter.formatDuration(65_000)).toBe("1m 5s");
    expect(
      ApplicationBuildReporter.formatPhaseLine({
        id: "bundle",
        label: "Bundle",
        durationMs: 1500,
        summary: "3 files",
      }),
    ).toBe("✓ Bundle: 3 files (1.5s)");

    const nested = new Error("outer", { cause: new Error("inner") });
    expect(ApplicationBuildReporter.formatError(nested)).toBe("outer\nCaused by: inner");

    const aggregate = new AggregateError([new Error("first"), { message: "second" }, "third"], "failed");
    expect(ApplicationBuildReporter.formatError(aggregate)).toBe(
      ["failed", "  first", "  second", "  third"].join("\n"),
    );
  });

  test("says where the bundler placed each reason, relative to the workspace root", async () => {
    const root = await makeTempRoot();
    const refuseWith = (message: string) => ({
      name: "refuse",
      setup: (build: Bun.PluginBuilder) => {
        build.onLoad({ filter: /plugged\.ts$/ }, () => {
          throw new Error(message);
        });
      },
    });
    const failureOf = (entry: string, plugins: Bun.BunPlugin[] = []) =>
      Bun.build({ entrypoints: [path.join(root, entry)], plugins }).then(
        () => null,
        (error: unknown) => error,
      );
    await write(
      path.join(root, "src/entry.ts"),
      'export const a = 1;\nimport { gone } from "./not-there";\nexport const b = gone;\n',
    );
    await write(path.join(root, "src/plugged.ts"), "export const b = 1;\n");

    const unresolved = await failureOf("src/entry.ts");
    expect(ApplicationBuildReporter.formatError(unresolved, root)).toBe(
      ["Bundle failed", '  Could not resolve: "./not-there" (src/entry.ts:2:22)'].join("\n"),
    );
    const outside = path.join(await realpath(root), "src/entry.ts");
    expect(ApplicationBuildReporter.formatError(unresolved, path.join(root, "elsewhere"))).toBe(
      ["Bundle failed", `  Could not resolve: "./not-there" (${outside}:2:22)`].join("\n"),
    );
    expect(
      ApplicationBuildReporter.formatError(
        await failureOf("src/plugged.ts", [refuseWith("refused\nsecond line")]),
        root,
      ),
    ).toBe(["Bundle failed", "  refused (src/plugged.ts)", "  second line"].join("\n"));
    expect(
      ApplicationBuildReporter.formatError(
        await failureOf("src/plugged.ts", [refuseWith("src/plugged.ts is refused")]),
        root,
      ),
    ).toBe(["Bundle failed", "  src/plugged.ts is refused"].join("\n"));
  });
});
