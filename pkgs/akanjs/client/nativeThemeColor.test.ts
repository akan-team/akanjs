import "../test/registerDom";
import { afterEach, describe, expect, test } from "bun:test";
import { installMockHost, type MockHost } from "@akanjs/native/core/testing";
import { NativeThemeColor } from "./nativeThemeColor";

let host: MockHost | null = null;
afterEach(() => {
  host?.uninstall();
  host = null;
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
const sent = () => (host?.requests ?? []).filter((request) => request.method === "setThemeColor");

describe("NativeThemeColor", () => {
  test("turns a painted pixel into the hex a shell parses, and a transparent one into nothing", () => {
    expect(NativeThemeColor.pixelHex([12, 30, 62, 255])).toBe("#0c1e3e");
    expect(NativeThemeColor.pixelHex([255, 255, 255, 128])).toBe("#ffffff");
    expect(NativeThemeColor.pixelHex([12, 30, 62, 0])).toBeNull();
    expect(NativeThemeColor.hex("#0C1E3E")).toBe("#0c1e3e");
  });

  test("sends a phone's shell each new color once, and null once the page names none", async () => {
    host = installMockHost({ platform: "ios", plugins: { appearance: { methods: { setThemeColor: () => {} } } } });
    NativeThemeColor.follow("#0c1e3e");
    NativeThemeColor.follow("#0C1E3E");
    await settle();
    NativeThemeColor.follow("#ffffff");
    await settle();
    NativeThemeColor.follow(null);
    await settle();
    expect(sent().map((request) => request.args)).toEqual([
      { color: "#0c1e3e" },
      { color: "#ffffff" },
      { color: null },
    ]);
  });

  test("leaves a shell built before setThemeColor alone, and a browser never loads the plugin", async () => {
    host = installMockHost({ platform: "android", plugins: { appearance: { methods: { get: () => null } } } });
    NativeThemeColor.follow("#123456");
    await settle();
    expect(host.requests).toEqual([]);
    host.uninstall();

    host = installMockHost({ platform: "web" });
    NativeThemeColor.follow("#654321");
    await settle();
    expect(host.requests).toEqual([]);
  });
});
