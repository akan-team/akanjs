import { afterEach, describe, expect, test } from "bun:test";
import { Logger, type LoggerSinkEntry } from "akanjs/common";
import type { Adaptor } from "akanjs/service";
import { TraceContext } from "../common/TraceContext";
import type { EndpointInfo } from "./endpointInfo";
import { Exception } from "./exception";
import { RequestTrace } from "./requestTrace";
import { SignalFailure } from "./SignalFailure";
import { SignalContext } from "./signalContext";
import { getCurrentTrace, runTraced, SignalTrace, setCanonicalLineMode, setLogContextEnabled } from "./trace";

const inbound = "0af7651916cd43dd8448eb211c80319c";
const inboundSpan = "b7ad6b7169203331";
const traceparent = `00-${inbound}-${inboundSpan}-01`;
const hex32 = /^[0-9a-f]{32}$/;

afterEach(() => {
  setCanonicalLineMode("off");
  setLogContextEnabled(true);
  SignalFailure.reset();
});

const collect = () => {
  const entries: LoggerSinkEntry[] = [];
  const removeSink = Logger.addSink((entry) => void entries.push(entry));
  return { entries, restore: removeSink };
};

const endpoint = { logger: new Logger("RequestTraceTest") } as unknown as Adaptor;
const endpointInfo = {
  type: "query",
  signalOption: {},
  getPath: (key: string) => `/api/${key}`,
} as unknown as EndpointInfo;

describe("RequestTrace", () => {
  test("is the request's id for every trace and log line written while it is answered", async () => {
    const request = RequestTrace.adopt(new Headers({ traceparent }), () => true);
    const logs = collect();
    try {
      await RequestTrace.run(request, async () => {
        new Logger("Router").warn("before any endpoint");
        const trace = SignalTrace.create("userList", "query", "http");
        await runTraced(trace, async () => {
          new Logger("Service").warn("inside the endpoint");
          expect(getCurrentTrace()?.traceId).toBe(inbound);
          expect(SignalTrace.create("nested", "query", "http")?.parentSpanId).toBe(trace?.spanId ?? null);
        });
        expect(trace?.parentSpanId).toBe(request.spanId);
      });
    } finally {
      logs.restore();
    }

    expect(request.parentSpanId).toBe(inboundSpan);
    expect(request.traceparent).toBe(`00-${inbound}-${request.spanId}-01`);
    expect(logs.entries.map(({ record }) => [record.message, record.traceId])).toEqual([
      ["before any endpoint", inbound],
      ["inside the endpoint", inbound],
    ]);
    expect(RequestTrace.current()).toBeUndefined();
  });

  test("an id from a caller that is no trusted hop is never a trace's id, only its link", async () => {
    setCanonicalLineMode("all");
    const logs = collect();
    const ids: string[] = [];
    try {
      const forged: Record<string, string>[] = [{ traceparent }, { "x-request-id": inbound }];
      for (const headers of forged) {
        const request = RequestTrace.adopt(new Headers(headers), () => false);
        await RequestTrace.run(request, async () => {
          const trace = SignalTrace.create("userList", "query", "http");
          ids.push(trace?.traceId ?? "");
          await runTraced(trace, async () => undefined);
        });
      }
    } finally {
      logs.restore();
    }

    expect(ids[0]).toMatch(hex32);
    expect(ids).not.toContain(inbound);
    expect(ids[0]).not.toBe(ids[1]);
    expect(logs.entries.map(({ record }) => [record.traceId, record.attrs?.link])).toEqual([
      [ids[0] ?? "", inbound],
      [ids[1] ?? "", inbound],
    ]);
  });

  test("a job or a schedule opens its own trace, even when the request that woke it is still being answered", () => {
    const request = RequestTrace.adopt(new Headers(), () => false);

    const { job, call } = RequestTrace.run(request, () => ({
      job: SignalTrace.create("sendMail", "internal", "internal"),
      call: SignalTrace.create("userList", "query", "http"),
    }));

    expect(call?.traceId).toBe(request.traceId);
    expect(job?.traceId).toMatch(hex32);
    expect(job?.traceId).not.toBe(request.traceId);
    expect(job?.parentSpanId).toBeNull();
  });

  test("continues what a parent process handed over, and nothing it cannot read", () => {
    const continued = RequestTrace.continued(traceparent, "c".repeat(32));

    expect(continued).toMatchObject({ traceId: inbound, parentSpanId: inboundSpan, link: "c".repeat(32) });
    expect(RequestTrace.continued("junk")).toBeNull();
    expect(RequestTrace.continued(undefined)).toBeNull();
    expect(RequestTrace.continued(traceparent, "not an id")?.link).toBeNull();
  });

  test("writes the id on the response, and on a copy when the headers refuse a write", async () => {
    const request = RequestTrace.adopt(new Headers(), () => false);
    class LockedHeaders extends Headers {
      override set(): void {
        throw new TypeError("immutable");
      }
    }
    const locked = new Response("body", { status: 202 });
    Object.defineProperty(locked, "headers", { value: new LockedHeaders(locked.headers) });

    const copy = RequestTrace.echo(locked, request);

    expect(RequestTrace.echo(new Response("ok"), request).headers.get("x-request-id")).toBe(request.traceId);
    expect(copy.headers.get("x-request-id")).toBe(request.traceId);
    expect(copy.status).toBe(202);
    expect(await copy.text()).toBe("body");
    expect(RequestTrace.echo(undefined, request)).toBeUndefined();
  });

  test("names the open trace as the traceparent an outbound call carries", async () => {
    const request = RequestTrace.adopt(new Headers({ traceparent }), () => true);
    expect(TraceContext.outbound()).toBeUndefined();

    await RequestTrace.run(request, async () => {
      expect(TraceContext.outbound()).toBe(request.traceparent);
      const trace = SignalTrace.create("userList", "query", "http");
      await runTraced(trace, async () => expect(TraceContext.outbound()).toBe(trace?.traceparent));
    });
  });
});

describe("SignalContext.try", () => {
  const failing = (error: unknown) =>
    SignalContext.try(endpoint, endpointInfo, "userList", async () => {
      throw error;
    });

  test("names the request's id in the body of a refusal and of a crash, the id its log lines carry", async () => {
    process.env.NODE_ENV = "production";
    SignalFailure.reset();
    const request = RequestTrace.adopt(new Headers({ traceparent }), () => true);
    const logs = collect();
    let refused: Response | undefined;
    let crashed: Response | undefined;
    try {
      await RequestTrace.run(request, async () => {
        refused = await failing(new Exception.Forbidden("no"));
        crashed = await failing(new TypeError("driver broke"));
      });
    } finally {
      logs.restore();
      process.env.NODE_ENV = "test";
    }

    expect(refused?.status).toBe(403);
    expect(await refused?.json()).toMatchObject({ statusCode: 403, path: "/api/userList", traceId: inbound });
    expect(await crashed?.json()).toMatchObject({
      error: "Internal Server Error",
      statusCode: 500,
      path: "/api/userList",
      traceId: inbound,
    });
    expect(logs.entries.filter(({ record }) => record.level === "error").map(({ record }) => record.traceId)).toEqual([
      inbound,
    ]);
  });

  test("names an id outside a request too, and the request's even with the log context switched off", async () => {
    const alone = (await (await failing(new Exception.NotFound("gone")))?.json()) as { traceId?: string };
    setLogContextEnabled(false);
    const request = RequestTrace.fresh();
    const scoped = await RequestTrace.run(request, async () => (await failing(new Exception.NotFound("gone")))?.json());

    expect(alone.traceId).toMatch(hex32);
    expect(scoped).toMatchObject({ traceId: request.traceId });
  });
});
