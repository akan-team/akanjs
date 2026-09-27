import { afterEach, describe, expect, test } from "bun:test";
import { pluginDecls } from "../../../packages/cli/src/lib/native-plugins.ts";
import { isAkanNativeError } from "../../../packages/core/src/index.ts";
import { installMockHost, type MockHost } from "../../../packages/core/src/testing.ts";
import type { DesktopContext } from "../../../packages/desktop/src/plugin.ts";
import manifest from "../native-plugin.json";
import { createDesktopClipboard } from "../src/desktop.ts";
import { clipboard } from "../src/index.ts";

let host: MockHost | null = null;
const stubs: string[] = [];

/** Puts a fake property on navigator for one test (bun has a navigator without clipboard). */
function stubNavigator(key: string, value: unknown) {
  Object.defineProperty(navigator, key, { value, configurable: true, writable: true });
  stubs.push(key);
}

afterEach(() => {
  host?.uninstall();
  host = null;
  for (const key of stubs.splice(0)) delete (navigator as unknown as Record<string, unknown>)[key];
});

const rejection = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: unknown) => e,
  );

describe("clipboard routing", () => {
  test("native hosts get { text } and return { text }", async () => {
    const written: unknown[] = [];
    host = installMockHost({
      platform: "ios",
      plugins: {
        clipboard: { methods: { writeText: (args) => void written.push(args), readText: () => ({ text: "hello" }) } },
      },
    });
    expect(clipboard.implementation("writeText")).toBe("native");
    await clipboard.writeText({ text: "a\nb 한글" });
    expect(written).toEqual([{ text: "a\nb 한글" }]);
    expect(await clipboard.readText()).toEqual({ text: "hello" });
    expect(host.requests.map((r) => [r.plugin, r.method])).toEqual([
      ["clipboard", "writeText"],
      ["clipboard", "readText"],
    ]);
  });

  test("native errors keep their code", async () => {
    host = installMockHost({
      platform: "android",
      plugins: {
        clipboard: {
          methods: {
            readText: () => {
              throw Object.assign(new Error("no focus"), { name: "NotAllowedError" });
            },
          },
        },
      },
    });
    expect(isAkanNativeError(await rejection(clipboard.readText()), "PERMISSION_DENIED")).toBe(true);
  });

  test("a host without the plugin rejects UNSUPPORTED", async () => {
    host = installMockHost({ platform: "ios" });
    expect(clipboard.isSupported("readText")).toBe(false);
    expect(isAkanNativeError(await rejection(clipboard.readText()), "UNSUPPORTED")).toBe(true);
  });

  test("manifest: native on macOS (desktop.ts), iOS and Android", () => {
    const plugin = { spec: "clipboard", dir: `${import.meta.dir}/..`, manifest: manifest as never };
    for (const platform of ["macos", "ios", "android"] as const) {
      expect(pluginDecls([plugin], platform)).toEqual({
        clipboard: { methods: ["writeText", "readText"], events: [] },
      });
    }
  });
});

describe("clipboard web implementation", () => {
  test("without navigator.clipboard (no DOM, insecure context) both methods reject UNSUPPORTED", async () => {
    host = installMockHost({ platform: "web" });
    expect(isAkanNativeError(await rejection(clipboard.readText()), "UNSUPPORTED")).toBe(true);
    expect(isAkanNativeError(await rejection(clipboard.writeText({ text: "x" })), "UNSUPPORTED")).toBe(true);
  });

  test("uses navigator.clipboard and maps refusals", async () => {
    host = installMockHost({ platform: "web" });
    let stored = "";
    stubNavigator("clipboard", {
      writeText: async (text: string) => {
        stored = text;
      },
      readText: async () => stored,
    });
    const writing = clipboard.writeText({ text: "copied" });
    expect(stored).toBe("copied"); // started before any await: keeps the click's user activation
    await writing;
    expect(await clipboard.readText()).toEqual({ text: "copied" });

    stubNavigator("clipboard", {
      readText: () => Promise.reject(Object.assign(new Error("Read permission denied."), { name: "NotAllowedError" })),
    });
    expect(isAkanNativeError(await rejection(clipboard.readText()), "PERMISSION_DENIED")).toBe(true);
  });

  test("writeText validates its argument before touching the browser", async () => {
    host = installMockHost({ platform: "web" });
    let calls = 0;
    stubNavigator("clipboard", { writeText: async () => void calls++ });
    expect(isAkanNativeError(await rejection(clipboard.writeText({ text: 1 as never })), "INVALID_ARGS")).toBe(true);
    expect(isAkanNativeError(await rejection(clipboard.writeText(undefined as never)), "INVALID_ARGS")).toBe(true);
    expect(calls).toBe(0);
  });

  test("the desktop WebView never runs the web implementation (desktop.ts is native)", () => {
    host = installMockHost({
      platform: "macos",
      plugins: { clipboard: { methods: { readText: () => ({ text: "" }) } } },
    });
    expect(clipboard.implementation("readText")).toBe("native");
    expect(clipboard.implementation("writeText")).toBe("none");
  });
});

describe("clipboard desktop implementation", () => {
  const ctx = {} as DesktopContext;

  test("validates text", async () => {
    const plugin = createDesktopClipboard("ruler");
    expect(
      isAkanNativeError(
        await rejection(Promise.resolve().then(() => plugin.methods.writeText!({ text: 5 as never }, ctx))),
        "INVALID_ARGS",
      ),
    ).toBe(true);
  });

  test("Windows and Linux: clipboard.writeText and clipboard.readText shell ops", async () => {
    const ops: unknown[] = [];
    let stored: string | null = null;
    const shell = {
      async shell(op: string, args?: Record<string, unknown>) {
        ops.push({ op, ...args });
        if (op === "clipboard.writeText") stored = args?.text as string;
        return op === "clipboard.readText" ? { text: stored } : null;
      },
    } as unknown as DesktopContext;
    const plugin = createDesktopClipboard("general", "linux");
    expect(await plugin.methods.readText!(undefined, shell)).toEqual({ text: "" }); // no text on the clipboard
    expect(
      isAkanNativeError(
        await rejection(Promise.resolve().then(() => plugin.methods.writeText!({ text: 5 as never }, shell))),
        "INVALID_ARGS",
      ),
    ).toBe(true);
    await plugin.methods.writeText!({ text: "한글 ✓" }, shell);
    expect(await plugin.methods.readText!(undefined, shell)).toEqual({ text: "한글 ✓" });
    expect(ops).toEqual([
      { op: "clipboard.readText" },
      { op: "clipboard.writeText", text: "한글 ✓" },
      { op: "clipboard.readText" },
    ]);
  });

  // Uses the "ruler" pasteboard so the user's clipboard is left alone.
  test.skipIf(process.platform !== "darwin")(
    "round-trips UTF-8 through pbcopy/pbpaste even without a UTF-8 locale",
    async () => {
      const plugin = createDesktopClipboard("ruler");
      const sample = "한글 é 😀\nsecond line\t";
      const utf8 = { LC_ALL: "en_US.UTF-8" };
      const saved = { LANG: process.env.LANG, LC_ALL: process.env.LC_ALL };
      process.env.LANG = "C"; // what a Finder-launched app has (no LANG at all behaves the same)
      process.env.LC_ALL = "C";
      try {
        await plugin.methods.writeText!({ text: sample }, ctx);
        // Read back independently in UTF-8: a MacRoman write would come back as mojibake here.
        const paste = Bun.spawn(["/usr/bin/pbpaste", "-pboard", "ruler"], { env: utf8, stdout: "pipe" });
        expect(await new Response(paste.stdout).text()).toBe(sample);

        const other = "from another app ✓";
        const copy = Bun.spawn(["/usr/bin/pbcopy", "-pboard", "ruler"], { env: utf8, stdin: new Blob([other]) });
        await copy.exited;
        expect(await plugin.methods.readText!(undefined, ctx)).toEqual({ text: other });

        await plugin.methods.writeText!({ text: "" }, ctx);
        expect(await plugin.methods.readText!(undefined, ctx)).toEqual({ text: "" });
      } finally {
        for (const [key, value] of Object.entries(saved)) {
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
        }
      }
    },
  );
});
