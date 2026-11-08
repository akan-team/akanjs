import { describe, expect, spyOn, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { FileSys, getDirname } from "./fileSys";

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

describe("FileSys.ensurePrivateDir", () => {
  //? macOS refuses even the owner a chmod of a folder flagged user-immutable; Linux needs root for the same.
  test.skipIf(process.platform !== "darwin")(
    "warns instead of throwing when the folder's mode cannot be changed",
    () => {
      const root = mkdtempSync(path.join(tmpdir(), "akan-private-dir-"));
      const dir = path.join(root, "locked");
      mkdirSync(dir);
      chmodSync(dir, 0o755);
      Bun.spawnSync(["chflags", "uchg", dir]);
      const warn = spyOn(FileSys.logger, "warn").mockImplementation(() => undefined);
      try {
        expect(FileSys.ensurePrivateDir(dir)).toBe(dir);
        expect(statSync(dir).mode & 0o777).toBe(0o755);
        expect(warn.mock.calls.map(([line]) => String(line))).toEqual([
          expect.stringContaining(`${dir} stays at mode 755`),
        ]);
      } finally {
        warn.mockRestore();
        Bun.spawnSync(["chflags", "nouchg", dir]);
        rmSync(root, { recursive: true, force: true });
      }
    },
  );
});
