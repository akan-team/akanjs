import { afterEach, describe, expect, test } from "bun:test";
import { pluginDecls } from "../../../packages/cli/src/lib/native-plugins.ts";
import { AkanNativeError, isAkanNativeError } from "../../../packages/core/src/index.ts";
import { installMockHost, type MockHost } from "../../../packages/core/src/testing.ts";
import type { DesktopContext } from "../../../packages/desktop/src/plugin.ts";
import { limitExternalOpens } from "../../../packages/desktop/src/plugin.ts";
import manifest from "../native-plugin.json";
import { createDesktopOpener, type Runner } from "../src/desktop.ts";
import { opener } from "../src/index.ts";
import { checkUrl } from "../src/url.ts";

// Opens in a row: the one-per-second limit (L0) is tested in packages/desktop.
limitExternalOpens(false);

let host: MockHost | null = null;
afterEach(() => {
  host?.uninstall();
  host = null;
  delete (globalThis as { window?: unknown }).window;
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

describe("opener URL policy", () => {
  test("accepts http, https, mailto and tel, normalizing the scheme", () => {
    expect(checkUrl("HTTPS://Example.com/a?b=1").href).toBe("https://example.com/a?b=1");
    expect(checkUrl("http://localhost:3000").protocol).toBe("http:");
    expect(checkUrl("mailto:someone@example.com?subject=Hi").protocol).toBe("mailto:");
    expect(checkUrl("tel:+821012345678").protocol).toBe("tel:");
  });

  test("rejects everything else with INVALID_ARGS", () => {
    for (const url of [
      "",
      "example.com",
      "/relative",
      "file:///etc/hosts",
      "javascript:alert(1)",
      "sms:123",
      "akansample://x",
      "https://",
    ]) {
      expect(codeOf(() => checkUrl(url))).toBe("INVALID_ARGS");
    }
    expect(codeOf(() => checkUrl(undefined))).toBe("INVALID_ARGS");
    expect(codeOf(() => checkUrl(42))).toBe("INVALID_ARGS");
  });
});

describe("opener routing", () => {
  test("native hosts get { url }", async () => {
    const seen: unknown[] = [];
    host = installMockHost({
      platform: "ios",
      plugins: {
        opener: {
          methods: {
            openUrl: (args) => void seen.push(args),
            canOpenUrl: () => ({ value: false }),
            openSettings: () => void seen.push("settings"),
          },
        },
      },
    });
    await opener.openUrl({ url: "https://example.com" });
    expect(await opener.canOpenUrl({ url: "tel:1" })).toEqual({ value: false });
    await opener.openSettings();
    expect(seen).toEqual([{ url: "https://example.com" }, "settings"]);
  });

  test("manifest: Android leaves out canOpenUrl, the other hosts implement everything", () => {
    const plugin = { spec: "opener", dir: `${import.meta.dir}/..`, manifest: manifest as never };
    const all = ["openUrl", "canOpenUrl", "openSettings"];
    expect(pluginDecls([plugin], "ios")).toEqual({ opener: { methods: all, events: [] } });
    expect(pluginDecls([plugin], "macos")).toEqual({ opener: { methods: all, events: [] } });
    expect(pluginDecls([plugin], "android")).toEqual({ opener: { methods: ["openUrl", "openSettings"], events: [] } });
  });

  test("on Android canOpenUrl is UNSUPPORTED", async () => {
    host = installMockHost({
      platform: "android",
      plugins: { opener: { methods: { openUrl: () => {}, openSettings: () => {} } } },
    });
    expect(opener.isSupported("canOpenUrl")).toBe(false);
    expect(isAkanNativeError(await rejection(opener.canOpenUrl({ url: "https://example.com" })), "UNSUPPORTED")).toBe(
      true,
    );
  });
});

describe("opener web implementation", () => {
  function fakeWindow(result: object | null) {
    const opened: string[] = [];
    const win = {
      location: { href: "https://app.example/" },
      open(url: string, target: string) {
        opened.push(`${target} ${url}`);
        return result;
      },
    };
    (globalThis as { window?: unknown }).window = win;
    return { win, opened };
  }

  test("http(s) opens a new window without an opener", async () => {
    host = installMockHost({ platform: "web" });
    const child = { opener: {} as unknown };
    const { opened } = fakeWindow(child);
    const opening = opener.openUrl({ url: "https://example.com/x" });
    expect(opened).toEqual(["_blank https://example.com/x"]); // synchronous: inside the click's user activation
    await opening;
    expect(child.opener).toBeNull();
  });

  test("a blocked popup is PERMISSION_DENIED; mailto navigates instead", async () => {
    host = installMockHost({ platform: "web" });
    const { win, opened } = fakeWindow(null);
    expect(
      isAkanNativeError(await rejection(opener.openUrl({ url: "https://example.com" })), "PERMISSION_DENIED"),
    ).toBe(true);
    await opener.openUrl({ url: "mailto:a@example.com" });
    expect(win.location.href).toBe("mailto:a@example.com");
    expect(opened).toHaveLength(1);
  });

  test("validation, canOpenUrl and the missing openSettings", async () => {
    host = installMockHost({ platform: "web" });
    fakeWindow({});
    expect(isAkanNativeError(await rejection(opener.openUrl({ url: "file:///etc/passwd" })), "INVALID_ARGS")).toBe(
      true,
    );
    expect(await opener.canOpenUrl({ url: "tel:123" })).toEqual({ value: true });
    expect(opener.isSupported("openSettings")).toBe(false);
    expect(isAkanNativeError(await rejection(opener.openSettings()), "UNSUPPORTED")).toBe(true);
  });
});

describe("opener desktop implementation", () => {
  const ctx = {} as DesktopContext;
  const mac = process.platform === "darwin";

  function recorder(reply: Partial<Awaited<ReturnType<Runner>>> = {}) {
    const commands: string[][] = [];
    const run: Runner = async (argv) => {
      commands.push(argv);
      return { code: 0, stdout: "", stderr: "", ...reply };
    };
    return { commands, plugin: createDesktopOpener(run) };
  }

  test("capabilities scope (PL-11): openUrl only inside the url globs, on the normalized URL", async () => {
    const { commands, plugin } = recorder();
    const scoped = {
      scope: {
        allow: [{ url: "https://example.com/*" }, { url: "mailto:*" }],
        deny: [{ url: "https://example.com/admin*" }],
      },
    } as unknown as DesktopContext;
    const code = (url: string) =>
      Promise.resolve()
        .then(() => plugin.methods.openUrl!({ url }, scoped))
        .then(
          () => "ok",
          (e) => (e as { code?: string }).code,
        );
    expect(await code("https://evil.example.org/")).toBe("NOT_ALLOWED");
    expect(await code("https://example.com/admin/users")).toBe("NOT_ALLOWED");
    expect(await code("tel:123")).toBe("NOT_ALLOWED");
    if (mac) {
      expect(await code("HTTPS://EXAMPLE.COM")).toBe("ok"); // normalized to https://example.com/
      expect(await code("mailto:a@b.c")).toBe("ok");
      expect(commands.length).toBe(2);
    }
  });

  test("validates before running anything", async () => {
    const { commands, plugin } = recorder();
    const error = await rejection(
      Promise.resolve().then(() => plugin.methods.openUrl!({ url: "file:///Applications/Calculator.app" }, ctx)),
    );
    expect(isAkanNativeError(error, "INVALID_ARGS")).toBe(true);
    expect(commands).toEqual([]);
  });

  test.skipIf(!mac)("openUrl and openSettings run open -u; an unclaimed URL is NOT_FOUND", async () => {
    const { commands, plugin } = recorder();
    await plugin.methods.openUrl!({ url: "https://example.com/a b" }, ctx);
    await plugin.methods.openSettings!(undefined, ctx);
    expect(commands).toEqual([
      ["/usr/bin/open", "-u", "https://example.com/a%20b"],
      ["/usr/bin/open", "-u", "x-apple.systempreferences:com.apple.preference.security"],
    ]);

    const failing = recorder({ code: 1, stderr: "No application knows how to open URL tel:1 (… Code=-10814 …)" });
    expect(
      isAkanNativeError(
        await rejection(Promise.resolve(failing.plugin.methods.openUrl!({ url: "tel:1" }, ctx))),
        "NOT_FOUND",
      ),
    ).toBe(true);
  });

  test("Windows and Linux: shell.open and shell.handler; openSettings per OS", async () => {
    const ops: unknown[] = [];
    let app: string | null = "firefox.desktop";
    const shell = {
      async shell(op: string, args?: Record<string, unknown>) {
        ops.push({ op, ...args });
        if (op === "shell.handler") return { app };
        if (op === "shell.open" && args?.url === "tel:1")
          throw new AkanNativeError("NOT_FOUND", "no app is registered for tel:");
        return null;
      },
    } as unknown as DesktopContext;
    const commands: string[][] = [];
    const run: Runner = async (argv) => {
      commands.push(argv);
      return { code: 0, stdout: "", stderr: "" };
    };
    const linux = createDesktopOpener(run, "linux");
    await linux.methods.openUrl!({ url: "https://example.com/a b" }, shell);
    expect(await linux.methods.canOpenUrl!({ url: "mailto:a@b.c" }, shell)).toEqual({ value: true });
    app = null;
    expect(await linux.methods.canOpenUrl!({ url: "tel:1" }, shell)).toEqual({ value: false });
    expect(
      isAkanNativeError(
        await rejection(Promise.resolve().then(() => linux.methods.openUrl!({ url: "tel:1" }, shell))),
        "NOT_FOUND",
      ),
    ).toBe(true);
    expect(
      isAkanNativeError(
        await rejection(Promise.resolve().then(() => linux.methods.openSettings!(undefined, shell))),
        "UNSUPPORTED",
      ),
    ).toBe(true);
    await createDesktopOpener(run, "win32").methods.openSettings!(undefined, shell);
    expect(ops).toEqual([
      { op: "shell.open", url: "https://example.com/a%20b" },
      { op: "shell.handler", url: "mailto:a@b.c" },
      { op: "shell.handler", url: "tel:1" },
      { op: "shell.open", url: "tel:1" },
      { op: "shell.open", url: "ms-settings:privacy" },
    ]);
    expect(commands).toEqual([]);
  });

  // Real LaunchServices lookup: shows no UI and opens nothing.
  test.skipIf(!mac)("canOpenUrl asks LaunchServices", async () => {
    const plugin = createDesktopOpener();
    expect(await plugin.methods.canOpenUrl!({ url: "https://example.com" }, ctx)).toEqual({ value: true });
    const { value } = await plugin.methods.canOpenUrl!({ url: "tel:123" }, ctx);
    expect(typeof value).toBe("boolean");
  });
});
