import { afterEach, describe, expect, test } from "bun:test";
import { Logger, type LoggerSinkEntry, TrustedProxy } from "akanjs/common";
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
    expect(logs.entries.map(({ record }) => [record.traceId, record.link, record.attrs?.link])).toEqual([
      [ids[0] ?? "", inbound, inbound],
      [ids[1] ?? "", inbound, inbound],
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

    expect(continued).toEqual({ traceId: inbound, spanId: inboundSpan, sampled: true, link: "c".repeat(32) });
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

describe("RequestTrace.accept", () => {
  const sent: Record<string, string>[] = [{ traceparent }, { "x-request-id": "0AF76519-16CD-43DD-8448-EB211C80319C" }];
  const from = (address: string | null | undefined, headers: Record<string, string>) =>
    RequestTrace.accept(new Headers(headers), address ? { address } : (address as null | undefined));
  const settings = (adopt: string | undefined, proxies: string | undefined) => {
    if (adopt === undefined) delete process.env.AKAN_TRACE_ADOPT;
    else process.env.AKAN_TRACE_ADOPT = adopt;
    TrustedProxy.configure(proxies);
  };
  const expectMintedWithLink = (request: RequestTrace) => {
    expect(request.traceId).toMatch(hex32);
    expect(request.traceId).not.toBe(inbound);
    expect(request).toMatchObject({ parentSpanId: null, link: inbound });
  };

  afterEach(() => {
    delete process.env.AKAN_TRACE_ADOPT;
    TrustedProxy.reset();
  });

  test("with no setting, never takes a caller's id from a TCP peer: private, loopback or public", () => {
    for (const proxies of [undefined, "none", "*", "private", "10.0.0.0/8, 127.0.0.1"]) {
      settings(undefined, proxies);
      for (const address of [
        "10.0.0.5",
        "192.168.1.9",
        "127.0.0.1",
        "::1",
        "::ffff:127.0.0.1",
        "203.0.113.9",
        undefined,
      ])
        for (const headers of sent) expectMintedWithLink(from(address, headers));
    }
  });

  test("takes the id from the gateway's unix-socket hop with no setting, and the link it relays", () => {
    settings(undefined, undefined);

    expect(from(null, { traceparent })).toMatchObject({ traceId: inbound, parentSpanId: inboundSpan, link: null });
    expect(from(null, { traceparent, "x-akan-trace-link": "c".repeat(32) }).link).toBe("c".repeat(32));
    expect(from(null, { "x-request-id": "0AF76519-16CD-43DD-8448-EB211C80319C" }).traceId).toBe(inbound);
  });

  test("under AKAN_TRACE_ADOPT=trusted-proxies, takes it from a proxy the list names and from no other peer", () => {
    settings("trusted-proxies", "10.0.0.5, 192.0.2.0/24");
    for (const headers of sent) {
      expect(from("10.0.0.5", headers).traceId).toBe(inbound);
      expect(from("192.0.2.77", headers).traceId).toBe(inbound);
      for (const address of ["10.0.0.6", "127.0.0.1", "::1", "203.0.113.9", undefined])
        expectMintedWithLink(from(address, headers));
    }
  });

  test("the opt-in adopts from loopback and the private ranges only when the list spells them", () => {
    const local = ["127.0.0.1", "10.0.0.5"];
    const adopted = (proxies: string | undefined) => {
      settings("trusted-proxies", proxies);
      return local.filter((address) => from(address, { traceparent }).traceId === inbound);
    };

    expect(adopted(undefined)).toEqual([]);
    expect(adopted("none")).toEqual([]);
    expect(adopted("*")).toEqual([]);
    expect(adopted("192.0.2.1")).toEqual([]);
    expect(adopted("private")).toEqual(["10.0.0.5"]);
    expect(adopted("127.0.0.1")).toEqual(["127.0.0.1"]);
    expect(adopted("127.0.0.0/8, 10.0.0.0/8")).toEqual(local);
  });

  test("any other value of the setting adopts nothing", () => {
    for (const adopt of ["", "1", "true", "always", "TRUSTED-PROXIES", "trusted-proxies "]) {
      settings(adopt, "10.0.0.5");
      expectMintedWithLink(from("10.0.0.5", { traceparent }));
    }
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
