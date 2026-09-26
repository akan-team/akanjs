import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import * as fsPromises from "node:fs/promises";
import os from "node:os";
import path from "node:path";

//? The Windows VM runs as an administrator, so a refused link only ever happens here — injected, on every OS.
const realSymlink = fsPromises.symlink;
let refuseLinks = false;
mock.module("node:fs/promises", () => ({
  ...fsPromises,
  symlink: async (...args: Parameters<typeof fsPromises.symlink>) => {
    if (refuseLinks)
      throw Object.assign(new Error(`EPERM: operation not permitted, symlink '${String(args[0])}'`), {
        code: "EPERM",
      });
    return await realSymlink(...args);
  },
}));
const { AppExecutor, WorkspaceExecutor } = await import("./executors");

const { lstat, mkdir, mkdtemp, readFile, rm, writeFile } = fsPromises;
const originalEnv = { ...process.env };
const originalPlatform = process.platform;
const tempRoots: string[] = [];
const PAGE_SOURCE = "export default function Page() {\n  return null;\n}\n";

const setPlatform = (platform: NodeJS.Platform) =>
  Object.defineProperty(process, "platform", { value: platform, configurable: true, writable: true });

// `AppExecutor.from` memoises by name, so each test needs a name no other test has used.
const makeApp = async (appName: string) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "akan-link-fallback-"));
  tempRoots.push(root);
  process.env.AKAN_PUBLIC_REPO_NAME = "repo";
  process.env.AKAN_PUBLIC_SERVE_DOMAIN = "example.com";
  process.env.AKAN_PUBLIC_ENV = "local";
  process.env.PORT_OFFSET = "0";
  await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "fixture", version: "1.0.0" }));
  await mkdir(path.join(root, "libs/shared/public"), { recursive: true });
  await writeFile(path.join(root, "libs/shared/public/logo.png"), "logo");
  await mkdir(path.join(root, "libs/shared/page/about"), { recursive: true });
  await writeFile(path.join(root, "libs/shared/page/about/_index.tsx"), PAGE_SOURCE);
  await mkdir(path.join(root, "apps", appName, "page"), { recursive: true });
  await writeFile(path.join(root, "apps", appName, "akan.config.ts"), "export default { syncPageLibs: true };\n");
  const workspace = new WorkspaceExecutor({ workspaceRoot: root, repoName: "repo" });
  return { root, app: AppExecutor.from(workspace, appName), appRoot: path.join(root, "apps", appName) };
};

beforeEach(() => {
  process.env = { ...originalEnv };
  refuseLinks = true;
});

afterEach(async () => {
  refuseLinks = false;
  setPlatform(originalPlatform);
  process.env = { ...originalEnv };
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("lib links the OS refuses to create", () => {
  test("Windows gets a copy of the lib assets, and a resync replaces it without touching the lib", async () => {
    setPlatform("win32");
    const { root, app, appRoot } = await makeApp("fallback-assets");

    await app.syncAssets(["shared"]);
    const copied = path.join(appRoot, "public/libs/shared");
    expect((await lstat(copied)).isSymbolicLink()).toBe(false);
    expect(await readFile(path.join(copied, "logo.png"), "utf8")).toBe("logo");

    await writeFile(path.join(root, "libs/shared/public/logo.png"), "logo-v2");
    await app.syncAssets(["shared"]);
    expect(await readFile(path.join(copied, "logo.png"), "utf8")).toBe("logo-v2");

    await app.syncAssets([]);
    expect(await lstat(path.join(appRoot, "public/libs")).catch(() => null)).toBeNull();
    expect(await readFile(path.join(root, "libs/shared/public/logo.png"), "utf8")).toBe("logo-v2");
  });

  test("Windows gets a copy of the lib pages that still routes, and a resync picks up a new lib route", async () => {
    setPlatform("win32");
    const { root, app, appRoot } = await makeApp("fallback-pages");

    expect(await app.syncPages(["shared"])).toBe(true);
    expect((await lstat(path.join(appRoot, "page/(libs)/(shared)"))).isSymbolicLink()).toBe(false);
    expect(await app.getPageKeys({ refresh: true })).toEqual(["./(libs)/(shared)/about/_index.tsx"]);

    await mkdir(path.join(root, "libs/shared/page/terms"), { recursive: true });
    await writeFile(path.join(root, "libs/shared/page/terms/_index.tsx"), PAGE_SOURCE);
    expect(await app.syncPages(["shared"])).toBe(true);
    expect(await app.getPageKeys({ refresh: true })).toEqual([
      "./(libs)/(shared)/about/_index.tsx",
      "./(libs)/(shared)/terms/_index.tsx",
    ]);
  });

  test("elsewhere the refusal surfaces rather than being papered over with a copy", async () => {
    setPlatform(originalPlatform === "win32" ? "linux" : originalPlatform);
    const { app } = await makeApp("fallback-posix");

    await expect(app.syncAssets(["shared"])).rejects.toThrow("EPERM");
  });
});
