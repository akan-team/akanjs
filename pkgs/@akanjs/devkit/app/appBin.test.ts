import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { AkanBinConfig } from "../akanConfig";
import { tempDirs } from "../test/testHelpers";
import { AppBin } from "./appBin";

const makeTempRoot = tempDirs("akan-app-bin-");
const script = "#!/bin/sh\necho carried\n";

const appBinOf = (root: string, bin: AkanBinConfig) => {
  const app = {
    name: "portal",
    cwdPath: path.join(root, "apps/portal"),
    getScanInfo: () => ({ getLibs: () => [] }),
    logger: { info: () => {}, warn: () => {} },
  };
  return new AppBin(app as never, { app: { name: "portal" }, bin, libBins: [] } as never);
};

describe("AppBin", () => {
  test("carries each declared Linux file under the name Docker gives its CPU", async () => {
    const root = await makeTempRoot();
    const dist = path.join(root, "dist");
    for (const name of ["x64", "arm64", "mac"]) writeFileSync(path.join(root, name), `${script}# ${name}\n`);
    const carried = await appBinOf(root, {
      ffmpeg: {
        "linux-x64": { path: path.join(root, "x64") },
        "linux-arm64": { path: path.join(root, "arm64") },
        "darwin-arm64": { path: path.join(root, "mac") },
      },
    }).stageImage(dist);

    expect(carried).toEqual(["ffmpeg"]);
    expect(readdirSync(path.join(dist, "bin")).toSorted()).toEqual(["amd64", "arm64"]);
    expect(readFileSync(path.join(dist, "bin/amd64/ffmpeg"), "utf8")).toBe(`${script}# x64\n`);
    expect(readFileSync(path.join(dist, "bin/arm64/ffmpeg"), "utf8")).toBe(`${script}# arm64\n`);
    if (process.platform !== "win32") expect(statSync(path.join(dist, "bin/amd64/ffmpeg")).mode & 0o111).toBe(0o111);
  });

  test("leaves an entry with no Linux file to the image's own steps, and a stale folder out", async () => {
    const root = await makeTempRoot();
    const dist = path.join(root, "dist");
    writeFileSync(path.join(root, "tool"), script);
    await appBinOf(root, { tool: { "linux-x64": { path: path.join(root, "tool") } } }).stageImage(dist);
    const carried = await appBinOf(root, { tool: { "darwin-arm64": { path: path.join(root, "tool") } } }).stageImage(
      dist,
    );

    expect(carried).toEqual([]);
    expect(readdirSync(dist)).toEqual([]);
  });

  test("names the declared executables this computer's PATH lacks", () => {
    const which = (name: string) => (name === "ffmpeg" ? "/usr/bin/ffmpeg" : null);

    expect(AppBin.missing(["ffmpeg"], which)).toBeNull();
    expect(AppBin.missing([], which)).toBeNull();
    expect(AppBin.missing(["ffmpeg", "ffprobe"], which)).toStartWith(
      "bin declares ffprobe, which this computer's PATH",
    );
  });
});
