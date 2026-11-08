import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dayjs } from "akanjs/base";
import type { LocalFile } from "akanjs/server";

import "../cnst";
import type * as db from "../db";
import { FileService } from "./file.service";

const bucket = "https://bucket.test";
const oldUrl = `${bucket}/test/default/f1.txt`;

const docOf = (fields: Record<string, unknown>) =>
  ({
    ...fields,
    set(data: Record<string, unknown>) {
      Object.assign(this, data);
      return this;
    },
    save: async function () {
      return this;
    },
  }) as unknown as db.File;

const serviceOn = ({ deleteFails = false } = {}) => {
  const stored = new Map<string, db.File>([["f1", docOf({ id: "f1", filename: "a.txt", url: oldUrl })]]);
  const deleted: string[] = [];
  const warned: string[] = [];
  const uploadedTypes: (string | undefined)[] = [];
  const service = new FileService();
  Object.defineProperty(service, "fileModel", {
    value: {
      loadFile: async (fileId: string) => stored.get(fileId) ?? null,
      createFile: async (data: Record<string, unknown>) => {
        const file = docOf({ ...data, id: data.id ?? "created" });
        stored.set(file.id, file);
        return file;
      },
      finishUpload: async () => true,
    },
  });
  Object.defineProperty(service, "storageApi", {
    value: {
      uploadDataFromLocal: async ({ path, mimetype }: { path: string; mimetype?: string }) => {
        uploadedTypes.push(mimetype);
        return `${bucket}/${path}`;
      },
      deleteData: async (url: string) => {
        if (deleteFails) throw new Error("bucket unreachable");
        deleted.push(url);
        return true;
      },
    },
  });
  Object.defineProperty(service, "logger", { value: { warn: (message: string) => warned.push(message) } });
  return { service, deleted, warned, uploadedTypes };
};

describe("FileService.addFileFromLocal under a given id", () => {
  let dir: string;
  let localFile: LocalFile;
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "file-service-"));
    localFile = { filename: "a.txt", mimetype: "text/plain", encoding: "7bit", localPath: join(dir, "a.txt") };
    await writeFile(localFile.localPath, "hello");
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test("re-copying a file over its own id removes the object its old url named", async () => {
    const { service, deleted } = serviceOn();
    const file = await service.addFileFromLocal(localFile, "test", "default", { fileId: "f1" });
    expect(file.url.startsWith(`${bucket}/test/default/f1-`)).toBe(true);
    expect(deleted).toEqual([oldUrl]);
  });

  test("a first copy under a new id removes nothing", async () => {
    const { service, deleted } = serviceOn();
    await service.addFileFromLocal(localFile, "test", "default", { fileId: "f2" });
    expect(deleted).toEqual([]);
  });

  test("an old object the bucket refuses to remove does not fail the copy", async () => {
    const { service, warned } = serviceOn({ deleteFails: true });
    const file = await service.addFileFromLocal(localFile, "test", "default", { fileId: "f1" });
    expect(file.url.startsWith(`${bucket}/test/default/f1-`)).toBe(true);
    expect(warned.length).toBe(1);
  });
});

const uploadServiceOn = ({ refuseInsert = false } = {}) => {
  const created: string[] = [];
  const streamed: string[] = [];
  let insertNum = 0;
  let committed = false;
  const service = new FileService();
  Object.defineProperty(service, "createFileMany", {
    value: async (rows: Record<string, unknown>[]) => {
      insertNum++;
      if (refuseInsert) throw new Error("insert refused");
      const files = rows.map((row, idx) => docOf({ ...row, id: `u${idx}` }));
      created.push(...files.map(({ id }) => id));
      return files;
    },
  });
  Object.defineProperty(service, "storageApi", {
    value: {
      uploadDataFromStream: ({ path }: { path: string }) => {
        if (!committed) throw new Error("stream started before commit");
        streamed.push(path);
      },
    },
  });
  const afterCommit: (() => unknown)[] = [];
  Object.defineProperty(service, "transaction", {
    value: async <T>(fn: () => Promise<T>) => {
      const result = await fn();
      committed = true;
      for (const hook of afterCommit) await hook();
      return result;
    },
  });
  Object.defineProperty(service, "afterCommit", {
    value: async (fn: () => unknown) => {
      afterCommit.push(fn);
    },
  });
  return { service, created, streamed, insertNumOf: () => insertNum };
};

describe("FileService.addFiles", () => {
  const filesOf = (count: number) =>
    Array.from({ length: count }, (_, idx) => new File([`body ${idx}`], `f${idx}.png`, { type: "image/png" }));
  const metasOf = (count: number) => Array.from({ length: count }, () => ({ lastModifiedAt: dayjs(), size: 0 }));

  test("creates every row of the batch in one insert, then starts one stream per file once they are committed", async () => {
    const { service, created, streamed, insertNumOf } = uploadServiceOn();
    const files = await service.addFiles(filesOf(3), metasOf(3), "test", "default");
    expect(files.map(({ id }) => id)).toEqual(["u0", "u1", "u2"]);
    expect(created).toHaveLength(3);
    expect(insertNumOf()).toBe(1);
    expect(streamed).toHaveLength(3);
    expect(streamed.every((path) => path.startsWith("test/default/") && path.endsWith(".png"))).toBe(true);
  });

  test("starts no stream when the batch insert is refused", async () => {
    const { service, streamed } = uploadServiceOn({ refuseInsert: true });
    await expect(service.addFiles(filesOf(3), metasOf(3), "test", "default")).rejects.toThrow("insert refused");
    expect(streamed).toEqual([]);
  });
});

describe("FileService upload limits", () => {
  const oversizedFile = () => {
    const file = new File(["x"], "big.mp4", { type: "video/mp4" });
    Object.defineProperty(file, "size", { value: FileService.maxUploadBytes + 1 });
    return file;
  };

  test("refuses a batch holding a file over the cap before any row is created", async () => {
    const { service, created, streamed } = uploadServiceOn();
    const files = [new File(["ok"], "ok.png", { type: "image/png" }), oversizedFile()];
    const metas = files.map(() => ({ lastModifiedAt: dayjs(), size: 0 }));
    await expect(service.addFiles(files, metas, "test", "default")).rejects.toMatchObject({
      message: "file.error.fileTooLarge",
      statusCode: 413,
    });
    expect(created).toEqual([]);
    expect(streamed).toEqual([]);
  });

  test("accepts a file exactly at the cap", async () => {
    const { service, created } = uploadServiceOn();
    const file = new File(["x"], "edge.png", { type: "image/png" });
    Object.defineProperty(file, "size", { value: FileService.maxUploadBytes });
    await service.addFiles([file], [{ lastModifiedAt: dayjs(), size: 0 }], "test", "default");
    expect(created).toHaveLength(1);
  });
});

describe("FileService.addFileFromLocal content type", () => {
  let dir: string;
  const localFileOf = async (filename: string, mimetype: string, body: string): Promise<LocalFile> => {
    const localPath = join(dir, filename);
    await writeFile(localPath, body);
    return { filename, mimetype, encoding: "7bit", localPath };
  };
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "file-service-type-"));
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test("stores HTML as application/octet-stream, in the row and in the bucket", async () => {
    const { service, uploadedTypes } = serviceOn();
    const file = await service.addFileFromLocal(await localFileOf("page.html", "text/html", "<p>hi</p>"), "test");
    expect(file.mimetype).toBe("application/octet-stream");
    expect(uploadedTypes).toEqual(["application/octet-stream"]);
  });

  test("stores SVG as application/octet-stream", async () => {
    const { service } = serviceOn();
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>';
    const file = await service.addFileFromLocal(await localFileOf("logo.svg", "image/svg+xml", svg), "test");
    expect(file.mimetype).toBe("application/octet-stream");
  });

  test("drops an extension a served type cannot spell in [a-z0-9]{1,10}", async () => {
    const { service } = serviceOn();
    const file = await service.addFileFromLocal(await localFileOf("clip", "video/x-matroska", "mkv"), "test");
    expect(file.mimetype).toBe("video/x-matroska");
    expect(file.url.split("/").at(-1)).not.toContain(".");
  });

  test("keeps a served type and names the object after it", async () => {
    const { service } = serviceOn();
    const file = await service.addFileFromLocal(await localFileOf("doc", "application/pdf", "%PDF-1.4"), "test");
    expect(file.mimetype).toBe("application/pdf");
    expect(file.url.endsWith(".pdf")).toBe(true);
  });
});
