import { describe, expect, test } from "bun:test";
import { McpProgress } from "./McpProgress";

/** A macrotask boundary, which flushes every pending microtask — enough for the pump to make all the progress it can. */
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("McpProgress", () => {
  test("delivers a report pushed while the consumer was suspended on a yield", async () => {
    // The real pump writes each event to a stream between reports, so the consumer is suspended inside `yield`
    // for a moment on every one. A report arriving in that window finds nothing to wake and used to sit in the
    // queue until the next report or the end of the call — which for the last one is the whole call.
    const channel = new McpProgress();
    const seen: number[] = [];
    let release: (() => void) | null = null;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const pump = (async () => {
      for await (const report of channel.reports()) {
        seen.push(report.progress);
        if (report.progress === 1) await held;
      }
    })();

    let seenDuringCall: number[] = [];
    await McpProgress.run(channel, async () => {
      McpProgress.report(1);
      await channel.started;
      await tick();
      McpProgress.report(2);
      release?.();
      await tick();
      seenDuringCall = [...seen];
    });
    channel.end();
    await pump;

    expect(seenDuringCall).toEqual([1, 2]);
    expect(seen).toEqual([1, 2]);
  });

  test("still owes a report pushed in the same tick the call ended", async () => {
    const channel = new McpProgress();
    const seen: number[] = [];
    const pump = (async () => {
      for await (const report of channel.reports()) seen.push(report.progress);
    })();
    await McpProgress.run(channel, async () => {
      McpProgress.report(1);
    });
    channel.end();
    await pump;
    expect(seen).toEqual([1]);
  });

  test("is a no-op outside a streamed call", () => {
    expect(McpProgress.streaming).toBe(false);
    expect(() => McpProgress.report(1)).not.toThrow();
  });
});
