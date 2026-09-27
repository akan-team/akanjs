import { afterEach, describe, expect, test } from "bun:test";
import { AkanNativeError, definePlugin, isAkanNativeError, releaseFile } from "../src/index.ts";
import { cloneProblem } from "../src/plugin.ts";
import { runtime } from "../src/runtime.ts";
import { installMockHost, type MockHost } from "../src/testing.ts";

// Architecture review stage 3: the web-standard call surface (bridge v1.1 `cancel`).

let host: MockHost | null = null;
afterEach(() => {
  host?.uninstall();
  host = null;
});
const tick = () => new Promise((r) => setTimeout(r, 0));

interface Api {
  ping(args: { n: number }): Promise<number>;
  wait(): Promise<string>;
  fail(): Promise<void>;
}
const p = definePlugin<Api, { tick: number }>("p", {
  methods: ["ping", "wait", "fail"],
  events: ["tick"],
  web: {
    methods: {
      ping: async ({ n }: { n: number }) => n + 1,
      wait: (_args?: undefined, ctx?: { signal?: AbortSignal }) =>
        new Promise<string>((resolve) => ctx?.signal?.addEventListener("abort", () => resolve("stopped"))),
    } as never,
  },
});

function native(options: { dev?: boolean } = {}) {
  const seen: { signal?: AbortSignal }[] = [];
  host = installMockHost({
    platform: "ios",
    dev: options.dev ?? false,
    plugins: {
      p: {
        methods: {
          ping: ({ n }: { n: number }) => n + 1,
          wait: (_args: unknown, _host: MockHost, _scope: unknown, signal?: AbortSignal) =>
            new Promise((resolve) => {
              seen.push({ signal });
              signal?.addEventListener("abort", () => resolve("too late"));
            }),
          fail: () => {
            throw new AkanNativeError("UNSUPPORTED", "managed by the package manager", {
              data: { reason: "packageManaged" },
              retryable: true,
            });
          },
        },
        events: ["tick"],
      },
    },
  });
  return { host, seen };
}

describe("AbortSignal on calls", () => {
  test("an aborted signal rejects before anything is sent", async () => {
    const { host } = native();
    const error = await p.ping({ n: 1 }, { signal: AbortSignal.abort() }).catch((e) => e);
    expect(isAkanNativeError(error, "CANCELLED")).toBe(true);
    expect(error.name).toBe("AbortError");
    expect(host.requests).toHaveLength(0);
  });

  test("a later abort rejects at once and tells the host, which stops the call", async () => {
    const { host, seen } = native();
    const controller = new AbortController();
    const waiting = p.wait(undefined, { signal: controller.signal });
    await tick();
    await tick();
    controller.abort();
    const error = await waiting.catch((e) => e);
    expect(error).toBeInstanceOf(AkanNativeError);
    expect([error.code, error.name]).toEqual(["CANCELLED", "AbortError"]);
    await tick();
    await tick();
    const callId = host.requests[0]!.id;
    expect(host.requests[1]).toMatchObject({
      plugin: "$bridge",
      method: "cancel",
      args: { id: callId, reason: "abort" },
    });
    expect(host.cancels).toEqual([{ id: callId, reason: "abort", cancelled: true }]);
    expect(seen[0]!.signal!.aborted).toBe(true);
  });

  test("AbortSignal.timeout rejects with TIMEOUT (TimeoutError) and cancels with reason timeout", async () => {
    const { host } = native();
    const error = await p.wait(undefined, { signal: AbortSignal.timeout(5) }).catch((e) => e);
    expect([error.code, error.name]).toEqual(["TIMEOUT", "TimeoutError"]);
    await tick();
    await tick();
    expect(host.cancels[0]).toMatchObject({ reason: "timeout", cancelled: true });
  });

  test("a call that already finished is not cancelled; the signal's listener is removed", async () => {
    const { host } = native();
    const controller = new AbortController();
    expect(await p.ping({ n: 1 }, { signal: controller.signal })).toBe(2);
    controller.abort();
    await tick();
    expect(host.requests.filter((r) => r.plugin === "$bridge")).toHaveLength(0);
  });

  test("web implementations get the signal in their context and the call rejects when it fires", async () => {
    host = installMockHost({ platform: "web" });
    const controller = new AbortController();
    const waiting = p.wait(undefined, { signal: controller.signal });
    controller.abort(new DOMException("user left", "AbortError"));
    const error = await waiting.catch((e) => e);
    expect([error.code, error.message]).toEqual(["CANCELLED", "user left"]);
    expect(await p.ping({ n: 2 }, {})).toBe(3);
  });
});

describe("errors", () => {
  test("data and retryable cross the bridge; names follow the web", async () => {
    native();
    const error = await p.fail().catch((e) => e);
    expect([error.code, error.name, error.retryable]).toEqual(["UNSUPPORTED", "NotSupportedError", true]);
    expect(error.data).toEqual({ reason: "packageManaged" });
    const names = (
      [
        "CANCELLED",
        "TIMEOUT",
        "PERMISSION_DENIED",
        "NOT_ALLOWED",
        "UNSUPPORTED",
        "NOT_FOUND",
        "INVALID_ARGS",
        "INTERNAL",
      ] as const
    ).map((c) => new AkanNativeError(c, "").name);
    expect(names).toEqual([
      "AbortError",
      "TimeoutError",
      "NotAllowedError",
      "NotAllowedError",
      "NotSupportedError",
      "NotFoundError",
      "AkanNativeError",
      "AkanNativeError",
    ]);
    expect(AkanNativeError.from(new DOMException("slow", "TimeoutError")).code).toBe("TIMEOUT");
  });

  test("dev builds refuse arguments JSON would change (DataCloneError)", async () => {
    native({ dev: true });
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    for (const bad of [
      { at: new Date() },
      { m: new Map() },
      { n: Number.NaN },
      { f: () => 1 },
      { big: 1n },
      cyclic,
      [1, [Infinity]],
    ]) {
      const error = await p.ping(bad as never).catch((e) => e);
      expect([error.code, error.name]).toEqual(["INVALID_ARGS", "DataCloneError"]);
    }
    const shared = { x: 1 };
    expect(
      cloneProblem({ a: shared, b: shared, list: [null, "s", true, 1.5], nested: Object.create(null) }, "args"),
    ).toBeNull();
    expect(cloneProblem({ list: [1, new Uint8Array(1)] }, "args")).toBe(
      "args.list[1] is a Uint8Array: only plain objects, arrays, strings, numbers, booleans and null cross the bridge",
    );
    expect(await p.ping({ n: 1 })).toBe(2);
  });
});

describe("releaseFile", () => {
  test("native: $bridge.release with the URL; the web revokes blob: URLs", async () => {
    const { host } = native();
    expect(await releaseFile({ url: "/__akan_native/file/abc.jpg", mime: "image/jpeg", size: 1 })).toBe(true);
    expect(host.releases).toEqual(["/__akan_native/file/abc.jpg"]);
    runtime().transport = null; // the web: no host
    const blob = URL.createObjectURL(new Blob(["x"]));
    expect(await releaseFile(blob)).toBe(true);
    expect(await releaseFile("https://example.com/x")).toBe(false);
  });
});

describe("listen options", () => {
  test("once unsubscribes after the first event; a signal unsubscribes when it fires", async () => {
    const { host } = native();
    const once: number[] = [];
    p.listen("tick", (n) => once.push(n), { once: true });
    const controller = new AbortController();
    const all: number[] = [];
    p.listen("tick", (n) => all.push(n), { signal: controller.signal });
    await tick();
    await tick();
    host.emit("p", "tick", 1);
    host.emit("p", "tick", 2);
    controller.abort();
    await tick();
    await tick();
    expect(host.emit("p", "tick", 3)).toBe(false); // the last listener left: the host stopped the source
    expect([once, all]).toEqual([[1], [1, 2]]);
    expect(p.listen("tick", () => {}, { signal: AbortSignal.abort() })).toBeInstanceOf(Function);
    await tick();
    expect(host.subscriptions("p", "tick")).toBe(0);
  });
});
