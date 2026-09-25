import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { isCompressibleContentType, resolveEncodedSidecar } from "./assetEncoding";

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

  // A q-value of 0 is an explicit refusal; treating it as a preference sends a body the client cannot decode.
  test("honours q=0 as a refusal", async () => {
    expect((await resolve("br;q=0, gzip"))?.encoding).toBe("gzip");
    expect(await resolve("br;q=0, gzip;q=0")).toBeNull();
  });

  test("treats a wildcard as accepting brotli", async () => {
    expect((await resolve("*"))?.encoding).toBe("br");
  });

  // "brotli" is not the `br` token — a prefix match would send brotli bytes to a client that never asked.
  test("does not match a token that merely starts with br", async () => {
    expect(await resolve("brotli")).toBeNull();
  });

  test("skips sidecars for content types that are not compressible", async () => {
    expect(await resolve("gzip, br", assetPath, "font/woff2")).toBeNull();
  });
});

describe("isCompressibleContentType", () => {
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
