import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pluginDecls } from "../../../packages/cli/src/lib/native-plugins.ts";
import { toPlist } from "../../../packages/cli/src/lib/plist.ts";
import { isAkanNativeError } from "../../../packages/core/src/index.ts";
import { installMockHost, type MockHost } from "../../../packages/core/src/testing.ts";
import { createDispatcher } from "../../../packages/desktop/src/dispatcher.ts";
import type { NativeEvent } from "../../../packages/desktop/src/plugin.ts";
import { limitExternalOpens } from "../../../packages/desktop/src/plugin.ts";
import manifest from "../native-plugin.json";
import { createDesktopAuthSession, type Runner, registeredSchemes } from "../src/desktop.ts";
import { authSession, checkStart, isCallback } from "../src/index.ts";

// Opens in a row: the one-per-second limit (L0) is tested in packages/desktop.
limitExternalOpens(false);

let host: MockHost | null = null;
afterEach(() => {
  host?.uninstall();
  host = null;
});

const rejection = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: unknown) => e,
  );
const codeOf = (fn: () => unknown) => {
  try {
    fn();
    return null;
  } catch (e) {
    return (e as { code?: string }).code;
  }
};

describe("auth-session arguments and manifest", () => {
  test("an http(s) page and a lowercase custom callback scheme", () => {
    expect(checkStart({ url: "https://id.example.com/authorize?x=1", callbackScheme: "myapp" })).toMatchObject({
      callbackScheme: "myapp",
      ephemeral: false,
    });
    expect(
      checkStart({ url: "http://localhost:8080/", callbackScheme: "com.example.app", ephemeral: true }).ephemeral,
    ).toBe(true);
    for (const args of [
      {},
      { url: "id.example.com", callbackScheme: "myapp" },
      { url: "myapp://x", callbackScheme: "myapp" },
      { url: "https://id.example.com", callbackScheme: "https" },
      { url: "https://id.example.com", callbackScheme: "MyApp" },
      { url: "https://id.example.com", callbackScheme: "my app" },
      { url: "https://id.example.com", callbackScheme: "myapp", ephemeral: "yes" },
    ]) {
      expect(codeOf(() => checkStart(args))).toBe("INVALID_ARGS");
    }
    expect(isCallback("MYAPP://done?code=1", "myapp")).toBe(true);
    expect(isCallback("myapp2://done", "myapp")).toBe(false);
    expect(isCallback("https://myapp", "myapp")).toBe(false);
  });

  test("iOS, Android and macOS implement start; the web does not", () => {
    const plugin = { spec: "auth-session", dir: `${import.meta.dir}/..`, manifest: manifest as never };
    for (const platform of ["ios", "android", "macos"] as const) {
      expect(pluginDecls([plugin], platform)).toEqual({ "auth-session": { methods: ["start"], events: [] } });
    }
  });

  test("web: UNSUPPORTED", async () => {
    host = installMockHost({ platform: "web" });
    expect(authSession.isSupported("start")).toBe(false);
    expect(
      isAkanNativeError(
        await rejection(authSession.start({ url: "https://id.example.com", callbackScheme: "myapp" })),
        "UNSUPPORTED",
      ),
    ).toBe(true);
  });

  test("native hosts get the arguments and return { url }", async () => {
    host = installMockHost({
      platform: "ios",
      plugins: {
        "auth-session": {
          methods: { start: (args: { callbackScheme: string }) => ({ url: `${args.callbackScheme}://done?code=42` }) },
        },
      },
    });
    expect(
      await authSession.start({ url: "https://id.example.com", callbackScheme: "myapp", ephemeral: true }),
    ).toEqual({ url: "myapp://done?code=42" });
    expect(host.requests[0]).toMatchObject({
      method: "start",
      args: { url: "https://id.example.com", callbackScheme: "myapp", ephemeral: true },
    });
  });
});

describe("auth-session desktop implementation", () => {
  const plist = toPlist({
    CFBundleIdentifier: "dev.test",
    CFBundleURLTypes: [{ CFBundleURLName: "dev.test", CFBundleURLSchemes: ["myapp", "Other"] }],
    LSMinimumSystemVersion: "26.0",
  });

  test("CFBundleURLSchemes from the XML Info.plist", () => {
    expect(registeredSchemes(plist)).toEqual(["myapp", "other"]);
    expect(registeredSchemes(toPlist({ CFBundleIdentifier: "dev.test" }))).toEqual([]);
    expect(registeredSchemes(null)).toBeNull();
  });

  function harness(options: { timeoutMs?: number; openFails?: boolean; platform?: NodeJS.Platform } = {}) {
    const commands: string[][] = [];
    let opened: ((e: NativeEvent) => void) | undefined;
    const run: Runner = async (argv) => {
      commands.push(argv);
      return options.openFails ? { code: 1, stderr: "boom" } : { code: 0, stderr: "" };
    };
    const platform = options.platform ?? "darwin";
    const dispatcher = createDispatcher(
      [createDesktopAuthSession({ run, plist: () => plist, timeoutMs: options.timeoutMs, platform })],
      {
        app: { id: "dev.test", name: "Test", version: "1.0.0", build: 1 },
        appDataDir: join(mkdtempSync(join(tmpdir(), "akan-native-auth-")), "data"),
        emit: () => {},
        registerFile: () => ({ url: "", mime: "", size: 0 }),
        // Windows and Linux: the schemes from shell.json, the browser through the shell.
        deepLinkSchemes: ["myapp", "other"],
        shell: async (op, args) => {
          commands.push([op, String(args?.url)]);
          if (options.openFails) throw new Error("INTERNAL: no browser");
          return null;
        },
        onNativeEvent: (type, listener) => {
          if (type === "opened") opened = listener;
          return () => {};
        },
      },
    );
    let id = 0;
    const start = (args: unknown) =>
      dispatcher.handle(JSON.stringify({ v: 1, id: ++id, plugin: "auth-session", method: "start", args }));
    const link = (...urls: string[]) => opened!({ type: "opened", urls });
    return { commands, start, link };
  }

  test("opens the default browser and resolves with the matching deep link", async () => {
    const h = harness();
    const pending = h.start({ url: "https://id.example.com/authorize?state=s", callbackScheme: "myapp" });
    await Bun.sleep(1);
    expect(h.commands).toEqual([["/usr/bin/open", "-u", "https://id.example.com/authorize?state=s"]]);
    h.link("otherapp://x"); // not ours
    h.link("myapp://callback?code=forged&state=other", "myapp://callback?code=forged"); // our scheme, not our state
    h.link("MyApp://callback?code=42&state=s");
    expect(await pending).toMatchObject({ ok: true, result: { url: "MyApp://callback?code=42&state=s" } });
    h.link("myapp://late"); // nobody waiting: ignored (the app plugin still sees it)
  });

  test("the callback is auth-session's: the app plugin does not also deliver it to urlOpen (R10)", async () => {
    const { linkClaimed } = await import("../../../packages/desktop/src/plugin.ts");
    const h = harness();
    const pending = h.start({ url: "https://id.example.com/authorize?state=r10", callbackScheme: "myapp" });
    await Bun.sleep(1);
    expect(linkClaimed("myapp://callback?state=elsewhere")).toBe(false); // not ours: a deep link
    // The app plugin may ask first (it resolves start()) …
    expect(linkClaimed("myapp://callback?code=7&state=r10")).toBe(true);
    expect(await pending).toMatchObject({ ok: true, result: { url: "myapp://callback?code=7&state=r10" } });
    // … or after auth-session saw the same event: still claimed, answered once.
    h.link("myapp://callback?code=7&state=r10");
    expect(linkClaimed("myapp://callback?code=7&state=r10")).toBe(true);
    expect(linkClaimed("myapp://later")).toBe(false);
  });

  test("without a state in the start URL any callback of the scheme answers; a fragment state counts", async () => {
    const { isAnswer } = await import("../src/args.ts");
    expect(isAnswer("myapp://cb?code=1", "myapp", null)).toBe(true);
    expect(isAnswer("myapp://cb#access_token=t&state=s", "myapp", "s")).toBe(true);
    expect(isAnswer("myapp://cb#state=x", "myapp", "s")).toBe(false);
    expect(isAnswer("other://cb?state=s", "myapp", "s")).toBe(false);
  });

  test("a newer start() cancels the older; a timeout cancels; an unregistered scheme is refused", async () => {
    const h = harness({ timeoutMs: 50 });
    const first = h.start({ url: "https://id.example.com/a", callbackScheme: "myapp" });
    await Bun.sleep(1);
    const second = h.start({ url: "https://id.example.com/b", callbackScheme: "myapp" });
    expect(await first).toMatchObject({ ok: false, error: { code: "CANCELLED" } });
    expect(await second).toMatchObject({
      ok: false,
      error: { code: "CANCELLED", message: "no sign-in callback arrived in time" },
    });
    expect(await h.start({ url: "https://id.example.com", callbackScheme: "notmine" })).toMatchObject({
      ok: false,
      error: { code: "INVALID_ARGS" },
    });
    expect(await h.start({ url: "javascript:alert(1)", callbackScheme: "myapp" })).toMatchObject({
      ok: false,
      error: { code: "INVALID_ARGS" },
    });
    expect(h.commands).toHaveLength(2);
  });

  test("a failing open rejects at once", async () => {
    const h = harness({ openFails: true });
    expect(await h.start({ url: "https://id.example.com", callbackScheme: "myapp" })).toMatchObject({
      ok: false,
      error: { code: "INTERNAL" },
    });
  });

  test("Windows and Linux: shell.open, the schemes from deepLinks.schemes", async () => {
    for (const platform of ["win32", "linux"] as const) {
      const h = harness({ platform });
      const pending = h.start({ url: "https://id.example.com/authorize", callbackScheme: "myapp" });
      await Bun.sleep(1);
      expect(h.commands).toEqual([["shell.open", "https://id.example.com/authorize"]]);
      h.link("myapp://callback?code=1");
      expect(await pending).toMatchObject({ ok: true, result: { url: "myapp://callback?code=1" } });
      expect(await h.start({ url: "https://id.example.com", callbackScheme: "notmine" })).toMatchObject({
        ok: false,
        error: { code: "INVALID_ARGS" },
      });
      expect(
        await harness({ platform, openFails: true }).start({ url: "https://id.example.com", callbackScheme: "myapp" }),
      ).toMatchObject({ ok: false, error: { code: "INTERNAL" } });
    }
  });
});
