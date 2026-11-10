import { describe, expect, test } from "bun:test";
import { AbortSignals } from "./abortSignals";

const withoutNativeAny = (run: () => void) => {
  const any = AbortSignal.any;
  Reflect.deleteProperty(AbortSignal, "any");
  try {
    run();
  } finally {
    Object.assign(AbortSignal, { any });
  }
};

const countListeners = (signal: AbortSignal) => {
  const counter = { added: 0, live: 0 };
  const add = signal.addEventListener.bind(signal);
  const remove = signal.removeEventListener.bind(signal);
  signal.addEventListener = ((...args: Parameters<AbortSignal["addEventListener"]>) => {
    counter.added += 1;
    counter.live += 1;
    add(...args);
  }) as AbortSignal["addEventListener"];
  signal.removeEventListener = ((...args: Parameters<AbortSignal["removeEventListener"]>) => {
    counter.live -= 1;
    remove(...args);
  }) as AbortSignal["removeEventListener"];
  return counter;
};

describe("AbortSignals", () => {
  test("joins signals into one that aborts with the first reason, and passes a lone one through", () => {
    const single = new AbortController();
    expect(AbortSignals.join([undefined, single.signal, null]).signal).toBe(single.signal);
    expect(AbortSignals.join([]).signal).toBeUndefined();

    const [a, b] = [new AbortController(), new AbortController()];
    const joined = AbortSignals.join([a.signal, b.signal]).signal;
    b.abort("b first");
    a.abort("a later");
    expect(joined?.aborted).toBe(true);
    expect(joined?.reason).toBe("b first");
  });

  test("joins them by hand where AbortSignal.any is missing, as in an iOS 16 WebView", () => {
    withoutNativeAny(() => {
      const [a, b] = [new AbortController(), new AbortController()];
      const joined = AbortSignals.join([a.signal, b.signal]).signal;
      expect(joined?.aborted).toBe(false);
      a.abort("a");
      expect(joined?.reason).toBe("a");
    });
  });

  test("leaves no listener on a long-lived input once the work is disposed or the join aborts", () => {
    withoutNativeAny(() => {
      const long = new AbortController();
      const counter = countListeners(long.signal);
      for (let idx = 0; idx < 50; idx += 1) AbortSignals.join([long.signal, new AbortController().signal]).dispose();
      expect(counter.live).toBe(0);

      const other = new AbortController();
      AbortSignals.join([long.signal, other.signal]);
      other.abort("other");
      expect(counter.live).toBe(0);
    });
  });

  test("adds no listener when a later input is already aborted, and takes its reason", () => {
    withoutNativeAny(() => {
      const long = new AbortController();
      const counter = countListeners(long.signal);
      const done = new AbortController();
      done.abort("already");
      expect(AbortSignals.join([long.signal, done.signal]).signal?.reason).toBe("already");
      expect(counter.added).toBe(0);
    });
  });

  test("races a promise against a signal without stopping the work behind it", async () => {
    let finish = (_value: string) => {};
    const work = new Promise<string>((resolve) => {
      finish = resolve;
    });
    const controller = new AbortController();
    const raced = AbortSignals.race(work, controller.signal).catch((error: unknown) => error);
    controller.abort("left");
    expect(await raced).toBe("left");
    finish("done");
    expect(await work).toBe("done");

    expect(await AbortSignals.race(Promise.resolve("kept"), new AbortController().signal)).toBe("kept");
    expect(await AbortSignals.race(Promise.reject(new Error("x")), controller.signal).catch((e) => e)).toBe("left");
  });

  test("tells an abort from any other failure", () => {
    expect(AbortSignals.isAbort(new DOMException("stop", "AbortError"))).toBe(true);
    expect(AbortSignals.isAbort(new DOMException("slow", "TimeoutError"))).toBe(false);
    expect(AbortSignals.isAbort("AbortError")).toBe(false);
    expect(AbortSignals.isAbort(null)).toBe(false);
  });

  test("knows a timeout by its reason, and an abort by its name or by the reason a call rejected with", () => {
    expect(AbortSignals.isTimeout(AbortSignal.abort(new DOMException("timed out", "TimeoutError")))).toBe(true);
    expect(AbortSignals.isTimeout(AbortSignal.abort())).toBe(false);
    expect(AbortSignals.isTimeout(new AbortController().signal)).toBe(false);

    const custom = new Error("superseded");
    expect(AbortSignals.isAbort(custom)).toBe(false);
    const leaving = new AbortController();
    leaving.abort(custom);
    expect(AbortSignals.reasonOf(leaving.signal)).toBe(custom);
    expect(AbortSignals.isAbort(custom)).toBe(true);
    expect(AbortSignals.isAbort(new DOMException("stopped", "AbortError"))).toBe(true);
    expect(AbortSignals.isAbort(new Error("real"))).toBe(false);

    const slow = new DOMException("timed out", "TimeoutError");
    const deadline = AbortSignal.abort(slow);
    expect(AbortSignals.reasonOf(deadline)).toBe(slow);
    expect(AbortSignals.isAbort(slow)).toBe(false);
    expect(AbortSignals.isAbortOf(slow, [{ signal: deadline }])).toBe(false);
  });

  test("matches a primitive reason only against an aborted signal the call was given", () => {
    const left = new AbortController();
    left.abort("left");
    expect(AbortSignals.isAbort("left")).toBe(false);
    expect(AbortSignals.isAbortOf("left", [1, { signal: left.signal }])).toBe(true);
    expect(AbortSignals.isAbortOf("left", [left.signal])).toBe(true);
    expect(AbortSignals.isAbortOf("other", [left.signal])).toBe(false);
    expect(AbortSignals.isAbortOf("left", [{ signal: new AbortController().signal }, null, "left"])).toBe(false);
  });

  test("never takes an app or restored error for an abort, though it aborted a call", () => {
    const keyed = Object.assign(new Error("Forbidden"), { error: "memo.error.forbidden" });
    const restored = Object.assign(new Error("Forbidden"), { statusCode: 403 });
    for (const failure of [keyed, restored]) {
      const ctrl = new AbortController();
      ctrl.abort(failure);
      expect(AbortSignals.reasonOf(ctrl.signal)).toBe(failure);
      expect(AbortSignals.isAbort(failure)).toBe(false);
      expect(AbortSignals.isAbortOf(failure, [ctrl.signal])).toBe(false);
    }
  });
});
