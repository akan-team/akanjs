import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { AkanError } from "akanjs/base";
import { Logger } from "akanjs/common";
import { adapt } from "akanjs/service";
import { buildEndpoint } from "./endpointInfo";
import { type ErrorReportContext, ErrorReporting } from "./errorReporting";
import { Public } from "./guards";
import { RequestTrace } from "./requestTrace";
import { SignalContext } from "./signalContext";
import { reportedTraceOf, SignalTrace } from "./trace";

const collect = () => {
  const calls: [Error, ErrorReportContext][] = [];
  ErrorReporting.use((error, context) => {
    calls.push([error, context]);
  });
  return calls;
};
const unset = { traceId: null, endpoint: null, routeId: null, accountId: null, digest: null };

afterEach(() => ErrorReporting.use(null));

describe("ErrorReporting", () => {
  test("hands the reporter an error once, cause kept, after the caller has moved on", async () => {
    const calls = collect();
    const error = new Error("order total failed", { cause: new TypeError("price was undefined") });
    ErrorReporting.report(error, { source: "server", endpoint: "query:orderTotal" });
    ErrorReporting.report(error, { source: "render" });
    expect(calls).toEqual([]);

    await ErrorReporting.flush();
    expect(calls.length).toBe(1);
    expect(calls[0]?.[0]).toBe(error);
    expect(calls[0]?.[0].cause).toMatchObject({ message: "price was undefined" });
    expect(calls[0]?.[1]).toEqual({ ...unset, source: "server", endpoint: "query:orderTotal" });
  });

  test("hands over a thrown value that is not an Error as one, keeping the value as its cause", async () => {
    const calls = collect();
    ErrorReporting.report("lost connection", { source: "process" });
    await ErrorReporting.flush();
    expect(calls[0]?.[0]).toBeInstanceOf(AkanError);
    expect(calls[0]?.[0]).toMatchObject({
      code: "nonErrorThrown",
      message: "lost connection",
      cause: "lost connection",
    });
  });

  test("logs a throwing and a rejecting reporter once each and lets the caller go on", async () => {
    const warn = spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    try {
      ErrorReporting.use(() => {
        throw new Error("reporter is down");
      });
      expect(() => ErrorReporting.report(new Error("first"), { source: "server" })).not.toThrow();
      ErrorReporting.report(new Error("second"), { source: "server" });
      await ErrorReporting.flush();
      ErrorReporting.use(async () => {
        await Promise.resolve();
        throw new Error("reporter refused");
      });
      ErrorReporting.report(new Error("third"), { source: "server" });
      ErrorReporting.report(new Error("fourth"), { source: "server" });
      await ErrorReporting.flush();

      expect(warn.mock.calls.map(([line]) => line)).toEqual([
        "The error reporter failed, and later failures are not logged: reporter is down",
        "The error reporter failed, and later failures are not logged: reporter refused",
      ]);
    } finally {
      warn.mockRestore();
    }
  });

  test("never hands the reporter an error raised while it runs", async () => {
    let calls = 0;
    ErrorReporting.use(() => {
      calls += 1;
      ErrorReporting.report(new Error("raised by the reporter"), { source: "process" });
    });
    ErrorReporting.report(new Error("the real one"), { source: "process" });
    await ErrorReporting.flush();
    await ErrorReporting.flush();
    expect(calls).toBe(1);
  });

  test("waits at a flush for a reporter still sending, up to the deadline", async () => {
    let sent = false;
    ErrorReporting.use(async () => {
      await Bun.sleep(20);
      sent = true;
    });
    ErrorReporting.report(new Error("before exit"), { source: "process" });
    await ErrorReporting.flush();
    expect(sent).toBe(true);

    ErrorReporting.use(() => new Promise<void>(() => undefined));
    ErrorReporting.report(new Error("never sent"), { source: "process" });
    const started = performance.now();
    await ErrorReporting.flush(30);
    expect(performance.now() - started).toBeLessThan(1_000);
  });

  test("names the account a trace carries by its id alone", () => {
    const trace = SignalTrace.create("orderTotal", "query", "http", RequestTrace.fresh());
    trace?.setAttr("userId", "account-7");
    expect(reportedTraceOf(trace)).toEqual({
      traceId: trace?.traceId ?? null,
      endpoint: "query:orderTotal",
      accountId: "account-7",
    });
  });
});

describe("a server error answer", () => {
  test("reaches the reporter from 500 up with its endpoint and request id, never under 500", async () => {
    const calls = collect();
    const info = buildEndpoint.query(String, { guards: [Public] }).exec(() => "unused");
    const adaptor = new (adapt("errorReportingCrashAdaptor"))();
    const errorLine = spyOn(Logger, "emit").mockImplementation(() => undefined);
    const run = async (statusCode: number) =>
      await SignalContext.run(adaptor, info, "orderTotal", "http", async () => {
        throw new AkanError("taken", "held by another order", { statusCode });
      }).catch((error: unknown) => error);
    const request = RequestTrace.fresh();
    try {
      const crashed = await RequestTrace.run(request, async () => {
        await run(409);
        return await run(503);
      });
      await ErrorReporting.flush();

      expect(calls).toEqual([
        [crashed as Error, { ...unset, source: "server", traceId: request.traceId, endpoint: "query:orderTotal" }],
      ]);
    } finally {
      errorLine.mockRestore();
    }
  });
});
