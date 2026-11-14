import "../test/registerDom";
import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { TransformStream } from "node:stream/web";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { act } from "react";
import { BrowserError } from "../signal/browserError";
import { type ErrorReportContext, ErrorReporting } from "../signal/errorReporting";
import { ClientErrorReport } from "./clientErrorReport";
import { AKAN_RSC_RESPONSE_STATE_HEADER, encodeAkanRouterState } from "./routeState";
import { makeRouterState } from "./rscNavigation.fixture";

const origin = "http://localhost";
const pageId = "0af7651916cd43dd8448eb211c80319c";
const htmlOf = (main: unknown) =>
  `["$","html",null,{"children":[["$","head","h",{}],["$","body","b",{"children":["$","main",null,{"children":${JSON.stringify(main)}}]}]]}]`;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const failure = new TypeError("price was undefined");
const host = "/_akan/client/order-total-a1.js";
const OrderTotal = () => {
  throw failure;
};
const sent: { url: string; init: RequestInit }[] = [];
const spies: { mockRestore: () => void }[] = [];

beforeAll(async () => {
  process.env.AKAN_PUBLIC_APP_NAME = "test";
  process.env.AKAN_PUBLIC_REPO_NAME = "akanjs";
  process.env.AKAN_PUBLIC_SERVE_DOMAIN = "akanjs.com";
  process.env.AKAN_BUNDLE_COMMAND = "build";
  (window as unknown as { happyDOM: { setURL: (url: string) => void } }).happyDOM.setURL(`${origin}/home`);
  spies.push(
    spyOn(performance, "getEntriesByType").mockImplementation(((type: string) =>
      type === "navigation"
        ? [{ serverTiming: [{ name: "akan-report", description: pageId }] }]
        : []) as unknown as typeof performance.getEntriesByType),
  );
  Object.assign(globalThis, {
    TransformStream,
    __webpack_require__: Object.assign(() => ({ OrderTotal }), { u: () => "" }),
    __webpack_get_script_filename__: (chunkId: string) => chunkId,
    __webpack_chunk_load__: () => Promise.resolve(),
    __RSC_CHUNKS__: [[1, `0:${htmlOf("/home")}\n`]],
    __RSC_CLOSED__: true,
    fetch: async (url: string, init: RequestInit = {}) => {
      if (url === ClientErrorReport.path) {
        sent.push({ url, init });
        return new Response(null, { status: 204 });
      }
      return new Response(
        `1:I${JSON.stringify([host, [host, host], "OrderTotal", 1])}\n0:${htmlOf(["$", "$L1", null, {}])}\n`,
        {
          headers: {
            "Content-Type": "text/x-component",
            [AKAN_RSC_RESPONSE_STATE_HEADER]: encodeAkanRouterState(
              makeRouterState("/en/orders/7", "/:lang/orders/:orderId"),
            ),
          },
        },
      );
    },
  });
  document.documentElement.innerHTML = "<head></head><body><main>/home</main></body>";
  await act(async () => {
    await import("./rscClient");
  });
});

afterAll(() => {
  for (const spy of spies.splice(0)) spy.mockRestore();
  ErrorReporting.use(null);
  ClientErrorReport.configure(false);
});

describe("an error a browser component throws", () => {
  test("reaches the app's reporter through the report route with the page view's request id", async () => {
    const quiet = [
      spyOn(globalThis, "reportError").mockImplementation(() => undefined),
      spyOn(console, "error").mockImplementation(() => undefined),
      spyOn(console, "warn").mockImplementation(() => undefined),
      spyOn(window.location, "reload").mockImplementation(() => undefined),
    ];
    try {
      //? Inside `act`, React's development build throws an uncaught error from `act` instead of reporting it.
      (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
      await globalThis.__AKAN_RSC_NAVIGATE__?.("/en/orders/7");
      for (let waited = 0; !sent.length && waited < 1_000; waited += 20) await sleep(20);
      expect(sent).toHaveLength(1);

      const reported: [Error, ErrorReportContext][] = [];
      ErrorReporting.use((error, context) => void reported.push([error, context]));
      ClientErrorReport.configure(true);
      const { init } = sent[0] ?? { init: {} };
      const userAgent = navigator.userAgent;
      //? The DOM's own `Request` drops `Origin`, so Bun's builds what the browser sends for a string body.
      await GlobalRegistrator.unregister();
      const arrived = new Request(`${origin}${ClientErrorReport.path}`, {
        method: init.method,
        body: init.body,
        headers: {
          "content-type": "text/plain;charset=UTF-8",
          origin,
          "sec-fetch-site": "same-origin",
          "user-agent": userAgent,
        },
      });
      expect((await ClientErrorReport.handle(arrived)).status).toBe(204);
      await ErrorReporting.flush();

      expect(reported).toHaveLength(1);
      const [error, context] = reported[0] ?? [];
      expect(error).toBeInstanceOf(BrowserError);
      expect((error as BrowserError).data).toMatchObject({
        kind: "uncaught",
        name: "TypeError",
        message: "price was undefined",
        routeId: "/:lang/orders/:orderId",
      });
      expect((error as BrowserError).data.stack).toContain("rscClientErrorReport.test.tsx");
      expect(context).toMatchObject({ source: "client", traceId: pageId, routeId: "/:lang/orders/:orderId" });
    } finally {
      for (const spy of quiet) spy.mockRestore();
    }
  });
});
