import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { type UpdateBucket, UpdateUploader } from "./updateUploader";

const fakeBucket = (held: string[] = []) => {
  const writes: { key: string; type?: string }[] = [];
  const bucket: UpdateBucket = {
    exists: async (key) => held.includes(key),
    write: async (key, _data, options) => {
      writes.push({ key, ...(options?.type ? { type: options.type } : {}) });
      return 0;
    },
  };
  return { bucket, writes };
};

const sha = (char: string) => char.repeat(64);

const inUpdatesDir = async (files: Record<string, string>, run: (updatesDir: string) => Promise<void>) => {
  const updatesDir = await mkdtemp(path.join(tmpdir(), "akan-update-upload-"));
  try {
    for (const [file, content] of Object.entries(files)) {
      await mkdir(path.dirname(path.join(updatesDir, file)), { recursive: true });
      await writeFile(path.join(updatesDir, file), content);
    }
    await run(updatesDir);
  } finally {
    await rm(updatesDir, { recursive: true, force: true });
  }
};

const envelope = (manifest: object) =>
  JSON.stringify({
    manifest: Buffer.from(JSON.stringify(manifest)).toString("base64"),
    keyId: "0011223344556677",
    signature: "c2lnbmF0dXJl",
  });

describe("UpdateUploader", () => {
  test("reads s3://bucket/prefix and refuses anything else", () => {
    expect(UpdateUploader.parseTarget("s3://releases/acme/kiosk/")).toEqual({
      bucket: "releases",
      prefix: "acme/kiosk",
    });
    expect(UpdateUploader.parseTarget("s3://releases")).toEqual({ bucket: "releases", prefix: "" });
    expect(UpdateUploader.parseTarget("s3://releases//acme//")).toEqual({ bucket: "releases", prefix: "/acme" });
    expect(() => UpdateUploader.parseTarget("https://releases.example/acme")).toThrow("s3://<bucket>/<prefix>");
  });

  test("uploads a desktop release's archives the bucket lacks first, then the signature before the manifest", async () => {
    const manifest = {
      bundle: "1.2.0-2000",
      archive: { url: `app/${sha("b")}.tar.gz` },
      patches: [{ url: `app/${sha("a")}-${sha("b")}.delta.gz` }],
    };
    await inUpdatesDir(
      {
        [`windows-x64/app/${sha("a")}.tar.gz`]: "previous release",
        [`windows-x64/app/${sha("b")}.tar.gz`]: "tar",
        [`windows-x64/app/${sha("a")}-${sha("b")}.delta.gz`]: "delta",
        "windows-x64/main.json": JSON.stringify(manifest),
        "windows-x64/main.json.sig": "sig",
        "windows-x64/main.json.tmp": "{}",
        "windows-x64/develop.json": JSON.stringify({ ...manifest, bundle: "1.1.0-1000" }),
        "windows-x64/develop.json.sig": "sig",
      },
      async (updatesDir) => {
        const { bucket, writes } = fakeBucket([`acme/windows-x64/app/${sha("a")}-${sha("b")}.delta.gz`]);
        const release = { dir: path.join(updatesDir, "windows-x64"), channel: "main", bundle: "1.2.0-2000" };

        expect(await new UpdateUploader(bucket, "acme").upload(updatesDir, release)).toEqual({
          uploaded: 3,
          skipped: 1,
        });
        expect(writes).toEqual([
          { key: `acme/windows-x64/app/${sha("b")}.tar.gz` },
          { key: "acme/windows-x64/main.json.sig", type: "text/plain" },
          { key: "acme/windows-x64/main.json", type: "application/json" },
        ]);
      },
    );
  });

  test("uploads a phone release's own files and envelope, never pack records or another manifest beside them", async () => {
    await inUpdatesDir(
      {
        "android/pack.json": JSON.stringify({ out: "/Users/someone/work/dist/native/demo/default/updates/android" }),
        "android/manifest.template.json": "{}",
        "android/bundle.json": "{}",
        "android/compat.json": "{}",
        [`android/files/${sha("a")}`]: "index.html",
        [`android/files/${sha("b")}`]: "env.runtime.json",
        [`android/files/${sha("c")}`]: "an earlier pack's file",
        "android/main/api2.json": envelope({
          bundle: "3000-aaaaaaaa",
          files: [{ sha256: sha("a") }, { sha256: sha("b") }, { sha256: sha("a") }],
        }),
        "android/main/api1.json": envelope({ bundle: "1000-cccccccc", files: [{ sha256: sha("c") }] }),
        "android/develop/api2.json": envelope({ bundle: "2000-bbbbbbbb", files: [{ sha256: sha("b") }] }),
      },
      async (updatesDir) => {
        const { bucket, writes } = fakeBucket();
        const release = { dir: path.join(updatesDir, "android"), channel: "main", bundle: "3000-aaaaaaaa" };

        expect(await new UpdateUploader(bucket, "").upload(updatesDir, release)).toEqual({ uploaded: 3, skipped: 0 });
        expect(writes).toEqual([
          { key: `android/files/${sha("a")}` },
          { key: `android/files/${sha("b")}` },
          { key: "android/main/api2.json", type: "application/json" },
        ]);
      },
    );
  });

  test("uploads nothing when the release is not there or names a file outside its folder", async () => {
    await inUpdatesDir(
      {
        "linux-x64/main.json": JSON.stringify({ bundle: "1.0.0-10", archive: { url: "../../.ssh/id_ed25519" } }),
        "linux-x64/main.json.sig": "sig",
        "ios/main/api1.json": envelope({ bundle: "10-aaaaaaaa", files: [{ sha256: "../pack.json" }] }),
      },
      async (updatesDir) => {
        const { bucket, writes } = fakeBucket();
        const uploader = new UpdateUploader(bucket, "acme");
        const linux = path.join(updatesDir, "linux-x64");

        await expect(uploader.upload(updatesDir, { dir: linux, channel: "main", bundle: "1.0.0-9" })).rejects.toThrow(
          "holds no main manifest of release 1.0.0-9",
        );
        await expect(uploader.upload(updatesDir, { dir: linux, channel: "main", bundle: "1.0.0-10" })).rejects.toThrow(
          "which is not inside that folder",
        );
        await expect(
          uploader.upload(updatesDir, { dir: path.join(updatesDir, "ios"), channel: "main", bundle: "10-aaaaaaaa" }),
        ).rejects.toThrow("not 64 hex digits");
        expect(writes).toEqual([]);
      },
    );
  });
});
