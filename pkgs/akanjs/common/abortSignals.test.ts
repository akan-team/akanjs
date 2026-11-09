import { describe, expect, test } from "bun:test";
import { AbortSignals } from "./abortSignals";

describe("AbortSignals", () => {
  test("joins signals into one that aborts with the first reason, and passes a lone one through", () => {
    const single = new AbortController();
    expect(AbortSignals.any([undefined, single.signal, null])).toBe(single.signal);
    expect(AbortSignals.any([])).toBeUndefined();

    const [a, b] = [new AbortController(), new AbortController()];
    const joined = AbortSignals.any([a.signal, b.signal]);
    b.abort("b first");
    a.abort("a later");
    expect(joined?.aborted).toBe(true);
    expect(joined?.reason).toBe("b first");
  });

  test("joins them by hand where AbortSignal.any is missing, as in an iOS 16 WebView", () => {
    const any = AbortSignal.any;
    Reflect.deleteProperty(AbortSignal, "any");
    try {
      const [a, b] = [new AbortController(), new AbortController()];
      const joined = AbortSignals.any([a.signal, b.signal]);
      expect(joined?.aborted).toBe(false);
      a.abort("a");
      expect(joined?.reason).toBe("a");

      const done = new AbortController();
      done.abort("already");
      expect(AbortSignals.any([new AbortController().signal, done.signal])?.reason).toBe("already");
    } finally {
      Object.assign(AbortSignal, { any });
    }
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
});
