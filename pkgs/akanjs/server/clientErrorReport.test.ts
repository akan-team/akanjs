import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { BrowserError } from "../signal/browserError";
import { type ErrorReportContext, ErrorReporting } from "../signal/errorReporting";
import { RequestTrace } from "../signal/requestTrace";
import { SignalContext } from "../signal/signalContext";
import { AkanOption } from "./akanOption";
import { ClientErrorReport } from "./clientErrorReport";
import { DevSurfacePolicy } from "./routing/devSurfacePolicy";
import { WebRouteContext } from "./webRouteContext";

const pageId = "0af7651916cd43dd8448eb211c80319c";
const report = {
  requestId: pageId,
  routeId: "/:lang/orders/:orderId",
  kind: "uncaught",
  name: "TypeError",
  message: "price was undefined",
  stack: "TypeError: price was undefined\n    at OrderTotal (http://shop.test/_akan/client/orders-a1.js:3:15)",
  digest: null,
};
const addresses = new WeakMap<Request, string>();
const post = (
  body: unknown = report,
  { address = "198.51.100.7", headers = {} }: { address?: string; headers?: Record<string, string> } = {},
) => {
  const req = new Request(`http://shop.test${ClientErrorReport.path}`, {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: {
      "content-type": "text/plain;charset=UTF-8",
      origin: "http://shop.test",
      "sec-fetch-site": "same-origin",
      "user-agent": "Mozilla/5.0 (Macintosh) Safari/605.1.15",
      ...headers,
    },
  });
  addresses.set(req, address);
  return req;
};
const answerOf = async (req: Request) => {
  const res = await ClientErrorReport.handle(req);
  return { status: res.status, body: await res.text(), headers: Object.fromEntries(res.headers) };
};
const constantAnswer = { status: 204, body: "", headers: { "cache-control": "no-store" } };

let reported: [Error, ErrorReportContext][] = [];
const savedBuildId = process.env.AKAN_BUILD_ID;
beforeEach(() => {
  reported = [];
  ErrorReporting.use((error, context) => void reported.push([error, context]));
  SignalContext.setHttpPeerResolver((req) => ({ address: addresses.get(req) ?? "192.0.2.1", port: 1 }));
  process.env.AKAN_BUILD_ID = "build-7";
});
afterEach(() => {
  ErrorReporting.use(null);
  ClientErrorReport.configure(false);
  SignalContext.setHttpPeerResolver(null);
  if (savedBuildId === undefined) delete process.env.AKAN_BUILD_ID;
  else process.env.AKAN_BUILD_ID = savedBuildId;
});

describe("ClientErrorReport route", () => {
  test("is registered only once an app turns it on, on a path the production route list allows", () => {
    expect(ClientErrorReport.routes()).toEqual({});
    expect(new AkanOption().getClientReport()).toBeUndefined();

    ClientErrorReport.configure(new AkanOption().setClientReport().getClientReport() ?? false);
    const routes = ClientErrorReport.routes() ?? {};
    expect(Object.keys(routes)).toEqual(["/_akan/client-report"]);
    expect(() => DevSurfacePolicy.checkReserved("A test", Object.entries(routes))).not.toThrow();
  });

  test("hands the reporter a browser error carrying the page view's request id, scrubbed, as data", async () => {
    ClientErrorReport.configure(true);
    const emitted = spyOn((await import("akanjs/common")).Logger, "emit").mockImplementation(() => undefined);
    try {
      const answer = await answerOf(
        post({
          ...report,
          message: "price was \u001b[31mundefined\u001b[0m\nfor order 7",
          stack: `${report.stack}\n    at http://shop.test/en/orders/7?token=s3cret#pay:12:4`,
          digest: "a1b2c3d4",
        }),
      );
      await ErrorReporting.flush();

      expect(answer).toEqual(constantAnswer);
      expect(reported).toHaveLength(1);
      const [error, context] = reported[0] ?? [];
      expect(error).toBeInstanceOf(BrowserError);
      expect((error as BrowserError).data).toEqual({
        kind: "uncaught",
        name: "TypeError",
        message: "price was undefined\\nfor order 7",
        stack: `${report.stack}\n    at http://shop.test/en/orders/7:12:4`,
        routeId: "/:lang/orders/:orderId",
        digest: "a1b2c3d4",
        buildId: "build-7",
        userAgent: "Mozilla/5.0 (Macintosh) Safari/605.1.15",
      });
      expect((error as Error).message).toBe("TypeError: price was undefined\\nfor order 7");
      expect(context).toEqual({
        source: "client",
        traceId: pageId,
        endpoint: null,
        routeId: "/:lang/orders/:orderId",
        accountId: null,
        digest: "a1b2c3d4",
      });
      expect(String(emitted.mock.calls[0]?.[0].message)).not.toContain("\u001b");
    } finally {
      emitted.mockRestore();
    }
  });

  test("hands the reporter no query string, email address, credential or reordering character a report carried", async () => {
    ClientErrorReport.configure(true);
    const emitted = spyOn((await import("akanjs/common")).Logger, "emit").mockImplementation(() => undefined);
    try {
      await answerOf(
        post({
          ...report,
          name: "CartError\u202e",
          message: "no cart for ada@example.com at /en/cart?token=s3cret with Bearer abc.def-123",
          stack:
            "CartError: no cart\n    at Cart (/en/cart?token=s3cret:3:15)\n    eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhY2NvdW50LTcifQ.c2ln",
        }),
      );
      await ErrorReporting.flush();

      expect(reported[0]?.[0]).toMatchObject({
        data: {
          name: "CartError",
          message: "no cart for [email] at /en/cart with Bearer [redacted]",
          stack: "CartError: no cart\n    at Cart (/en/cart:3:15)\n    [redacted]",
        },
      });
      expect(String(emitted.mock.calls[0]?.[0].message)).toBe(
        "Browser error (uncaught) on /:lang/orders/:orderId: CartError: no cart for [email] at /en/cart with Bearer [redacted]",
      );
    } finally {
      emitted.mockRestore();
    }
  });

  test("answers a cross-site, malformed or oversized report with the same 204 and reports none of them", async () => {
    ClientErrorReport.configure({ perAddress: 100 });
    const chunked = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < 3; i += 1) controller.enqueue(new Uint8Array(4_000).fill(32));
        controller.close();
      },
    });
    const refused = [
      post(report, { headers: { "sec-fetch-site": "cross-site", origin: "https://elsewhere.test" } }),
      post(report, { headers: { "sec-fetch-site": "same-site", origin: "http://admin.shop.test" } }),
      post(report, { headers: { "sec-fetch-site": "", origin: "https://elsewhere.test" } }),
      post(report, { headers: { origin: "null" } }),
      new Request(`http://shop.test${ClientErrorReport.path}`, { method: "POST", body: JSON.stringify(report) }),
      new Request(`http://shop.test${ClientErrorReport.path}`, { headers: { "sec-fetch-site": "same-origin" } }),
      post(report, { headers: { "content-type": "application/x-www-form-urlencoded" } }),
      post({ ...report, message: "x".repeat(9_000) }),
      new Request(`http://shop.test${ClientErrorReport.path}`, {
        method: "POST",
        body: chunked,
        headers: { "content-type": "text/plain", origin: "http://shop.test", "sec-fetch-site": "same-origin" },
      }),
      post("{not json"),
      post({ ...report, requestId: "not-a-request-id" }),
      post({ ...report, kind: "warning" }),
    ];
    for (const req of refused) expect(await answerOf(req)).toEqual(constantAnswer);
    await ErrorReporting.flush();
    expect(reported).toEqual([]);
  });

  test("caps a flood per address and per server a minute, answering every request the same", async () => {
    ClientErrorReport.configure({ perAddress: 2, perServer: 3 });
    const answers = [];
    for (let i = 0; i < 4; i += 1) answers.push(await answerOf(post({ ...report, message: `flood ${i}` })));
    for (let i = 0; i < 3; i += 1)
      answers.push(await answerOf(post({ ...report, message: `other ${i}` }, { address: "203.0.113.9" })));
    await ErrorReporting.flush();

    expect(answers.every((answer) => JSON.stringify(answer) === JSON.stringify(constantAnswer))).toBe(true);
    expect(reported.map(([error]) => (error as BrowserError).data.message)).toEqual(["flood 0", "flood 1", "other 0"]);
  });

  test("takes only the page views its sample drew, from the request id, on the server as in the page", async () => {
    ClientErrorReport.configure({ sampleRate: 0.5 });
    const inSample = `00000000${pageId.slice(8)}`;
    const outOfSample = `ffffffff${pageId.slice(8)}`;
    expect(ClientErrorReport.timingEntry("no-cache", inSample)).toBe(`akan-report;desc=${inSample}`);
    expect(ClientErrorReport.timingEntry("no-cache", outOfSample)).toBeNull();

    await answerOf(post({ ...report, requestId: outOfSample }));
    await answerOf(post({ ...report, requestId: inSample }));
    await ErrorReporting.flush();
    expect(reported.map(([, context]) => context.traceId)).toEqual([inSample]);
  });
});

describe("a page's request id for its reports", () => {
  const context = new WebRouteContext({ prodMode: true } as unknown as ConstructorParameters<
    typeof WebRouteContext
  >[0]);
  const page = (headers: Record<string, string> = {}) => new Request("http://shop.test/en/orders/7", { headers });
  const timingOf = (req: Request, trace = RequestTrace.fresh()) => ({
    trace,
    timing: RequestTrace.run(trace, () => context.htmlResponseHeaders(200, req).get("Server-Timing")),
  });
  const savedCacheControl = process.env.AKAN_HTML_CACHE_CONTROL;
  afterEach(() => {
    if (savedCacheControl === undefined) delete process.env.AKAN_HTML_CACHE_CONTROL;
    else process.env.AKAN_HTML_CACHE_CONTROL = savedCacheControl;
  });

  test("rides the document's Server-Timing only while reports are on", () => {
    expect(timingOf(page()).timing).toBeNull();
    ClientErrorReport.configure(true);
    const { trace, timing } = timingOf(page());
    expect(timing).toBe(`akan-report;desc=${trace.traceId}`);
    expect(timingOf(page({ cookie: "session=1" })).timing).toStartWith("akan-report;desc=");
  });

  test("is left off a page a shared cache may store, so no stored copy hands it to another visitor", () => {
    ClientErrorReport.configure(true);
    process.env.AKAN_HTML_CACHE_CONTROL = "public, max-age=60";
    expect(timingOf(page()).timing).toBeNull();
    process.env.AKAN_HTML_CACHE_CONTROL = "off";
    expect(timingOf(page()).timing).toBeNull();
  });
});
