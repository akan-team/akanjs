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

describe("UpdateUploader", () => {
  test("reads s3://bucket/prefix and refuses anything else", () => {
    expect(UpdateUploader.parseTarget("s3://releases/dcms/kiosk/")).toEqual({
      bucket: "releases",
      prefix: "dcms/kiosk",
    });
    expect(UpdateUploader.parseTarget("s3://releases")).toEqual({ bucket: "releases", prefix: "" });
    expect(() => UpdateUploader.parseTarget("https://releases.example/dcms")).toThrow("s3://<bucket>/<prefix>");
  });

  test("uploads what the bucket lacks first, then each signature before its manifest", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "akan-update-upload-"));
    try {
      await mkdir(path.join(dir, "windows-x64", "files"), { recursive: true });
      for (const file of ["windows-x64/files/2000-aa.tar.gz", "windows-x64/files/1000-bb.tar.gz"])
        await writeFile(path.join(dir, file), "tar");
      for (const file of ["windows-x64/main.json", "windows-x64/main.json.sig", "windows-x64/main.json.tmp"])
        await writeFile(path.join(dir, file), "{}");
      const { bucket, writes } = fakeBucket(["dcms/windows-x64/files/1000-bb.tar.gz"]);

      expect(await new UpdateUploader(bucket, "dcms").upload(dir)).toEqual({ uploaded: 3, skipped: 1 });
      expect(writes).toEqual([
        { key: "dcms/windows-x64/files/2000-aa.tar.gz" },
        { key: "dcms/windows-x64/main.json.sig", type: "text/plain" },
        { key: "dcms/windows-x64/main.json", type: "application/json" },
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
