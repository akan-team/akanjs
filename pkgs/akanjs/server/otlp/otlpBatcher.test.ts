import { describe, expect, test } from "bun:test";
import type { Logger } from "akanjs/common";
import { RequestTrace } from "../../signal/requestTrace";
import { type Fetch, OtlpBatcher } from "./otlpBatcher";
import type { OtlpSignalConfig } from "./otlpConfig";

const secret = "Bearer do-not-print";

interface Sent {
  body: number[];
  headers: Record<string, string>;
  inRequest: boolean;
}

const harness = (answer: (call: number) => Promise<Response>, overrides: Partial<OtlpSignalConfig> = {}) => {
  const sent: Sent[] = [];
  const lines: string[] = [];
  const logger = {
    warn: (message: string) => void lines.push(message),
    info: (message: string) => void lines.push(message),
  } as unknown as Logger;
  const fetchImpl: Fetch = async (_url, init) => {
    sent.push({
      body: JSON.parse(String(init.body)) as number[],
      headers: init.headers as Record<string, string>,
      inRequest: RequestTrace.current() !== undefined,
    });
    return await answer(sent.length);
  };
  const config: OtlpSignalConfig = {
    signal: "traces",
    url: "http://collector.test:4318/v1/traces",
    headers: { authorization: secret },
    timeoutMs: 2_000,
    maxQueue: 10,
    maxBatch: 4,
    delayMs: 60_000,
    ...overrides,
  };
  const batcher = new OtlpBatcher<number>(config, (items) => JSON.stringify(items), logger, fetchImpl);
  return { batcher, sent, lines };
};

const never = () => new Promise<Response>(() => undefined);
const ok = async () => new Response(null, { status: 200 });
const until = async (check: () => boolean, ms = 2_000) => {
  const deadline = Date.now() + ms;
  while (!check() && Date.now() < deadline) await Bun.sleep(5);
};

describe("OTLP batching under a failing collector", () => {
  test("a full queue drops its oldest entries, counts them, and stays at its bound", async () => {
    const { batcher, sent } = harness(never);
    for (let i = 0; i < 23; i++) batcher.push(i);

    expect(sent.map((call) => call.body)).toEqual([
      [0, 1, 2, 3],
      [4, 5, 6, 7],
    ]);
    expect(batcher.stats).toEqual({ queued: 10, exported: 0, dropped: 5, failedBatches: 0 });
    await batcher.shutdown(10);
  });

  test("never more than two requests are in flight, however much is queued", async () => {
    const { batcher, sent } = harness(never, { maxQueue: 100 });
    for (let i = 0; i < 80; i++) batcher.push(i);
    batcher.flush();

    expect(sent).toHaveLength(2);
    expect(batcher.stats.queued).toBe(72);
    await batcher.shutdown(10);
  });

  test("a retryable status is retried as Retry-After says, and the batch arrives", async () => {
    const { batcher, sent, lines } = harness(async (call) =>
      call < 3 ? new Response(null, { status: 503, headers: { "retry-after": "0" } }) : ok(),
    );
    for (let i = 0; i < 4; i++) batcher.push(i);
    await until(() => batcher.stats.exported === 4);

    expect(sent.map((call) => call.body)).toEqual([
      [0, 1, 2, 3],
      [0, 1, 2, 3],
      [0, 1, 2, 3],
    ]);
    expect(batcher.stats).toEqual({ queued: 0, exported: 4, dropped: 0, failedBatches: 0 });
    expect(lines).toEqual([]);
  });

  test("a status the protocol does not retry drops the batch after one request", async () => {
    for (const status of [400, 401, 413, 500]) {
      const { batcher, sent, lines } = harness(async () => new Response("no", { status }));
      for (let i = 0; i < 4; i++) batcher.push(i);
      await until(() => batcher.stats.failedBatches === 1);

      expect(sent).toHaveLength(1);
      expect(batcher.stats).toEqual({ queued: 0, exported: 0, dropped: 4, failedBatches: 1 });
      expect(lines).toEqual([
        `OTLP traces export to collector.test:4318 failed (status ${status}): 4 dropped so far, 0/10 queued`,
      ]);
    }
  });

  test("an unreachable collector is retried with backoff only within the timeout, and is reported once", async () => {
    const { batcher, sent, lines } = harness(
      async () => {
        throw new TypeError("connect ECONNREFUSED");
      },
      { timeoutMs: 400 },
    );
    const startedAt = performance.now();
    for (let i = 0; i < 8; i++) batcher.push(i);
    await until(() => batcher.stats.failedBatches === 2);

    expect(performance.now() - startedAt).toBeLessThan(1_000);
    expect(sent.length).toBeGreaterThan(2);
    expect(batcher.stats).toMatchObject({ exported: 0, dropped: 8, failedBatches: 2 });
    expect(lines).toEqual([
      "OTLP traces export to collector.test:4318 failed (unreachable): 4 dropped so far, 0/10 queued",
    ]);
    expect(lines.join("\n")).not.toContain(secret);
    expect(sent[0]?.headers).toMatchObject({ authorization: secret, "content-type": "application/json" });
  });

  test("an export that answers again after failing says so once, with what it dropped", async () => {
    const { batcher, lines } = harness(async (call) => (call === 1 ? new Response(null, { status: 400 }) : ok()));
    for (let i = 0; i < 4; i++) batcher.push(i);
    await until(() => batcher.stats.failedBatches === 1);
    for (let i = 0; i < 8; i++) batcher.push(i);
    await until(() => batcher.stats.exported === 8);

    expect(lines).toEqual([
      "OTLP traces export to collector.test:4318 failed (status 400): 4 dropped so far, 0/10 queued",
      "OTLP traces export recovered; 4 dropped so far",
    ]);
  });

  test("a partial success counts what the collector refused and is not retried", async () => {
    const { batcher, sent, lines } = harness(async () =>
      Response.json({ partialSuccess: { rejectedSpans: "3", errorMessage: "span too large" } }),
    );
    for (let i = 0; i < 4; i++) batcher.push(i);
    await until(() => batcher.stats.exported === 1);

    expect(sent).toHaveLength(1);
    expect(batcher.stats).toMatchObject({ exported: 1, dropped: 3 });
    expect(lines).toEqual(["OTLP traces collector rejected 3 of 4: span too large"]);
  });
});

describe("OTLP batching outside a failure", () => {
  test("the timer sends a batch smaller than the batch size", async () => {
    const { batcher, sent } = harness(ok, { delayMs: 20 });
    batcher.start();
    batcher.push(1);
    batcher.push(2);
    await until(() => sent.length === 1);

    expect(sent[0]?.body).toEqual([1, 2]);
    await batcher.shutdown(10);
  });

  test("a flush a request's push starts sends outside that request, so the export joins no trace", async () => {
    const { batcher, sent } = harness(ok);
    RequestTrace.run(RequestTrace.fresh(), () => {
      for (let i = 0; i < 4; i++) batcher.push(i);
    });
    await until(() => sent.length === 1);

    expect(sent[0]?.inRequest).toBe(false);
  });

  test("shutdown sends what is queued in one pass, and a collector that never answers cannot hold it past its budget", async () => {
    const answering = harness(ok);
    for (let i = 0; i < 3; i++) answering.batcher.push(i);
    await answering.batcher.shutdown(500);
    answering.batcher.push(9);

    expect(answering.sent.map((call) => call.body)).toEqual([[0, 1, 2]]);
    expect(answering.batcher.stats).toEqual({ queued: 0, exported: 3, dropped: 0, failedBatches: 0 });

    const hanging = harness(never);
    for (let i = 0; i < 6; i++) hanging.batcher.push(i);
    const startedAt = performance.now();
    await hanging.batcher.shutdown(100);

    expect(performance.now() - startedAt).toBeLessThan(400);
    expect(hanging.sent.map((call) => call.body)).toEqual([
      [0, 1, 2, 3],
      [4, 5],
    ]);
  });
});
