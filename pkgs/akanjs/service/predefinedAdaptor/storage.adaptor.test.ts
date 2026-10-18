import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { resolve } from "node:path";
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

afterEach(() => {
  for (const key of envKeys) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  resetEnvCache();
});

describe("BlobStorage.resolveLocalPath", () => {
  const workspace = resolve(Bun.env.TMPDIR ?? "/tmp", `blob-storage-${crypto.randomUUID()}`);
  const storage = Object.assign(new BlobStorage(), {
    root: `${workspace}/backend`,
    privateRoot: `${workspace}/server-private`,
  });
  afterAll(async () => {
    await Bun.$`rm -rf ${workspace}`.quiet();
  });

  test("resolves a stored path under the root a read of that path uses", () => {
    expect(storage.resolveLocalPath("memo/a.png")).toBe(resolve(workspace, "backend", "memo/a.png"));
    expect(storage.resolveLocalPath("private/memo/a.pdf")).toBe(
      resolve(workspace, "server-private", "private/memo/a.pdf"),
    );
  });

  test("with access, picks the root an upload with that access wrote to", () => {
    expect(storage.resolveLocalPath("memo/a.pdf", "private")).toBe(resolve(workspace, "server-private", "memo/a.pdf"));
    expect(storage.resolveLocalPath("private/a.png", "public")).toBe(resolve(workspace, "backend", "private/a.png"));
  });

  test("refuses a path that leaves its root or names the root itself", () => {
    for (const path of ["../server-private/key.pem", "memo/../../x", "/etc/passwd", "", ".", "memo/..", "memo/a\0.png"])
      expect(storage.resolveLocalPath(path)).toBeNull();
    expect(storage.resolveLocalPath("../backend/a.png", "private")).toBeNull();
  });

  test("refuses an absolute key even inside the root, since the adaptor joins every key under it", () => {
    expect(storage.resolveLocalPath(resolve(workspace, "backend", "memo/a.png"))).toBeNull();
  });

  test("keeps a name that only starts with two dots", () => {
    expect(storage.resolveLocalPath("..hidden/a.png")).toBe(resolve(workspace, "backend", "..hidden/a.png"));
  });

  test("is the path the adaptor writes to and reads from", async () => {
    useEnv({ AKAN_PUBLIC_ENV: "local", AKAN_PUBLIC_OPERATION_MODE: "local" });
    const local = `${workspace}/src.txt`;
    await Bun.write(local, "hello");
    await storage.uploadDataFromLocal({ path: "memo/b.txt", localPath: local, access: "private" });
    expect(await Bun.file(storage.resolveLocalPath("memo/b.txt", "private") ?? "").text()).toBe("hello");
  });
});

describe("BlobStorage.assertShared", () => {
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
