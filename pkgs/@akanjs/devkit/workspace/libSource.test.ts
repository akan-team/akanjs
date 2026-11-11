import { describe, expect, test } from "bun:test";
import path from "node:path";
import { Executor, LibExecutor, WorkspaceExecutor } from "../executors";
import { tempDirs, writeText as write } from "../test/testHelpers";
import { formatLibStatuses, LibSource } from "./libSource";

const makeTempRoot = tempDirs("akan-libsource-");

// `LibExecutor.from` memoises by name, so each fixture needs a name no other test has used.
const makeLib = async (libName: string) => {
  const root = await makeTempRoot();
  await write(
    path.join(root, "package.json"),
    '{ "name": "workspace", "version": "0.0.1", "description": "workspace" }\n',
  );
  await write(path.join(root, ".gitignore"), "node_modules\n");
  await write(path.join(root, `libs/${libName}/package.json`), `{ "name": "@${libName}", "version": "0.0.1" }\n`);
  await write(path.join(root, `libs/${libName}/common/helper.ts`), "export const helper = 1;\n");
  await write(path.join(root, `libs/${libName}/env/env.server.testing.ts`), "export const env = { key: 1 };\n");

  const git = new Executor("fixture", root);
  await git.spawn("git", ["init", "--quiet"]);

  const workspace = WorkspaceExecutor.fromRoot({ workspaceRoot: root, repoName: `workspace-${libName}` });
  const lib = LibExecutor.from(workspace, libName);
  return { root, lib, source: new LibSource(lib) };
};

describe("LibSource", () => {
  test("reports an unstamped library", async () => {
    const { source } = await makeLib("plain-lib");
    const status = await source.status();

    expect(status.drift).toBe("unstamped");
    expect(status.stamp).toBeNull();
    expect(status.hash).toMatch(/^[0-9a-f]{32}$/);
  });

  test("stamps the origin into package.json and reads back clean", async () => {
    const { lib, source } = await makeLib("stamped-lib");
    const stamp = await source.write({ origin: "akanjs", sha: "3.0.0" });

    expect(stamp.origin).toBe("akanjs");
    expect(await source.read()).toEqual(stamp);
    expect((await source.status()).drift).toBe("clean");

    const manifest = await lib.getPackageJson();
    expect(manifest.name).toBe("@stamped-lib");
    expect((manifest.akan as { source: { sha: string } }).source.sha).toBe("3.0.0");
  });

  test("detects an edit to library source as drift", async () => {
    const { root, source } = await makeLib("drift-lib");
    await source.write({ origin: "akanjs", sha: "3.0.0" });
    await write(path.join(root, "libs/drift-lib/common/helper.ts"), "export const helper = 2;\n");

    expect((await source.status()).drift).toBe("drifted");
  });

  test("survives every other akan write to the manifest", async () => {
    const { lib, source } = await makeLib("merge-lib");
    const stamp = await source.write({ origin: "akanjs", sha: "3.0.0" });
    const manifest = await lib.getPackageJson();
    await lib.setPackageJson({ ...manifest, dependencies: { lodash: "4.0.0" } });

    expect(await source.read()).toEqual(stamp);
    expect((await source.status()).drift).toBe("drifted");
  });

  test("leaves env values out of the hash — they belong to the installing workspace", async () => {
    const { root, source } = await makeLib("env-lib");
    await source.write({ origin: "akanjs", sha: "3.0.0" });
    await write(path.join(root, "libs/env-lib/env/env.server.testing.ts"), "export const env = { key: 999 };\n");

    expect((await source.status()).drift).toBe("clean");
  });
});

describe("formatLibStatuses", () => {
  test("marks drifted libraries and counts them", () => {
    const text = formatLibStatuses([
      {
        lib: "util",
        drift: "clean",
        hash: "a".repeat(32),
        stamp: { origin: "akanjs", sha: "3.0.0", hash: "a".repeat(32), syncedAt: "now" },
      },
      {
        lib: "shared",
        drift: "drifted",
        hash: "b".repeat(32),
        stamp: { origin: "akanjs", sha: "3.0.0", hash: "a".repeat(32), syncedAt: "now" },
      },
      { lib: "local", drift: "unstamped", hash: "c".repeat(32), stamp: null },
    ]);

    expect(text).toContain("DRIFTED   libs/shared  akanjs@3.0.0");
    expect(text).toContain("unstamped libs/local  no akan.source in package.json");
    expect(text).toContain("drifted: 1 / 3");
  });
});
