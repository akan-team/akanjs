import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import preferences from "../../../plugins/preferences/src/desktop.ts";
import { AkanNativeError } from "../../core/src/index.ts";
import { CallIds, createDispatcher } from "../src/dispatcher.ts";
import {
  type DesktopContext,
  defineDesktopPlugin,
  type EmitTarget,
  externalOpenAllowed,
  limitExternalOpens,
} from "../src/plugin.ts";

function setup() {
  const emitted: unknown[] = [];
  const stops: string[] = [];
  const ticker = defineDesktopPlugin<{ ping(args: { n: number }): Promise<number> }, { tick: number }>({
    id: "ticker",
    methods: { ping: ({ n }) => n + 1 },
    events: {
      tick(emit) {
        emit(1);
        return () => stops.push("tick");
      },
    },
  });
  const appDataDir = join(mkdtempSync(join(tmpdir(), "akan-native-desktop-")), "data");
  const dispatcher = createDispatcher([ticker, preferences], {
    app: { id: "dev.test", name: "Test", version: "1.0.0" },
    appDataDir,
    emit: (_window, { plugin, event, data }) => emitted.push({ plugin, event, data }),
    registerFile: (path, mime) => ({ url: `/__akan_native/file/x`, mime, size: 0 }),
  });
  let next = 100;
  const call = (plugin: string, method: string, args?: unknown, id = ++next) =>
    dispatcher.handle(JSON.stringify({ v: 1, id, plugin, method, args }));
  return { dispatcher, call, emitted, stops, appDataDir };
}

describe("desktop dispatcher", () => {
  test("calls methods and validates requests", async () => {
    const { call, dispatcher } = setup();
    expect(await call("ticker", "ping", { n: 1 }, 7)).toEqual({ v: 1, id: 7, ok: true, result: 2 });
    expect(await call("nope", "ping")).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await call("ticker", "nope")).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    // Object.prototype is no method or event source.
    for (const name of ["constructor", "toString", "hasOwnProperty"]) {
      expect(await call("ticker", name)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    }
    for (const event of ["constructor", "toString", "__proto__"]) {
      expect(await call("ticker", "$listen", { event })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    }
    expect(await dispatcher.handle("{bad json")).toMatchObject({ ok: false, error: { code: "INVALID_ARGS" } });
    expect(await dispatcher.handle(JSON.stringify({ v: 9, id: 3, plugin: "ticker", method: "ping" }))).toMatchObject({
      id: 3,
      ok: false,
      error: { code: "INVALID_ARGS" },
    });
  });

  test("reference counts event sources and stops them on page reset", async () => {
    const { call, dispatcher, emitted, stops } = setup();
    await call("ticker", "$listen", { event: "tick" });
    await call("ticker", "$listen", { event: "tick" });
    expect(emitted).toEqual([{ plugin: "ticker", event: "tick", data: 1 }]);
    await call("ticker", "$unlisten", { event: "tick" });
    expect(stops).toEqual([]);
    dispatcher.reset();
    expect(stops).toEqual(["tick"]);
    expect(await call("ticker", "$listen", { event: "nope" })).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
  });

  test("preferences desktop implementation persists to a JSON file", async () => {
    const { call, appDataDir } = setup();
    expect(await call("preferences", "get", { key: "a" })).toMatchObject({ ok: true, result: { value: null } });
    await call("preferences", "set", { key: "a", value: "1" });
    expect(await call("preferences", "get", { key: "a" })).toMatchObject({ result: { value: "1" } });
    expect(JSON.parse(readFileSync(join(appDataDir, "preferences.json"), "utf8"))).toEqual({ a: "1" });
    expect(await call("preferences", "set", { key: "", value: "1" })).toMatchObject({
      ok: false,
      error: { code: "INVALID_ARGS" },
    });
  });
});

test("an event source that fails to start is not left registered", async () => {
  let starts = 0;
  const flaky = defineDesktopPlugin<object, { tick: number }>({
    id: "flaky",
    methods: {},
    events: {
      tick() {
        if (++starts === 1) throw new Error("no device");
        return () => {};
      },
    },
  });
  const dispatcher = createDispatcher([flaky], {
    app: { id: "dev.test", name: "Test", version: "1.0.0" },
    appDataDir: join(mkdtempSync(join(tmpdir(), "akan-native-desktop-")), "data"),
    emit: () => {},
    registerFile: (_path, mime) => ({ url: "/__akan_native/file/x", mime, size: 0 }),
  });
  const listen = (id: number) =>
    dispatcher.handle(JSON.stringify({ v: 1, id, plugin: "flaky", method: "$listen", args: { event: "tick" } }));
  expect(await listen(1)).toMatchObject({ ok: false, error: { code: "INTERNAL" } });
  expect(await listen(2)).toEqual({ v: 1, id: 2, ok: true });
  expect(starts).toBe(2);
});

describe("documents (bridge v1.1)", () => {
  const DOC_A = "a".repeat(32);
  const DOC_B = "b".repeat(32);
  function docs() {
    const sent: { window: number; message: unknown }[] = [];
    const stops: string[] = [];
    let emit: ((n: number) => void) | null = null;
    const aborted: unknown[] = [];
    const plugin = defineDesktopPlugin<
      { ping(): Promise<string>; slow(): Promise<string>; wait(): Promise<string>; fail(): Promise<void> },
      { tick: number }
    >({
      id: "p",
      methods: {
        ping: () => "pong",
        slow: () => Bun.sleep(20).then(() => "late"),
        // Runs until the page gives up; the answer after that goes nowhere.
        wait: (_args, ctx) =>
          new Promise<string>((resolve) =>
            ctx.signal!.addEventListener("abort", () => {
              aborted.push(ctx.signal!.reason);
              resolve("too late");
            }),
          ),
        fail: () => {
          throw new AkanNativeError("UNSUPPORTED", "managed by the package manager", {
            data: { reason: "packageManaged" },
            retryable: false,
          });
        },
      },
      events: {
        tick(send) {
          emit = send;
          return () => void stops.push("tick");
        },
      },
    });
    const released: string[] = [];
    const dispatcher = createDispatcher([plugin], {
      app: { id: "t", name: "T", version: "1" },
      appDataDir: "/nonexistent",
      emit: (window, message) => void sent.push({ window, message }),
      registerFile: () => ({ url: "", mime: "", size: 0 }),
      releaseFile: (url) => released.push(url) > 0 && url.endsWith("known"),
      builtins: { $host: (req) => (req.method === "echo" ? req.args : Promise.reject(new Error("nope"))) },
    });
    const call = (doc: string, id: number, method: string, args?: unknown, window = 1, plugin = "p") =>
      dispatcher.handle(JSON.stringify({ v: 1, id, doc, plugin, method, args }), window);
    const bridge = (doc: string, id: number, method: string, args: unknown) =>
      call(doc, id, method, args, 1, "$bridge");
    return { dispatcher, call, bridge, sent, stops, aborted, released, emit: (n: number) => emit!(n) };
  }

  test("$bridge.cancel ends a running call now: the plugin's signal fires, TIMEOUT for a timeout (v1.1 cancel)", async () => {
    const d = docs();
    const waiting = d.call(DOC_A, 1, "wait");
    await Bun.sleep(1);
    expect(await d.bridge(DOC_A, 2, "cancel", { id: 1, reason: "abort" })).toMatchObject({
      ok: true,
      result: { cancelled: true },
    });
    expect(await waiting).toMatchObject({
      id: 1,
      ok: false,
      error: { code: "CANCELLED", message: "cancelled by the page" },
    });
    expect(d.aborted).toHaveLength(1);
    expect((d.aborted[0] as AkanNativeError).code).toBe("CANCELLED");
    const timed = d.call(DOC_A, 3, "wait");
    await Bun.sleep(1);
    await d.bridge(DOC_A, 4, "cancel", { id: 3, reason: "timeout" });
    expect(await timed).toMatchObject({ ok: false, error: { code: "TIMEOUT" } });
    // A finished call: nothing to cancel.
    await d.call(DOC_A, 5, "ping");
    expect(await d.bridge(DOC_A, 6, "cancel", { id: 5 })).toMatchObject({ result: { cancelled: false } });
  });

  test("a cancel that overtakes its call answers the call at once; another document cannot cancel it", async () => {
    const d = docs();
    await d.call(DOC_A, 1, "ping");
    expect(await d.bridge(DOC_A, 3, "cancel", { id: 2 })).toMatchObject({ result: { cancelled: false } });
    expect(await d.call(DOC_A, 2, "wait")).toMatchObject({ id: 2, ok: false, error: { code: "CANCELLED" } });
    expect(d.aborted).toEqual([]); // it never ran
    // The call ids are the document's: a new document's cancel ends the old document, whose calls end with it.
    const waiting = d.call(DOC_A, 4, "wait");
    await Bun.sleep(1);
    expect(await d.bridge(DOC_B, 1, "cancel", { id: 4 })).toMatchObject({ result: { cancelled: false } });
    expect(await waiting).toMatchObject({
      error: { code: "CANCELLED", message: "the page that made this call is gone" },
    });
  });

  test("$bridge.release drops a FileRef; errors carry data and retryable", async () => {
    const d = docs();
    expect(await d.bridge(DOC_A, 1, "release", { url: "/__akan_native/file/known" })).toMatchObject({
      ok: true,
      result: { released: true },
    });
    expect(await d.bridge(DOC_A, 2, "release", { url: "/__akan_native/file/other" })).toMatchObject({
      result: { released: false },
    });
    expect(d.released).toEqual(["/__akan_native/file/known", "/__akan_native/file/other"]);
    expect(await d.bridge(DOC_A, 3, "drop", {})).toMatchObject({
      ok: false,
      error: { code: "INVALID_ARGS", message: "unknown bridge operation $bridge.drop" },
    });
    expect(await d.call(DOC_A, 4, "fail")).toMatchObject({
      ok: false,
      error: { code: "UNSUPPORTED", data: { reason: "packageManaged" } },
    });
  });

  test("responses and events share the document's numbering", async () => {
    const d = docs();
    expect(await d.call(DOC_A, 1, "$listen", { event: "tick" })).toEqual({ v: 1, id: 1, ok: true, doc: DOC_A, seq: 1 });
    d.emit(5);
    expect(await d.call(DOC_A, 2, "ping")).toEqual({ v: 1, id: 2, ok: true, result: "pong", doc: DOC_A, seq: 3 });
    expect(d.sent).toEqual([{ window: 1, message: { v: 1, plugin: "p", event: "tick", data: 5, doc: DOC_A, seq: 2 } }]);
    d.dispatcher.emitTo(1, "$host", "echo", { n: 1 });
    expect(d.sent[1]).toEqual({
      window: 1,
      message: { v: 1, plugin: "$host", event: "echo", data: { n: 1 }, doc: DOC_A, seq: 4 },
    });
    const echo = await d.dispatcher.handle(
      JSON.stringify({ v: 1, id: 3, doc: DOC_A, plugin: "$host", method: "echo", args: { n: 2 } }),
    );
    expect(echo).toEqual({ v: 1, id: 3, ok: true, result: { n: 2 }, doc: DOC_A, seq: 5 });
  });

  test("a new document ends the previous one; the ended one is refused; ids run once", async () => {
    const d = docs();
    await d.call(DOC_A, 1, "$listen", { event: "tick" });
    const slow = d.call(DOC_A, 2, "slow");
    expect(await d.call(DOC_A, 1, "ping")).toEqual({
      v: 1,
      id: -1,
      ok: false,
      error: { code: "INVALID_ARGS", message: "request 1 was already received" },
    });
    expect(await d.call(DOC_B, 1, "ping")).toMatchObject({ id: 1, ok: true, doc: DOC_B, seq: 1 });
    expect(d.stops).toEqual(["tick"]); // the new page's first call ended the old page's subscription
    // Its calls ended with it (v1.1 cancel), unnumbered: that page is gone.
    expect(await slow).toEqual({
      v: 1,
      id: 2,
      ok: false,
      error: { code: "CANCELLED", message: "the page that made this call is gone" },
      doc: DOC_A,
    });
    expect(await d.call(DOC_A, 3, "ping")).toMatchObject({
      ok: false,
      error: { code: "INTERNAL", message: "the page that made this call is gone" },
    });
    // A commit (page load started) ends the document too; other windows keep theirs.
    await d.call(DOC_A.replace(/a/g, "c"), 1, "ping", undefined, 2);
    d.dispatcher.reset(1);
    expect(await d.call(DOC_B, 2, "ping")).toMatchObject({ ok: false, error: { code: "INTERNAL" } });
    expect(await d.call("c".repeat(32), 2, "ping", undefined, 2)).toMatchObject({ ok: true, seq: 2 });
  });

  test("inside a document with an id, a request without one is refused and takes no number", async () => {
    const d = docs();
    expect(await d.call(DOC_A, 1, "ping")).toMatchObject({ seq: 1 });
    const bare = await d.dispatcher.handle(JSON.stringify({ v: 1, id: 2, plugin: "p", method: "ping" }));
    expect(bare).toEqual({
      v: 1,
      id: 2,
      ok: false,
      error: { code: "INVALID_ARGS", message: "request has no document id" },
    });
    expect(await d.call(DOC_A, 2, "ping")).toMatchObject({ ok: true, seq: 2 }); // id 2 was not spent
  });

  test("a document's end closes what its calls own, last first, then the hooks; owning after the end closes at once", async () => {
    const order: string[] = [];
    let late: (() => void) | null = null;
    const plugin = defineDesktopPlugin<{ open(args: { name: string }): Promise<void>; openLate(): Promise<void> }>({
      id: "res",
      methods: {
        open: ({ name }, ctx) => void ctx.document!.own(() => void order.push(`close ${name}`)),
        // Finishes after its page left: what it opened is closed right away.
        openLate: (_args, ctx) =>
          new Promise<void>((resolve) => {
            late = () => {
              ctx.document!.own(() => void order.push("close late"));
              resolve();
            };
          }),
      },
      onDocumentEnd: (doc) => void order.push(`hook ${doc.window} ${doc.id.slice(0, 1)}`),
    });
    const broken = defineDesktopPlugin({
      id: "broken",
      methods: {},
      onDocumentEnd: () => {
        throw new Error("broken hook");
      },
    });
    const dispatcher = createDispatcher([plugin, broken], {
      app: { id: "t", name: "T", version: "1" },
      appDataDir: "/nonexistent",
      emit: () => {},
      registerFile: () => ({ url: "", mime: "", size: 0 }),
    });
    const call = (doc: string, id: number, method: string, args?: unknown) =>
      dispatcher.handle(JSON.stringify({ v: 1, id, doc, plugin: "res", method, args }));
    await call(DOC_A, 1, "open", { name: "one" });
    expect(await call(DOC_A, 2, "open", { name: "two" })).toMatchObject({ ok: true });
    const lateCall = call(DOC_A, 3, "openLate");
    await Bun.sleep(1);
    expect(dispatcher.stats()).toMatchObject({ documents: 1, running: 1, resources: 2 });
    await call(DOC_B, 1, "open", { name: "three" }); // a new page: the old one ends
    expect(order).toEqual(["close two", "close one", "hook 1 a"]);
    late!();
    await lateCall;
    expect(order.at(-1)).toBe("close late");
    dispatcher.reset(1);
    dispatcher.reset(1); // twice: nothing runs twice
    expect(order.filter((o) => o === "close three")).toHaveLength(1);
    expect(dispatcher.stats()).toMatchObject({ documents: 0, running: 0, resources: 0, ended: 2 });
  });

  test("coalescing events: the latest of a burst, sent before the next other message, in order", async () => {
    const sent: { window: number; message: { event: string; data?: unknown; seq?: number } }[] = [];
    let emit!: (n: number) => void;
    let other!: () => void;
    const plugin = defineDesktopPlugin<{ ping(): Promise<string> }, { progress: number; done: boolean }>({
      id: "dl",
      methods: { ping: () => "pong" },
      events: {
        progress(send) {
          emit = send;
          return () => {};
        },
        done(send) {
          other = () => void send(true);
          return () => {};
        },
      },
    });
    const dispatcher = createDispatcher(
      [plugin],
      {
        app: { id: "t", name: "T", version: "1" },
        appDataDir: "/nonexistent",
        emit: (window, message) => void sent.push({ window, message: message as never }),
        registerFile: () => ({ url: "", mime: "", size: 0 }),
      },
      { declarations: { dl: { methods: ["ping"], events: ["progress", "done"], coalesce: ["progress"] } } },
    );
    const call = (id: number, method: string, args?: unknown) =>
      dispatcher.handle(JSON.stringify({ v: 1, id, doc: DOC_A, plugin: "dl", method, args }));
    await call(1, "$listen", { event: "progress" });
    await call(2, "$listen", { event: "done" });
    for (let n = 1; n <= 50; n++) emit(n);
    expect(sent).toEqual([]); // waiting for a newer one
    other(); // another message: the waiting progress goes first
    for (let n = 51; n <= 60; n++) emit(n);
    const answer = await call(3, "ping"); // a response sends what waits, too
    expect(sent.map((s) => [s.message.event, s.message.data ?? null, s.message.seq])).toEqual([
      ["progress", 50, 3],
      ["done", true, 4],
      ["progress", 60, 5],
    ]);
    expect(answer).toMatchObject({ seq: 6 });
    emit(61);
    await Bun.sleep(150); // alone: after COALESCE_MS
    expect(sent.at(-1)!.message).toMatchObject({ event: "progress", data: 61, seq: 7 });
  });

  test("ids that overtake each other are all accepted once", () => {
    const ids = new CallIds();
    expect([5, 3, 4, 3, 5, 6].map((id) => ids.accept(id))).toEqual([true, true, true, false, false, true]);
    for (let id = 7; id < 3000; id++) ids.accept(id);
    expect(ids.accept(1000)).toBe(false); // below the floor
    expect(ids.accept(3000)).toBe(true);
  });
});

test("undeclared methods and events never reach the plugin (L2 declaration gate)", async () => {
  let reached = 0;
  const plugin = defineDesktopPlugin<
    { get(): Promise<number>; extra(): Promise<number> },
    { change: number; secret: number }
  >({
    id: "p",
    methods: { get: () => ++reached, extra: () => ++reached },
    events: { change: () => () => {}, secret: () => () => {} },
  });
  const d = createDispatcher(
    [plugin],
    {
      app: { id: "t", name: "T", version: "1" },
      appDataDir: "/nonexistent",
      emit() {},
      registerFile: () => ({ url: "", mime: "", size: 0 }),
    },
    {
      declarations: { p: { methods: ["get"], events: ["change"] } },
    },
  );
  const call = (id: number, method: string, args?: unknown) =>
    d.handle(JSON.stringify({ v: 1, id, plugin: "p", method, args }));
  expect(await call(1, "get")).toMatchObject({ ok: true, result: 1 });
  expect(await call(2, "extra")).toMatchObject({
    ok: false,
    error: { code: "NOT_FOUND", message: "method p.extra is not declared" },
  });
  expect(await call(3, "$listen", { event: "change" })).toMatchObject({ ok: true });
  expect(await call(4, "$listen", { event: "secret" })).toMatchObject({
    ok: false,
    error: { code: "NOT_FOUND", message: "event p.secret is not declared" },
  });
  expect(reached).toBe(1);
});

describe("launch phase", () => {
  const services = {
    app: { id: "t", name: "T", version: "1" },
    appDataDir: "/nonexistent",
    emit() {},
    registerFile: () => ({ url: "", mime: "", size: 0 }),
  };

  test("gate plugins set up first, in order; a gate that exits skips every other setup (N3)", async () => {
    const order: string[] = [];
    const gate = (id: string, exit?: number) =>
      defineDesktopPlugin({
        id,
        launchPhase: "gate",
        async setup(ctx) {
          await Bun.sleep(5);
          order.push(id);
          if (exit !== undefined) ctx.launch.exit(exit);
        },
        methods: {},
      });
    const other = defineDesktopPlugin({ id: "other", setup: () => void order.push("other"), methods: {} });
    expect(await createDispatcher([other, gate("g1"), gate("g2")], services).launched).toEqual({ window: {} });
    expect(order).toEqual(["g1", "g2", "other"]);
    order.length = 0;
    expect(await createDispatcher([other, gate("g1", 0), gate("g2")], services).launched).toEqual({
      window: {},
      exit: 0,
    });
    expect(order).toEqual(["g1"]);
  });

  test("waits for async setups, merges setWindow, keeps the first exit code", async () => {
    let finished = false;
    const slow = defineDesktopPlugin({
      id: "slow",
      async setup(ctx) {
        await Bun.sleep(30);
        ctx.launch.setWindow({ x: 10, y: 20 });
        finished = true;
      },
      methods: {},
    });
    const sync = defineDesktopPlugin({
      id: "sync",
      setup: (ctx) => ctx.launch.setWindow({ width: 800, maximized: true }),
      methods: {},
    });
    const launch = await createDispatcher([slow, sync], services).launched;
    expect(finished).toBe(true);
    expect(launch).toEqual({ window: { x: 10, y: 20, width: 800, maximized: true } });

    const exits = ["a", "b"].map((id, i) =>
      defineDesktopPlugin({ id, setup: (ctx) => ctx.launch.exit(i + 3), methods: {} }),
    );
    expect(await createDispatcher(exits, services).launched).toEqual({ window: {}, exit: 3 });
  });

  test("a failing or hanging setup does not hold the window; a late exit quits the app instead", async () => {
    let late: (() => void) | undefined;
    const broken = defineDesktopPlugin({
      id: "broken",
      setup() {
        throw new Error("boom");
      },
      methods: {},
    });
    const hangs = defineDesktopPlugin({
      id: "hangs",
      setup: (ctx) =>
        new Promise<void>(() => {
          late = () => ctx.launch.exit(1);
        }),
      methods: {},
    });
    const started = Date.now();
    const quits: number[] = [];
    const launch = await createDispatcher(
      [broken, hangs],
      { ...services, quit: (code) => void quits.push(code) },
      {
        setupTimeoutMs: 50,
      },
    ).launched;
    expect(Date.now() - started).toBeLessThan(1000);
    expect(launch).toEqual({ window: {} });
    late!();
    expect(launch).toEqual({ window: {} });
    expect(quits).toEqual([1]);
  });

  test("a page's call to a plugin still setting up waits for it; past the wait it is retryable", async () => {
    let ready!: () => void;
    const slow = defineDesktopPlugin<{ ping(): Promise<string> }>({
      id: "slow",
      setup: () => new Promise<void>((resolve) => (ready = resolve)),
      methods: { ping: () => "pong" },
    });
    const dispatcher = createDispatcher([slow], services, { setupTimeoutMs: 10, setupWaitMs: 30 });
    await dispatcher.launched; // the window came before the setup finished
    const call = () => dispatcher.handle(JSON.stringify({ v: 1, id: 1, plugin: "slow", method: "ping" }));
    expect(await call()).toMatchObject({ ok: false, error: { code: "INTERNAL", retryable: true } });
    const waiting = call();
    ready();
    expect(await waiting).toMatchObject({ ok: true, result: "pong" });
  });
});

describe("windows (SH-6)", () => {
  function multi(focusOrder: number[] = []) {
    const delivered: { event: string; data: unknown; window: number }[] = [];
    const shellCalls: { op: string; args?: Record<string, unknown> }[] = [];
    const emits: ((data: number, target?: EmitTarget) => number[] | void)[] = [];
    let stops = 0;
    let caller: DesktopContext | undefined;
    const plugin = defineDesktopPlugin<
      { whoami(): Promise<number | undefined>; poke(args: { window?: number }): Promise<void> },
      { tick: number; other: number }
    >({
      id: "p",
      methods: {
        whoami: (_args, ctx) => {
          caller = ctx;
          return ctx.window;
        },
        poke: async (args, ctx) => void (await ctx.shell("window.focus", args ?? {})),
      },
      events: {
        tick(emit) {
          emits.push(emit);
          return () => void stops++;
        },
        other: () => () => {},
      },
    });
    const dispatcher = createDispatcher([plugin], {
      app: { id: "t", name: "T", version: "1" },
      appDataDir: "/nonexistent",
      emit: (window, { event, data }) => void delivered.push({ event, data, window }),
      registerFile: () => ({ url: "", mime: "", size: 0 }),
      shell: async (op, args) => void shellCalls.push({ op, args }),
      focusOrder: () => focusOrder,
    });
    let next = 0;
    const call = (method: string, window: number, args?: unknown) =>
      dispatcher.handle(JSON.stringify({ v: 1, id: ++next, plugin: "p", method, args }), window);
    return { dispatcher, call, delivered, shellCalls, emits, stops: () => stops, caller: () => caller };
  }

  test("one source for every window; events reach subscribers, one window, or the focused one", async () => {
    const m = multi([3, 2]);
    await m.call("$listen", 1, { event: "tick" });
    await m.call("$listen", 2, { event: "tick" });
    await m.call("$listen", 3, { event: "other" });
    expect(m.emits).toHaveLength(1);
    const emit = m.emits[0]!;
    expect(emit(1)).toEqual([1, 2]);
    expect(emit(2, { window: 2 })).toEqual([2]);
    expect(emit(3, { window: 3 })).toEqual([]); // window 3 does not listen to tick
    expect(emit(4, "focused")).toEqual([2]); // 3 is focused but does not listen
    expect(m.delivered).toEqual([
      { event: "tick", data: 1, window: 1 },
      { event: "tick", data: 1, window: 2 },
      { event: "tick", data: 2, window: 2 },
      { event: "tick", data: 4, window: 2 },
    ]);
  });

  test("a reload in one window keeps the other windows' subscriptions; the source stops with the last", async () => {
    const m = multi();
    await m.call("$listen", 1, { event: "tick" });
    await m.call("$listen", 2, { event: "tick" });
    m.dispatcher.reset(1);
    expect(m.stops()).toBe(0);
    expect(m.emits[0]!(1)).toEqual([2]);
    await m.call("$unlisten", 2, { event: "tick" });
    expect(m.stops()).toBe(1);
    await m.call("$listen", 1, { event: "tick" });
    m.dispatcher.reset();
    expect(m.stops()).toBe(2);
  });

  test("method calls know their window; window ops default to it unless args name one", async () => {
    const m = multi();
    expect(await m.call("whoami", 2)).toMatchObject({ ok: true, result: 2 });
    expect(m.caller()!.app.id).toBe("t"); // the base context's fields stay reachable
    await m.call("poke", 2);
    await m.call("poke", 2, { window: 5 });
    expect(m.shellCalls).toEqual([
      { op: "window.focus", args: { window: 2 } },
      { op: "window.focus", args: { window: 5 } },
    ]);
  });
});

describe("capabilities (PL-11, plugins.md C7)", () => {
  const services = {
    app: { id: "t", name: "T", version: "1" },
    appDataDir: "/nonexistent",
    emit() {},
    registerFile: () => ({ url: "", mime: "", size: 0 }),
  };
  const seen: unknown[] = [];
  const fsPlugin = defineDesktopPlugin<
    { read(a: { path: string }): Promise<string>; remove(a: { path: string }): Promise<void> },
    { change: number }
  >({
    id: "fs",
    methods: {
      read: ({ path }, ctx) => (seen.push({ window: ctx.window, scope: ctx.scope }), path),
      remove: () => {},
    },
    events: { change: () => () => {} },
  });
  const acl = {
    grants: [
      { plugin: "fs", windows: [1] as number[], items: ["read", "listen:change"], allow: [{ path: "notes/**" }] },
      { plugin: "fs", windows: "*" as const, items: ["remove"] },
    ],
    denied: { fs: ["remove"] },
  };
  const call = (d: ReturnType<typeof createDispatcher>, method: string, args: unknown, window: number) =>
    d.handle(JSON.stringify({ v: 1, id: 9, plugin: "fs", method, args }), window);

  test("grants per window, deny wins, scope reaches the plugin, $listen checked, $unlisten free", async () => {
    const d = createDispatcher([fsPlugin], services, { acl });
    seen.length = 0;
    expect(await call(d, "read", { path: "notes/a" }, 1)).toEqual({ v: 1, id: 9, ok: true, result: "notes/a" });
    expect(seen).toEqual([{ window: 1, scope: { allow: [{ path: "notes/**" }], deny: [] } }]);
    expect(await call(d, "read", { path: "x" }, 2)).toMatchObject({ ok: false, error: { code: "NOT_ALLOWED" } });
    expect(await call(d, "remove", { path: "x" }, 1)).toMatchObject({
      ok: false,
      error: { code: "NOT_ALLOWED", message: "fs.remove() is not allowed by the app's capabilities" },
    });
    expect(await call(d, "$listen", { event: "change" }, 1)).toMatchObject({ ok: true });
    expect(await call(d, "$listen", { event: "change" }, 2)).toMatchObject({
      ok: false,
      error: { code: "NOT_ALLOWED", message: "fs.change events is not allowed by the app's capabilities" },
    });
    expect(await call(d, "$unlisten", { event: "change" }, 2)).toMatchObject({ ok: true });
    // An unregistered plugin is still NOT_FOUND, before any ACL question.
    expect(await d.handle(JSON.stringify({ v: 1, id: 1, plugin: "nope", method: "x" }), 1)).toMatchObject({
      error: { code: "NOT_FOUND" },
    });
  });

  test("no ACL: everything allowed, no scope", async () => {
    const d = createDispatcher([fsPlugin], services);
    seen.length = 0;
    expect(await call(d, "remove", { path: "x" }, 3)).toMatchObject({ ok: true });
    await call(d, "read", { path: "y" }, 3);
    expect(seen).toEqual([{ window: 3, scope: undefined }]);
  });
});

test("plugins' external opens: at most one a second (L0)", () => {
  limitExternalOpens(true);
  expect([
    externalOpenAllowed(0),
    externalOpenAllowed(500),
    externalOpenAllowed(999),
    externalOpenAllowed(1000),
    externalOpenAllowed(1500),
  ]).toEqual([true, false, false, true, false]);
  limitExternalOpens(true);
});

test("FileRefs never serve the app's own storage (L4)", async () => {
  const { reservedDirs } = await import("../src/paths.ts");
  expect(reservedDirs("dev.x", "darwin", {}, "/Users/u")).toEqual([
    {
      root: "/Users/u/Library/Application Support/dev.x",
      except: ["/Users/u/Library/Application Support/dev.x/files"],
    },
  ]);
  expect(reservedDirs("dev.x", "linux", {}, "/home/u").map((d) => d.root)).toEqual([
    "/home/u/.local/share/dev.x",
    "/home/u/.local/share/dev.x/webview",
  ]);
});
