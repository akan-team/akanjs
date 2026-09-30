import { afterEach, describe, expect, test } from "bun:test";
import { resetEnvCache } from "../../base/baseEnv";
import { AppInfo } from "./appInfo";

const savedEnv = { ...process.env };

const runAs = (env: Record<string, string>) => {
  for (const key of ["AKAN_PUBLIC_ENV", "AKAN_PUBLIC_OPERATION_MODE", "AKAN_WORKSPACE_ROOT"]) delete process.env[key];
  Object.assign(process.env, {
    AKAN_PUBLIC_APP_NAME: "demo",
    AKAN_PUBLIC_REPO_NAME: "repo",
    AKAN_PUBLIC_SERVE_DOMAIN: "example.com",
    ...env,
  });
  resetEnvCache();
};

afterEach(() => {
  process.env = { ...savedEnv };
  resetEnvCache();
});

describe("AppInfo.public", () => {
  test("a local dev server names the checkout it runs from", async () => {
    runAs({ AKAN_PUBLIC_ENV: "local", AKAN_PUBLIC_OPERATION_MODE: "local", AKAN_WORKSPACE_ROOT: "/work/akanjs" });
    expect(await AppInfo.handlePublic().json()).toEqual({
      appName: "demo",
      repoName: "repo",
      environment: "local",
      operationMode: "local",
      workspaceRoot: "/work/akanjs",
    });
  });

  test("no server past local names a path of its machine, whatever its env holds", () => {
    for (const operationMode of ["edge", "cloud"]) {
      runAs({
        AKAN_PUBLIC_ENV: "main",
        AKAN_PUBLIC_OPERATION_MODE: operationMode,
        AKAN_WORKSPACE_ROOT: "/work/akanjs",
      });
      expect(AppInfo.public()).toEqual({ appName: "demo", repoName: "repo", environment: "main", operationMode });
    }
  });

  test("a local server started without the akan CLI names none", () => {
    runAs({ AKAN_PUBLIC_ENV: "local", AKAN_PUBLIC_OPERATION_MODE: "local" });
    expect(AppInfo.public()).not.toHaveProperty("workspaceRoot");
  });
});
