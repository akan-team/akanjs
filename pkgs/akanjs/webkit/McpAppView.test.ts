import { describe, expect, test } from "bun:test";

process.env.AKAN_PUBLIC_APP_NAME = "test";
process.env.AKAN_PUBLIC_REPO_NAME = "akanjs";
process.env.AKAN_PUBLIC_SERVE_DOMAIN = "akanjs.com";
//? Imported once the env is set: the store module reads it while it loads.
const { McpAppView } = await import("./McpAppView");

describe("McpAppView.localize", () => {
  const locales = ["en", "ko"];

  test("moves the screen to the host's language when the app speaks it", () => {
    expect(McpAppView.localize("/en/memo/1?tab=a", "ko-KR", locales)).toBe("/ko/memo/1?tab=a");
    expect(McpAppView.localize("/en", "ko", locales)).toBe("/ko");
  });

  test("keeps the server's language for a locale the app lacks, or an href with no locale segment", () => {
    expect(McpAppView.localize("/en/memo", "ja-JP", locales)).toBe("/en/memo");
    expect(McpAppView.localize("/en/memo", undefined, locales)).toBe("/en/memo");
    expect(McpAppView.localize("/memo", "ko-KR", locales)).toBe("/memo");
  });
});
