import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appDataDir, appLocalDataDir, appTempDir, makePrivateDir, reservedDirs, serverDataDir } from "../src/paths.ts";

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

  test("scratch files stay out of a temp folder other users share", () => {
    expect(appTempDir("dev.x", "darwin", {}, "/Users/u", "/var/folders/T")).toBe(join("/var/folders/T", "dev.x"));
    expect(appTempDir("dev.x", "win32", winEnv, "/C/Users/u", "/C/Users/u/AppData/Local/Temp")).toBe(
      join("/C/Users/u/AppData/Local/Temp", "dev.x"),
    );
    expect(appTempDir("dev.x", "linux", {}, "/home/u", "/tmp")).toBe(join("/home/u/.cache/dev.x/tmp"));
    expect(appTempDir("dev.x", "linux", { XDG_CACHE_HOME: "/xdg" }, "/home/u", "/tmp")).toBe("/xdg/dev.x/tmp");
    expect(appTempDir("dev.x", "linux", { XDG_CACHE_HOME: "rel" }, "/home/u", "/tmp")).toBe(
      join("/home/u/.cache/dev.x/tmp"),
    );
  });

  test.skipIf(process.platform === "win32")("a private folder and the folders made for it are the user's only", () => {
    const root = mkdtempSync(join(tmpdir(), "akan-native-private-"));
    try {
      const dir = makePrivateDir(join(root, "app", "tmp", "picker"));
      for (const made of [join(root, "app"), join(root, "app", "tmp"), dir])
        expect(statSync(made).mode & 0o777).toBe(0o700);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
