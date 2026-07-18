import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AppScanResult } from "akanjs";
import { withBase } from "./capacitor.base.config";

const originalEnv = { ...process.env };
const originalCwd = process.cwd();
const tempRoots: string[] = [];

const makeTempRoot = async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "akan-capacitor-"));
  tempRoots.push(root);
  return root;
};

const writeAppConfig = async (root: string, appName: string) => {
  await mkdir(path.join(root, "apps", appName), { recursive: true });
  await writeFile(path.join(root, "apps", appName, "akan.config.ts"), "export default {};\n");
};

const appInfo = (name: string): AppScanResult =>
  ({
    name,
    type: "app",
    repoName: "repo",
    serveDomain: "example.com",
    files: {},
    libDeps: [],
    pkgDeps: [],
    dependencies: [],
    devDependencies: [],
    routes: [],
    akanConfig: {
      mobile: {
        targets: {
          app: {
            name: "app",
            appId: "com.example.app",
            appName: "Example",
          },
        },
      },
    },
  }) as AppScanResult;

afterEach(async () => {
  process.chdir(originalCwd);
  process.env = { ...originalEnv };
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("withBase", () => {
  test("uses sorted app order for local CSR fallback port", async () => {
    const root = await makeTempRoot();
    await writeAppConfig(root, "minimal");
    await writeAppConfig(root, "akan");
    process.chdir(root);
    delete process.env.AKAN_PUBLIC_CLIENT_PORT;
    delete process.env.PORT;

    const config = withBase(undefined, appInfo("minimal"));

    expect(config.server).toMatchObject({
      url: expect.stringContaining(":8283/"),
    });
  });

  test("prefers explicit local CSR port env", async () => {
    const root = await makeTempRoot();
    await writeAppConfig(root, "minimal");
    await writeAppConfig(root, "akan");
    process.chdir(root);
    process.env.AKAN_PUBLIC_CLIENT_PORT = "9300";

    const config = withBase(undefined, appInfo("minimal"));

    expect(config.server).toMatchObject({
      url: expect.stringContaining(":9300/"),
    });
  });
});
