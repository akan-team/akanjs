import { expect, test } from "bun:test";
import { EARLY_ERRORS_SCRIPT, injectEarlyErrors } from "../../cli/src/lib/html.ts";
import { flushEarlyErrors } from "../src/runtime.ts";
import { installMockHost } from "../src/testing.ts";

// Architecture review stage 5: errors before @akanjs/native/core runs still reach a log (dev builds).

test("the build puts the collector right after init.js; it is valid script", () => {
  const html = injectEarlyErrors(`<head><script src="/__akan_native/init.js"></script><title>x</title></head>`);
  expect(html).toStartWith(`<head><script src="/__akan_native/init.js"></script><script>(function(){`);
  expect(() => new Function(EARLY_ERRORS_SCRIPT)).not.toThrow();
  expect(injectEarlyErrors("<head></head>")).toBe("<head></head>"); // no init.js: nothing to follow
});

test("core sends what was collected once, marked [before runtime], and stops the collector", () => {
  const host = installMockHost({ platform: "ios", dev: true });
  const g = globalThis as { window?: unknown; __AKAN_NATIVE__?: { early?: unknown } };
  const hadWindow = "window" in g;
  const logged: string[] = [];
  const error = console.error;
  console.error = (...args: unknown[]) => void logged.push(args.join(" "));
  try {
    g.window ??= globalThis;
    g.__AKAN_NATIVE__!.early = [
      "error: ReferenceError: x is not defined\n    at main.js:1",
      "unhandled rejection: boom",
    ];
    flushEarlyErrors();
    flushEarlyErrors(); // once
    expect(g.__AKAN_NATIVE__!.early).toBeNull();
    expect(logged).toEqual([
      `[before runtime] 2 error(s) before @akanjs/native/core started:\nerror: ReferenceError: x is not defined\n    at main.js:1\nunhandled rejection: boom`,
    ]);
  } finally {
    console.error = error;
    if (!hadWindow) delete g.window;
    host.uninstall();
  }
});
