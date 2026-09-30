import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { appDataDir, appLocalDataDir, reservedDirs, serverDataDir } from "../src/paths.ts";

describe("app folders", () => {
  const winEnv = { APPDATA: "/C/Users/u/AppData/Roaming", LOCALAPPDATA: "/C/Users/u/AppData/Local" };

  test("the carried server lives in the machine-local folder: never Roaming on Windows", () => {
    expect(appDataDir("dev.x", "win32", winEnv, "/C/Users/u")).toBe(join(winEnv.APPDATA, "dev.x"));
    expect(serverDataDir("dev.x", false, "win32", winEnv, "/C/Users/u")).toBe(
      join(winEnv.LOCALAPPDATA, "dev.x", "server"),
    );
    expect(serverDataDir("dev.x", false, "darwin", {}, "/Users/u")).toBe(
      join("/Users/u/Library/Application Support/dev.x/server"),
    );
    expect(serverDataDir("dev.x", false, "linux", {}, "/home/u")).toBe(join("/home/u/.local/share/dev.x/server"));
  });

  test("a debug build's server keeps its own folder beside the release app's", () => {
    expect(serverDataDir("dev.x", true, "darwin", {}, "/Users/u")).toBe(
      join("/Users/u/Library/Application Support/dev.x/server-debug"),
    );
  });

  test("no FileRef serves the machine-local folder either", () => {
    const local = appLocalDataDir("dev.x", "win32", winEnv, "/C/Users/u");
    expect(reservedDirs("dev.x", "win32", winEnv, "/C/Users/u").map((d) => d.root)).toContain(local);
  });
});
