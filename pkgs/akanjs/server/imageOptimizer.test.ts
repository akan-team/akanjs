import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ImageOptimizer } from "./imageOptimizer";

const onePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const hex = (text: string) => Buffer.from(text.replace(/\s+/g, ""), "hex");
const gifFrame = "21f904010000 0000 2c00000000010001000000 020244010000";
const animatedGif = hex(`47494638396101000100 8000 00 000000 ffffff${gifFrame}${gifFrame}3b`);

const root = path.join(tmpdir(), `akan-image-optimizer-${process.pid}`);
let optimizer: ImageOptimizer;

const request = (url: string, width: number, accept: string) =>
  new Request(`http://local.akan/_akan/image?url=${encodeURIComponent(url)}&w=${width}&q=75`, { headers: { accept } });

describe("ImageOptimizer", () => {
  beforeAll(async () => {
    await Bun.write(path.join(root, "public/photo.png"), await new Bun.Image(onePixelPng).resize(64).png().bytes());
    await Bun.write(path.join(root, "public/loop.gif"), animatedGif);
    await Bun.write(path.join(root, "public/logo.svg"), '<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    optimizer = new ImageOptimizer({
      publicDir: path.join(root, "public"),
      cacheDir: path.join(root, "cache"),
      prodMode: true,
    });
  });
  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test("re-encodes a png to webp when the client accepts it", async () => {
    const res = await optimizer.handle(request("/photo.png", 32, "image/webp,image/*"));

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/webp");
    expect(res.headers.get("Vary")).toBe("Accept");
    expect(await new Bun.Image(Buffer.from(await res.arrayBuffer())).metadata()).toMatchObject({
      width: 32,
      format: "webp",
    });
  });

  test("keeps the source format when the client accepts nothing better", async () => {
    const res = await optimizer.handle(request("/photo.png", 32, "text/html"));

    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(await new Bun.Image(Buffer.from(await res.arrayBuffer())).metadata()).toMatchObject({ width: 32 });
  });

  test("never enlarges past the source", async () => {
    const res = await optimizer.handle(request("/photo.png", 256, "image/webp"));
    const meta = await new Bun.Image(Buffer.from(await res.arrayBuffer())).metadata();

    expect(meta.width).toBe(64);
  });

  test("passes an animated gif through untouched", async () => {
    const res = await optimizer.handle(request("/loop.gif", 32, "image/webp,image/*"));

    expect(res.headers.get("Content-Type")).toBe("image/gif");
    expect(Buffer.from(await res.arrayBuffer())).toEqual(animatedGif);
  });

  test("refuses svg unless the app opted in", async () => {
    const res = await optimizer.handle(request("/logo.svg", 32, "image/webp"));

    expect(res.status).toBe(400);
  });

  test("answers 304 for a matching if-none-match", async () => {
    const first = await optimizer.handle(request("/photo.png", 32, "image/webp"));
    const etag = first.headers.get("ETag") ?? "";
    const req = request("/photo.png", 32, "image/webp");
    req.headers.set("if-none-match", etag);

    expect((await optimizer.handle(req)).status).toBe(304);
  });

  test("downgrades an avif-only config to webp where no OS codec exists", async () => {
    // The `bun` backend is what a Linux container runs, and it has no AV1 encoder. Forcing it here
    // means the downgrade is covered on a macOS dev machine too, where `system` would have encoded.
    const backend = Bun.Image.backend;
    Bun.Image.backend = "bun";
    try {
      const avifOnly = new ImageOptimizer({
        publicDir: path.join(root, "public"),
        cacheDir: path.join(root, "cache-avif"),
        prodMode: true,
        config: { formats: ["image/avif"] },
      });
      const res = await avifOnly.handle(request("/photo.png", 32, "image/avif,image/webp,image/*"));

      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("image/webp");
    } finally {
      Bun.Image.backend = backend;
    }
  });
});
