import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { AkanBinConfig, BinPlatform } from "../akanConfig";
import { tempDirs } from "../testHelpers";
import { DesktopBin } from "./desktopBin";

const makeTempRoot = tempDirs("akan-desktop-bin-");
const here = DesktopBin.platform() as BinPlatform;
const elsewhere: BinPlatform = here === "linux-x64" ? "darwin-arm64" : "linux-x64";
const script = "#!/bin/sh\necho carried\n";

const fakeApp = (cwdPath: string, libs: string[] = []) =>
  ({
    name: "portal",
    cwdPath,
    getScanInfo: () => ({ getLibs: () => libs }),
    logger: { info: () => {}, warn: () => {} },
    spawn: async (command: string, args: string[], { cwd }: { cwd?: string } = {}) => {
      const proc = Bun.spawnSync([command, ...args], { cwd });
      if (proc.exitCode !== 0) throw new Error(proc.stderr.toString());
      return proc.stdout.toString();
    },
  }) as never;

const stage = async (
  root: string,
  bin: AkanBinConfig,
  { libBins = [], libs = [] }: { libBins?: { lib: string; bin: AkanBinConfig }[]; libs?: string[] } = {},
) => {
  const binDir = path.join(root, "apps/portal/.akan/native/default/bin");
  const config = { app: { name: "portal" }, bin, libBins } as never;
  const carried = await new DesktopBin(fakeApp(path.join(root, "apps/portal"), libs), config).stage(binDir);
  return { carried, binDir };
};

let requests = 0;
const served = new Map<string, Uint8Array<ArrayBuffer>>();
const files = Bun.serve({
  port: 0,
  fetch(req) {
    requests++;
    const body = served.get(new URL(req.url).pathname);
    return body ? new Response(body) : new Response("missing", { status: 404 });
  },
});
afterAll(() => files.stop(true));
const hash = (bytes: Uint8Array | string) => new Bun.CryptoHasher("sha256").update(bytes).digest("hex");

describe("DesktopBin", () => {
  test("a build carries the file of the CPU it is for", () => {
    expect(DesktopBin.platform("x64")).toBe(`${process.platform}-x64` as BinPlatform);
    expect(DesktopBin.platform("ia32")).toBeNull();
  });

  test("carries the app's own entries and those of the libs it depends on, the app's first", () => {
    const own = { ffmpeg: { [here]: { path: "/a/ffmpeg" } } };
    const lib = { ffmpeg: { [here]: { path: "/lib/ffmpeg" } }, ffprobe: { [here]: { path: "/lib/ffprobe" } } };
    const other = { gst: { [here]: { path: "/other/gst" } } };
    const chosen = DesktopBin.select(
      {
        app: { name: "portal" } as never,
        bin: own,
        libBins: [
          { lib: "media", bin: lib },
          { lib: "robotics", bin: other },
        ],
      },
      ["media"],
    );
    expect([...chosen.entries()]).toEqual([
      ["ffmpeg", { owner: "apps/portal/akan.config.ts", platforms: own.ffmpeg }],
      ["ffprobe", { owner: "libs/media/akan.config.ts", platforms: lib.ffprobe }],
    ]);
  });

  test("two libs may repeat an entry but not change it", () => {
    const select = (second: AkanBinConfig) => () =>
      DesktopBin.select(
        {
          app: { name: "portal" } as never,
          bin: {},
          libBins: [
            { lib: "media", bin: { ffmpeg: { [here]: { path: "/lib/ffmpeg" } } } },
            { lib: "video", bin: second },
          ],
        },
        ["media", "video"],
      );
    expect(select({ ffmpeg: { [here]: { path: "/lib/ffmpeg" } } })).not.toThrow();
    expect(select({ ffmpeg: { [here]: { path: "/video/ffmpeg" } } })).toThrow(
      "libs/media/akan.config.ts and libs/video/akan.config.ts declare bin.ffmpeg differently",
    );
  });

  test("keeps an extension on Windows, where PATH lookup needs one", () => {
    expect(DesktopBin.fileName("ffmpeg", "/x/ffmpeg.exe", "win32")).toBe("ffmpeg.exe");
    expect(DesktopBin.fileName("ffmpeg", "/x/ffmpeg", "win32")).toBe("ffmpeg.exe");
    expect(DesktopBin.fileName("tool", "/x/tool.cmd", "win32")).toBe("tool.cmd");
    expect(DesktopBin.fileName("ffmpeg", "/x/ffmpeg.exe", "darwin")).toBe("ffmpeg");
  });

  test("names a download by its URL's extension alone, so no URL writes outside the cache folder", () => {
    expect(DesktopBin.downloadName("https://x.dev/r/ffmpeg-7.1-linux64.tar.xz")).toBe("download.tar.xz");
    expect(DesktopBin.downloadName("https://x.dev/r/FFmpeg.ZIP?token=1")).toBe("download.zip");
    expect(DesktopBin.downloadName("https://x.dev/r/ffmpeg.exe")).toBe("download.exe");
    expect(DesktopBin.downloadName("https://x.dev/r/ffmpeg")).toBe("download");
    expect(DesktopBin.downloadName("https://x.dev/r/ffmpeg%E0.zip")).toBe("download.zip");
    expect(DesktopBin.downloadName("https://x.dev/a/..%2F..%2Fevil.zip")).toBe("download.zip");
    expect(DesktopBin.downloadName("https://x.dev/a/..%5C..%5Cevil.zip")).toBe("download.zip");
  });

  test("unpacks with the OS's own tools", () => {
    expect(DesktopBin.extractCommand("/c/a.zip", "/d", "linux")).toEqual(["unzip", "-q", "-o", "/c/a.zip", "-d", "/d"]);
    expect(DesktopBin.extractCommand("/c/a.zip", "/d", "darwin")).toEqual(["tar", "-xf", "/c/a.zip", "-C", "/d"]);
    expect(DesktopBin.extractCommand("C:\\c\\a.zip", "C:\\d", "win32")[0]).toMatch(/System32[\\/]tar\.exe$/);
  });

  test("copies a file into the app's bin folder, executable", async () => {
    const root = await makeTempRoot();
    writeFileSync(path.join(root, "tool"), script);
    const { carried, binDir } = await stage(root, { tool: { [here]: { path: path.join(root, "tool") } } });
    const staged = path.join(binDir, DesktopBin.fileName("tool", "tool"));
    expect(carried).toEqual(["tool"]);
    expect(readFileSync(staged, "utf8")).toBe(script);
    if (process.platform !== "win32") expect(statSync(staged).mode & 0o111).toBe(0o111);
  });

  test("empties the folder first, so a bin taken out of the config is not carried again", async () => {
    const root = await makeTempRoot();
    writeFileSync(path.join(root, "tool"), script);
    writeFileSync(path.join(root, "other"), script);
    await stage(root, { tool: { [here]: { path: path.join(root, "tool") } } });
    const { binDir } = await stage(root, { other: { [here]: { path: path.join(root, "other") } } });
    expect(readdirSync(binDir)).toEqual([DesktopBin.fileName("other", "other")]);
  });

  test("downloads once, checks the hash, and reuses the file it kept", async () => {
    const root = await makeTempRoot();
    served.set("/ffmpeg", new TextEncoder().encode(script));
    const bin = { ffmpeg: { [here]: { url: `${files.url}ffmpeg`, sha256: hash(script) } } };
    const before = requests;
    await stage(root, bin);
    await stage(root, bin);
    expect(requests - before).toBe(1);
    await expect(
      stage(await makeTempRoot(), { ffmpeg: { [here]: { url: `${files.url}ffmpeg`, sha256: "0".repeat(64) } } }),
    ).rejects.toThrow(`hashes to ${hash(script)}, not the declared`);
  });

  test("takes the executable out of an archive", async () => {
    const root = await makeTempRoot();
    mkdirSync(path.join(root, "pkg/ffmpeg-7.1/bin"), { recursive: true });
    writeFileSync(path.join(root, "pkg/ffmpeg-7.1/bin/ffmpeg"), script);
    Bun.spawnSync(["tar", "-czf", path.join(root, "ffmpeg.tar.gz"), "-C", path.join(root, "pkg"), "ffmpeg-7.1"]);
    served.set("/ffmpeg.tar.gz", new Uint8Array(readFileSync(path.join(root, "ffmpeg.tar.gz"))));
    const { binDir } = await stage(root, {
      ffmpeg: {
        [here]: {
          url: `${files.url}ffmpeg.tar.gz`,
          sha256: hash(readFileSync(path.join(root, "ffmpeg.tar.gz"))),
          file: "ffmpeg-7.1/bin/ffmpeg",
        },
      },
    });
    expect(readFileSync(path.join(binDir, DesktopBin.fileName("ffmpeg", "ffmpeg")), "utf8")).toBe(script);
    await expect(
      stage(await makeTempRoot(), {
        ffmpeg: { [here]: { path: path.join(root, "ffmpeg.tar.gz"), file: "ffmpeg-7.1/bin/ffprobe" } },
      }),
    ).rejects.toThrow("the archive holds no ffmpeg-7.1/bin/ffprobe");
  });

  test("refuses an entry with no file for this computer, and carries nothing for a lib the app does not use", async () => {
    const root = await makeTempRoot();
    await expect(stage(root, { ffmpeg: { [elsewhere]: { path: "/x/ffmpeg" } } })).rejects.toThrow(
      `apps/portal/akan.config.ts: bin.ffmpeg names no ${here} file`,
    );
    const unused = await stage(root, {}, { libBins: [{ lib: "media", bin: { ffmpeg: { [here]: { path: "/x" } } } }] });
    expect(unused.carried).toEqual([]);
  });
});
