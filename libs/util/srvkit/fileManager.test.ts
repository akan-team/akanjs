import { afterAll, describe, expect, test } from "bun:test";
import { FileManager } from "./fileManager";

const workspace = `${Bun.env.TMPDIR ?? "/tmp"}/file-manager-${crypto.randomUUID()}`;

afterAll(async () => {
  await Bun.$`rm -rf ${workspace}`.quiet();
});

describe("FileManager.parseDataUri", () => {
  test("decodes base64 and percent-encoded data, with or without parameters", () => {
    expect(FileManager.parseDataUri("data:image/png;base64,aGk=")).toEqual({
      mimetype: "image/png",
      body: Buffer.from("hi"),
    });
    expect(FileManager.parseDataUri("data:text/plain;charset=utf-8,%ED%95%9C%20a")).toEqual({
      mimetype: "text/plain",
      body: Buffer.from("한 a"),
    });
    expect(FileManager.parseDataUri("data:,plain")).toEqual({ mimetype: "text/plain", body: Buffer.from("plain") });
  });

  test("refuses a string that is not a data URI", () => {
    expect(() => FileManager.parseDataUri("https://example.com/a.png")).toThrow("util.error.invalidDataUri");
    expect(() => FileManager.parseDataUri("data:text/plain,%E0%A4%A")).toThrow("util.error.invalidDataUri");
  });
});

describe("FileManager.saveEncodedData", () => {
  test("writes a data URI that carries a charset parameter", async () => {
    const saved = await FileManager.saveEncodedData("data:text/plain;charset=utf-8,hello", workspace);
    expect(saved.mimetype).toBe("text/plain");
    expect(await Bun.file(saved.localPath).text()).toBe("hello");
  });
});

describe("FileManager.writeStreamToFile", () => {
  test("types a file by its name the way Bun does, including the .jfif JPEG alias", async () => {
    const png = await FileManager.writeStreamToFile(new Response("x").body as ReadableStream, `${workspace}/a.PNG`);
    const jfif = await FileManager.writeStreamToFile(new Response("x").body as ReadableStream, `${workspace}/b.jfif`);
    const pdf = await FileManager.writeStreamToFile(new Response("x").body as ReadableStream, `${workspace}/c.pdf`);
    const csv = await FileManager.writeStreamToFile(new Response("x").body as ReadableStream, `${workspace}/d.csv`);
    expect([png.mimetype, jfif.mimetype, pdf.mimetype, csv.mimetype]).toEqual([
      "image/png",
      "image/jpeg",
      "application/pdf",
      "text/csv",
    ]);
  });
});
