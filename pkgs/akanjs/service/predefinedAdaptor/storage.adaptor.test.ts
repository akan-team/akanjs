import { afterEach, describe, expect, test } from "bun:test";
import { resetEnvCache } from "akanjs/base";
import { BlobStorage } from "./storage.adaptor";

const envKeys = [
  "AKAN_DATABASE_MODE",
  "AKAN_STORAGE_SHARED",
  "AKAN_PUBLIC_ENV",
  "AKAN_PUBLIC_OPERATION_MODE",
  "AKAN_PUBLIC_APP_NAME",
  "AKAN_PUBLIC_REPO_NAME",
  "AKAN_PUBLIC_SERVE_DOMAIN",
] as const;
const saved = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));

const useEnv = (env: Partial<Record<(typeof envKeys)[number], string>>) => {
  for (const key of envKeys) delete process.env[key];
  Object.assign(process.env, {
    AKAN_PUBLIC_APP_NAME: "probe",
    AKAN_PUBLIC_REPO_NAME: "repo",
    AKAN_PUBLIC_SERVE_DOMAIN: "example.com",
    ...env,
  });
  resetEnvCache();
};

describe("BlobStorage.assertShared", () => {
  afterEach(() => {
    for (const key of envKeys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    resetEnvCache();
  });

  test("[F-1] a deployed multi-instance app refuses a disk nobody said was shared", () => {
    for (const mode of ["multiple", "cluster"]) {
      useEnv({ AKAN_DATABASE_MODE: mode, AKAN_PUBLIC_ENV: "main", AKAN_PUBLIC_OPERATION_MODE: "cloud" });
      expect(() => BlobStorage.assertShared("uploads")).toThrow("AKAN_STORAGE_SHARED");
    }
  });

  test("accepts a volume the operator declares shared, one instance, and a development machine", () => {
    useEnv({
      AKAN_DATABASE_MODE: "cluster",
      AKAN_PUBLIC_ENV: "main",
      AKAN_PUBLIC_OPERATION_MODE: "cloud",
      AKAN_STORAGE_SHARED: "true",
    });
    expect(() => BlobStorage.assertShared("uploads")).not.toThrow();
    useEnv({ AKAN_DATABASE_MODE: "single", AKAN_PUBLIC_ENV: "main", AKAN_PUBLIC_OPERATION_MODE: "cloud" });
    expect(() => BlobStorage.assertShared("uploads")).not.toThrow();
    useEnv({ AKAN_DATABASE_MODE: "cluster", AKAN_PUBLIC_ENV: "debug", AKAN_PUBLIC_OPERATION_MODE: "local" });
    expect(() => BlobStorage.assertShared("uploads")).not.toThrow();
  });
});
