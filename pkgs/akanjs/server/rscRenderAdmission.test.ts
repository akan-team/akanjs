import { describe, expect, test } from "bun:test";
import { runTraced, SignalTrace } from "../signal/trace";
import { metricRegistry } from "./metrics/metricRegistry";
import { RscRenderAdmission } from "./rscRenderAdmission";
import { RscRenderRefusal } from "./rscRenderRefusal";

const never = () => false;

const refusals = (reason: string) => {
  const samples =
    metricRegistry.snapshot().find(({ name }) => name === "akan_rsc_render_refusals_total")?.samples ?? [];
  const sample = samples.find(({ labels }) => labels.reason === reason);
  return sample && "value" in sample ? sample.value : 0;
};

describe("RscRenderAdmission settings", () => {
  test("no cap, no depth limit and no wait limit unless a cap is set", () => {
    expect(RscRenderAdmission.options({})).toEqual({ limit: 0, maxQueue: 0, maxWaitMs: 0 });
    expect(RscRenderAdmission.options({ AKAN_RSC_WORKER_MAX_QUEUE: "8" })).toEqual({
      limit: 0,
      maxQueue: 0,
      maxWaitMs: 0,
    });
    for (const off of ["0", "off", "OFF", " ", "four", "-2", "1.5"])
      expect(RscRenderAdmission.options({ AKAN_RSC_WORKER_MAX_CONCURRENCY: off }).limit).toBe(0);
  });

  test("a cap brings a depth limit of the cap times the idle timeout's seconds, and that timeout as the wait limit", () => {
    expect(RscRenderAdmission.options({ AKAN_RSC_WORKER_MAX_CONCURRENCY: "4" })).toEqual({
      limit: 4,
      maxQueue: 480,
      maxWaitMs: 120_000,
    });
    expect(RscRenderAdmission.options({ AKAN_RSC_WORKER_MAX_CONCURRENCY: "4", AKAN_IDLE_TIMEOUT: "30s" })).toEqual({
      limit: 4,
      maxQueue: 120,
      maxWaitMs: 30_000,
    });
  });

  test("with the idle timeout off a render waits as long as its client does, behind the default depth limit", () => {
    const off = { AKAN_RSC_WORKER_MAX_CONCURRENCY: "2", AKAN_IDLE_TIMEOUT: "0" };
    expect(RscRenderAdmission.options(off)).toEqual({ limit: 2, maxQueue: 240, maxWaitMs: 0 });
    expect(RscRenderAdmission.options({ AKAN_RSC_WORKER_MAX_CONCURRENCY: "2", AKAN_COMMAND_TYPE: "start" })).toEqual({
      limit: 2,
      maxQueue: 240,
      maxWaitMs: 0,
    });
  });

  test("the depth limit takes its own value, and `0` or `off` lets the queue grow", () => {
    const withQueue = (value: string) =>
      RscRenderAdmission.options({ AKAN_RSC_WORKER_MAX_CONCURRENCY: "4", AKAN_RSC_WORKER_MAX_QUEUE: value }).maxQueue;
    expect(withQueue("32")).toBe(32);
    expect(withQueue("0")).toBe(0);
    expect(withQueue("off")).toBe(0);
    expect(withQueue("many")).toBe(480);
  });
});

describe("RscRenderAdmission", () => {
  test("a render refused for depth fails with a 503 `renderQueueFull` and is counted by its reason", async () => {
    const admission = new RscRenderAdmission({ limit: 1, maxQueue: 1, maxWaitMs: 0 });
    const before = refusals("queue-full");
    await admission.enter("holder", never);
    void admission.enter("waiter", never);

    const refused = await admission.enter("refused", never).catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(RscRenderRefusal);
    expect(refused).toMatchObject({ code: "renderQueueFull", statusCode: 503 });
    expect(refusals("queue-full") - before).toBe(1);
  });

  test("a render refused for its wait fails with a 503 `renderQueueTimeout`", async () => {
    const admission = new RscRenderAdmission({ limit: 1, maxQueue: 0, maxWaitMs: 20 });
    const before = refusals("wait-timeout");
    await admission.enter("holder", never);

    const refused = await admission.enter("late", never).catch((error: unknown) => error);
    expect(refused).toMatchObject({ code: "renderQueueTimeout", statusCode: 503 });
    expect(refusals("wait-timeout") - before).toBe(1);
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
    admission.leave("holder");
    expect(await entered).toBe(true);
    const span = queued.spans.find(({ name }) => name === "renderQueue");
    expect(span?.durationMs).toBeGreaterThanOrEqual(25);
    expect(span?.parentId).toBe(queued.spanId);
    expect(queued.attrs.queueMs).toBeGreaterThanOrEqual(25);
  });

  test("a render cancelled before it asks, or in the turn its slot came, does not start", async () => {
    const admission = new RscRenderAdmission({ limit: 1, maxQueue: 0, maxWaitMs: 0 });
    expect(await admission.enter("gone", () => true)).toBe(false);

    await admission.enter("holder", never);
    let cancelled = false;
    const waiter = admission.enter("waiter", () => cancelled);
    const next = admission.enter("next", never);
    admission.leave("holder");
    cancelled = true;
    admission.leave("waiter");
    expect(await waiter).toBe(false);
    expect(await next).toBe(true);
  });
});
