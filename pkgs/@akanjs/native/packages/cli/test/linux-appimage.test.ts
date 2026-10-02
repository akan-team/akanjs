import { describe, expect, test } from "bun:test";
import { TOOLCHAIN } from "../src/lib/toolchains.ts";
import { appRun, desktopEntry } from "../src/platforms/linux-appimage.ts";

// CLI-9: a Linux AppImage of the app folder.

describe("the Linux AppImage", () => {
  test("its launcher entry names the app, its icon and the link schemes it opens", () => {
    expect(desktopEntry({ name: "Board\nSign", fileName: "board", schemes: ["board", "board-dev"] })).toBe(
      [
        "[Desktop Entry]",
        "Type=Application",
        "Name=Board\\nSign",
        "Exec=board %u",
        "Icon=board",
        "Terminal=false",
        "Categories=Utility;",
        "MimeType=x-scheme-handler/board;x-scheme-handler/board-dev;",
        "",
      ].join("\n"),
    );
    expect(desktopEntry({ name: "Board", fileName: "board", schemes: [] })).not.toContain("MimeType");
  });

  test("AppRun starts the executable beside it with the arguments it was given", () => {
    expect(appRun("board")).toBe('#!/bin/sh\nHERE="$(dirname "$(readlink -f "$0")")"\nexec "$HERE/board" "$@"\n');
  });

  test("the runtime is pinned per CPU to a dated release, by digest", () => {
    for (const arch of ["x64", "arm64"]) {
      const spec = TOOLCHAIN.appimageRuntime.downloads[arch];
      expect(spec?.url).toContain(`/releases/download/${TOOLCHAIN.appimageRuntime.version}/`);
      expect(spec?.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});
