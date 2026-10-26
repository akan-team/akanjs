import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import { connect } from "node:net";
import os from "node:os";
import path from "node:path";
import { brotliDecompressSync, constants, gunzipSync } from "node:zlib";
import {
  acceptedEncodings,
  compressResponse,
  compressStreamResponse,
  encodeBody,
  encodedBodyResponse,
  encodedFileResponse,
  isCompressibleContentType,
  matchesIfNoneMatch,
  resolveEncodedSidecar,
} from "./contentEncoding";

const body = JSON.stringify({ rows: Array.from({ length: 200 }, (_, i) => ({ id: i, title: "repeated title" })) });
const json = (payload = body) => Response.json(JSON.parse(payload) as unknown);
const req = (acceptEncoding?: string) =>
  new Request("http://localhost/api/x", acceptEncoding ? { headers: { "accept-encoding": acceptEncoding } } : {});

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "asset-encoding-"));
const assetPath = path.join(dir, "root.css");
fs.writeFileSync(assetPath, "body{color:red}");
fs.writeFileSync(`${assetPath}.gz`, "gzip-bytes");
fs.writeFileSync(`${assetPath}.br`, "brotli-bytes");

const bareAssetPath = path.join(dir, "bare.css");
fs.writeFileSync(bareAssetPath, "body{color:blue}");

const gzipOnlyPath = path.join(dir, "gzipOnly.css");
fs.writeFileSync(gzipOnlyPath, "body{color:green}");
fs.writeFileSync(`${gzipOnlyPath}.gz`, "gzip-bytes");

const resolve = (acceptEncoding: string, filePath = assetPath, contentType = "text/css; charset=utf-8") =>
  resolveEncodedSidecar(
    new Request("https://x.test/root.css", { headers: { "accept-encoding": acceptEncoding } }),
    filePath,
    contentType,
  );

afterEach(() => {
  process.env.AKAN_HTTP_COMPRESS = undefined;
});

describe("acceptedEncodings", () => {
  test("takes what a client names, and lets a coding named with q=0 override `*`", () => {
    expect(acceptedEncodings("gzip, deflate, br, zstd")).toEqual(["br", "gzip"]);
    expect(acceptedEncodings("BR;Q=0.5")).toEqual(["br"]);
    expect(acceptedEncodings("*")).toEqual(["br", "gzip"]);
    expect(acceptedEncodings("*, br;q=0")).toEqual(["gzip"]);
    expect(acceptedEncodings("*, gzip;q=0, br;q=0")).toEqual([]);
    expect(acceptedEncodings("*;q=0, gzip")).toEqual(["gzip"]);
    expect(acceptedEncodings("identity")).toEqual([]);
    expect(acceptedEncodings("")).toEqual([]);
  });
});

describe("matchesIfNoneMatch", () => {
  test("compares weakly, so a validator a compressed answer weakened still matches", () => {
    expect(matchesIfNoneMatch('W/"abc"', '"abc"')).toBe(true);
    expect(matchesIfNoneMatch('"x", W/"abc"', 'W/"abc"')).toBe(true);
    expect(matchesIfNoneMatch("*", '"abc"')).toBe(true);
    expect(matchesIfNoneMatch('"abd"', '"abc"')).toBe(false);
    expect(matchesIfNoneMatch(null, '"abc"')).toBe(false);
  });
});

describe("encodedFileResponse", () => {
  test("varies a compressible file on Accept-Encoding even when it goes out plain", async () => {
    const plain = await encodedFileResponse(req("identity"), bareAssetPath, "text/css", new Headers());
    const encoded = await encodedFileResponse(req("br"), assetPath, "text/css", new Headers({ Vary: "Accept" }));
    const font = await encodedFileResponse(req("br"), bareAssetPath, "font/woff2", new Headers());

    expect(plain.headers.get("Content-Encoding")).toBeNull();
    expect(plain.headers.get("Vary")).toBe("Accept-Encoding");
    expect(encoded.headers.get("Content-Encoding")).toBe("br");
    expect(encoded.headers.get("Vary")).toBe("Accept, Accept-Encoding");
    expect(font.headers.get("Vary")).toBeNull();
  });
});

describe("compressResponse", () => {
  test("prefers brotli and reports it, leaving the decoded body unchanged", async () => {
    const original = await json().text();
    const response = await compressResponse(req("gzip, deflate, br"), json());

    expect(response.headers.get("Content-Encoding")).toBe("br");
    expect(response.headers.get("Vary")).toContain("Accept-Encoding");
    const compressed = Buffer.from(await response.arrayBuffer());
    expect(compressed.byteLength).toBeLessThan(Buffer.byteLength(original) / 4);
    expect(brotliDecompressSync(compressed).toString()).toBe(original);
    expect(response.headers.get("Content-Length")).toBe(String(compressed.byteLength));
  });

  test("falls back to gzip when brotli is not advertised", async () => {
    const original = await json().text();
    const response = await compressResponse(req("gzip, deflate"), json());

    expect(response.headers.get("Content-Encoding")).toBe("gzip");
    expect(gunzipSync(Buffer.from(await response.arrayBuffer())).toString()).toBe(original);
  });

  test("leaves the body alone when nothing is accepted, or the encoding is refused with q=0", async () => {
    expect((await compressResponse(req(), json())).headers.get("Content-Encoding")).toBeNull();
    expect((await compressResponse(req("identity"), json())).headers.get("Content-Encoding")).toBeNull();
    expect((await compressResponse(req("br;q=0, gzip;q=0"), json())).headers.get("Content-Encoding")).toBeNull();
  });

  test("skips a body too small to pay for its own framing", async () => {
    const small = Response.json({ ok: true });
    const response = await compressResponse(req("br"), small);

    expect(response.headers.get("Content-Encoding")).toBeNull();
    expect(await response.json()).toEqual({ ok: true });
  });

  test("skips a body that is already encoded, and one whose type is not compressible", async () => {
    const encoded = new Response(body, {
      headers: { "Content-Type": "application/json", "Content-Encoding": "gzip" },
    });
    const png = new Response(body, { headers: { "Content-Type": "image/png" } });

    expect((await compressResponse(req("br"), encoded)).headers.get("Content-Encoding")).toBe("gzip");
    expect((await compressResponse(req("br"), png)).headers.get("Content-Encoding")).toBeNull();
  });

  test("is switched off wholesale by AKAN_HTTP_COMPRESS", async () => {
    process.env.AKAN_HTTP_COMPRESS = "false";

    expect((await compressResponse(req("br"), json())).headers.get("Content-Encoding")).toBeNull();
  });

  test("leaves a Range request, and a partial, failed or redirecting answer, as they are", async () => {
    const ranged = json();
    const rangeReq = new Request("http://localhost/api/x", {
      headers: { "accept-encoding": "br", range: "bytes=0-9" },
    });
    const partial = new Response(body, {
      status: 206,
      headers: { "Content-Type": "application/json", "Content-Range": `bytes 0-${body.length - 1}/${body.length * 2}` },
    });
    const failed = new Response(body, { status: 500, headers: { "Content-Type": "application/json" } });
    const moved = new Response(body, { status: 302, headers: { "Content-Type": "text/html", Location: "/next" } });

    for (const [request, response] of [
      [rangeReq, ranged],
      [req("br"), partial],
      [req("br"), failed],
      [req("br"), moved],
    ] as const)
      expect(await compressResponse(request, response)).toBe(response);
  });

  test("sends a body declared past 4 MiB as it is, without reading it", async () => {
    const large = new Response(body, {
      headers: { "Content-Type": "application/json", "Content-Length": String(4 * 1024 * 1024 + 1) },
    });

    expect(await compressResponse(req("br"), large)).toBe(large);
    expect(large.bodyUsed).toBe(false);
  });

  test("sends a handler-built body past 4 MiB as it is, though it declares no length", async () => {
    const large = Response.json({ rows: "x".repeat(4 * 1024 * 1024 + 1) });
    const res = await compressResponse(req("br"), large);

    expect(res.headers.get("Content-Encoding")).toBeNull();
    expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(4 * 1024 * 1024);
  });

  test("carries the status and the headers the handler set", async () => {
    const created = new Response(body, {
      status: 201,
      statusText: "Created",
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
    const response = await compressResponse(req("br"), created);

    expect(response.status).toBe(201);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Content-Type")).toBe("application/json");
  });
});

describe("compressResponse behind Bun.serve", () => {
  const blobPath = path.join(dir, "rows.json");
  const blob = JSON.stringify(Array.from({ length: 20_000 }, (_, i) => ({ id: i, title: "repeated title" })));
  fs.writeFileSync(blobPath, blob);

  const serve = () =>
    Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      routes: {
        "/blob": (request) =>
          compressResponse(
            request,
            new Response(Bun.file(blobPath).stream(), { headers: { "x-content-type-options": "nosniff" } }),
          ),
        "/typed": (request) => compressResponse(request, new Response(Bun.file(blobPath))),
        "/api": (request) => compressResponse(request, json()),
      },
    });

  test("a file body goes out whole, typed by its name, and a Range of it as Bun's own 206", async () => {
    const server = serve();
    try {
      const whole = await fetch(`http://127.0.0.1:${server.port}/blob`, { headers: { "accept-encoding": "br" } });
      expect(whole.headers.get("content-encoding")).toBeNull();
      expect(whole.headers.get("content-type")).toBe("application/json;charset=utf-8");
      expect(whole.headers.get("content-length")).toBe(String(blob.length));
      expect(await whole.text()).toBe(blob);

      for (const route of ["/blob", "/typed"]) {
        const ranged = await fetch(`http://127.0.0.1:${server.port}${route}`, {
          headers: { "accept-encoding": "br", range: "bytes=10-19" },
        });
        expect(ranged.status).toBe(206);
        expect(ranged.headers.get("content-range")).toBe(`bytes 10-19/${blob.length}`);
        expect(await ranged.text()).toBe(blob.slice(10, 20));
      }
    } finally {
      server.stop(true);
    }
  });

  test("an API answer is still compressed", async () => {
    const server = serve();
    try {
      const api = await fetch(`http://127.0.0.1:${server.port}/api`, { headers: { "accept-encoding": "br" } });
      expect(api.headers.get("content-encoding")).toBe("br");
      expect(await api.text()).toBe(await json().text());
    } finally {
      server.stop(true);
    }
  });
});

const shell = `<!doctype html><html><body>${'<div class="jelly-glass">shell</div>'.repeat(200)}`;
const tail = `${"<p>streamed boundary</p>".repeat(200)}</body></html>`;

interface HtmlRender {
  response: Response;
  finish: () => void;
  cancelled: Promise<unknown>;
}
const htmlRender = (headers: Record<string, string> = {}): HtmlRender => {
  let finish: () => void = () => undefined;
  let onCancel: (reason: unknown) => void = () => undefined;
  const cancelled = new Promise<unknown>((resolve) => {
    onCancel = resolve;
  });
  const body = new ReadableStream<Uint8Array>({
    start: async (controller) => {
      controller.enqueue(new TextEncoder().encode(shell));
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      controller.enqueue(new TextEncoder().encode(tail));
      controller.close();
    },
    cancel: (reason) => onCancel(reason),
  });
  const response = new Response(body, { headers: { "Content-Type": "text/html; charset=utf-8", ...headers } });
  return { response, finish: () => finish(), cancelled };
};

// Waits on the render's open stream: a compressor that held the shell back would time the test out here.
const readShell = async (reader: ReadableStreamDefaultReader<Uint8Array>, decode: (bytes: Buffer) => string) => {
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) throw new Error("stream ended before the shell decoded");
    chunks.push(value);
    if (decode(Buffer.concat(chunks)) === shell) return chunks;
  }
};

describe("compressStreamResponse", () => {
  test("sends the shell, decodable, before the render finishes, then the rest", async () => {
    for (const [encoding, decode] of [
      ["br", (bytes: Buffer) => brotliDecompressSync(bytes, { finishFlush: constants.BROTLI_OPERATION_FLUSH })],
      ["gzip", (bytes: Buffer) => gunzipSync(bytes, { finishFlush: constants.Z_SYNC_FLUSH })],
    ] as const) {
      const render = htmlRender();
      const response = compressStreamResponse(req(encoding), render.response);

      expect(response.headers.get("Content-Encoding")).toBe(encoding);
      expect(response.headers.get("Vary")).toContain("Accept-Encoding");
      const reader = (response.body as ReadableStream<Uint8Array>).getReader();
      const chunks = await readShell(reader, (bytes) => decode(bytes).toString());

      render.finish();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
      const whole = Buffer.concat(chunks);
      expect((encoding === "br" ? brotliDecompressSync(whole) : gunzipSync(whole)).toString()).toBe(shell + tail);
      expect(whole.byteLength).toBeLessThan((shell + tail).length / 10);
    }
  });

  test("cancels the render when the client goes away", async () => {
    const render = htmlRender();
    const response = compressStreamResponse(req("br"), render.response);
    const reader = (response.body as ReadableStream<Uint8Array>).getReader();
    await reader.read();

    await reader.cancel("client gone");

    expect(await render.cancelled).toBe("client gone");
  });

  test("drops the length, weakens a strong validator and keeps the status and other headers", async () => {
    const render = htmlRender({ "Content-Length": "999", ETag: '"v1"', "Cache-Control": "no-store" });
    const response = compressStreamResponse(req("gzip"), render.response);
    render.finish();

    expect(response.headers.get("Content-Length")).toBeNull();
    expect(response.headers.get("ETag")).toBe('W/"v1"');
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.status).toBe(200);
    expect(gunzipSync(Buffer.from(await response.arrayBuffer())).toString()).toBe(shell + tail);
  });

  test("leaves an encoded, incompressible, unaccepted, ranged or switched-off response as it is", async () => {
    const ranged = new Request("http://localhost/", { headers: { "accept-encoding": "br", range: "bytes=0-9" } });
    const cases: [Request, Response][] = [
      [req("br"), htmlRender({ "Content-Encoding": "gzip" }).response],
      [req("br"), new Response("x".repeat(4096), { headers: { "Content-Type": "image/png" } })],
      [req("br"), new Response("data: tick\n\n".repeat(400), { headers: { "Content-Type": "text/event-stream" } })],
      [req(), htmlRender().response],
      [ranged, htmlRender().response],
      [req("br"), new Response(null, { status: 304 })],
    ];
    for (const [request, response] of cases) expect(compressStreamResponse(request, response)).toBe(response);

    process.env.AKAN_HTTP_COMPRESS = "0";
    const off = htmlRender().response;
    expect(compressStreamResponse(req("br"), off)).toBe(off);
  });
});

describe("compressStreamResponse behind Bun.serve", () => {
  test("survives clients that leave while the compressor finishes a body written at once", async () => {
    const page = Array.from({ length: 60_000 }, (_, i) => `<p>${i} ${Bun.hash(String(i)).toString(36)}</p>`).join("");
    const payload = new TextEncoder().encode(page);
    const uncaught: unknown[] = [];
    const onUncaught = (error: unknown) => uncaught.push(error);
    process.on("uncaughtException", onUncaught);
    const server = Bun.serve({
      port: 0,
      fetch: (request) => {
        const body = new ReadableStream<Uint8Array>({
          start: (controller) => {
            for (let at = 0; at < payload.byteLength; at += 16_384)
              controller.enqueue(payload.subarray(at, at + 16_384));
            controller.close();
          },
        });
        return compressStreamResponse(request, new Response(body, { headers: { "Content-Type": "text/html" } }));
      },
    });
    const leaveAtFirstBytes = (encoding: string) =>
      new Promise<void>((resolve) => {
        const socket = connect({ port: Number(server.port), host: "127.0.0.1" });
        socket.on("error", () => resolve());
        socket.write(`GET / HTTP/1.1\r\nHost: x\r\nAccept-Encoding: ${encoding}\r\n\r\n`);
        socket.once("data", () => {
          socket.destroy();
          setTimeout(resolve, 20);
        });
      });
    try {
      for (const encoding of ["gzip", "br", "gzip", "br", "gzip", "br"]) await leaveAtFirstBytes(encoding);
      const whole = await fetch(`http://127.0.0.1:${server.port}/`, { headers: { "Accept-Encoding": "br" } });

      expect(await whole.text()).toBe(page);
      await Bun.sleep(50);
      expect(uncaught).toEqual([]);
    } finally {
      process.off("uncaughtException", onUncaught);
      server.stop(true);
    }
  });
});

describe("encodedBodyResponse", () => {
  const page = `<!doctype html><html><body>${"<p>안녕 cached</p>".repeat(300)}</body></html>`;
  const htmlHeaders = () => new Headers({ "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });

  test("answers every request from the encodings made once, for whichever the client takes", async () => {
    const encoded = await encodeBody(page);
    expect(encoded.byteLength).toBe(
      encoded.bytes.byteLength + (encoded.encodings.br?.byteLength ?? 0) + (encoded.encodings.gzip?.byteLength ?? 0),
    );

    for (let i = 0; i < 2; i++) {
      const br = encodedBodyResponse(req("gzip, br"), encoded, { headers: htmlHeaders() });
      expect(br.headers.get("Content-Encoding")).toBe("br");
      expect(br.headers.get("Vary")).toContain("Accept-Encoding");
      expect(br.headers.get("Cache-Control")).toBe("no-store");
      const bytes = Buffer.from(await br.arrayBuffer());
      expect(br.headers.get("Content-Length")).toBe(String(bytes.byteLength));
      expect(brotliDecompressSync(bytes).toString()).toBe(page);
    }

    const gzip = encodedBodyResponse(req("gzip"), encoded, { headers: htmlHeaders() });
    expect(gzip.headers.get("Content-Encoding")).toBe("gzip");
    expect(gunzipSync(Buffer.from(await gzip.arrayBuffer())).toString()).toBe(page);

    const identity = encodedBodyResponse(req(), encoded, { headers: htmlHeaders() });
    expect(identity.headers.get("Content-Encoding")).toBeNull();
    await expect(identity.text()).resolves.toBe(page);
  });

  test("keeps no encoding of a small body, or with compression switched off, and serves the bytes as they are", async () => {
    const small = await encodeBody("<p>tiny</p>");
    expect(small.encodings).toEqual({});
    const response = encodedBodyResponse(req("br"), small, { headers: htmlHeaders() });
    expect(response.headers.get("Content-Encoding")).toBeNull();
    await expect(response.text()).resolves.toBe("<p>tiny</p>");

    process.env.AKAN_HTTP_COMPRESS = "0";
    const off = await encodeBody(page);
    expect(off.encodings).toEqual({});
    expect(off.byteLength).toBe(off.bytes.byteLength);
  });

  test("sends the raw bytes for a status or range it would not compress", async () => {
    const encoded = await encodeBody(page);
    const notFound = encodedBodyResponse(req("br"), encoded, { status: 404, headers: htmlHeaders() });
    expect(notFound.status).toBe(404);
    expect(notFound.headers.get("Content-Encoding")).toBeNull();

    const ranged = new Request("http://localhost/", { headers: { "accept-encoding": "br", range: "bytes=0-9" } });
    expect(encodedBodyResponse(ranged, encoded, { headers: htmlHeaders() }).headers.get("Content-Encoding")).toBeNull();
  });
});

describe("resolveEncodedSidecar", () => {
  test("prefers brotli when both sidecars are accepted", async () => {
    expect((await resolve("gzip, deflate, br"))?.encoding).toBe("br");
  });

  test("falls back to gzip when brotli is not advertised", async () => {
    expect((await resolve("gzip, deflate"))?.encoding).toBe("gzip");
  });

  test("falls back to gzip when the brotli sidecar is missing", async () => {
    expect((await resolve("gzip, br", gzipOnlyPath))?.encoding).toBe("gzip");
  });

  test("serves the raw file when nothing is accepted", async () => {
    expect(await resolve("identity")).toBeNull();
  });

  test("serves the raw file when no sidecar exists", async () => {
    expect(await resolve("gzip, br", bareAssetPath)).toBeNull();
  });

  test("honours q=0 as a refusal", async () => {
    expect((await resolve("br;q=0, gzip"))?.encoding).toBe("gzip");
    expect(await resolve("br;q=0, gzip;q=0")).toBeNull();
  });

  test("treats a wildcard as accepting brotli", async () => {
    expect((await resolve("*"))?.encoding).toBe("br");
  });

  test("does not match a token that merely starts with br", async () => {
    expect(await resolve("brotli")).toBeNull();
  });

  test("skips sidecars for content types that are not compressible", async () => {
    expect(await resolve("gzip, br", assetPath, "font/woff2")).toBeNull();
  });
});

describe("isCompressibleContentType", () => {
  test("refuses an event stream, which has no end to buffer", () => {
    expect(isCompressibleContentType("text/event-stream")).toBe(false);
    expect(isCompressibleContentType("text/html; charset=utf-8")).toBe(true);
    expect(isCompressibleContentType("application/json")).toBe(true);
    expect(isCompressibleContentType("image/png")).toBe(false);
  });

  test("accepts text and the listed application types", () => {
    expect(isCompressibleContentType("text/css; charset=utf-8")).toBe(true);
    expect(isCompressibleContentType("application/javascript")).toBe(true);
    expect(isCompressibleContentType("image/svg+xml")).toBe(true);
  });

  test("rejects already-compressed binary types", () => {
    expect(isCompressibleContentType("font/woff2")).toBe(false);
    expect(isCompressibleContentType("image/png")).toBe(false);
  });
});
