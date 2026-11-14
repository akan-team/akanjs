import { describe, expect, test } from "bun:test";
import { TraceContext } from "./TraceContext";

const traceId = "0af7651916cd43dd8448eb211c80319c";
const spanId = "b7ad6b7169203331";
const traceparent = `00-${traceId}-${spanId}-01`;
const trusted = () => true;
const untrusted = () => false;
const hex32 = /^[0-9a-f]{32}$/;

describe("TraceContext ids", () => {
  test("mints a 32-digit trace id and a 16-digit span id, each time another one", () => {
    const first = TraceContext.mintTraceId();
    expect(first).toMatch(hex32);
    expect(TraceContext.mintTraceId()).not.toBe(first);
    expect(TraceContext.mintSpanId()).toMatch(/^[0-9a-f]{16}$/);
    expect(TraceContext.traceparentOf(traceId, spanId, true)).toBe(traceparent);
    expect(TraceContext.traceparentOf(traceId, spanId)).toBe(`00-${traceId}-${spanId}-00`);
  });

  test("reads a W3C traceparent and nothing shaped any other way", () => {
    expect(TraceContext.parseTraceparent(traceparent)).toEqual({ traceId, spanId, sampled: true });
    expect(TraceContext.parseTraceparent(`00-${traceId}-${spanId}-00`)?.sampled).toBe(false);
    const refused = [
      null,
      "",
      `ff-${traceId}-${spanId}-01`,
      `00-${"0".repeat(32)}-${spanId}-01`,
      `00-${traceId}-${"0".repeat(16)}-01`,
      `00-${traceId.toUpperCase()}-${spanId}-01`,
      `00-${traceId}-${spanId}-01-extra`,
      `00-${traceId}-${spanId}-0`,
      ` ${traceparent}`,
      `${traceparent}\n`,
      `00-${traceId.slice(0, 31)}\n-${spanId}-01`,
    ];
    for (const value of refused) expect(TraceContext.parseTraceparent(value)).toBeNull();
  });

  test("reads an x-request-id that is a UUID or 32 hex digits, lower-cased and without dashes", () => {
    expect(TraceContext.parseId(traceId)).toBe(traceId);
    expect(TraceContext.parseId(traceId.toUpperCase())).toBe(traceId);
    expect(TraceContext.parseId("0AF76519-16CD-43DD-8448-EB211C80319C")).toBe(traceId);
    const refused = [
      null,
      "",
      "req-1",
      "0".repeat(32),
      "00000000-0000-0000-0000-000000000000",
      `${traceId}0`,
      traceId.slice(1),
      `${traceId.slice(0, 31)}\n`,
      `${traceId.slice(0, 31)}\u0000`,
      `0af76519-16cd-43dd-8448-eb211c80319\r`,
      "0af7651916cd43dd8448eb211c80319c\r\nx-injected: 1",
      "g".repeat(32),
      "a".repeat(4096),
    ];
    for (const value of refused) expect(TraceContext.parseId(value)).toBeNull();
  });
});

describe("TraceContext.adopt", () => {
  test("mints an id for a request that names none, without asking who sent it", () => {
    let asked = 0;
    const adopted = TraceContext.adopt(new Headers(), () => {
      asked += 1;
      return true;
    });

    expect(adopted.traceId).toMatch(hex32);
    expect(adopted).toMatchObject({ parentSpanId: null, link: null, sampled: false });
    expect(asked).toBe(0);
  });

  test("takes a trusted hop's traceparent as the request's id and its span as the parent", () => {
    const adopted = TraceContext.adopt(new Headers({ traceparent, "x-request-id": "f".repeat(32) }), trusted);

    expect(adopted).toEqual({ traceId, parentSpanId: spanId, sampled: true, link: null });
  });

  test("takes a trusted hop's x-request-id when it sends no usable traceparent", () => {
    const uuid = "0af76519-16cd-43dd-8448-eb211c80319c";

    expect(TraceContext.adopt(new Headers({ "x-request-id": uuid }), trusted)).toMatchObject({
      traceId,
      parentSpanId: null,
    });
    expect(TraceContext.adopt(new Headers({ traceparent: "junk", "x-request-id": uuid }), trusted).traceId).toBe(
      traceId,
    );
  });

  test("never takes an id from a caller that is not a trusted hop: it mints one and links the caller's", () => {
    const byTraceparent = TraceContext.adopt(new Headers({ traceparent }), untrusted);
    const byRequestId = TraceContext.adopt(new Headers({ "x-request-id": traceId }), untrusted);
    const twice = TraceContext.adopt(new Headers({ "x-request-id": traceId }), untrusted);

    for (const adopted of [byTraceparent, byRequestId, twice]) {
      expect(adopted.traceId).toMatch(hex32);
      expect(adopted.traceId).not.toBe(traceId);
      expect(adopted).toMatchObject({ parentSpanId: null, link: traceId });
    }
    expect(byRequestId.traceId).not.toBe(twice.traceId);
  });

  test("mints a fresh id, with no link, for an id of another shape whoever sent it", () => {
    const malformed = [
      "req-1",
      "a".repeat(4096),
      `${traceId.slice(0, 16)} ${traceId.slice(17)}`,
      `${traceId.slice(0, 16)}\t${traceId.slice(17)}`,
      "0".repeat(32),
      "../../etc/passwd",
    ];
    for (const value of malformed)
      for (const isTrustedPeer of [trusted, untrusted]) {
        const adopted = TraceContext.adopt(new Headers({ "x-request-id": value }), isTrustedPeer);
        expect(adopted.traceId).toMatch(hex32);
        expect(adopted.link).toBeNull();
      }
    const oversized = TraceContext.adopt(new Headers({ traceparent: `${traceparent}-${"a".repeat(4096)}` }), trusted);
    expect(oversized.traceId).not.toBe(traceId);
    expect(oversized.link).toBeNull();
  });

  test("reads the link a trusted hop relays, and no link header from anyone else", () => {
    const link = "c".repeat(32);
    const headers = new Headers({ traceparent, "x-akan-trace-link": link });

    expect(TraceContext.adopt(headers, trusted).link).toBe(link);
    expect(TraceContext.adopt(headers, untrusted).link).toBe(traceId);
    expect(TraceContext.adopt(new Headers({ traceparent, "x-akan-trace-link": "not an id" }), trusted).link).toBeNull();
  });
});
