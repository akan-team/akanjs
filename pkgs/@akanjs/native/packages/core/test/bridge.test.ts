import { afterEach, describe, expect, test } from "bun:test";
import { createLiveValue, definePlugin, defineWebPlugin, env, isAkanNativeError, platform } from "../src/index.ts";
import { validateRequest } from "../src/protocol.ts";
import { installPrint, resetRuntime } from "../src/runtime.ts";
import { installMockHost, type MockHost } from "../src/testing.ts";

interface EchoApi {
  echo(args: { text: string }): Promise<{ text: string }>;
  fail(): Promise<void>;
  onlyWeb(): Promise<string>;
}
interface EchoEvents {
  tick: { n: number };
}

const webStarts: string[] = [];
const echoWeb = defineWebPlugin<EchoApi, EchoEvents>({
  methods: {
    echo: async ({ text }) => ({ text: `web:${text}` }),
    onlyWeb: async () => "web-only",
  },
  events: {
    tick(emit) {
      webStarts.push("start");
      const timer = setInterval(() => emit({ n: 1 }), 1);
      return () => {
        webStarts.push("stop");
        clearInterval(timer);
      };
    },
  },
});

const echo = definePlugin<EchoApi, EchoEvents>("echo", {
  methods: ["echo", "fail", "onlyWeb"],
  events: ["tick"],
  web: echoWeb,
});

const tick = () => new Promise((r) => setTimeout(r, 5));

let host: MockHost | null = null;
afterEach(() => {
  host?.uninstall();
  host = null;
  webStarts.length = 0;
  resetRuntime();
});

describe("web platform (no init.js)", () => {
  test("routes to the web implementation", async () => {
    resetRuntime();
    expect(echo.implementation("echo")).toBe("web");
    expect(await echo.echo({ text: "hi" })).toEqual({ text: "web:hi" });
  });

  test("methods without a web implementation reject UNSUPPORTED", async () => {
    expect(echo.isSupported("fail")).toBe(false);
    const error = await echo.fail().catch((e) => e);
    expect(isAkanNativeError(error, "UNSUPPORTED")).toBe(true);
  });

  test("web event sources start once and stop after the last listener", async () => {
    const seen: number[] = [];
    const a = echo.listen("tick", (d) => seen.push(d.n));
    const b = echo.listen("tick", (d) => seen.push(d.n));
    expect(webStarts).toEqual(["start"]);
    await tick();
    expect(seen.length).toBeGreaterThan(0);
    a();
    b();
    b(); // double unsubscribe is harmless
    await Promise.resolve();
    expect(webStarts).toEqual(["start", "stop"]);
  });
});

describe("native host (mock)", () => {
  test("routes declared methods to the host with JSON args", async () => {
    host = installMockHost({
      platform: "ios",
      env: { PUBLIC_API: "https://api.example" },
      plugins: { echo: { methods: { echo: (args: { text: string }) => ({ text: `native:${args.text}` }) } } },
    });
    expect(platform).toBe("ios");
    expect(env.PUBLIC_API).toBe("https://api.example");
    expect(echo.implementation("echo")).toBe("native");
    expect(await echo.echo({ text: "hi" })).toEqual({ text: "native:hi" });
    expect(host.requests[0]).toMatchObject({ v: 1, plugin: "echo", method: "echo", args: { text: "hi" } });
  });

  test('a native host does not fall back to web unless it declares "web"', async () => {
    host = installMockHost({ platform: "android", plugins: { echo: { methods: { echo: () => ({}) } } } });
    expect(echo.implementation("onlyWeb")).toBe("none");
    host.uninstall();
    host = installMockHost({ platform: "macos", plugins: { echo: "web" } });
    expect(echo.implementation("onlyWeb")).toBe("web");
    expect(await echo.onlyWeb()).toBe("web-only");
  });

  test("a native subset with web: true mixes: listed methods native, the rest web", async () => {
    host = installMockHost({
      platform: "macos",
      plugins: { echo: { methods: { echo: () => ({ text: "native" }) }, web: true } },
    });
    expect(echo.implementation("echo")).toBe("native");
    expect(echo.implementation("onlyWeb")).toBe("web");
    expect(await echo.echo({ text: "x" })).toEqual({ text: "native" });
    expect(await echo.onlyWeb()).toBe("web-only");
  });

  test("host errors become AkanNativeError with the wire code", async () => {
    host = installMockHost({
      plugins: {
        echo: {
          methods: {
            fail: () => {
              throw Object.assign(new Error("nope"), { name: "NotAllowedError" });
            },
          },
        },
      },
    });
    const error = await echo.fail().catch((e) => e);
    expect(error).toBeInstanceOf(Error);
    expect(isAkanNativeError(error, "PERMISSION_DENIED")).toBe(true);
    expect(error.stack).toBeString();
  });

  test("native events: one $listen per event, StrictMode remount does not churn", async () => {
    host = installMockHost({ plugins: { echo: { events: ["tick"] } } });
    const seen: number[] = [];
    // StrictMode: subscribe, unsubscribe, subscribe in the same tick.
    const first = echo.listen("tick", (d) => seen.push(d.n));
    first();
    const second = echo.listen("tick", (d) => seen.push(d.n));
    const third = echo.listen("tick", (d) => seen.push(d.n * 10));
    await tick();
    expect(host.requests.map((r) => r.method)).toEqual(["$listen"]);
    expect(host.subscriptions("echo", "tick")).toBe(1);

    expect(host.emit("echo", "tick", { n: 2 })).toBe(true);
    expect(seen).toEqual([2, 20]);

    second();
    third();
    await tick();
    expect(host.requests.map((r) => r.method)).toEqual(["$listen", "$unlisten"]);
    expect(host.emit("echo", "tick", { n: 3 })).toBe(false);
  });
});

describe("transports", () => {
  test("android: doorbell with a nonce, the shell's port for that nonce only, claim, queued requests", async () => {
    const g = globalThis as any;
    const realFetch = g.fetch;
    const rang: string[] = [];
    g.fetch = async (url: string, init?: RequestInit) => {
      rang.push(url);
      expect(init?.referrerPolicy).toBe("same-origin");
      return new Response(null, { status: 204 });
    };
    g.__AKAN_NATIVE__ = { platform: "android", plugins: { echo: { methods: ["echo"], events: ["tick"] } } };
    try {
      const pending = echo.echo({ text: "queued" }); // sent before the port exists
      expect(rang).toHaveLength(1);
      const nonce = /^\/__akan_native\/hello\?n=([0-9a-f]{32})$/.exec(rang[0]!)?.[1];
      expect(nonce).toBeDefined();

      // A port offered by some window (an iframe) is ignored.
      const fake = new MessageChannel();
      g.dispatchEvent(
        new MessageEvent("message", { data: `akan-native:port:${nonce}`, ports: [fake.port2], source: fake.port1 }),
      );
      // So is a port the shell posted for another ring (a frame rang the doorbell, SEC-4).
      const other = new MessageChannel();
      let otherClaimed = false;
      other.port1.onmessage = () => (otherClaimed = true);
      g.dispatchEvent(
        new MessageEvent("message", {
          data: "akan-native:port:0123456789abcdef0123456789abcdef",
          ports: [other.port2],
        }),
      );
      g.dispatchEvent(new MessageEvent("message", { data: "akan-native:port", ports: [other.port2] }));

      const channel = new MessageChannel();
      const shell = channel.port1;
      const seen: number[] = [];
      const shellGot: string[] = [];
      shell.onmessage = (e) => {
        shellGot.push(e.data === "akan-native:claim" ? e.data : "request");
        if (e.data === "akan-native:claim") return;
        const req = JSON.parse(e.data);
        if (req.method === "$listen") {
          shell.postMessage(JSON.stringify({ v: 1, id: req.id, ok: true }));
          shell.postMessage(JSON.stringify({ v: 1, plugin: "echo", event: "tick", data: { n: 7 } }));
        } else shell.postMessage(JSON.stringify({ v: 1, id: req.id, ok: true, result: { text: req.args.text } }));
      };
      g.dispatchEvent(new MessageEvent("message", { data: `akan-native:port:${nonce}`, ports: [channel.port2] }));
      expect(await pending).toEqual({ text: "queued" });
      expect(shellGot).toEqual(["akan-native:claim", "request"]); // claimed first; the queued call went once
      expect(otherClaimed).toBe(false);
      // A second port for the same ring (the shell answered a retry late) is closed unclaimed.
      const late = new MessageChannel();
      let lateClaimed = false;
      late.port1.onmessage = () => (lateClaimed = true);
      g.dispatchEvent(new MessageEvent("message", { data: `akan-native:port:${nonce}`, ports: [late.port2] }));
      expect(await echo.echo({ text: "direct" })).toEqual({ text: "direct" });
      expect(lateClaimed).toBe(false);
      expect(shellGot).toEqual(["akan-native:claim", "request", "request"]);
      expect((globalThis as any).__AKAN_NATIVE__.__runtime.transport.info()).toEqual({ ports: 1 });
      const stop = echo.listen("tick", (d) => seen.push(d.n));
      await tick();
      expect(seen).toEqual([7]);
      stop();
      shell.close();
      fake.port1.close();
      other.port1.close();
      late.port1.close();
    } finally {
      g.fetch = realFetch;
      delete g.__AKAN_NATIVE__;
    }
  });

  test("in a frame the bridge answers UNSUPPORTED without ringing the shell (SEC-4)", async () => {
    const g = globalThis as any;
    const realFetch = g.fetch;
    const rang: string[] = [];
    g.fetch = async (url: string) => (rang.push(url), new Response(null, { status: 204 }));
    g.__AKAN_NATIVE__ = { platform: "android", plugins: { echo: { methods: ["echo"], events: [] } } };
    g.top = {}; // not this window: an iframe
    try {
      expect(
        isAkanNativeError(
          await echo.echo({ text: "x" }).then(
            () => null,
            (e: unknown) => e,
          ),
          "UNSUPPORTED",
        ),
      ).toBe(true);
      expect(rang).toEqual([]);
    } finally {
      delete g.top;
      g.fetch = realFetch;
      delete g.__AKAN_NATIVE__;
    }
  });

  test("desktop posts to /__akan_native/ipc and reads the HTTP body", async () => {
    const g = globalThis as any;
    const realFetch = g.fetch;
    g.__AKAN_NATIVE__ = { platform: "macos", plugins: { echo: { methods: ["echo"], events: [] } } };
    g.fetch = async (url: string, init: RequestInit) => {
      expect(url).toBe("/__akan_native/ipc");
      const req = JSON.parse(String(init.body));
      return Response.json({ v: 1, id: req.id, ok: true, result: { text: `d:${req.args.text}` } });
    };
    try {
      expect(await echo.echo({ text: "b" })).toEqual({ text: "d:b" });
    } finally {
      g.fetch = realFetch;
      delete g.__AKAN_NATIVE__;
    }
  });

  test("ios sends JSON text and accepts a JSON text reply", async () => {
    const g = globalThis as any;
    g.__AKAN_NATIVE__ = { platform: "ios", plugins: { echo: { methods: ["echo"], events: [] } } };
    g.webkit = {
      messageHandlers: {
        akanNative: {
          postMessage: async (text: string) => {
            const req = JSON.parse(text);
            return JSON.stringify({
              v: 1,
              id: req.id,
              ok: false,
              error: { code: "CANCELLED", message: "user cancelled" },
            });
          },
        },
      },
    };
    try {
      const error = await echo.echo({ text: "c" }).catch((e) => e);
      expect(isAkanNativeError(error, "CANCELLED")).toBe(true);
    } finally {
      delete g.webkit;
      delete g.__AKAN_NATIVE__;
    }
  });
});

describe("bridge v1.1: doc and seq", () => {
  const g = globalThis as any;
  const iosHost = (answer: (req: any, next: () => number) => unknown) => {
    let seq = 0;
    g.__AKAN_NATIVE__ = { platform: "ios", plugins: { echo: { methods: ["echo"], events: ["tick"] } } };
    g.webkit = {
      messageHandlers: {
        akanNative: { postMessage: async (text: string) => JSON.stringify(answer(JSON.parse(text), () => ++seq)) },
      },
    };
  };
  afterEach(() => {
    delete g.webkit;
    delete g.__AKAN_NATIVE__;
  });

  test("an event the host sent after a response reaches listeners after the code awaiting the response", async () => {
    const docs = new Set<string>();
    iosHost((req, next) => {
      docs.add(req.doc);
      if (req.method === "$listen") return { v: 1, id: req.id, ok: true, doc: req.doc, seq: next() };
      const response = next();
      // The event, sent after the reply, overtakes it (WKWebView: 5961 of 6000 times).
      g.__AKAN_NATIVE__.receive(
        JSON.stringify({
          v: 1,
          plugin: "echo",
          event: "tick",
          data: { n: Number(req.args.text) },
          doc: req.doc,
          seq: next(),
        }),
      );
      return { v: 1, id: req.id, ok: true, result: { text: req.args.text }, doc: req.doc, seq: response };
    });
    const seen: string[] = [];
    const stop = echo.listen("tick", (d) => seen.push(`event ${d.n}`));
    await tick();
    for (const n of ["1", "2", "3"]) seen.push(`answer ${(await echo.echo({ text: n })).text}`);
    await tick();
    expect(seen).toEqual(["answer 1", "event 1", "answer 2", "event 2", "answer 3", "event 3"]);
    expect([...docs]).toHaveLength(1);
    expect([...docs][0]).toMatch(/^[0-9a-f]{32}$/);
    stop();
  });

  test("messages of another document are dropped; a reply for another document fails the call", async () => {
    iosHost((req, next) =>
      req.method.startsWith("$")
        ? { v: 1, id: req.id, ok: true, doc: req.doc, seq: next() }
        : { v: 1, id: req.id, ok: true, result: { text: "x" }, doc: "0".repeat(32) },
    );
    const seen: number[] = [];
    const stop = echo.listen("tick", (d) => seen.push(d.n));
    await tick();
    g.__AKAN_NATIVE__.receive({ v: 1, plugin: "echo", event: "tick", data: { n: 1 }, doc: "f".repeat(32), seq: 2 });
    await tick();
    expect(seen).toEqual([]);
    const error = await echo.echo({ text: "a" }).catch((e) => e);
    expect(isAkanNativeError(error, "INTERNAL")).toBe(true);
    stop();
  });

  // A number that never arrives (SEQ_GAP_MS) and arrival orders: order.test.ts, on a virtual clock.

  test("requests may name their document", () => {
    const base = { v: 1, id: 1, plugin: "p", method: "m" };
    expect(validateRequest({ ...base, doc: "0123456789abcdef0123456789abcdef" })).toBeNull();
    expect(validateRequest({ ...base, doc: "bad doc" })).toBe("invalid document id");
    expect(validateRequest({ ...base, doc: 7 })).toBe("invalid document id");
  });
});

describe("protocol validation", () => {
  test.each([
    [{ v: 1, id: 1, plugin: "camera", method: "takePhoto" }, null],
    [{ v: 2, id: 1, plugin: "camera", method: "takePhoto" }, "unsupported protocol version: 2"],
    [{ v: 1, id: "1", plugin: "camera", method: "takePhoto" }, "id must be an integer"],
    [{ v: 1, id: 1, plugin: "../x", method: "takePhoto" }, "invalid plugin name"],
    [{ v: 1, id: 1, plugin: "camera", method: "$listen" }, "$listen requires args.event"],
    [[1, 2], "request must be an object"],
  ])("%j", (request, expected) => {
    expect(validateRequest(request)).toBe(expected as string | null);
  });
});

describe("createLiveValue", () => {
  test("starts on first subscriber, stops a microtask after the last", async () => {
    const log: string[] = [];
    const value = createLiveValue(0, (set) => {
      log.push("start");
      set(1);
      return () => log.push("stop");
    });
    const off1 = value.subscribe(() => log.push("change"));
    expect(value.get()).toBe(1);
    off1();
    const off2 = value.subscribe(() => {});
    await Promise.resolve();
    expect(log).toEqual(["start", "change"]);
    off2();
    await Promise.resolve();
    expect(log).toEqual(["start", "change", "stop"]);
  });
});

describe("window.print on macOS (plugins.md D8)", () => {
  test("macOS: print asks the host; other platforms keep the browser's print", async () => {
    const g = globalThis as { print?: () => void };
    const original = () => {};
    for (const platform of ["ios", "android", "web"] as const) {
      const host = installMockHost({ platform });
      g.print = original;
      expect(installPrint()).toBe(false);
      expect(g.print).toBe(original);
      host.uninstall();
    }
    const host = installMockHost({ platform: "macos" });
    g.print = original;
    expect(installPrint()).toBe(true);
    g.print!();
    await Promise.resolve();
    expect(host.requests.map((r) => [r.plugin, r.method])).toEqual([["$host", "print"]]);
    host.uninstall();
    delete g.print;
  });
});
