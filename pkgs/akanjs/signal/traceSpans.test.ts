import { afterEach, describe, expect, test } from "bun:test";
import { RequestTrace } from "./requestTrace";
import {
  runTraced,
  SignalTrace,
  type SpanRecord,
  setLocalServerTiming,
  setTraceEnabled,
  traceAggregator,
  traceSpan,
} from "./trace";

const env = {
  AKAN_PUBLIC_ENV: process.env.AKAN_PUBLIC_ENV,
  AKAN_PUBLIC_OPERATION_MODE: process.env.AKAN_PUBLIC_OPERATION_MODE,
  AKAN_LOG_DEBUG_HEADER: process.env.AKAN_LOG_DEBUG_HEADER,
  AKAN_COMMAND_TYPE: process.env.AKAN_COMMAND_TYPE,
  NODE_ENV: process.env.NODE_ENV,
};

afterEach(() => {
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  setTraceEnabled(false);
  setLocalServerTiming(null);
  traceAggregator.reset();
});

const production = (secret?: string) => {
  process.env.AKAN_PUBLIC_ENV = "main";
  process.env.NODE_ENV = "production";
  if (secret) process.env.AKAN_LOG_DEBUG_HEADER = secret;
  else delete process.env.AKAN_LOG_DEBUG_HEADER;
  setLocalServerTiming(null);
};

const byName = (trace: SignalTrace, name: string) => trace.spans.find((span) => span.name === name) as SpanRecord;

describe("SignalTrace spans", () => {
  test("gives each span an id, the span it ran inside as its parent, and its offset from the start of the call", async () => {
    const request = RequestTrace.fresh();
    const trace = new SignalTrace("listMemo", "query", { mode: "full", parent: request });

    await runTraced(trace, async () => {
      await traceSpan("guards", async () => await Bun.sleep(2));
      await traceSpan("handler", async () => {
        await Bun.sleep(5);
        await traceSpan("serialize", async () => undefined);
        trace.recordDbQuery("memo", "find", 3);
      });
      trace.recordSpan("argRead", 1);
    });

    const [guards, handler, serialize, db, argRead, total] = [
      "guards",
      "handler",
      "serialize",
      "db:memo.find",
      "argRead",
    ]
      .map((name) => byName(trace, name))
      .concat(byName(trace, "total"));
    const ids = trace.spans.map((span) => span.id);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{16}$/);
    expect(new Set(ids).size).toBe(6);
    expect(total).toMatchObject({ id: trace.spanId, parentId: request.spanId, startMs: 0 });
    expect([guards?.parentId, handler?.parentId, argRead?.parentId]).toEqual([
      trace.spanId,
      trace.spanId,
      trace.spanId,
    ]);
    expect([serialize?.parentId, db?.parentId]).toEqual([handler?.id ?? "", handler?.id ?? ""]);
    expect(db?.attrs).toEqual({ model: "memo", op: "find" });
    expect(guards?.startMs).toBeLessThan(handler?.startMs ?? 0);
    expect(handler?.startMs).toBeGreaterThanOrEqual(2);
    expect(serialize?.startMs).toBeGreaterThanOrEqual((handler?.startMs ?? 0) + 4);
    expect((handler?.startMs ?? 0) + (handler?.durationMs ?? 0)).toBeLessThanOrEqual(total?.durationMs ?? 0);
    expect([trace.dbQueryCount, trace.dbQueryMs]).toEqual([1, 3]);
  });

  test("keeps the parents of two calls that overlap apart", async () => {
    const first = new SignalTrace("a", "query", { mode: "full" });
    const second = new SignalTrace("b", "query", { mode: "full" });
    const work = (trace: SignalTrace) =>
      runTraced(trace, () =>
        traceSpan("handler", async () => {
          await Bun.sleep(3);
          await traceSpan("inner", async () => await Bun.sleep(1));
        }),
      );

    await Promise.all([work(first), work(second)]);

    for (const trace of [first, second]) {
      expect(byName(trace, "inner").parentId).toBe(byName(trace, "handler").id);
      expect(byName(trace, "handler").parentId).toBe(trace.spanId);
    }
    expect(byName(first, "handler").id).not.toBe(byName(second, "handler").id);
  });

  test("records nothing when tracing is off, and the call's own span even past the span limit", async () => {
    const off = new SignalTrace("listMemo", "query", { mode: "context" });
    await runTraced(off, async () => {
      await traceSpan("handler", async () => undefined);
      off.recordDbQuery("memo", "find", 3);
    });
    const busy = new SignalTrace("listMemo", "query", { mode: "full" });
    await runTraced(busy, async () => {
      for (let idx = 0; idx < 100; idx += 1) busy.recordDbQuery("memo", "findOne", 1);
    });

    expect(off.spans).toEqual([]);
    expect(off.dbQueryCount).toBe(0);
    expect(busy.spans).toHaveLength(65);
    expect(busy.spans.at(-1)).toMatchObject({ name: "total", id: busy.spanId });
    expect(busy.dbQueryCount).toBe(100);
  });
});

describe("Server-Timing", () => {
  const answer = async (trace: SignalTrace | null, debug?: string) =>
    await runTraced(trace, async () => {
      trace?.applyDebugHeader(debug);
      await traceSpan("handler", async () => {
        await Bun.sleep(4);
        trace?.recordDbQuery("memo", "find", 2.04);
      });
      return new Response("ok");
    });

  test("is not sent to a production caller, with tracing on or with a debug header that does not match", async () => {
    production("s3cret");
    setTraceEnabled(true);

    const plain = await answer(SignalTrace.create("listMemo", "query", "http"));
    const wrong = await answer(SignalTrace.create("listMemo", "query", "http"), "guess");
    production();
    const unset = await answer(SignalTrace.create("listMemo", "query", "http"), "s3cret");

    expect([plain, wrong, unset].map((response) => response.headers.get("server-timing"))).toEqual([null, null, null]);
  });

  test("shows a call that carries the debug secret where its time went, without AKAN_TRACE", async () => {
    production("s3cret");
    const trace = SignalTrace.create("listMemo", "query", "http");

    const response = await answer(trace, "s3cret");

    expect(trace?.mode).toBe("full");
    expect(response.headers.get("server-timing")).toMatch(
      /^total;dur=[\d.]+, handler;dur=[\d.]+, db;desc="memo\.find";dur=2$/,
    );
    expect(traceAggregator.snapshot().endpoints).toEqual([]);
  });

  test("is sent in a local runtime, as the total alone until spans are recorded", async () => {
    process.env.AKAN_PUBLIC_ENV = "local";
    delete process.env.AKAN_PUBLIC_OPERATION_MODE;
    process.env.NODE_ENV = "development";
    setLocalServerTiming(null);

    const context = await answer(SignalTrace.create("listMemo", "query", "http"));
    setTraceEnabled(true);
    const full = await answer(SignalTrace.create("listMemo", "query", "http"));
    const untraced = await answer(null);

    expect(context.headers.get("server-timing")).toMatch(/^total;dur=[\d.]+$/);
    expect(full.headers.get("server-timing")).toMatch(/^total;dur=[\d.]+, handler;dur=[\d.]+, db;desc="memo\.find"/);
    expect(untraced.headers.get("server-timing")).toBeNull();
    expect(traceAggregator.snapshot().endpoints.map((stat) => stat.endpoint)).toEqual(["query:listMemo"]);
  });

  test("leaves a response whose headers refuse a write as it is", async () => {
    setLocalServerTiming(true);
    class LockedHeaders extends Headers {
      override set(): void {
        throw new TypeError("immutable");
      }
    }
    const locked = new Response("proxied");
    Object.defineProperty(locked, "headers", { value: new LockedHeaders() });

    const response = await runTraced(SignalTrace.create("proxy", "query", "http"), async () => locked);

    expect(response).toBe(locked);
    expect(await response.text()).toBe("proxied");
  });

  test("sends names as header tokens only, and stops at a bounded number of entries", async () => {
    const trace = new SignalTrace("listMemo", "query", { mode: "full" });
    await runTraced(trace, async () => {
      trace.recordSpan('odd name"; injected=1\r\nx-other: 1', 1);
      trace.recordDbQuery('memo"\r\n', "find all", 1);
      for (let idx = 0; idx < 60; idx += 1) trace.recordSpan(`step${idx}`, 1);
    });

    const header = trace.serverTiming();

    expect(header).not.toMatch(/[\r\n]/);
    expect(header).toContain("odd_name___injected_1__x-other__1;dur=1");
    expect(header).toContain('db;desc="memo___.find_all";dur=1');
    expect(header.split(", ")).toHaveLength(32);
  });
});
