import { describe, expect, test } from "bun:test";
import type { LogRecord } from "akanjs/common";
import { type ExportSpan, spanKind } from "../../signal/spanExport";
import { OtlpEncode, unixNano } from "./otlpEncode";

const traceId = "4bf92f3577b34da6a3ce929d0e0e4736";
const span = (overrides: Partial<ExportSpan> = {}): ExportSpan => ({
  traceId,
  spanId: "00f067aa0ba902b7",
  parentSpanId: "b7ad6b7169203331",
  name: "GET /api/*",
  kind: spanKind.server,
  startMs: 10,
  endMs: 12.5,
  attrs: { "http.request.method": "GET", "http.response.status_code": 200, ratio: 0.25, ok: true },
  link: null,
  failed: false,
  exception: null,
  ...overrides,
});

const record = (overrides: Partial<LogRecord> = {}): LogRecord => ({
  at: 1_700_000_000_123,
  elapsedMs: 5,
  level: "warn",
  sev: 13,
  name: "Replica",
  context: "",
  message: "replica answering a page",
  stream: "stdout",
  pid: 1,
  replicaIdx: 0,
  role: "federation",
  origin: "http",
  traceId,
  endpoint: "query:getUser",
  attrs: { ms: 12, userId: "[redacted]" },
  ...overrides,
});

describe("OTLP/JSON bodies", () => {
  test("a span body is resourceSpans → scopeSpans → spans with hex ids, an integer kind and nanosecond strings", () => {
    const body = JSON.parse(
      OtlpEncode.traces({ "service.name": "shop", "process.pid": 42 }, [span()], 1_700_000_000_000),
    );
    const [resourceSpans] = body.resourceSpans;
    const [encoded] = resourceSpans.scopeSpans[0].spans;

    expect(resourceSpans.resource.attributes).toEqual([
      { key: "service.name", value: { stringValue: "shop" } },
      { key: "process.pid", value: { intValue: "42" } },
    ]);
    expect(resourceSpans.scopeSpans[0].scope).toEqual({ name: "akanjs" });
    expect(encoded).toEqual({
      traceId,
      spanId: "00f067aa0ba902b7",
      parentSpanId: "b7ad6b7169203331",
      flags: 1,
      name: "GET /api/*",
      kind: 2,
      startTimeUnixNano: "1700000000010000000",
      endTimeUnixNano: "1700000000012500000",
      attributes: [
        { key: "http.request.method", value: { stringValue: "GET" } },
        { key: "http.response.status_code", value: { intValue: "200" } },
        { key: "ratio", value: { doubleValue: 0.25 } },
        { key: "ok", value: { boolValue: true } },
      ],
    });
  });

  test("a root span leaves parentSpanId out, a failure sets status ERROR with an exception event, a link has the trace id", () => {
    const body = JSON.parse(
      OtlpEncode.traces(
        {},
        [
          span({
            parentSpanId: null,
            link: "0af7651916cd43dd8448eb211c80319c",
            failed: true,
            exception: { type: "TypeError", message: "internalServerError" },
          }),
        ],
        0,
      ),
    );
    const [encoded] = body.resourceSpans[0].scopeSpans[0].spans;

    expect(encoded.parentSpanId).toBeUndefined();
    expect(encoded.status).toEqual({ code: 2 });
    expect(encoded.links).toEqual([{ traceId: "0af7651916cd43dd8448eb211c80319c", spanId: "" }]);
    expect(encoded.events).toEqual([
      {
        timeUnixNano: encoded.endTimeUnixNano,
        name: "exception",
        attributes: [
          { key: "exception.type", value: { stringValue: "TypeError" } },
          { key: "exception.message", value: { stringValue: "internalServerError" } },
        ],
      },
    ]);
    expect(
      JSON.parse(OtlpEncode.traces({}, [span()], 0)).resourceSpans[0].scopeSpans[0].spans[0].status,
    ).toBeUndefined();
  });

  test("a log body is resourceLogs → scopeLogs → logRecords with severity, a string body and the request's ids", () => {
    const body = JSON.parse(
      OtlpEncode.logs({ "service.name": "shop" }, [{ record: record(), spanId: "00f067aa0ba902b7", sampled: true }]),
    );
    const [encoded] = body.resourceLogs[0].scopeLogs[0].logRecords;

    expect(body.resourceLogs[0].scopeLogs[0].scope).toEqual({ name: "akanjs" });
    expect(encoded).toEqual({
      timeUnixNano: "1700000000123000000",
      observedTimeUnixNano: "1700000000123000000",
      severityNumber: 13,
      severityText: "WARN",
      body: { stringValue: "replica answering a page" },
      attributes: [
        { key: "ms", value: { intValue: "12" } },
        { key: "userId", value: { stringValue: "[redacted]" } },
        { key: "akan.logger", value: { stringValue: "Replica" } },
        { key: "akan.endpoint", value: { stringValue: "query:getUser" } },
        { key: "akan.origin", value: { stringValue: "http" } },
      ],
      traceId,
      spanId: "00f067aa0ba902b7",
      flags: 1,
    });
  });

  test("a line written outside a request carries no trace fields, and an id that is not W3C hex is left out", () => {
    const outside = JSON.parse(
      OtlpEncode.logs({}, [{ record: record({ traceId: null }), spanId: null, sampled: false }]),
    );
    const legacy = JSON.parse(
      OtlpEncode.logs({}, [{ record: record({ traceId: "lq2x0k-abc123" }), spanId: null, sampled: false }]),
    );

    for (const body of [outside, legacy]) {
      const [encoded] = body.resourceLogs[0].scopeLogs[0].logRecords;
      expect([encoded.traceId, encoded.spanId, encoded.flags]).toEqual([undefined, undefined, undefined]);
    }
  });

  test("nanoseconds since the epoch keep every digit past 2^53", () => {
    expect(unixNano(1_700_000_000_123.25)).toBe("1700000000123250000");
    expect(unixNano(1_700_000_000_000)).toBe("1700000000000000000");
    expect(unixNano(1.9999999)).toBe("2000000");
  });
});
