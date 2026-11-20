import { describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { tempDirs } from "../test/testHelpers";
import { loadSsh2, ssh2InstallCommand } from "./ssh2Module";

const makeTempRoot = tempDirs("akan-ssh2-module-");

//? Bun resolves a bare specifier from its global cache when no node_modules sits above the importer, so each root has one.
const workspaceWithout = async (lockfile: string) => {
  const root = await makeTempRoot();
  await mkdir(path.join(root, "node_modules"));
  await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "ws", private: true }));
  await writeFile(path.join(root, lockfile), "");
  return root;
};

describe("loadSsh2", () => {
  test("names the bun install command when a Bun workspace lacks ssh2", async () => {
    const root = await workspaceWithout("bun.lock");
    await expect(loadSsh2("The redis tunnel for demo-debug", root, [root])).rejects.toThrow(
      `The redis tunnel for demo-debug needs the ssh2 package, which an Akan workspace installs only to open a tunnel: run \`bun add -d ssh2\` in ${root}, then try again.`,
    );
  });

  test("names the npm install command when only an npm lockfile is present", async () => {
    const root = await workspaceWithout("package-lock.json");
    expect(ssh2InstallCommand(root)).toBe("npm install -D ssh2");
    await expect(loadSsh2("The postgres tunnel", root, [root])).rejects.toThrow("run `npm install -D ssh2`");
  });

  test("loads ssh2 from a later directory when an earlier one lacks it", async () => {
    const root = await workspaceWithout("bun.lock");
    const ssh2 = await loadSsh2("The redis tunnel", root, [root, import.meta.dir]);
    expect(typeof ssh2.Client).toBe("function");
  });
});
