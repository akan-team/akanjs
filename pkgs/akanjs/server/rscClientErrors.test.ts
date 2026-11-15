import "../test/registerDom";
import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { pageErrorReporter } from "./rscClientErrors";

const pageId = "0af7651916cd43dd8448eb211c80319c";
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const posted: RequestInit[] = [];
const spies: { mockRestore: () => void }[] = [];

const openPage = (serverTiming: { name: string; description: string }[]) => {
  spies.push(
    spyOn(performance, "getEntriesByType").mockImplementation(((type: string) =>
      type === "navigation" ? [{ serverTiming }] : []) as unknown as typeof performance.getEntriesByType),
    spyOn(globalThis, "fetch").mockImplementation((async (_url: unknown, init?: RequestInit) => {
      posted.push(init ?? {});
      return new Response(null, { status: 204 });
    }) as typeof fetch),
  );
};
const bodies = () => posted.map(({ body }) => JSON.parse(String(body)) as Record<string, unknown>);

afterEach(() => {
  for (const spy of spies.splice(0)) spy.mockRestore();
  posted.length = 0;
});

describe("pageErrorReporter", () => {
  test("on a page the server named no request id, hears nothing and sends nothing", async () => {
    openPage([{ name: "total", description: "" }]);
    const listen = spyOn(window, "addEventListener");
    spies.push(listen);
    expect(pageErrorReporter(() => "/orders")).toBeNull();
    window.dispatchEvent(new ErrorEvent("error", { error: new Error("ignored") }));
    await sleep(20);

    expect(listen.mock.calls.map(([type]) => type)).toEqual([]);
    expect(posted).toEqual([]);
  });

  test("sends each error once, with the page's request id and route, without cookies, at most five a page", async () => {
    openPage([{ name: "akan-report", description: pageId }]);
    const report = pageErrorReporter(() => "/:lang/orders/:orderId");
    const failure = new TypeError("price was undefined");
    report?.(failure, "uncaught");
    report?.(failure, "uncaught");
    window.dispatchEvent(new ErrorEvent("error", { error: failure }));
    window.dispatchEvent(new ErrorEvent("error", { error: new RangeError("page out of range") }));
    await sleep(50);

    expect(bodies()).toEqual([
      {
        requestId: pageId,
        routeId: "/:lang/orders/:orderId",
        kind: "uncaught",
        name: "TypeError",
        message: "price was undefined",
        digest: null,
        stack: failure.stack,
      },
      expect.objectContaining({ kind: "error", name: "RangeError", message: "page out of range" }),
    ]);
    expect(posted[0]).toMatchObject({ method: "POST", keepalive: true, credentials: "omit" });

    for (let i = 0; i < 6; i += 1) report?.(new Error(`render failed ${i}`), "caught");
    await sleep(20);
    expect(posted).toHaveLength(5);
  });

  test("leaves a route control and a server error the page streamed to the server, which reported it", async () => {
    openPage([{ name: "akan-report", description: pageId }]);
    const report = pageErrorReporter(() => null);
    report?.(Object.assign(new Error("not found"), { digest: "AKAN_NOT_FOUND" }), "caught");
    report?.(Object.assign(new Error("render failed"), { digest: "a1b2c3d4" }), "uncaught");
    report?.(Object.assign(new Error("hydration fell back"), { digest: "a1b2c3d4" }), "recoverable");
    await sleep(50);

    expect(bodies().map(({ kind, digest }) => [kind, digest])).toEqual([["recoverable", "a1b2c3d4"]]);
  });

  test("sends a message and a stack without their query strings, email addresses and credentials", async () => {
    openPage([{ name: "akan-report", description: pageId }]);
    const report = pageErrorReporter(() => null);
    const failure = new Error("no cart for ada@example.com at /en/cart?token=s3cret with Bearer abc.def");
    failure.stack = "Error: no cart\n    at Cart (http://shop.test/en/cart?token=s3cret:3:15)";
    report?.(failure, "uncaught");
    await sleep(50);

    expect(bodies()[0]).toMatchObject({
      message: "no cart for [email] at /en/cart with Bearer [redacted]",
      stack: "Error: no cart\n    at Cart (http://shop.test/en/cart:3:15)",
    });
  });

  test("cuts a stack that would carry the report past what the server reads", async () => {
    openPage([{ name: "akan-report", description: pageId }]);
    const report = pageErrorReporter(() => null);
    const failure = new Error("주문 합계를 계산하지 못했습니다".repeat(30));
    failure.stack = `Error: ${"한".repeat(3_000)}`;
    report?.(failure, "uncaught");
    await sleep(50);

    expect(posted).toHaveLength(1);
    expect(new TextEncoder().encode(String(posted[0]?.body)).byteLength).toBeLessThanOrEqual(8_192);
    expect(String(bodies()[0]?.stack).length).toBe(1_000);
  });
});
