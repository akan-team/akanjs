import { describe, expect, test } from "bun:test";
import path from "node:path";
import { tempDirs, writeText } from "../test/testHelpers";
import { TypeScriptDependencyScanner } from "./dependencyScanner";
import type { PackageJson } from "./types";

const makeTempRoot = tempDirs("akan-devkit-depscan-");

const write = async (root: string, relPath: string, content: string) => {
  const filePath = path.join(root, relPath);
  await writeText(filePath, content);
  return filePath;
};

const scannerFor = async (root: string, dependencies: Record<string, string> = {}) =>
  new TypeScriptDependencyScanner(path.join(root, "pkgs/@akanjs/devkit"), {
    workspaceRoot: root,
    tsconfig: { compilerOptions: { target: "esnext" } },
    rootPackageJson: { dependencies } as unknown as PackageJson,
  });

describe("TypeScriptDependencyScanner — getPackageBuildDependencies", () => {
  test("collects imports from ordinary source files", async () => {
    const root = await makeTempRoot();
    await write(root, "pkgs/@akanjs/devkit/linter.ts", `import chalk from "chalk";\nexport const x = chalk;\n`);
    const scanner = await scannerFor(root, { chalk: "^5.0.0" });

    const { npmDeps, missingDeps } = await scanner.getPackageBuildDependencies("@akanjs/devkit");

    expect(npmDeps).toEqual(["chalk"]);
    expect(missingDeps).toEqual([]);
  });

  test("reports an import that root package.json does not version", async () => {
    const root = await makeTempRoot();
    await write(root, "pkgs/@akanjs/devkit/linter.ts", `import clsx from "clsx";\nexport const x = clsx;\n`);
    const scanner = await scannerFor(root);

    expect((await scanner.getPackageBuildDependencies("@akanjs/devkit")).missingDeps).toEqual(["clsx"]);
  });

  test("skips __fixtures__, whose imports are lint violations rather than dependencies", async () => {
    const root = await makeTempRoot();
    await write(
      root,
      "pkgs/@akanjs/devkit/lint/__fixtures__/no-import-external-library/bad.tsx",
      `import clsx from "clsx";\nimport { cnst } from "@libs/shared/client";\nexport const x = [clsx, cnst];\n`,
    );
    const scanner = await scannerFor(root);

    const { npmDeps, npmDevDeps, missingDeps } = await scanner.getPackageBuildDependencies("@akanjs/devkit");

    expect(missingDeps).toEqual([]);
    expect(npmDeps).toEqual([]);
    expect(npmDevDeps).toEqual([]);
  });

  test("skips a nested __fixtures__ directory at any depth", async () => {
    const root = await makeTempRoot();
    await write(root, "pkgs/@akanjs/devkit/__fixtures__/bad.ts", `import a from "pkg-a";\nexport const x = a;\n`);
    await write(root, "pkgs/@akanjs/devkit/a/b/__fixtures__/c/bad.ts", `import b from "pkg-b";\nexport const x = b;\n`);
    const scanner = await scannerFor(root);

    expect((await scanner.getPackageBuildDependencies("@akanjs/devkit")).missingDeps).toEqual([]);
  });

  test("keeps a directory whose name merely contains the fixtures marker", async () => {
    const root = await makeTempRoot();
    await write(
      root,
      "pkgs/@akanjs/devkit/__fixtures__helper/keep.ts",
      `import a from "pkg-a";\nexport const x = a;\n`,
    );
    const scanner = await scannerFor(root);

    expect((await scanner.getPackageBuildDependencies("@akanjs/devkit")).missingDeps).toEqual(["pkg-a"]);
  });

  test("skips test files but still reports their non-test siblings", async () => {
    const root = await makeTempRoot();
    await write(root, "pkgs/@akanjs/devkit/linter.test.ts", `import a from "pkg-a";\nexport const x = a;\n`);
    await write(root, "pkgs/@akanjs/devkit/linter.ts", `import b from "pkg-b";\nexport const x = b;\n`);
    const scanner = await scannerFor(root);

    expect((await scanner.getPackageBuildDependencies("@akanjs/devkit")).missingDeps).toEqual(["pkg-b"]);
  });
});
