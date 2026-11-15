import { describe, expect, test } from "bun:test";
import type { Logger } from "akanjs/common";
import { runTraced, SignalTrace } from "../signal/trace";
import { metricRegistry } from "./metrics/metricRegistry";
import { RscRenderAdmission } from "./rscRenderAdmission";
import { RscRenderRefusal } from "./rscRenderRefusal";

const never = () => false;

const entering = async (entered: boolean | Promise<boolean>): Promise<unknown> => {
  try {
    return await entered;
  } catch (error) {
    return error;
  }
};

const gauge = (name: string) => {
  const sample = metricRegistry.snapshot().find((family) => family.name === name)?.samples[0];
  return sample && "value" in sample ? sample.value : 0;
};

const warnings = () => {
  const messages: string[] = [];
  return { messages, logger: { warn: (message: string) => messages.push(message) } as unknown as Logger };
};

const refusals = (reason: string) => {
  const samples =
    metricRegistry.snapshot().find(({ name }) => name === "akan_rsc_render_refusals_total")?.samples ?? [];
  const sample = samples.find(({ labels }) => labels.reason === reason);
  return sample && "value" in sample ? sample.value : 0;
};

describe("RscRenderAdmission settings", () => {
  test("no cap, no depth limit and no time limits unless a cap is set", () => {
    const off = { limit: 0, maxQueue: 0, maxWaitMs: 0, maxHoldMs: 0 };
    expect(RscRenderAdmission.options({})).toEqual(off);
    expect(RscRenderAdmission.options({ AKAN_RSC_WORKER_MAX_QUEUE: "8" })).toEqual(off);
    for (const value of ["0", "off", "OFF", " "])
      expect(RscRenderAdmission.options({ AKAN_RSC_WORKER_MAX_CONCURRENCY: value })).toEqual(off);
  });

  test("a cap brings a depth limit of the cap times the idle timeout's seconds, and that timeout as the wait and hold limits", () => {
    expect(RscRenderAdmission.options({ AKAN_RSC_WORKER_MAX_CONCURRENCY: "4" })).toEqual({
      limit: 4,
      maxQueue: 480,
      maxWaitMs: 120_000,
      maxHoldMs: 120_000,
    });
    expect(RscRenderAdmission.options({ AKAN_RSC_WORKER_MAX_CONCURRENCY: "4", AKAN_IDLE_TIMEOUT: "30s" })).toEqual({
      limit: 4,
      maxQueue: 120,
      maxWaitMs: 30_000,
      maxHoldMs: 30_000,
    });
  });

  test("with the idle timeout off, as under `akan start`, the limits are those of the default idle timeout, never none", () => {
    const limits = { limit: 2, maxQueue: 240, maxWaitMs: 120_000, maxHoldMs: 120_000 };
    expect(RscRenderAdmission.options({ AKAN_RSC_WORKER_MAX_CONCURRENCY: "2", AKAN_IDLE_TIMEOUT: "0" })).toEqual(
      limits,
    );
    expect(RscRenderAdmission.options({ AKAN_RSC_WORKER_MAX_CONCURRENCY: "2", AKAN_COMMAND_TYPE: "start" })).toEqual(
      limits,
    );
  });

  test("the depth limit takes its own value, and `0` or `off` lets the queue grow", () => {
    const withQueue = (value: string) =>
      RscRenderAdmission.options({ AKAN_RSC_WORKER_MAX_CONCURRENCY: "4", AKAN_RSC_WORKER_MAX_QUEUE: value }).maxQueue;
    expect(withQueue("32")).toBe(32);
    expect(withQueue("0")).toBe(0);
    expect(withQueue("off")).toBe(0);
    expect(withQueue("many")).toBe(480);
  });

  test("a value it cannot read is named in one warning, and the default is used", () => {
    const { messages, logger } = warnings();
    for (const value of ["4x", "1.5", "-2"])
      expect(RscRenderAdmission.options({ AKAN_RSC_WORKER_MAX_CONCURRENCY: value }, logger).limit).toBe(0);
    RscRenderAdmission.options({ AKAN_RSC_WORKER_MAX_CONCURRENCY: "4x" }, logger);
    RscRenderAdmission.options({ AKAN_RSC_WORKER_MAX_CONCURRENCY: "4", AKAN_RSC_WORKER_MAX_QUEUE: "lots" }, logger);
    expect(messages).toEqual([
      'AKAN_RSC_WORKER_MAX_CONCURRENCY="4x" is not a whole number such as 8, or off; using the default.',
      'AKAN_RSC_WORKER_MAX_CONCURRENCY="1.5" is not a whole number such as 8, or off; using the default.',
      'AKAN_RSC_WORKER_MAX_CONCURRENCY="-2" is not a whole number such as 8, or off; using the default.',
      'AKAN_RSC_WORKER_MAX_QUEUE="lots" is not a whole number such as 8, or off; using the default.',
    ]);

    const quiet = warnings();
    for (const value of ["", "0", "off", "8"])
      RscRenderAdmission.options({ AKAN_RSC_WORKER_MAX_CONCURRENCY: value }, quiet.logger);
    expect(quiet.messages).toEqual([]);
  });
});

describe("RscRenderAdmission", () => {
  test("with no cap a render starts in the turn it asks, counted and never queued or refused", () => {
    const admission = new RscRenderAdmission({ limit: 0, maxQueue: 1, maxWaitMs: 1 });
    const cancelled = () => {
      throw new Error("an uncapped render is not asked whether it was cancelled");
    };
    expect(admission.enter("a", cancelled)).toBe(true);
    expect(admission.enter("b", cancelled)).toBe(true);
    admission.sample();
    expect([gauge("akan_rsc_renders_in_flight"), gauge("akan_rsc_render_queue_depth")]).toEqual([2, 0]);

    admission.abandon("a");
    admission.leave("a", null);
    admission.leave("b", null);
    admission.sample();
    expect([gauge("akan_rsc_renders_in_flight"), gauge("akan_rsc_renders_abandoned")]).toEqual([0, 0]);
  });

  test("under a cap a render that finds a free slot also starts in the turn it asks", () => {
    const admission = new RscRenderAdmission({ limit: 1, maxQueue: 0, maxWaitMs: 0 });
    expect(admission.enter("holder", never)).toBe(true);
    expect(admission.enter("waiter", never)).toBeInstanceOf(Promise);
  });

  test("a render refused for depth fails with a 503 `renderQueueFull` and is counted by its reason", async () => {
    const admission = new RscRenderAdmission({ limit: 1, maxQueue: 1, maxWaitMs: 0 });
    const before = refusals("queue-full");
    await admission.enter("holder", never);
    void admission.enter("waiter", never);

    const refused = await entering((async () => await admission.enter("refused", never))());
    expect(refused).toBeInstanceOf(RscRenderRefusal);
    expect(refused).toMatchObject({ code: "renderQueueFull", statusCode: 503 });
    expect(refusals("queue-full") - before).toBe(1);
  });

  test("a render refused for its wait fails with a 503 `renderQueueTimeout`", async () => {
    const admission = new RscRenderAdmission({ limit: 1, maxQueue: 0, maxWaitMs: 20 });
    const before = refusals("wait-timeout");
    await admission.enter("holder", never);

    const refused = await entering(admission.enter("late", never));
    expect(refused).toMatchObject({ code: "renderQueueTimeout", statusCode: 503 });
    expect(refusals("wait-timeout") - before).toBe(1);
  });

  test("a slot held past the hold limit goes to the next render, counted as `hold-timeout`, and its render as abandoned until it ends", async () => {
    const admission = new RscRenderAdmission({ limit: 1, maxQueue: 0, maxWaitMs: 0, maxHoldMs: 30 });
    const before = refusals("hold-timeout");
    await admission.enter("stuck", never);
    expect(await admission.enter("next", never)).toBe(true);
    admission.sample();
    expect([gauge("akan_rsc_renders_in_flight"), gauge("akan_rsc_renders_abandoned")]).toEqual([1, 1]);
    expect(refusals("hold-timeout") - before).toBe(1);

    admission.leave("stuck", null);
    admission.leave("next", null);
    admission.sample();
    expect([gauge("akan_rsc_renders_in_flight"), gauge("akan_rsc_renders_abandoned")]).toEqual([0, 0]);
  });

  test("a cancelled render gives its slot up at once and counts as abandoned until it ends; a cancelled waiter never counts", async () => {
    const admission = new RscRenderAdmission({ limit: 1, maxQueue: 0, maxWaitMs: 0 });
    await admission.enter("running", never);
    const waiter = admission.enter("waiter", never);
    const next = admission.enter("next", never);
    admission.abandon("waiter");
    admission.abandon("running");
    expect(await waiter).toBe(false);
    expect(await next).toBe(true);
    admission.sample();
    expect([gauge("akan_rsc_renders_in_flight"), gauge("akan_rsc_renders_abandoned")]).toEqual([1, 1]);

    admission.leave("running", null);
    admission.leave("waiter", null);
    admission.abandon("running");
    admission.sample();
    expect(gauge("akan_rsc_renders_abandoned")).toBe(0);
  });

  test("the wait is a span and an attribute of the render's trace, and a render that did not wait gets neither", async () => {
    const admission = new RscRenderAdmission({ limit: 1, maxQueue: 0, maxWaitMs: 0 });
    const unqueued = new SignalTrace("/docs", "page", { mode: "full", origin: "page" });
    await runTraced(unqueued, async () => await admission.enter("holder", never));
    expect(unqueued.spans.map(({ name }) => name)).toEqual(["total"]);
    expect(unqueued.attrs.queueMs).toBeUndefined();

    const queued = new SignalTrace("/docs", "page", { mode: "full", origin: "page" });
    const entered = runTraced(queued, async () => await admission.enter("waiter", never));
    await Bun.sleep(30);
    admission.leave("holder", null);
    expect(await entered).toBe(true);
    const span = queued.spans.find(({ name }) => name === "renderQueue");
    expect(span?.durationMs).toBeGreaterThanOrEqual(25);
    expect(span?.parentId).toBe(queued.spanId);
    expect(queued.attrs.queueMs).toBeGreaterThanOrEqual(25);
  });

  test("a render cancelled before it asks, or in the turn its slot came, does not start", async () => {
    const admission = new RscRenderAdmission({ limit: 1, maxQueue: 0, maxWaitMs: 0 });
    expect(admission.enter("gone", () => true)).toBe(false);

    await admission.enter("holder", never);
    let cancelled = false;
    const waiter = admission.enter("waiter", () => cancelled);
    const next = admission.enter("next", never);
    admission.leave("holder", null);
    cancelled = true;
    admission.abandon("waiter");
    expect(await waiter).toBe(false);
    expect(await next).toBe(true);
  });
});
