import { describe, expect, mock, test } from "bun:test";
import path from "node:path";

// CI runs on Linux only; a desktop app's carried server runs this predicate on Windows.
mock.module("node:path", () => ({ ...path.win32, default: path.win32 }));
const { BlobStorage } = await import("./storage.adaptor");

describe("BlobStorage.resolveLocalPath under win32 paths", () => {
  const storage = Object.assign(new BlobStorage(), {
    root: "C:\\store\\backend",
    privateRoot: "C:\\store\\server-private",
  });

  test("resolves a relative key with either separator", () => {
    expect(storage.resolveLocalPath("memo/a.png")).toBe("C:\\store\\backend\\memo\\a.png");
    expect(storage.resolveLocalPath("memo\\a.png")).toBe("C:\\store\\backend\\memo\\a.png");
    expect(storage.resolveLocalPath("memo/a.pdf", "private")).toBe("C:\\store\\server-private\\memo\\a.pdf");
  });

  test("refuses rooted, drive-relative, UNC and climbing keys", () => {
    for (const key of [
      "C:\\store\\backend\\memo\\a.png",
      "C:relative.txt",
      "\\\\server\\share\\a.png",
      "\\memo\\a.png",
      "..\\server-private\\key.pem",
      "memo\\..\\..\\x",
      "D:..\\x",
    ])
      expect(storage.resolveLocalPath(key)).toBeNull();
  });

  test("keeps a name that only starts with two dots", () => {
    expect(storage.resolveLocalPath("..hidden\\a.png")).toBe("C:\\store\\backend\\..hidden\\a.png");
  });
});
