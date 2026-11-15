import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { AkanError } from "akanjs/base";
import { DEFAULT_AKAN_I18N, Logger } from "akanjs/common";
import { type ErrorReportContext, ErrorReporting } from "../signal/errorReporting";
import { RequestTrace } from "../signal/requestTrace";
import { PageFailure } from "./pageFailure";
import { SsrFromRscRenderer } from "./ssrFromRscRenderer";
import { WebRouteContext } from "./webRouteContext";

const encoder = new TextEncoder();
const boundary = (child: string) =>
  `0:["$","html",null,{"children":["$","body",null,{"children":["$","$Sreact.suspense",null,{"fallback":"Loading","children":${child}}]}]}]\n`;
const unset = { endpoint: null, accountId: null, digest: null };

let reported: [Error, ErrorReportContext][] = [];
const quiet: { mockRestore: () => void }[] = [];
const listen = () => {
  reported = [];
  ErrorReporting.use((error, context) => void reported.push([error, context]));
  quiet.push(spyOn(Logger.prototype, "error").mockImplementation(() => undefined));
};
afterEach(() => {
  ErrorReporting.use(null);
  for (const spy of quiet.splice(0)) spy.mockRestore();
});

const renderHtml = async (flight: string, req: Request) => {
  const stream = await new SsrFromRscRenderer().render({
    request: req,
    rscStream: new Response(encoder.encode(flight)).body ?? new ReadableStream(),
    ssrManifest: {
      moduleLoading: null,
      moduleMap: {
        "/_akan/client/total.js": { default: { id: "/_akan/client/total.js", chunks: [], name: "default" } },
      },
    },
    waitForAllReady: true,
  });
  return await new Response(stream).text();
};

describe("an error in the server's HTML render of a page", () => {
  test("reaches the reporter as a render error with the request's id and route pattern when a client component raised it", async () => {
    listen();
    const req = new Request("https://shop.test/en/orders/7");
    PageFailure.routed(req, "/:lang/orders/:orderId");
    const trace = RequestTrace.fresh();
    const clientComponent = `1:I["/_akan/client/total.js",[],"default"]\n${boundary('["$","$L1",null,{}]')}`;
    await RequestTrace.run(trace, () => renderHtml(clientComponent, req));
    await ErrorReporting.flush();

    expect(reported).toHaveLength(1);
    const [error, context] = reported[0] ?? [];
    expect(AkanError.is(error, "notInitialized")).toBe(true);
    expect(context).toEqual({ ...unset, source: "render", traceId: trace.traceId, routeId: "/:lang/orders/:orderId" });
  });

  test("is left to the RSC worker's report when a server component raised it, which its digest tells", async () => {
    listen();
    const serverComponent = `${boundary('"$L1"')}1:E{"digest":"a1b2c3d4","name":"Error","message":"row 42 had no price","stack":[],"env":"Server"}\n`;
    const html = await renderHtml(serverComponent, new Request("https://shop.test/en/orders/7"));
    await ErrorReporting.flush();

    expect(html).toContain("Loading");
    expect(reported).toEqual([]);
  });
});

describe("a page that answers 5xx", () => {
  const context = new WebRouteContext({
    prodMode: true,
    logger: new Logger("PageFailureTest"),
    artifact: { i18n: DEFAULT_AKAN_I18N, basePaths: [] },
    renderState: { cssAssets: {} },
    hub: () => null,
  } as unknown as ConstructorParameters<typeof WebRouteContext>[0]);
  const req = new Request("https://shop.test/en/orders/7");
  const stopped = () => new AkanError("rscWorkerStopped", "rsc worker exited with code 7");

  test("reaches the reporter with the request's id and route pattern, as a document and as an RSC payload", async () => {
    listen();
    const [document, payload] = [RequestTrace.fresh(), RequestTrace.fresh()];
    const failures = [stopped(), stopped()];
    const answers = [
      await RequestTrace.run(document, () =>
        context.errorPageResponse(req, "/en/orders/7", failures[0], "/:lang/orders/:orderId"),
      ),
      RequestTrace.run(payload, () => context.rscErrorResponse("__rsc", failures[1], "unmatched")),
    ];
    await ErrorReporting.flush();

    expect(answers.map(({ status }) => status)).toEqual([500, 500]);
    expect(reported).toEqual([
      [
        failures[0] as Error,
        { ...unset, source: "render", traceId: document.traceId, routeId: "/:lang/orders/:orderId" },
      ],
      [failures[1] as Error, { ...unset, source: "render", traceId: payload.traceId, routeId: null }],
    ]);
  });

  test("is not told again after a render error of the same request, nor for a request the browser closed", async () => {
    listen();
    const trace = RequestTrace.fresh();
    const rendered = new Error("row 42 had no price");
    ErrorReporting.report(rendered, { source: "render", traceId: trace.traceId, digest: "a1b2c3d4" });
    await RequestTrace.run(trace, async () => {
      await context.errorPageResponse(
        req,
        "/en/orders/7",
        new AkanError("rscWorkerFailed", "row 42 had no price"),
        "/",
      );
      context.rscErrorResponse("__rsc", "Internal Server Error");
    });
    const closed = Object.assign(new Error("The operation was aborted."), { name: "AbortError" });
    await RequestTrace.run(RequestTrace.fresh(), () => context.errorPageResponse(req, "/en/orders/7", closed, "/"));
    await ErrorReporting.flush();

    expect(reported.map(([error]) => error)).toEqual([rendered]);
  });
});
