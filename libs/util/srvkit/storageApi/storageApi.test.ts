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

describe("StorageApi.uploadDataFromLocal content type", () => {
  const received: { method: string; contentType: string | null }[] = [];
  let server: ReturnType<typeof Bun.serve>;
  let storage: StorageApi;
  const htmlPath = `${workspace}/page.html`;

  afterAll(() => {
    server?.stop(true);
  });

  test("stores a local file under the mimetype it is given, not the one its name implies", async () => {
    server = Bun.serve({
      port: 0,
      fetch: (req) => {
        received.push({ method: req.method, contentType: req.headers.get("content-type") });
        return new Response(null, { status: 200, headers: { etag: '"standin"' } });
      },
    });
    storage = Object.assign(new StorageApi(), {
      objectStorageOptions: { ...r2("public-bucket"), region: `http://127.0.0.1:${server.port}` },
    });
    await Bun.write(htmlPath, "<p>hi</p>");

    await storage.uploadDataFromLocal({
      path: "test/default/page.html",
      localPath: htmlPath,
      mimetype: "application/octet-stream",
    });
    expect(received.filter(({ method }) => method === "PUT").map(({ contentType }) => contentType)).toEqual([
      "application/octet-stream",
    ]);
  });
});

describe("BlobStorageApi keeps every key under its root", () => {
  const blobOf = () =>
    Object.assign(new BlobStorageApi(), {
      root: `${workspace}/confined/backend`,
      privateRoot: `${workspace}/confined/server-private`,
      urlPrefix: "/api/localFile/getBlob",
    });
  const escapes = ["../outside.txt", "a/../../outside.txt", `${workspace}/confined/backend/abs.txt`, "/etc/hosts"];
  const refusal = "security.error.storagePathOutsideRoot";
  const sourcePath = `${workspace}/confined-source.txt`;

  test("refuses an escaping key at every entry point", async () => {
    const blob = blobOf();
    await Bun.write(sourcePath, "source");
    for (const path of escapes) {
      await expect(blob.uploadDataFromLocal({ path, localPath: sourcePath })).rejects.toThrow(refusal);
      await expect(blob.uploadDataFromLocal({ path, localPath: sourcePath, access: "private" })).rejects.toThrow(
        refusal,
      );
      await expect(blob.uploadDataFromReadableStream({ path, body: new Blob(["x"]).stream() })).rejects.toThrow(
        refusal,
      );
      const logged: string[] = [];
      Object.defineProperty(blob, "logger", { value: { error: (message: string) => logged.push(message) } });
      let isUploaded = false;
      await blob.uploadDataFromStream({
        path,
        body: new Blob(["x"]).stream(),
        mimetype: "text/plain",
        updateProgress: () => undefined,
        uploadSuccess: () => {
          isUploaded = true;
        },
      });
      expect(isUploaded).toBe(false);
      expect(logged).toEqual([refusal]);
      await expect(blob.copyData({ bucket: "", copyPath: "kept.txt", pastePath: path, filename: "" })).rejects.toThrow(
        refusal,
      );
      await expect(blob.copyData({ bucket: "", copyPath: path, pastePath: "kept.txt", filename: "" })).rejects.toThrow(
        refusal,
      );
      await expect(blob.getDataList(path)).rejects.toThrow(refusal);
      await expect(blob.readData(path)).rejects.toThrow(refusal);
      await expect(blob.getDataSize(path)).rejects.toThrow(refusal);
    }
    await expect(blob.getDataList("..")).rejects.toThrow(refusal);
    expect(await Bun.file(`${workspace}/confined/outside.txt`).exists()).toBe(false);
    expect(await Bun.file(`${workspace}/outside.txt`).exists()).toBe(false);
  });

  test("still writes, copies, lists and reads ordinary keys", async () => {
    const blob = blobOf();
    await Bun.write(sourcePath, "source");
    await blob.uploadDataFromLocal({ path: "test/default/a.txt", localPath: sourcePath });
    await blob.uploadDataFromReadableStream({ path: "test/default/b.txt", body: new Blob(["b"]).stream() });
    await blob.uploadDataFromLocal({ path: "private/c.txt", localPath: sourcePath, access: "private" });
    expect(
      await blob.copyData({ bucket: "", copyPath: "test/default/a.txt", pastePath: "test/copy.txt", filename: "" }),
    ).toBe("test/copy.txt");
    expect(await new Response(await blob.readData("test/copy.txt")).text()).toBe("source");
    expect(await new Response(await blob.readData("private/c.txt")).text()).toBe("source");
    expect((await blob.getDataList("test/default")).sort()).toEqual([
      "/api/localFile/getBlob/a.txt",
      "/api/localFile/getBlob/b.txt",
    ]);
    expect(await blob.getDataList()).toEqual(["/api/localFile/getBlob/test"]);
  });
});
