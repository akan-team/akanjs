import { afterEach, describe, expect, test } from "bun:test";
import path from "node:path";
import { installMockHost, type MockHost } from "@akanjs/native/core/testing";
import { desktopPlatform, isNativeApp, isNativeShell, nativePlatform } from "./nativeHost";

let host: MockHost | null = null;

afterEach(() => {
  host?.uninstall();
  host = null;
});

describe("nativeHost", () => {
  test("names the shell the page runs in", () => {
    host = installMockHost({ platform: "android" });
    expect([isNativeApp(), isNativeShell(), nativePlatform(), desktopPlatform()]).toEqual([
      true,
      true,
      "android",
      null,
    ]);
    host.uninstall();
    host = installMockHost({ platform: "macos" });
    expect([isNativeApp(), isNativeShell(), nativePlatform(), desktopPlatform()]).toEqual([false, true, null, "macos"]);
  });

  test("takes a page with no shell, or one it does not know, for the web", () => {
    expect([isNativeApp(), isNativeShell(), nativePlatform(), desktopPlatform()]).toEqual([false, false, null, null]);
    host = installMockHost({ platform: "tvos" as never });
    expect([isNativeApp(), isNativeShell(), nativePlatform(), desktopPlatform()]).toEqual([false, false, null, null]);
  });

  //? A child process each: core starts once per page, and this one already loaded it for the mock host.
  test("starts @akanjs/native/core in a shell and never on the web", async () => {
    const receiverIn = async (boot: string) => {
      const nativeHost = JSON.stringify(path.join(import.meta.dir, "nativeHost.ts"));
      const proc = Bun.spawn(
        [
          process.execPath,
          "-e",
          `${boot}
await import(${nativeHost});
for (let i = 0; i < 20 && typeof globalThis.__AKAN_NATIVE__?.receive !== "function"; i++) await Bun.sleep(25);
console.info(typeof globalThis.__AKAN_NATIVE__?.receive);`,
        ],
        { stdout: "pipe", stderr: "pipe", timeout: 10_000 },
      );
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ]);
      return { receiver: stdout.trim(), exitCode, stderr };
    };
    expect(await receiverIn('globalThis.__AKAN_NATIVE__ = { platform: "ios" };')).toEqual({
      receiver: "function",
      exitCode: 0,
      stderr: "",
    });
    expect(await receiverIn("")).toEqual({ receiver: "undefined", exitCode: 0, stderr: "" });
  });

  test("leaves @akanjs/native/core out of what a web page loads", async () => {
    const result = await Bun.build({
      entrypoints: [path.join(import.meta.dir, "index.ts")],
      target: "browser",
      format: "esm",
      splitting: true,
      metafile: true,
      throw: true,
    });
    const outputs = result.metafile?.outputs ?? {};
    const eager = new Set<string>();
    const load = (outputPath: string) => {
      if (eager.has(outputPath) || !outputs[outputPath]) return;
      eager.add(outputPath);
      for (const imp of outputs[outputPath].imports) if (imp.kind === "import-statement") load(imp.path);
    };
    for (const [outputPath, output] of Object.entries(outputs))
      if (output.entryPoint?.endsWith("client/index.ts")) load(outputPath);
    const isCore = (input: string) => input.includes("@akanjs/native/packages/core");
    expect([...eager].flatMap((outputPath) => Object.keys(outputs[outputPath]?.inputs ?? {})).filter(isCore)).toEqual(
      [],
    );
    expect(Object.keys(result.metafile?.inputs ?? {}).some(isCore)).toBe(true);
  });
});
