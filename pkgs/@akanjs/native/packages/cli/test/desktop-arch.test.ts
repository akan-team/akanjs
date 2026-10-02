import { describe, expect, test } from "bun:test";
import { desktopArch } from "../src/lib/prepare.ts";
import { hostArch } from "../src/lib/updates.ts";
import { targetArch } from "../src/platforms/desktop.ts";

// CLI-9: a desktop app for the other CPU of the same OS; a macOS app is Apple silicon only.

describe("the desktop CPU", () => {
  test("defaults to this computer's for a desktop and is left out for a phone", () => {
    expect(desktopArch("linux", undefined)).toBe(hostArch());
    expect(desktopArch("ios", undefined)).toBeUndefined();
    expect(targetArch({})).toBe(hostArch());
  });

  test("is checked against the platform: a macOS app is arm64, and a phone picks none", () => {
    expect(desktopArch("windows", "x64")).toBe("x64");
    expect(desktopArch("linux", "arm64")).toBe("arm64");
    expect(desktopArch("macos", "arm64")).toBe("arm64");
    expect(() => desktopArch("macos", "x64")).toThrow(/Apple silicon/);
    expect(() => desktopArch("android", "arm64")).toThrow(/desktop build/);
    expect(() => desktopArch("linux", "ia32" as never)).toThrow(/arm64 or x64/);
  });
});
