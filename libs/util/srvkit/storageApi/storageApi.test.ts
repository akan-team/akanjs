import { afterAll, describe, expect, test } from "bun:test";
import { BlobStorageApi } from "./blobStorageApi";
import type { ObjectStorageOptions } from "./objectStorageApi.helper";
import { StorageApi } from "./storageApi";

process.env.AKAN_PUBLIC_APP_NAME ??= "util";
process.env.AKAN_PUBLIC_REPO_NAME ??= "soft-s2";
process.env.AKAN_PUBLIC_SERVE_DOMAIN ??= "localhost";

const r2 = (bucket: string): ObjectStorageOptions => ({
  service: "r2",
  region: "https://account.r2.cloudflarestorage.com",
  accessKey: "access-key",
  secretAccessKey: "secret-access-key",
  distributionId: null,
  bucket,
  host: null,
});
const bucketOf = (url: string | null) => new URL(url ?? "").pathname.split("/")[1];
const envArchive = "private/akasys-build/main/devProject/1/env.tar";

const workspace = `${Bun.env.TMPDIR ?? Bun.env.TEMP ?? "/tmp"}/storage-api-${crypto.randomUUID()}`;
afterAll(async () => {
  await Bun.$`rm -rf ${workspace}`.quiet();
});

describe("StorageApi private routing", () => {
  test("sends a private/ path to the private bucket and every other path to the public one", () => {
    const storage = Object.assign(new StorageApi(), {
      objectStorageOptions: r2("public-bucket"),
      privateStorageOptions: r2("private-bucket"),
    });

    expect(bucketOf(storage.presignUpload(envArchive, 60))).toBe("private-bucket");
    expect(bucketOf(storage.presignDownload(envArchive, 60))).toBe("private-bucket");
    expect(bucketOf(storage.presignUpload("image/default/1.png", 60))).toBe("public-bucket");
    expect(storage.urlPrefix).toBe(`https://public-bucket.s3.${r2("public-bucket").region}.amazonaws.com`);
  });

  test("refuses private data instead of writing it to the public bucket when no private bucket is set", () => {
    const storage = Object.assign(new StorageApi(), { objectStorageOptions: r2("public-bucket") });

    expect(() => storage.presignUpload(envArchive, 60)).toThrow("util.error.adaptorNotConfigured");
    expect(() => storage.getDataSize(envArchive)).toThrow("util.error.adaptorNotConfigured");
    expect(() =>
      storage.uploadDataFromLocal({ path: "env.tar", localPath: `${workspace}/env.tar`, access: "private" }),
    ).toThrow("util.error.adaptorNotConfigured");
    expect(bucketOf(storage.presignUpload("image/default/1.png", 60))).toBe("public-bucket");
  });

  test("keeps blob mode's private files under the server-private root", async () => {
    const blobStorageApi = Object.assign(new BlobStorageApi(), {
      root: `${workspace}/backend`,
      privateRoot: `${workspace}/server-private`,
      urlPrefix: "/api/localFile/getBlob",
    });
    const storage = Object.assign(new StorageApi(), { blobStorageApi });

    await storage.uploadDataFromReadableStream({
      path: envArchive,
      body: new Blob(["env"]).stream(),
      access: "private",
    });

    expect(await Bun.file(`${workspace}/server-private/${envArchive}`).text()).toBe("env");
    expect(await Bun.file(`${workspace}/backend/${envArchive}`).exists()).toBe(false);
    expect(await new Response(await storage.readData(envArchive)).text()).toBe("env");
  });
});
