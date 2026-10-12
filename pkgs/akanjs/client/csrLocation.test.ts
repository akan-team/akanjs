import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { CsrLocation } from "./csrLocation";

const popped: unknown[] = [];
const globals = globalThis as unknown as Record<string, unknown>;
const saved = { window: globals.window, PopStateEvent: globals.PopStateEvent };

beforeAll(() => {
  globals.PopStateEvent = class {
    readonly state: unknown;
    constructor(_type: string, init: { state: unknown }) {
      this.state = init.state;
    }
  };
  globals.window = { dispatchEvent: (event: { state: unknown }) => void popped.push(event.state) };
});

afterAll(() => {
  globals.window = saved.window;
  globals.PopStateEvent = saved.PopStateEvent;
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const owner = { leave: () => undefined, reload: () => undefined };

describe("CsrLocation in memory", () => {
  test("reads the parts of the href it was started on", () => {
    const location = new CsrLocation();
    location.useMemory("/en/memo/1?tab=images#top", owner);
    expect(location.isMemory).toBe(true);
    expect(location.pathname).toBe("/en/memo/1");
    expect(location.search).toBe("?tab=images");
    expect(location.hash).toBe("#top");
    expect(location.strip("/en/memo/1")).toBe("/en/memo/1");
  });

  test("drops the forward entries on a push, and pops back with the state it left", async () => {
    popped.length = 0;
    const location = new CsrLocation();
    location.useMemory("/en/memo", owner);
    location.replace({ idx: 0 });
    location.push({ idx: 1 }, "/en/memo/1");
    location.push({ idx: 2 }, "/en/memo/2");
    location.back();
    expect(location.href).toBe("/en/memo/1");
    location.push({ idx: 2 }, "/en/memo/3");
    location.back();
    location.back();
    location.back();
    await settle();
    expect(location.href).toBe("/en/memo");
    expect(location.state).toEqual({ idx: 0 });
    expect(popped).toEqual([{ idx: 1 }, { idx: 1 }, { idx: 0 }]);
  });

  test("hands a full navigation and a reload to its owner instead of routing to them", async () => {
    popped.length = 0;
    const handed: string[] = [];
    const location = new CsrLocation();
    location.useMemory("/en/memo", {
      leave: (href) => void handed.push(`leave ${href}`),
      reload: () => void handed.push("reload"),
    });
    location.assign("/404");
    location.reload();
    await settle();
    expect(location.href).toBe("/en/memo");
    expect(handed).toEqual(["leave /404", "reload"]);
    expect(popped).toEqual([]);
  });
});
