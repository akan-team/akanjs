import { afterEach, describe, expect, test } from "bun:test";
import { definePlugin } from "../src/index.ts";
import { resetRuntime, runtime, SEQ_GAP_MS, type Timers } from "../src/runtime.ts";

// Bridge v1.1 ordering (docs/architecture.md §4) without real waiting: the runtime's timers run on a
// virtual clock, and messages arrive in orders a seeded random generator picks (RN Fantom's idea).

interface EchoApi {
  echo(args: { n: number }): Promise<{ n: number }>;
}
const echo = definePlugin<EchoApi, { tick: { n: number } }>("echo", { methods: ["echo"], events: ["tick"] });

/** Timers on a virtual clock. `runDue` runs what is due, each as its own task (microtasks drained between). */
class VirtualClock implements Timers {
  now = 0;
  private next = 0;
  private tasks: { at: number; order: number; fn: () => void }[] = [];
  set(fn: () => void, ms: number) {
    const task = { at: this.now + ms, order: this.next++, fn };
    this.tasks.push(task);
    return task;
  }
  clear(handle: unknown) {
    this.tasks = this.tasks.filter((t) => t !== handle);
  }
  async runDue() {
    for (;;) {
      this.tasks.sort((a, b) => a.at - b.at || a.order - b.order);
      const task = this.tasks[0];
      if (!task || task.at > this.now) return;
      this.tasks.shift();
      task.fn();
      await microtasks();
    }
  }
  async advance(ms: number) {
    this.now += ms;
    await this.runDue();
  }
}

/** Lets every pending promise reaction run (the calls' await chains are a few reactions deep). */
async function microtasks() {
  for (let i = 0; i < 20; i++) await null;
}

/** A small seeded generator (mulberry32), so a failing order can be replayed from its seed. */
function random(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Planned = { kind: "response"; n: number } | { kind: "event"; n: number };

/**
 * An iOS host whose replies the test releases: each call's reply waits until `arrive` delivers it.
 * Events go through __AKAN_NATIVE__.receive like callAsyncJavaScript. Messages carry the plan's seq.
 */
function host(clock: VirtualClock) {
  const g = globalThis as any;
  const replies = new Map<number, (reply: string) => void>();
  g.__AKAN_NATIVE__ = { platform: "ios", plugins: { echo: { methods: ["echo"], events: ["tick"] } } };
  g.webkit = {
    messageHandlers: {
      akanNative: {
        postMessage: (text: string) => {
          const req = JSON.parse(text);
          if (req.method === "$listen") return Promise.resolve(JSON.stringify({ v: 1, id: req.id, ok: true }));
          return new Promise<string>((resolve) =>
            replies.set(req.args.n, (reply) => resolve(reply.replace("REQ", String(req.id)))),
          );
        },
      },
    },
  };
  runtime().timers = clock;
  return {
    /** Delivers message `seq` of the plan. */
    arrive(plan: Planned[], index: number) {
      const doc = runtime().doc;
      const m = plan[index]!;
      const seq = index + 1;
      if (m.kind === "response")
        replies.get(m.n)!(`{"v":1,"id":REQ,"ok":true,"result":{"n":${m.n}},"doc":"${doc}","seq":${seq}}`);
      else
        g.__AKAN_NATIVE__.receive(JSON.stringify({ v: 1, plugin: "echo", event: "tick", data: { n: m.n }, doc, seq }));
    },
  };
}

afterEach(() => {
  const g = globalThis as any;
  delete g.webkit;
  delete g.__AKAN_NATIVE__;
  resetRuntime();
});

describe("bridge order on a virtual clock", () => {
  test("any arrival order: seq order, and a response's awaiting code runs before the events after it", async () => {
    for (let seed = 1; seed <= 150; seed++) {
      resetRuntime();
      const rand = random(seed);
      const clock = new VirtualClock();
      const h = host(clock);
      const seen: string[] = [];
      const stop = echo.listen("tick", ({ n }) => seen.push(`event ${n}`));
      await microtasks();
      await clock.runDue();
      // A plan: the host's messages in its order (seq 1..n), responses and events mixed.
      const plan: Planned[] = [];
      for (let i = 0, count = 3 + Math.floor(rand() * 6); i < count; i++)
        plan.push(rand() < 0.5 ? { kind: "response", n: i } : { kind: "event", n: i });
      for (const m of plan)
        if (m.kind === "response") void echo.echo({ n: m.n }).then(({ n }) => seen.push(`answer ${n}`));
      await microtasks();
      // They arrive in a random order, each in its own task.
      const arrival = plan.map((_, i) => i).sort(() => rand() - 0.5);
      for (const index of arrival) {
        h.arrive(plan, index);
        await microtasks();
        await clock.runDue();
      }
      await clock.advance(0);
      const expected = plan.map((m) => (m.kind === "response" ? `answer ${m.n}` : `event ${m.n}`));
      expect({ seed, seen }).toEqual({ seed, seen: expected });
      stop();
    }
  });

  test("a number that never arrives holds later messages for SEQ_GAP_MS of virtual time", async () => {
    const clock = new VirtualClock();
    const h = host(clock);
    const seen: number[] = [];
    const stop = echo.listen("tick", ({ n }) => seen.push(n));
    await microtasks();
    await clock.runDue();
    const plan: Planned[] = [
      { kind: "event", n: 1 },
      { kind: "event", n: 2 },
      { kind: "event", n: 3 },
    ];
    h.arrive(plan, 2); // seq 3; seq 1 and 2 are late
    await clock.advance(SEQ_GAP_MS - 1);
    expect(seen).toEqual([]);
    await clock.advance(1);
    expect(seen).toEqual([3]);
    h.arrive(plan, 0); // late: delivered as it comes
    await clock.runDue();
    expect(seen).toEqual([3, 1]);
    stop();
  });
});
