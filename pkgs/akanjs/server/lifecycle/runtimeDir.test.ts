import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveRuntimeDir } from "./runtimeDir";

const saved = { ...process.env };
const savedCwd = process.cwd();
const tempRoots: string[] = [];

afterEach(() => {
  process.chdir(savedCwd);
  process.env.AKAN_RUNTIME_DIR = saved.AKAN_RUNTIME_DIR;
  process.env.NODE_ENV = saved.NODE_ENV;
  process.env.AKAN_PUBLIC_APP_NAME = saved.AKAN_PUBLIC_APP_NAME;
  if (saved.AKAN_RUNTIME_DIR === undefined) delete process.env.AKAN_RUNTIME_DIR;
});

afterAll(() => {
  for (const root of tempRoots) rmSync(root, { recursive: true, force: true });
});

const makeDir = (...segments: string[]) => {
  const dir = path.join(...segments);
  mkdirSync(dir, { recursive: true });
  return dir;
};
const makeTempDir = () => {
  const dir = realpathSync(mkdtempSync(path.join(os.tmpdir(), "akan-runtime-dir-")));
  tempRoots.push(dir);
  return dir;
};
const makePackage = (dir: string) => {
  writeFileSync(path.join(makeDir(dir), "package.json"), "{}");
  writeFileSync(path.join(dir, "tsconfig.json"), "{}");
  return dir;
};
const makeWorkspace = () => {
  const root = makePackage(makeTempDir());
  makePackage(path.join(root, "apps", "demo"));
  makeDir(root, "apps", "demo", "lib", "user");
  makePackage(path.join(root, "libs", "shared"));
  return root;
};
const resolveFrom = (cwd: string, { appName = "minimal", nodeEnv = "development" } = {}) => {
  delete process.env.AKAN_RUNTIME_DIR;
  process.env.AKAN_PUBLIC_APP_NAME = appName;
  process.env.NODE_ENV = nodeEnv;
  process.chdir(cwd);
  return resolveRuntimeDir();
};

describe("runtime dir", () => {
  test("prefers the caller's own path over everything else", () => {
    process.env.AKAN_RUNTIME_DIR = "/tmp/ignored";
    expect(resolveRuntimeDir("/tmp/explicit")).toBe(path.resolve("/tmp/explicit"));
  });

  test("takes AKAN_RUNTIME_DIR next, absolute", () => {
    process.env.AKAN_RUNTIME_DIR = "relative/runtime";
    expect(resolveRuntimeDir()).toBe(path.resolve(process.cwd(), "relative/runtime"));
  });

  test("lands beside the app in production and under local/ in dev", () => {
    delete process.env.AKAN_RUNTIME_DIR;
    process.env.AKAN_PUBLIC_APP_NAME = "minimal";
    process.env.NODE_ENV = "production";
    expect(resolveRuntimeDir()).toBe(path.resolve(process.cwd(), "runtime"));
    process.env.NODE_ENV = "development";
    expect(resolveRuntimeDir()).toBe(path.resolve(process.cwd(), "local", "apps", "minimal", "runtime"));
  });

  test("answers the same for the gateway and for a solo server", () => {
    delete process.env.AKAN_RUNTIME_DIR;
    process.env.NODE_ENV = "production";
    expect(resolveRuntimeDir(undefined)).toBe(resolveRuntimeDir());
  });

  test("writes a run from inside an app or a lib where akan test does, under the workspace root", () => {
    const root = makeWorkspace();

    expect(resolveFrom(path.join(root, "apps", "demo"))).toBe(path.join(root, "local", "apps", "demo", "runtime"));
    expect(resolveFrom(path.join(root, "apps", "demo", "lib", "user"))).toBe(
      path.join(root, "local", "apps", "demo", "runtime"),
    );
    expect(resolveFrom(path.join(root, "libs", "shared"))).toBe(path.join(root, "local", "libs", "shared", "runtime"));
  });

  test("keeps the cwd rule at the workspace root and outside any workspace", () => {
    const root = makeWorkspace();
    const outside = makeTempDir();

    expect(resolveFrom(root)).toBe(path.join(root, "local", "apps", "minimal", "runtime"));
    expect(resolveFrom(outside)).toBe(path.join(outside, "local", "apps", "minimal", "runtime"));
  });

  test("keeps production beside the process even inside an app", () => {
    const root = makeWorkspace();
    const appDir = path.join(root, "apps", "demo");

    expect(resolveFrom(appDir, { nodeEnv: "production" })).toBe(path.join(appDir, "runtime"));
  });
});
