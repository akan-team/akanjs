import { describe, expect, test } from "bun:test";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { getDirname } from "./getDirname";

describe("getDirname", () => {
  test("converts file URLs to filesystem paths", () => {
    const filePath = path.resolve("/tmp/akan workspace/index.ts");
    const dirname = getDirname(pathToFileURL(filePath).href);

    expect(dirname).toBe(path.dirname(filePath));
  });

  test("keeps Windows drive paths valid when running on Windows", () => {
    if (process.platform !== "win32") return;

    const dirname = getDirname("file:///C:/Users/ken78/.bun/install/global/node_modules/@akanjs/devkit/index.ts");

    expect(dirname).toBe("C:\\Users\\ken78\\.bun\\install\\global\\node_modules\\@akanjs\\devkit");
  });
});
