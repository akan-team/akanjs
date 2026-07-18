import { describe, expect, test } from "bun:test";
import path from "node:path";
import { getDirname } from "./getDirname";

describe("getDirname", () => {
  test("converts file URLs to filesystem paths", () => {
    const dirname = getDirname("file:///tmp/akan%20workspace/index.ts");

    expect(dirname).toBe(path.join("/tmp", "akan workspace"));
  });

  test("keeps Windows drive paths valid when running on Windows", () => {
    if (process.platform !== "win32") return;

    const dirname = getDirname("file:///C:/Users/ken78/.bun/install/global/node_modules/@akanjs/devkit/index.ts");

    expect(dirname).toBe("C:\\Users\\ken78\\.bun\\install\\global\\node_modules\\@akanjs\\devkit");
  });
});
