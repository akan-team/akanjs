import { afterEach, describe, expect, test } from "bun:test";
import { pluginDecls } from "../../../packages/cli/src/lib/native-plugins.ts";
import { AkanNativeError, isAkanNativeError } from "../../../packages/core/src/index.ts";
import { installMockHost, type MockHost } from "../../../packages/core/src/testing.ts";
import type { DesktopContext } from "../../../packages/desktop/src/plugin.ts";
import manifest from "../native-plugin.json";
import { CAFFEINATE, type Child, createDesktopKeepAwake } from "../src/desktop.ts";
import { holdKeepAwake, keepAwake } from "../src/index.ts";

const g = globalThis as { document?: unknown };
const nav = navigator as unknown as { wakeLock?: unknown };
let host: MockHost | null = null;

afterEach(async () => {
  host?.uninstall();
  host = null;
  delete g.document;
  delete nav.wakeLock;
});

const rejection = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: unknown) => e,
  );
const tick = () => new Promise((r) => setTimeout(r, 1));

describe("keep-awake routing", () => {
  test("native hosts get every method", async () => {
    let on = false;
    host = installMockHost({
      platform: "android",
      plugins: {
        "keep-awake": {
          methods: {
            keepAwake: () => {
              on = true;
            },
            allowSleep: () => {
              on = false;
            },
            isKeptAwake: () => ({ value: on }),
          },
        },
      },
    });
    await keepAwake.keepAwake();
    expect(await keepAwake.isKeptAwake()).toEqual({ value: true });
    await keepAwake.allowSleep();
    expect(await keepAwake.isKeptAwake()).toEqual({ value: false });
    expect(host.requests.map((r) => r.method)).toEqual(["keepAwake", "isKeptAwake", "allowSleep", "isKeptAwake"]);
  });

  test("manifest: every platform implements everything", () => {
    const plugin = { spec: "keep-awake", dir: `${import.meta.dir}/..`, manifest: manifest as never };
    const all = { methods: ["keepAwake", "allowSleep", "isKeptAwake"], events: [] };
    for (const platform of ["ios", "android", "macos"] as const)
      expect(pluginDecls([plugin], platform)).toEqual({ "keep-awake": all });
  });

  test("holders: the first calls keepAwake, the last release allowSleep, StrictMode remounts do not toggle", async () => {
    const calls: string[] = [];
    host = installMockHost({
      platform: "ios",
      plugins: {
        "keep-awake": {
          methods: {
            keepAwake: () => void calls.push("on"),
            allowSleep: () => void calls.push("off"),
            isKeptAwake: () => ({ value: false }),
          },
        },
      },
    });
    const a = holdKeepAwake();
    const b = holdKeepAwake();
    void a();
    const c = holdKeepAwake(); // remount before the deferred release ran
    await tick();
    expect(calls).toEqual(["on"]);
    void b();
    await c();
    expect(calls).toEqual(["on", "off"]);
    await c(); // releasing twice does nothing
    expect(calls).toEqual(["on", "off"]);
  });
});

describe("keep-awake web implementation", () => {
  class FakeSentinel extends EventTarget {
    released = false;
    async release() {
      this.released = true;
      this.dispatchEvent(new Event("release"));
    }
  }

  function fakePage(options: { refuse?: boolean; visible?: boolean } = {}) {
    const doc = Object.assign(new EventTarget(), { visibilityState: options.visible === false ? "hidden" : "visible" });
    g.document = doc;
    const sentinels: FakeSentinel[] = [];
    let syncCalls = 0;
    Object.defineProperty(nav, "wakeLock", {
      configurable: true,
      value: {
        request(type: string) {
          syncCalls++;
          expect(type).toBe("screen");
          if (options.refuse)
            return Promise.reject(Object.assign(new Error("Wake lock refused"), { name: "NotAllowedError" }));
          const s = new FakeSentinel();
          sentinels.push(s);
          return Promise.resolve(s);
        },
      },
    });
    const setVisible = (visible: boolean) => {
      doc.visibilityState = visible ? "visible" : "hidden";
      doc.dispatchEvent(new Event("visibilitychange"));
    };
    return { sentinels, setVisible, calls: () => syncCalls };
  }

  test("without navigator.wakeLock keepAwake is UNSUPPORTED", async () => {
    host = installMockHost({ platform: "web" });
    g.document = Object.assign(new EventTarget(), { visibilityState: "visible" });
    expect(isAkanNativeError(await rejection(keepAwake.keepAwake()), "UNSUPPORTED")).toBe(true);
    expect(await keepAwake.isKeptAwake()).toEqual({ value: false });
    await keepAwake.allowSleep();
  });

  test("requests synchronously, re-acquires after the page was hidden, releases on allowSleep", async () => {
    host = installMockHost({ platform: "web" });
    const page = fakePage();
    const pending = keepAwake.keepAwake();
    expect(page.calls()).toBe(1); // inside the caller's user activation
    await pending;
    expect(await keepAwake.isKeptAwake()).toEqual({ value: true });
    await keepAwake.keepAwake(); // idempotent
    expect(page.sentinels).toHaveLength(1);

    // The browser drops the lock with the page hidden, the plugin takes it again when visible.
    await page.sentinels[0]!.release();
    page.setVisible(false);
    expect(await keepAwake.isKeptAwake()).toEqual({ value: true });
    page.setVisible(true);
    await tick();
    expect(page.sentinels).toHaveLength(2);

    await keepAwake.allowSleep();
    expect(page.sentinels[1]!.released).toBe(true);
    expect(await keepAwake.isKeptAwake()).toEqual({ value: false });
    page.setVisible(true); // no listener any more
    await tick();
    expect(page.sentinels).toHaveLength(2);
  });

  test("a refused lock is PERMISSION_DENIED and not kept", async () => {
    host = installMockHost({ platform: "web" });
    fakePage({ refuse: true });
    expect(isAkanNativeError(await rejection(keepAwake.keepAwake()), "PERMISSION_DENIED")).toBe(true);
    expect(await keepAwake.isKeptAwake()).toEqual({ value: false });
  });

  test("called while hidden: the lock is taken once the page is visible", async () => {
    host = installMockHost({ platform: "web" });
    const page = fakePage({ visible: false });
    await keepAwake.keepAwake();
    expect(page.calls()).toBe(0);
    page.setVisible(true);
    await tick();
    expect(page.sentinels).toHaveLength(1);
    await keepAwake.allowSleep();
  });
});

describe("keep-awake desktop implementation", () => {
  const ctx = {} as DesktopContext;
  const mac = process.platform === "darwin";

  function recorder() {
    const commands: string[][] = [];
    const children: { killed: boolean; child: Child }[] = [];
    const plugin = createDesktopKeepAwake((argv) => {
      commands.push(argv);
      let exit!: (code: number) => void;
      const exited = new Promise<number>((r) => (exit = r));
      const entry = {
        killed: false,
        child: {
          exitCode: null as number | null,
          kill() {
            entry.killed = true;
            entry.child.exitCode = 143;
            exit(143);
          },
          exited,
        },
      };
      children.push(entry);
      return entry.child;
    }, 4242);
    return { commands, children, plugin };
  }

  test.skipIf(!mac)("caffeinate -d -i -w <app pid>, once; allowSleep kills it", async () => {
    const { commands, children, plugin } = recorder();
    await plugin.methods.keepAwake!(undefined, ctx);
    await plugin.methods.keepAwake!(undefined, ctx);
    expect(commands).toEqual([[CAFFEINATE, "-d", "-i", "-w", "4242"]]);
    expect(await plugin.methods.isKeptAwake!(undefined, ctx)).toEqual({ value: true });
    await plugin.methods.allowSleep!(undefined, ctx);
    expect(children[0]!.killed).toBe(true);
    expect(await plugin.methods.isKeptAwake!(undefined, ctx)).toEqual({ value: false });
    await plugin.methods.allowSleep!(undefined, ctx); // nothing to stop
  });

  test.skipIf(!mac)("a caffeinate that died is restarted", async () => {
    const { commands, children, plugin } = recorder();
    await plugin.methods.keepAwake!(undefined, ctx);
    children[0]!.child.kill(); // e.g. killed from Activity Monitor
    expect(await plugin.methods.isKeptAwake!(undefined, ctx)).toEqual({ value: false });
    await plugin.methods.keepAwake!(undefined, ctx);
    expect(commands).toHaveLength(2);
    await plugin.methods.allowSleep!(undefined, ctx);
  });

  test("Windows and Linux: power.preventSleep once, power.allowSleep once; errors of preventSleep reach the page", async () => {
    const ops: string[] = [];
    let refuse = false;
    const shell = {
      async shell(op: string) {
        ops.push(op);
        if (refuse) throw new AkanNativeError("UNSUPPORTED", "no inhibit service on the session bus");
        return null;
      },
    } as unknown as DesktopContext;
    const plugin = createDesktopKeepAwake(undefined, 1, "linux");
    await plugin.methods.allowSleep!(undefined, shell); // nothing held: no op
    await plugin.methods.keepAwake!(undefined, shell);
    await plugin.methods.keepAwake!(undefined, shell);
    expect(await plugin.methods.isKeptAwake!(undefined, shell)).toEqual({ value: true });
    await plugin.methods.allowSleep!(undefined, shell);
    expect(await plugin.methods.isKeptAwake!(undefined, shell)).toEqual({ value: false });
    expect(ops).toEqual(["power.preventSleep", "power.allowSleep"]);
    refuse = true;
    expect(
      isAkanNativeError(
        await rejection(Promise.resolve().then(() => plugin.methods.keepAwake!(undefined, shell))),
        "UNSUPPORTED",
      ),
    ).toBe(true);
    expect(await plugin.methods.isKeptAwake!(undefined, shell)).toEqual({ value: false });
  });

  test("document scope: a page that ends lets go; the display stays on while another window's page holds it", async () => {
    const ops: string[] = [];
    const page = (window: number, id: string) => {
      const owned: (() => unknown)[] = [];
      const ctx = {
        window,
        document: {
          id,
          window,
          ended: false,
          own: (fn: () => unknown) => (owned.push(fn), () => owned.splice(owned.indexOf(fn), 1)),
        },
        shell: async (op: string) => void ops.push(op),
      } as unknown as DesktopContext;
      return { ctx, end: () => Promise.all(owned.splice(0).map((fn) => fn())) };
    };
    const plugin = createDesktopKeepAwake(undefined, 1, "win32");
    const a = page(1, "a".repeat(32));
    const b = page(2, "b".repeat(32));
    await plugin.methods.keepAwake!(undefined, a.ctx);
    await plugin.methods.keepAwake!(undefined, b.ctx);
    await a.end(); // window 1 reloaded
    expect(await plugin.methods.isKeptAwake!(undefined, a.ctx)).toEqual({ value: true });
    await plugin.methods.allowSleep!(undefined, a.ctx); // that page no longer holds it: no effect
    expect(ops).toEqual(["power.preventSleep"]);
    await b.end();
    expect(ops).toEqual(["power.preventSleep", "power.allowSleep"]);
    expect(await plugin.methods.isKeptAwake!(undefined, b.ctx)).toEqual({ value: false });
    // allowSleep forgets the page's claim: its end later changes nothing.
    const c = page(1, "c".repeat(32));
    await plugin.methods.keepAwake!(undefined, c.ctx);
    await plugin.methods.allowSleep!(undefined, c.ctx);
    await c.end();
    expect(ops).toEqual(["power.preventSleep", "power.allowSleep", "power.preventSleep", "power.allowSleep"]);
  });

  // Real assertion for a moment: `pmset -g assertions` lists it under caffeinate.
  test.skipIf(!mac)("the real caffeinate holds PreventUserIdleDisplaySleep on behalf of the app", async () => {
    let pid = 0;
    const plugin = createDesktopKeepAwake((argv) => {
      const proc = Bun.spawn(argv, { stdin: "ignore", stdout: "ignore", stderr: "ignore" });
      pid = proc.pid;
      return proc;
    });
    await plugin.methods.keepAwake!(undefined, ctx);
    try {
      await Bun.sleep(300);
      const out = await new Response(
        Bun.spawn(["/usr/bin/pmset", "-g", "assertions"], { stdout: "pipe" }).stdout,
      ).text();
      const mine = out.split(/\n(?=\s*pid )/).filter((entry) => entry.includes(`pid ${pid}(caffeinate)`));
      expect(mine.some((e) => e.includes("PreventUserIdleDisplaySleep"))).toBe(true);
      expect(mine.every((e) => e.includes(`on behalf of Process ID ${process.pid}`))).toBe(true);
    } finally {
      await plugin.methods.allowSleep!(undefined, ctx);
    }
    expect(await plugin.methods.isKeptAwake!(undefined, ctx)).toEqual({ value: false });
  });
});
