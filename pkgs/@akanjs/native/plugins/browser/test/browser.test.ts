import { afterEach, describe, expect, test } from "bun:test";
import { pluginDecls } from "../../../packages/cli/src/lib/native-plugins.ts";
import { isAkanNativeError } from "../../../packages/core/src/index.ts";
import { installMockHost, type MockHost } from "../../../packages/core/src/testing.ts";
import type { DesktopContext } from "../../../packages/desktop/src/plugin.ts";
import { limitExternalOpens } from "../../../packages/desktop/src/plugin.ts";
import manifest from "../native-plugin.json";
import { createDesktopBrowser, type Runner } from "../src/desktop.ts";
import { browser, checkColor, checkUrl } from "../src/index.ts";

// Opens in a row: the one-per-second limit (L0) is tested in packages/desktop.
limitExternalOpens(false);

const g = globalThis as { window?: unknown };
let host: MockHost | null = null;

afterEach(async () => {
  if (host && browser.implementation("close") === "web") await browser.close().catch(() => {});
  host?.uninstall();
  host = null;
  delete g.window;
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

describe("browser arguments and manifest", () => {
  test("http and https only; #rrggbb colors", () => {
    expect(checkUrl("HTTPS://Example.com/a").href).toBe("https://example.com/a");
    for (const url of [
      "",
      "example.com",
      "mailto:a@b.c",
      "file:///etc/hosts",
      "javascript:alert(1)",
      "akansample://x",
      "https://",
      7,
    ]) {
      expect(codeOf(() => checkUrl(url))).toBe("INVALID_ARGS");
    }
    expect(checkColor("#1A2b3c")).toBe("#1A2b3c");
    expect(checkColor(undefined)).toBeUndefined();
    for (const color of ["red", "#123", "#12345678", "1a2b3c", 0x123456])
      expect(codeOf(() => checkColor(color))).toBe("INVALID_ARGS");
  });

  test("mobile hosts declare open, close and finished, macOS only open; Android asks for Custom Tabs visibility", () => {
    const plugin = { spec: "browser", dir: `${import.meta.dir}/..`, manifest: manifest as never };
    for (const platform of ["ios", "android"] as const) {
      expect(pluginDecls([plugin], platform)).toEqual({
        browser: { methods: ["open", "close"], events: ["finished"] },
      });
    }
    // The system browser cannot be closed from the app: close is not declared, so isSupported("close") is false.
    expect(pluginDecls([plugin], "macos")).toEqual({ browser: { methods: ["open"], events: ["finished"] } });
    expect(manifest.android.manifestXml).toContain("android.support.customtabs.action.CustomTabsService");
  });
});

describe("browser routing", () => {
  test("native hosts get { url, toolbarColor } and send finished", async () => {
    const seen: unknown[] = [];
    host = installMockHost({
      platform: "android",
      plugins: {
        browser: {
          methods: { open: (args) => void seen.push(args), close: () => void seen.push("close") },
          events: ["finished"],
        },
      },
    });
    let finished = 0;
    const stop = browser.listen("finished", () => finished++);
    await new Promise((r) => setTimeout(r, 1));
    await browser.open({ url: "https://example.com", toolbarColor: "#112233" });
    host.emit("browser", "finished", {});
    await browser.close();
    expect(seen).toEqual([{ url: "https://example.com", toolbarColor: "#112233" }, "close"]);
    expect(finished).toBe(1);
    stop();
  });
});

describe("browser web implementation", () => {
  function fakeWindow(result: "open" | "blocked" = "open") {
    const opened: { url: string; target: string; child: { closed: boolean; opener: unknown; close(): void } }[] = [];
    g.window = {
      open(url: string, target: string) {
        if (result === "blocked") return null;
        const child = {
          closed: false,
          opener: {} as unknown,
          close() {
            child.closed = true;
          },
        };
        opened.push({ url, target, child });
        return child;
      },
    };
    return opened;
  }

  test("opens synchronously without an opener, one at a time, close() closes it", async () => {
    host = installMockHost({ platform: "web" });
    const opened = fakeWindow();
    const pending = browser.open({ url: "https://example.com/x" });
    expect(opened).toHaveLength(1); // inside the click's user activation
    await pending;
    expect(opened[0]).toMatchObject({ url: "https://example.com/x", target: "_blank" });
    expect(opened[0]!.child.opener).toBeNull();
    expect(isAkanNativeError(await rejection(browser.open({ url: "https://example.com/y" })), "INVALID_ARGS")).toBe(
      true,
    );
    await browser.close();
    expect(opened[0]!.child.closed).toBe(true);
    await browser.close(); // nothing open: fine
  });

  test("finished when the user closes the window, not after close()", async () => {
    host = installMockHost({ platform: "web" });
    const opened = fakeWindow();
    let finished = 0;
    const stop = browser.listen("finished", () => finished++);
    await browser.open({ url: "https://example.com" });
    opened[0]!.child.closed = true; // the user closed it
    await Bun.sleep(600);
    expect(finished).toBe(1);
    await browser.open({ url: "https://example.com" }); // a new one may open now
    await browser.close();
    await Bun.sleep(600);
    expect(finished).toBe(1);
    stop();
  });

  test("blocked popup: PERMISSION_DENIED; bad arguments: INVALID_ARGS", async () => {
    host = installMockHost({ platform: "web" });
    fakeWindow("blocked");
    expect(isAkanNativeError(await rejection(browser.open({ url: "https://example.com" })), "PERMISSION_DENIED")).toBe(
      true,
    );
    expect(isAkanNativeError(await rejection(browser.open({ url: "ftp://example.com" })), "INVALID_ARGS")).toBe(true);
    expect(
      isAkanNativeError(
        await rejection(browser.open({ url: "https://example.com", toolbarColor: "blue" })),
        "INVALID_ARGS",
      ),
    ).toBe(true);
  });
});

describe("browser desktop implementation", () => {
  const ctx = {} as DesktopContext;
  const mac = process.platform === "darwin";

  test.skipIf(!mac)(
    "open -u with the normalized URL; no close (not declared); finished can be listened to",
    async () => {
      const commands: string[][] = [];
      const run: Runner = async (argv) => {
        commands.push(argv);
        return { code: 0, stderr: "" };
      };
      const plugin = createDesktopBrowser(run);
      await plugin.methods.open!({ url: "https://example.com/a b" }, ctx);
      expect(commands).toEqual([["/usr/bin/open", "-u", "https://example.com/a%20b"]]);
      expect(plugin.methods.close).toBeUndefined(); // the page gets UNSUPPORTED: close is not among the desktop methods
      expect(
        isAkanNativeError(
          await rejection(Promise.resolve().then(() => plugin.methods.open!({ url: "file:///etc/hosts" }, ctx))),
          "INVALID_ARGS",
        ),
      ).toBe(true);
      expect(commands).toHaveLength(1);
      const stop = plugin.events!.finished!(() => {}, ctx);
      stop();
    },
  );

  test("Windows and Linux: the shell's shell.open op", async () => {
    const ops: unknown[] = [];
    const shell = {
      shell: async (op: string, args?: Record<string, unknown>) => void ops.push({ op, ...args }),
    } as unknown as DesktopContext;
    const commands: string[][] = [];
    const plugin = createDesktopBrowser(async (argv) => {
      commands.push(argv);
      return { code: 0, stderr: "" };
    }, "win32");
    await plugin.methods.open!({ url: "https://example.com/a b" }, shell);
    expect(
      isAkanNativeError(
        await rejection(Promise.resolve().then(() => plugin.methods.open!({ url: "mailto:a@b.c" }, shell))),
        "INVALID_ARGS",
      ),
    ).toBe(true);
    expect(ops).toEqual([{ op: "shell.open", url: "https://example.com/a%20b" }]);
    expect(commands).toEqual([]);
  });
});
