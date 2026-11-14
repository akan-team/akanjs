import { afterEach, describe, expect, test } from "bun:test";
import { RequestTrace } from "./requestTrace";
import { type ExportSpan, SpanExport, spanKind } from "./spanExport";
import { runTraced, SignalTrace, setLogContextEnabled, setTraceEnabled, traceAggregator, traceSpan } from "./trace";

const inbound = "0af7651916cd43dd8448eb211c80319c";
const inboundSpan = "b7ad6b7169203331";
const outside = { address: "203.0.113.9" };

const exporting = (decide: (traceId: string, parentSampled: boolean | null) => boolean = () => true) => {
  const asked: (boolean | null)[] = [];
  const spans: ExportSpan[] = [];
  SpanExport.install({
    sample: (traceId, parentSampled) => {
      asked.push(parentSampled);
      return decide(traceId, parentSampled);
    },
    enqueue: (span) => void spans.push(span),
  });
  return { asked, spans };
};

afterEach(() => {
  SpanExport.install(null);
  setTraceEnabled(false);
  setLogContextEnabled(true);
  traceAggregator.reset();
});

describe("head sampling for the OTLP exporter", () => {
  test("a request from outside is sampled at its first hop; one through the gateway's socket keeps the flag it was sent", () => {
    const { asked } = exporting((_, parent) => parent ?? true);
    const first = RequestTrace.accept(new Headers({ traceparent: `00-${inbound}-${inboundSpan}-00` }), outside);
    const unsampled = RequestTrace.accept(new Headers({ traceparent: `00-${inbound}-${inboundSpan}-00` }), null);
    const sampled = RequestTrace.accept(new Headers({ traceparent: `00-${inbound}-${inboundSpan}-01` }), null);
    const direct = RequestTrace.accept(new Headers(), null);

    expect([first.traceId === inbound, first.link, first.sampled]).toEqual([false, inbound, true]);
    expect([unsampled.sampled, sampled.sampled, direct.sampled]).toEqual([false, true, true]);
    expect(asked).toEqual([null, null]);
  });

  test("a trusted parent's flag reaches a parentbased sampler, and a trace minted here is sampled too", () => {
    const { asked } = exporting((_, parent) => parent ?? true);
    const adopted = { traceId: inbound, parentSpanId: inboundSpan, sampled: false, link: null };

    expect(SpanExport.headSample(adopted, false)).toBe(adopted);
    expect(RequestTrace.fresh().sampled).toBe(true);
    expect(asked).toEqual([false, null]);
  });

  test("with no exporter a request is accepted as before and opens no span", () => {
    const request = RequestTrace.accept(new Headers(), outside);

    expect(request.sampled).toBe(false);
    expect(SpanExport.openServerSpan(request, new Request("http://shop.test/"), null)).toBeNull();
  });
});

describe("signal traces the exporter records", () => {
  test("a call under a sampled request records its spans with AKAN_TRACE off, and stays out of the AKAN_TRACE aggregate", async () => {
    setLogContextEnabled(false);
    const { spans } = exporting();
    const request = RequestTrace.fresh();
    const trace = RequestTrace.run(request, () => SignalTrace.create("getUser", "query", "http"));
    await runTraced(trace, async () => await traceSpan("handler", async () => undefined));

    expect([trace?.mode, trace?.exported, trace?.traceparent.endsWith("-01")]).toEqual(["full", true, true]);
    expect(spans.map((span) => span.name)).toEqual(["handler", "query:getUser"]);
    expect(traceAggregator.snapshot().endpoints).toEqual([]);
  });

  test("a call under an unsampled request is not recorded, and a job with no parent is sampled on its own", () => {
    setLogContextEnabled(false);
    const { asked } = exporting((_, parent) => parent === null);
    const request = new RequestTrace({ traceId: inbound, parentSpanId: inboundSpan, sampled: false, link: null });

    expect(RequestTrace.run(request, () => SignalTrace.create("getUser", "query", "http"))).toBeNull();
    setLogContextEnabled(true);
    const context = RequestTrace.run(request, () => SignalTrace.create("getUser", "query", "http"));
    expect([context?.mode, context?.exported]).toEqual(["context", false]);
    expect(SignalTrace.create("nightly", "cron", "internal")?.exported).toBe(true);
    expect(asked).toEqual([null]);
  });

  test("the root span is named after the endpoint, a query is a CLIENT span, and the caller's user id is never exported", async () => {
    const { spans } = exporting();
    const request = RequestTrace.fresh();
    const trace = RequestTrace.run(request, () => SignalTrace.create("getUser", "query", "http"));
    await runTraced(trace, async () => {
      trace?.setAttr("userId", "u-private-1");
      await traceSpan("handler", async () => trace?.recordDbQuery("user", "find", 2));
    });
    const [db, handler, root] = spans;

    expect(spans.every((span) => span.traceId === request.traceId)).toBe(true);
    expect(root).toMatchObject({
      spanId: trace?.spanId,
      parentSpanId: request.spanId,
      name: "query:getUser",
      kind: spanKind.internal,
      attrs: { "akan.endpoint": "query:getUser", "akan.origin": "http", "akan.status": 200 },
      failed: false,
      exception: null,
    });
    expect(handler).toMatchObject({ name: "handler", kind: spanKind.internal, parentSpanId: trace?.spanId, attrs: {} });
    expect(db).toMatchObject({
      name: "db:user.find",
      kind: spanKind.client,
      parentSpanId: handler?.spanId,
      attrs: { "db.collection.name": "user", "db.operation.name": "find" },
    });
    expect(JSON.stringify(spans)).not.toContain("u-private-1");
  });

  test("a call that crashes marks its root span failed with the error's type and code, never its message", async () => {
    const { spans } = exporting();
    const trace = RequestTrace.run(RequestTrace.fresh(), () => SignalTrace.create("getUser", "query", "http"));
    await runTraced(trace, async () => {
      throw new TypeError("driver broke for alice@example.com");
    }).catch(() => undefined);
    const root = spans.find((span) => span.spanId === trace?.spanId);

    expect(root).toMatchObject({
      failed: true,
      exception: { type: "TypeError", message: "internalError" },
      attrs: { "akan.status": 500, "error.type": "TypeError" },
    });
    expect(JSON.stringify(spans)).not.toContain("alice");
  });
});

describe("the server span of a sampled request", () => {
  const request = (path = "/api/getUser?email=alice@example.com", method = "GET") =>
    new Request(`http://shop.test${path}`, { method });

  test("is one SERVER span named by method and route, with the status and no query string", async () => {
    const { spans } = exporting();
    const trace = RequestTrace.accept(new Headers(), outside);
    const response = await RequestTrace.serve(trace, request(), "/api/*", async () => new Response("ok"));

    expect(response?.headers.get("x-request-id")).toBe(trace.traceId);
    expect(spans).toEqual([
      expect.objectContaining({
        traceId: trace.traceId,
        spanId: trace.spanId,
        parentSpanId: null,
        name: "GET /api/*",
        kind: spanKind.server,
        attrs: {
          "http.request.method": "GET",
          "url.scheme": "http",
          "http.route": "/api/*",
          "http.response.status_code": 200,
        },
        failed: false,
        exception: null,
      }),
    ]);
    expect(JSON.stringify(spans)).not.toContain("alice");
  });

  test("fails on a 5xx answer or a throw, and names an unknown method by the protocol's placeholder", async () => {
    const { spans } = exporting();
    const trace = () => RequestTrace.accept(new Headers(), outside);
    RequestTrace.serve(trace(), request("/"), null, () => new Response(null, { status: 503 }));
    const thrown = RequestTrace.serve(trace(), request("/"), "/api/*", async () => {
      throw new TypeError("driver broke for alice@example.com");
    });
    await expect(thrown).rejects.toThrow("driver broke");
    RequestTrace.serve(trace(), request("/", "PROPFIND"), null, () => undefined);
    const [unavailable, crashed, unknown] = spans;

    expect(unavailable).toMatchObject({ name: "GET", failed: true, attrs: { "error.type": "503" } });
    expect(crashed).toMatchObject({ failed: true, exception: { type: "TypeError", message: "internalError" } });
    expect(crashed?.attrs["http.response.status_code"]).toBeUndefined();
    expect(unknown).toMatchObject({ name: "HTTP", attrs: { "http.request.method": "_OTHER" } });
    expect(JSON.stringify(spans)).not.toContain("alice");
  });

  test("an unsampled request is answered as before and exports nothing", async () => {
    const { spans } = exporting(() => false);
    const trace = RequestTrace.accept(new Headers(), outside);
    const response = await RequestTrace.serve(trace, request(), "/api/*", async () => new Response("ok"));

    expect([trace.sampled, response?.headers.get("x-request-id"), spans]).toEqual([false, trace.traceId, []]);
  });
});
