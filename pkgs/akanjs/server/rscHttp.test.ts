import { describe, expect, test } from "bun:test";
import {
  joinBytes,
  mixedFlight,
  mixedFlightRows,
  offsetsWhereOutputDiffers,
  readBytes,
  rowShapedText,
  streamOfChunks,
  textRow,
} from "./flightRows.fixture";
import {
  encodeAkanRedirectDigest,
  getRscPayloadStream,
  guardRscRedirectRows,
  isRscPayloadResponse,
  RSC_CONTENT_TYPE,
  type RscRedirectRow,
  watchRscErrorRows,
} from "./rscHttp";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const respond = (body: string, status: number, contentType: string) =>
  new Response(body, { status, headers: { "Content-Type": contentType } });

const streamOf = (...chunks: Uint8Array[]) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });

describe("RSC HTTP helpers", () => {
  test("allows normal RSC payload responses", () => {
    const response = respond("flight", 200, RSC_CONTENT_TYPE);

    expect(isRscPayloadResponse(response)).toBe(true);
  });

  test("allows not-found RSC payload responses", () => {
    const response = respond("flight", 404, RSC_CONTENT_TYPE);

    expect(isRscPayloadResponse(response)).toBe(true);
  });

  test("rejects non-RSC not-found responses", () => {
    const response = respond("Not Found", 404, "text/plain; charset=utf-8");

    expect(isRscPayloadResponse(response)).toBe(false);
  });

  test("rejects non-RSC server error fallbacks so navigation can hard-reload", () => {
    const response = respond("Internal Server Error", 500, "text/plain; charset=utf-8");

    expect(isRscPayloadResponse(response)).toBe(false);
  });

  test("returns the original RSC response body stream for client decoding", () => {
    const response = respond("flight", 200, RSC_CONTENT_TYPE);

    expect(getRscPayloadStream(response)).toBe(response.body);
  });

  test("returns null for non-RSC response bodies", () => {
    const response = respond("Internal Server Error", 500, "text/plain; charset=utf-8");

    expect(getRscPayloadStream(response)).toBeNull();
  });

  test("passes normal RSC rows through the redirect guard", async () => {
    const stream = guardRscRedirectRows(
      streamOf(encoder.encode('0:D{"name":"Page"}\n'), encoder.encode('1:["$","main",null,{}]\n')),
    );

    await expect(new Response(stream).text()).resolves.toBe('0:D{"name":"Page"}\n1:["$","main",null,{}]\n');
  });

  test("replaces split Akan redirect rows before RSDW sees them", async () => {
    const row = 'a:E{"digest":"AKAN_REDIRECT","name":"AkanRedirectError","message":"Redirect to /target"}\n';
    const redirects: Array<{ rowId: string; location?: string }> = [];
    const bytes = encoder.encode(row);
    const stream = guardRscRedirectRows(streamOf(bytes.slice(0, 11), bytes.slice(11, 37), bytes.slice(37)), {
      onRedirect: (redirect) => {
        redirects.push(redirect);
      },
    });

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
    const stream = guardRscRedirectRows(streamOf(encoder.encode(row)), {
      onRedirect: (redirect) => {
        redirects.push(redirect);
      },
    });

    await expect(new Response(stream).text()).resolves.toBe("b:null\n");
    expect(redirects).toEqual([
      { rowId: "b", location: "/login?next=%2Fdashboard&label=한글", method: "push", status: 308 },
    ]);
  });

  test("leaves redirect-shaped lines inside a long text row to the text", async () => {
    const flight = joinBytes(textRow("1", rowShapedText), '0:"$1"\n');
    const redirects: RscRedirectRow[] = [];
    const output = await readBytes(
      guardRscRedirectRows(streamOfChunks([flight]), { onRedirect: (redirect) => redirects.push(redirect) }),
    );

    expect(decoder.decode(output)).toBe(decoder.decode(flight));
    expect(redirects).toEqual([]);
  });

  test("finds the one real redirect row wherever a chunk boundary falls", async () => {
    const rows = mixedFlightRows;
    const expected = joinBytes(rows.hint, rows.debug, rows.text, rows.bytes, rows.empty, "c7:null\n", rows.model);
    const redirects: RscRedirectRow[] = [];
    const differing = await offsetsWhereOutputDiffers(mixedFlight, expected, (stream) =>
      guardRscRedirectRows(stream, { onRedirect: (redirect) => redirects.push(redirect) }),
    );

    expect(differing).toEqual([]);
    expect(redirects).toHaveLength(mixedFlight.byteLength + 2);
    expect([...new Map(redirects.map((redirect) => [JSON.stringify(redirect), redirect])).values()]).toEqual([
      { rowId: "c7", location: "/target", method: "replace", status: 307 },
    ]);
  });

  test("calls back once for a streamed server error, and never for a not-found or redirect digest", async () => {
    const watched = async (rows: string) => {
      let errors = 0;
      const output = await readBytes(watchRscErrorRows(streamOf(encoder.encode(rows)), () => (errors += 1)));
      expect(decoder.decode(output)).toBe(rows);
      return errors;
    };
    const redirect = encodeAkanRedirectDigest({ location: "/signin", method: "replace", status: 307 });

    expect(await watched(`0:"page"\n1:E{"digest":"3f2a9c1d"}\n2:E{"digest":"8b7e6d5c"}\n`)).toBe(1);
    expect(await watched(`0:"page"\n1:E{"digest":"AKAN_NOT_FOUND"}\n2:E{"digest":"${redirect}"}\n`)).toBe(0);
    expect(await watched(`0:"page"\n1:T6,E{x:1}\n`)).toBe(0);
  });
});
