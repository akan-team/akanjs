import { describe, expect, test } from "bun:test";
import { NativeAppLine } from "./nativeAppLine";

describe("NativeAppLine", () => {
  test("a page logger line keeps its level and its logger's name", () => {
    expect(NativeAppLine.read("[page warn] [WsClient] WebSocket message process failed")).toEqual({
      level: "warn",
      message: "[page:WsClient] WebSocket message process failed",
    });
  });

  test("a bare console call keeps its level, `log` reading as info", () => {
    expect(NativeAppLine.read("[page log] hello")).toEqual({ level: "info", message: "[page] hello" });
    expect(NativeAppLine.read("[page debug] [akan:frame:x:1] csr.render {}")).toEqual({
      level: "debug",
      message: "[page:akan:frame:x:1] csr.render {}",
    });
  });

  test("a continuation line follows its message's level without a prefix of its own", () => {
    expect(NativeAppLine.read("[page+ error]     at run (app.js:1:2)")).toEqual({
      level: "error",
      message: "      at run (app.js:1:2)",
    });
  });

  test("a carried server's line keeps the level its logger wrote, and one without a level stays visible", () => {
    const line = "[server] [minimal] 81 - 09/30/2026, 12:30:06 PM   ERROR  boom +2ms";
    expect(NativeAppLine.read(line)).toEqual({ level: "error", message: line });
    expect(NativeAppLine.read("[server] \u001b[32m[minimal] 81 -\u001b[39m WARN  slow").level).toBe("warn");
    expect(NativeAppLine.read("[server]     at run (main.js:1:2)").level).toBe("info");
  });

  test("a second window is named, the first is not", () => {
    expect(NativeAppLine.read("[page#2 info] [App] ready")).toEqual({ level: "info", message: "[page#2:App] ready" });
  });

  test("logcat lines read by tag and priority", () => {
    expect(NativeAppLine.read("W/AkanNativeConsole( 1234): [WsClient] failed")).toEqual({
      level: "warn",
      message: "[page:WsClient] failed",
    });
    expect(NativeAppLine.read("E/AndroidRuntime( 1234): FATAL EXCEPTION: main")).toEqual({
      level: "error",
      message: "[AndroidRuntime] FATAL EXCEPTION: main",
    });
    expect(
      NativeAppLine.read("I/AkanNative( 1234): pages from http://10.0.2.2:5000 (akan-native dev --hmr)").level,
    ).toBe("debug");
  });

  test("the host's own lines stay visible but for where its pages come from", () => {
    expect(NativeAppLine.read("[akan-native] opened in the browser: https://x.test")).toEqual({
      level: "info",
      message: "[akan-native] opened in the browser: https://x.test",
    });
    expect(
      NativeAppLine.read("[akan-native native] pages from http://127.0.0.1:6000 (akan-native dev --hmr)").level,
    ).toBe("debug");
  });

  test("a line no page or host wrote is kept for debug, or for info when verbose", () => {
    expect(NativeAppLine.read("WebContent[123] Could not signal service")).toEqual({
      level: "debug",
      message: "WebContent[123] Could not signal service",
    });
    expect(NativeAppLine.read("WebContent[123] Could not signal service", { verbose: true }).level).toBe("info");
  });
});
