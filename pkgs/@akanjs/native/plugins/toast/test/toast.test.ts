import { afterEach, describe, expect, test } from "bun:test";
import { pluginDecls } from "../../../packages/cli/src/lib/native-plugins.ts";
import { isAkanNativeError } from "../../../packages/core/src/index.ts";
import { installMockHost, type MockHost } from "../../../packages/core/src/testing.ts";
import manifest from "../native-plugin.json";
import { checkShow, createToastQueue, MAX_QUEUED, type ToastItem, toast } from "../src/index.ts";

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
const tick = () => new Promise((r) => setTimeout(r, 1));

describe("toast arguments", () => {
  test("defaults and lengths", () => {
    expect(checkShow({ text: "Saved" })).toEqual({ text: "Saved", duration: "short", position: "bottom", ms: 2000 });
    expect(checkShow({ text: "Saved", duration: "long", position: "top" })).toEqual({
      text: "Saved",
      duration: "long",
      position: "top",
      ms: 3500,
    });
    expect(checkShow({ text: "x", duration: null, position: null })).toMatchObject({
      duration: "short",
      position: "bottom",
    });
  });

  test("rejects what the generated Android checks reject, plus empty text", () => {
    const cases: [unknown, string][] = [
      [undefined, "text is required"],
      [{}, "text is required"],
      [{ text: 1 }, "text must be a string"],
      [{ text: "  " }, "text must not be empty"],
      [{ text: "x", duration: "forever" }, "duration must be one of short, long"],
      [{ text: "x", position: "left" }, "position must be one of top, center, bottom"],
    ];
    for (const [options, message] of cases) {
      try {
        checkShow(options);
        throw new Error(`accepted ${JSON.stringify(options)}`);
      } catch (e) {
        expect(isAkanNativeError(e, "INVALID_ARGS")).toBe(true);
        expect((e as Error).message).toBe(message);
      }
    }
  });

  test("manifest: native on Android, the in-page toast on iOS and macOS", () => {
    const plugin = { spec: "toast", dir: `${import.meta.dir}/..`, manifest: manifest as never };
    expect(pluginDecls([plugin], "android")).toEqual({ toast: { methods: ["show"], events: [] } });
    expect(pluginDecls([plugin], "ios")).toEqual({ toast: "web" });
    expect(pluginDecls([plugin], "macos")).toEqual({ toast: "web" });
  });
});

describe("toast queue", () => {
  function recorder() {
    const shown: string[] = [];
    const done: (() => void)[] = [];
    const queue = createToastQueue((item: ToastItem) => {
      shown.push(item.text);
      return new Promise<void>((resolve) => done.push(resolve));
    });
    const item = (text: string) => checkShow({ text });
    return { shown, done, queue, item };
  }

  test("one at a time, in order", async () => {
    const { shown, done, queue, item } = recorder();
    expect(queue.push(item("a"))).toBe(true);
    expect(queue.push(item("b"))).toBe(true);
    expect(shown).toEqual(["a"]);
    done[0]!();
    await tick();
    expect(shown).toEqual(["a", "b"]);
    done[1]!();
    await tick();
    expect(queue.size).toBe(0);
  });

  test(`at most ${MAX_QUEUED} waiting or showing, like Android`, async () => {
    const { shown, done, queue, item } = recorder();
    for (let i = 0; i < MAX_QUEUED; i++) expect(queue.push(item(String(i)))).toBe(true);
    expect(queue.push(item("dropped"))).toBe(false);
    expect(queue.size).toBe(MAX_QUEUED);
    done[0]!();
    await tick();
    expect(queue.push(item("room again"))).toBe(true);
    for (let i = 1; i <= MAX_QUEUED; i++) {
      done[i]!();
      await tick();
    }
    expect(shown).toEqual(["0", "1", "2", "3", "4", "room again"]);
  });

  test("a failing display does not stop the queue", async () => {
    const shown: string[] = [];
    const warn = console.warn;
    console.warn = () => {};
    try {
      const queue = createToastQueue(async (item) => {
        shown.push(item.text);
        if (item.text === "bad") throw new Error("no document");
      });
      queue.push(checkShow({ text: "bad" }));
      queue.push(checkShow({ text: "good" }));
      await tick();
      expect(shown).toEqual(["bad", "good"]);
    } finally {
      console.warn = warn;
    }
  });
});

describe("toast routing", () => {
  test("Android gets the call with its options", async () => {
    const seen: unknown[] = [];
    host = installMockHost({
      platform: "android",
      plugins: { toast: { methods: { show: (args: unknown) => void seen.push(args) } } },
    });
    expect(toast.implementation("show")).toBe("native");
    await toast.show({ text: "Saved", duration: "long" });
    expect(seen).toEqual([{ text: "Saved", duration: "long" }]);
  });

  test("hosts that declare web run the in-page toast: arguments are checked, no DOM is UNSUPPORTED", async () => {
    host = installMockHost({ platform: "ios", plugins: { toast: "web" } });
    expect(toast.implementation("show")).toBe("web");
    expect(isAkanNativeError(await rejection(toast.show({ text: "" })), "INVALID_ARGS")).toBe(true);
    expect(isAkanNativeError(await rejection(toast.show({ text: "hi" })), "UNSUPPORTED")).toBe(true); // bun test has no document
    expect(host.requests).toEqual([]);
  });
});
