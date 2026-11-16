import { describe, expect, test } from "bun:test";
import type { Logger } from "akanjs/common";
import { RenderBusyResponse } from "./renderBusyResponse";
import { RscRenderRefusal } from "./rscRenderRefusal";

const quiet = { warn: () => undefined } as unknown as Logger;

const busyPage = async (message: string) => {
  const refusal = new RscRenderRefusal("renderQueueFull", message);
  const request = new Request("https://example.test/docs", { headers: { accept: "text/html" } });
  return await new RenderBusyResponse(quiet).document(request, refusal).text();
};

class Tab {
  readonly stored = new Map<string, string>();
  now = 1_700_000_000_000;
  reloads = 0;
  storageFails = false;

  refused(): number {
    const reloadsBefore = this.reloads;
    let delay = -1;
    let reload: () => void = () => undefined;
    const storage = {
      getItem: (key: string) => {
        if (this.storageFails) throw new Error("storage is blocked");
        return this.stored.get(key) ?? null;
      },
      setItem: (key: string, value: string) => void this.stored.set(key, value),
    };
    const run = new Function("sessionStorage", "location", "setTimeout", "Date", "Math", RenderBusyResponse.script);
    run(
      storage,
      { reload: () => (this.reloads += 1) },
      (fn: () => void, ms: number) => {
        reload = fn;
        delay = ms;
      },
      { now: () => this.now },
      { min: Math.min, random: () => 0.5 },
    );
    expect(this.reloads).toBe(reloadsBefore);
    reload();
    this.now += delay;
    return delay;
  }
}

describe("RenderBusyResponse page", () => {
  test("carries one script, the same bytes whatever was refused, that reloads and never polls", async () => {
    const [first, second] = [await busyPage("render queue is full: 480 renders wait for 4 slots"), await busyPage("x")];
    expect(first).toBe(second);
    expect(first.toLowerCase().split("<script")).toHaveLength(2);
    expect(first).toContain(`<script>${RenderBusyResponse.script}</script>`);
    expect(RenderBusyResponse.script).not.toContain("fetch(");
    expect(RenderBusyResponse.script.match(/location\.reload\(\)/g)).toHaveLength(1);
  });

  test("reloads once per refusal, after Retry-After plus jitter, waiting twice as long each time up to 30 s", () => {
    const tab = new Tab();
    const delays = [1, 2, 3, 4, 5, 6, 7].map(() => tab.refused());
    expect(delays).toEqual([1_500, 3_000, 6_000, 12_000, 24_000, 45_000, 45_000]);
    expect(tab.reloads).toBe(7);
  });

  test("starts over once the tab has gone two minutes without a refusal, and still reloads with storage blocked", () => {
    const tab = new Tab();
    expect([tab.refused(), tab.refused()]).toEqual([1_500, 3_000]);
    tab.now += 121_000;
    expect(tab.refused()).toBe(1_500);

    tab.storageFails = true;
    expect(tab.refused()).toBe(1_500);
  });
});
