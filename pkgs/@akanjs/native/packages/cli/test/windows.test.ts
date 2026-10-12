import { describe, expect, test } from "bun:test";
import { windowsVersionInfo } from "../src/platforms/windows.ts";

describe("windowsVersionInfo", () => {
  const app = { name: "Court Board", version: "1.4.2", build: 37 };

  test("names the app's publisher as the executable's company", () => {
    expect(windowsVersionInfo(app, "Leading Flight")).toEqual([
      "--windows-title=Court Board",
      "--windows-description=Court Board",
      "--windows-version=1.4.2.37",
      "--windows-publisher=Leading Flight",
    ]);
  });

  test("falls back to the app name, never leaving Bun's own company in place", () => {
    expect(windowsVersionInfo(app)).toContain("--windows-publisher=Court Board");
  });
});
