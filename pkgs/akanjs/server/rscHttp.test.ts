import { describe, expect, test } from "bun:test";
import {
  encodeAkanRedirectDigest,
  getRscPayloadStream,
  guardRscRedirectRows,
  isRscPayloadResponse,
  RSC_CONTENT_TYPE,
} from "./rscHttp";

const encoder = new TextEncoder();

describe("RSC HTTP helpers", () => {
  test("allows normal RSC payload responses", () => {
    const response = new Response("flight", {
      status: 200,
      headers: { "Content-Type": RSC_CONTENT_TYPE },
    });

    expect(isRscPayloadResponse(response)).toBe(true);
  });

  test("allows not-found RSC payload responses", () => {
    const response = new Response("flight", {
      status: 404,
      headers: { "Content-Type": RSC_CONTENT_TYPE },
    });

    expect(isRscPayloadResponse(response)).toBe(true);
  });

  test("rejects non-RSC not-found responses", () => {
    const response = new Response("Not Found", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });

    expect(isRscPayloadResponse(response)).toBe(false);
  });

  test("rejects non-RSC server error fallbacks so navigation can hard-reload", () => {
    const response = new Response("Internal Server Error", {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });

    expect(isRscPayloadResponse(response)).toBe(false);
  });

  test("returns the original RSC response body stream for client decoding", () => {
    const response = new Response("flight", {
      status: 200,
      headers: { "Content-Type": RSC_CONTENT_TYPE },
    });

    expect(getRscPayloadStream(response)).toBe(response.body);
  });

  test("returns null for non-RSC response bodies", () => {
    const response = new Response("Internal Server Error", {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });

    expect(getRscPayloadStream(response)).toBeNull();
  });

  test("passes normal RSC rows through the redirect guard", async () => {
    const stream = guardRscRedirectRows(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode('0:D{"name":"Page"}\n'));
          controller.enqueue(encoder.encode('1:["$","main",null,{}]\n'));
          controller.close();
        },
      }),
    );

    await expect(new Response(stream).text()).resolves.toBe('0:D{"name":"Page"}\n1:["$","main",null,{}]\n');
  });

  test("replaces split Akan redirect rows before RSDW sees them", async () => {
    const row = 'a:E{"digest":"AKAN_REDIRECT","name":"AkanRedirectError","message":"Redirect to /target"}\n';
    const redirects: Array<{ rowId: string; location?: string }> = [];
    const stream = guardRscRedirectRows(
      new ReadableStream<Uint8Array>({
        start(controller) {
          const bytes = encoder.encode(row);
          controller.enqueue(bytes.slice(0, 11));
          controller.enqueue(bytes.slice(11, 37));
          controller.enqueue(bytes.slice(37));
          controller.close();
        },
      }),
      {
        onRedirect: (redirect) => {
          redirects.push(redirect);
        },
      },
    );

    await expect(new Response(stream).text()).resolves.toBe("a:null\n");
    expect(redirects).toEqual([{ rowId: "a", location: "/target" }]);
  });

  test("reads redirect metadata from the digest without relying on error messages", async () => {
    const digest = encodeAkanRedirectDigest({
      location: "/login?next=%2Fdashboard&label=한글",
      method: "push",
      status: 308,
    });
    const row = `b:E{"digest":"${digest}","name":"Error"}\n`;
    const redirects: Array<{ rowId: string; location?: string; method?: string; status?: number }> = [];
    const stream = guardRscRedirectRows(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode(row));
          controller.close();
        },
      }),
      {
        onRedirect: (redirect) => {
          redirects.push(redirect);
        },
      },
    );

    await expect(new Response(stream).text()).resolves.toBe("b:null\n");
    expect(redirects).toEqual([
      { rowId: "b", location: "/login?next=%2Fdashboard&label=한글", method: "push", status: 308 },
    ]);
  });
});
