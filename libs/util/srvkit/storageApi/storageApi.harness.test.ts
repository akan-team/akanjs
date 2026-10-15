import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { existsSync } from "node:fs";
import { INJECT_META } from "akanjs/base";
import type { ObjectStorageOptions } from "./objectStorageApi.helper";
import type { StorageApi } from "./storageApi";

const s3Calls: string[] = [];
class S3ClientStandIn {
  constructor() {
    s3Calls.push("construct");
  }
  file(key: string) {
    s3Calls.push(`file ${key}`);
    return { stream: () => new Blob([]).stream(), delete: async () => undefined };
  }
}
const cloudFrontClient = mock(() => ({ send: async () => ({}) }));
mock.module("@aws-sdk/client-cloudfront", () => ({
  CloudFrontClient: cloudFrontClient,
  CreateInvalidationCommand: class {},
}));
const realS3Client = Bun.S3Client;
//? mock.module cannot replace "bun" and `import { S3Client } from "bun"` binds at load, so swap the global before any dynamic import.
Object.assign(Bun, { S3Client: S3ClientStandIn });

const standInBucket = (bucket: string): ObjectStorageOptions => ({
  service: "r2",
  region: "https://standin.invalid",
  accessKey: "standin",
  secretAccessKey: "standin",
  distributionId: "standin",
  bucket,
  host: null,
});
interface EnvInjection {
  type: string;
  generateFactory: (env: unknown) => unknown;
}
const injectEnv = async <T extends object>(instance: T, cls: object, env: unknown) => {
  const injections = (cls as Record<symbol, Record<string, EnvInjection>>)[INJECT_META] ?? {};
  for (const [key, injection] of Object.entries(injections))
    if (injection.type === "env") Object.assign(instance, { [key]: await injection.generateFactory(env) });
  return instance;
};
const workspace = `${Bun.env.TMPDIR ?? "/tmp"}/storage-harness-${crypto.randomUUID()}`;
const previousEnv = { ...process.env };

describe("StorageApi inside the signal-test harness", () => {
  let storage: StorageApi;
  let scratchDir: string;

  beforeAll(async () => {
    Object.assign(process.env, {
      AKAN_WORKSPACE_ROOT: workspace,
      AKAN_PUBLIC_APP_NAME: "util",
      AKAN_PUBLIC_REPO_NAME: "akan",
      AKAN_PUBLIC_SERVE_DOMAIN: "example.com",
      AKAN_PUBLIC_ENV: "testing",
      AKAN_PUBLIC_OPERATION_MODE: "local",
      NODE_ENV: "test",
    });
    delete process.env.STORAGE_MODE;
    const { BlobStorageApi, ObjectStorageApi, SignalTestHarness, StorageApi } = await import("@libs/util/srvkit");
    new ObjectStorageApi("util", standInBucket("probe"));
    expect(s3Calls).toEqual(["construct"]);
    s3Calls.length = 0;

    const env = { objectStorage: standInBucket("standin-public"), privateStorage: standInBucket("standin-private") };
    const blobStorageApi = await injectEnv(new BlobStorageApi(), BlobStorageApi, env);
    storage = Object.assign(await injectEnv(new StorageApi(), StorageApi, env), { blobStorageApi });
    storage.onInit();
    scratchDir = SignalTestHarness.scratchDir();
  });

  afterAll(async () => {
    Object.assign(Bun, { S3Client: realS3Client });
    for (const key of Object.keys(process.env)) if (!(key in previousEnv)) delete process.env[key];
    Object.assign(process.env, previousEnv);
    await Bun.$`rm -rf ${workspace}`.quiet();
  });

  test("drops both configured buckets and keeps files in the harness scratch dir", () => {
    expect(storage.objectStorageOptions).toBeUndefined();
    expect(storage.privateStorageOptions).toBeUndefined();
    expect(storage.root.startsWith(scratchDir)).toBe(true);
  });

  test("a public upload is written, read back and removed without an object-storage client", async () => {
    const { url, size } = await storage.uploadDataFromReadableStream({
      path: "harness/probe.txt",
      body: new Blob(["probe"]).stream(),
    });
    expect(size).toBe(5);
    expect(url).toBe(`${storage.urlPrefix}/harness/probe.txt`);
    expect(await new Response(await storage.readData("harness/probe.txt")).text()).toBe("probe");
    expect(await storage.getDataSize("harness/probe.txt")).toBe(5);
    expect(await storage.deleteData(url)).toBe(true);
    expect(await storage.getDataSize("harness/probe.txt")).toBeNull();
  });

  test("a private upload lands in the scratch server-private root and is removed", async () => {
    const path = "private/harness/secret.json";
    await storage.uploadDataFromReadableStream({ path, body: new Blob(["{}"]).stream(), access: "private" });
    expect(await storage.readDataAsJson<Record<string, unknown>>(path)).toEqual({});
    expect(existsSync(`${scratchDir}/util/server-private/${path}`)).toBe(true);
    expect(await storage.deleteDataByPath(path)).toBe(true);
    expect(await storage.getDataSize(path)).toBeNull();
  });

  test("never constructed or called the S3 client and never wrote under the workspace root", () => {
    expect(s3Calls).toEqual([]);
    expect(cloudFrontClient).not.toHaveBeenCalled();
    expect(existsSync(`${workspace}/local`)).toBe(false);
  });
});
