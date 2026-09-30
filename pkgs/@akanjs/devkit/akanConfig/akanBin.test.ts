import { describe, expect, test } from "bun:test";
import path from "node:path";
import { AkanBin } from "./akanBin";

const owner = "apps/portal/akan.config.ts";
const sha256 = "A".repeat(64);

describe("AkanBin.parse", () => {
  test("takes a download checked by its hash, or a file relative to the declaring folder", () => {
    expect(
      AkanBin.parse(
        {
          ffmpeg: {
            "linux-x64": { url: "https://files.test/ffmpeg-linux64-lgpl.tar.xz", sha256, file: "./ffmpeg\\bin/ffmpeg" },
            "darwin-arm64": { path: "tools/ffmpeg" },
          },
        },
        owner,
        "/repo/apps/portal",
      ),
    ).toEqual({
      ffmpeg: {
        "linux-x64": {
          url: "https://files.test/ffmpeg-linux64-lgpl.tar.xz",
          sha256: "a".repeat(64),
          file: "ffmpeg/bin/ffmpeg",
        },
        "darwin-arm64": { path: path.resolve("/repo/apps/portal/tools/ffmpeg") },
      },
    });
    expect(AkanBin.parse(undefined, owner, "/repo/apps/portal")).toEqual({});
  });

  test("names the declaration that is wrong", () => {
    const parse = (bin: unknown) => () => AkanBin.parse(bin, owner, "/repo/apps/portal");
    expect(parse(["ffmpeg"])).toThrow(`${owner}: bin maps each executable's name`);
    expect(parse({ "../ffmpeg": {} })).toThrow("bin.../ffmpeg is not a file name");
    expect(parse({ ffmpeg: { "darwin-universal": { path: "x" } } })).toThrow(
      "bin.ffmpeg.darwin-universal is not one of darwin-arm64",
    );
    expect(parse({ ffmpeg: { "linux-x64": { url: "https://x.test/ffmpeg", sha256, path: "x" } } })).toThrow(
      "takes either url and sha256, or path",
    );
    expect(parse({ ffmpeg: { "linux-x64": { url: "ftp://x.test/ffmpeg", sha256 } } })).toThrow(
      "url must be an http(s) address",
    );
    expect(parse({ ffmpeg: { "linux-x64": { url: "https://x.test/ffmpeg", sha256: "abc" } } })).toThrow(
      "sha256 must be the downloaded file's 64-digit hex digest",
    );
    expect(parse({ ffmpeg: { "linux-x64": { path: "ffmpeg", sha256 } } })).toThrow("a path source downloads nothing");
    expect(parse({ ffmpeg: { "linux-x64": { url: "https://x.test/ffmpeg.zip", sha256 } } })).toThrow(
      "names an archive: file picks the executable inside it",
    );
    expect(parse({ ffmpeg: { "linux-x64": { path: "ffmpeg", file: "bin/ffmpeg" } } })).toThrow(
      "file picks the executable out of an archive",
    );
    expect(parse({ ffmpeg: { "linux-x64": { path: "ffmpeg.tar.gz", file: "../ffmpeg" } } })).toThrow(
      "file must be a path inside the archive",
    );
    expect(parse({ ffmpeg: { "linux-x64": { path: "ffmpeg", mode: 755 } } })).toThrow("unknown key mode");
  });
});
