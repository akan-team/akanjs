import { describe, expect, test } from "bun:test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { tempDirs, writeJson, writeText } from "@akanjs/devkit/test/testHelpers";
import { CodePackage } from "./codePackage";

const makeTempRoot = tempDirs("akan-code-package-");

//? Bun resolves a bare specifier from its global cache when no node_modules sits above the importer, so each root has one.
const workspaceWith = async (lockfile: string, installed?: string) => {
  const root = await makeTempRoot();
  await mkdir(path.join(root, "node_modules"));
  await writeJson(path.join(root, "package.json"), { name: "ws", private: true });
  await writeText(path.join(root, lockfile), "");
  if (installed) {
    const dir = path.join(root, "node_modules/@akanjs/code");
    await writeJson(path.join(dir, "package.json"), {
      name: "@akanjs/code",
      version: installed,
      exports: { "./host": "./host/index.ts", "./package.json": "./package.json" },
    });
    await writeText(path.join(dir, "host/index.ts"), `export const AkanCodeRunner = "${installed}";\n`);
  }
  const spawned: string[][] = [];
  const spawn = async (command: string, args: string[] = []) => {
    spawned.push([command, ...args]);
    return "";
  };
  return { root, spawned, workspace: { workspaceRoot: root, spawn } };
};

describe("CodePackage", () => {
  test("names the bun install command at the CLI's version when the workspace lacks @akanjs/code", async () => {
    const { root, spawned, workspace } = await workspaceWith("bun.lock");
    await expect(CodePackage.load(workspace, { version: "3.4.0", ask: false, searchDirs: [root] })).rejects.toThrow(
      `akan code runs the coding agent from @akanjs/code, which this workspace does not have. Run \`bun add -d @akanjs/code@3.4.0\` in ${root}, then run akan code again.`,
    );
    expect(spawned).toEqual([]);
  });

  test("names the npm command in an npm workspace, and the version it found when that one differs", async () => {
    const { root, workspace } = await workspaceWith("package-lock.json", "3.3.9");
    await expect(CodePackage.load(workspace, { version: "3.4.0", ask: false, searchDirs: [root] })).rejects.toThrow(
      `akan code needs @akanjs/code 3.4.0, the version of this akan, but ${path.join(root, "node_modules/@akanjs/code")} is 3.3.9. Run \`npm install -D @akanjs/code@3.4.0\``,
    );
  });

  test("loads the host entry of the first directory that has the package at exactly the CLI's version", async () => {
    const { root, workspace } = await workspaceWith("bun.lock", "3.4.0");
    const empty = await workspaceWith("bun.lock");
    const loaded = await CodePackage.load(workspace, { version: "3.4.0", ask: false, searchDirs: [empty.root, root] });
    expect(String(loaded.AkanCodeRunner)).toBe("3.4.0");
  });
});
