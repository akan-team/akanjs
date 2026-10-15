import { afterAll, describe, expect, test } from "bun:test";
import { BlobStorageApi } from "@libs/util/srvkit";
import { LocalFileService } from "./localFile.service";

const workspace = `${Bun.env.TMPDIR ?? Bun.env.TEMP ?? "/tmp"}/local-file-${crypto.randomUUID()}`;
const storage = Object.assign(new BlobStorageApi(), {
  root: `${workspace}/backend`,
  privateRoot: `${workspace}/private`,
});
const service = Object.assign(new LocalFileService(), { blobStorageApi: storage });
const stored = {
  "memo/page.html": "<script>fetch('/api/memo/createMemo')</script>",
  "memo/rows.csv": "id,title\n".repeat(1000),
  "memo/doc.pdf": "%PDF-1.4\n",
};
await Promise.all(Object.entries(stored).map(([path, body]) => Bun.write(`${storage.root}/${path}`, body)));
await Bun.$`mkdir -p ${storage.root}/uploads`.quiet();

afterAll(async () => {
  await Bun.$`rm -rf ${workspace}`.quiet();
});

describe("LocalFileService.serveLocalFile", () => {
  test.each(["uploads/missing.png", "uploads%2fmissing.png", "..%2f..%2f.env", "uploads"])(
    "rejects unavailable file %s with a 404",
    async (path) => {
      await expect(service.serveLocalFile(path)).rejects.toMatchObject({
        statusCode: 404,
        error: "localFile.error.fileNotFound",
      });
    },
  );

  test("serves existing files with identical body bytes", async () => {
    const response = await service.serveLocalFile("memo/page.html");

    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new TextEncoder().encode(stored["memo/page.html"]));
  });

  test("continues refusing private files with a 400", async () => {
    await expect(service.serveLocalFile("private/x")).rejects.toMatchObject({
      statusCode: 400,
      error: "localFile.error.privateFilesNotServed",
    });
  });

  test("sandboxes every stored document but a PDF, which a browser's viewer refuses to show sandboxed", async () => {
    const page = await service.serveLocalFile("memo/page.html");
    const pdf = await service.serveLocalFile("memo/doc.pdf");

    expect(page.headers.get("content-security-policy")).toBe(LocalFileService.sandbox);
    expect(page.headers.get("x-content-type-options")).toBe("nosniff");
    expect(pdf.headers.get("content-security-policy")).toBeNull();
    expect(pdf.headers.get("x-content-type-options")).toBe("nosniff");
  });

  test("leaves the type to Bun.serve, which names it by the file name and answers a Range itself", async () => {
    expect((await service.serveLocalFile("memo/rows.csv")).headers.get("content-type")).toBeNull();
    const server = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch: (req) => service.serveLocalFile(new URL(req.url).pathname.slice(1)),
    });
    try {
      const page = await fetch(`http://127.0.0.1:${server.port}/memo/page.html`);
      expect(page.headers.get("content-type")).toBe("text/html;charset=utf-8");
      expect(page.headers.get("content-security-policy")).toBe(LocalFileService.sandbox);

      const ranged = await fetch(`http://127.0.0.1:${server.port}/memo/rows.csv`, { headers: { range: "bytes=3-11" } });
      expect(ranged.status).toBe(206);
      expect(await ranged.text()).toBe(stored["memo/rows.csv"].slice(3, 12));
    } finally {
      server.stop(true);
    }
  });
});

describe("LocalFileService.serveLocalFile with a request path", () => {
  test("decodes a percent-encoded name before looking it up", async () => {
    await Bun.write(`${storage.root}/memo/한글 이름.txt`, "hello");
    const response = await service.serveLocalFile("memo/%ED%95%9C%EA%B8%80%20%EC%9D%B4%EB%A6%84.txt");
    expect(await response.text()).toBe("hello");
  });

  test("answers 404 for a decoded path that climbs out of the public root, even when the target exists", async () => {
    await Bun.write(`${workspace}/outside.txt`, "secret");
    for (const path of ["..%2Foutside.txt", "memo%2F..%2F..%2Foutside.txt", "%2E%2E%2Foutside.txt"])
      await expect(service.serveLocalFile(path)).rejects.toMatchObject({
        statusCode: 404,
        error: "localFile.error.fileNotFound",
      });
  });

  test("answers 404 for a malformed escape", async () => {
    await expect(service.serveLocalFile("memo/%E0%A4%A.txt")).rejects.toMatchObject({ statusCode: 404 });
  });
});
