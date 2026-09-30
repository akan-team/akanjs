import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { brotliDecompressSync, gunzipSync } from "node:zlib";
import { compressResponse, isCompressibleContentType, resolveEncodedSidecar } from "./contentEncoding";

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
