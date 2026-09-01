import { describe, expect, test } from "bun:test";
import { isAnimatedImage } from "./animatedImage";

const hex = (text: string) => Buffer.from(text.replace(/\s+/g, ""), "hex");

const gifHeaderAndPalette = "47494638396101000100 8000 00 000000 ffffff";
const gifGraphicControl = "21f904010000 0000";
const gifFrame = "2c00000000010001000000 020244010000";
const gifTrailer = "3b";

const staticGif = hex(`${gifHeaderAndPalette}${gifGraphicControl}${gifFrame}${gifTrailer}`);
const animatedGif = hex(
  `${gifHeaderAndPalette}${gifGraphicControl}${gifFrame}${gifGraphicControl}${gifFrame}${gifTrailer}`,
);

const riffChunk = (id: string, payloadBytes: number) => {
  const header = Buffer.alloc(8);
  header.write(id, 0, "ascii");
  header.writeUInt32LE(payloadBytes, 4);
  return Buffer.concat([header, Buffer.alloc(payloadBytes)]);
};
const webpOf = (...chunks: Buffer[]) => {
  const body = Buffer.concat([Buffer.from("WEBP", "ascii"), ...chunks]);
  const riff = Buffer.alloc(8);
  riff.write("RIFF", 0, "ascii");
  riff.writeUInt32LE(body.length, 4);
  return Buffer.concat([riff, body]);
};
const staticWebp = webpOf(riffChunk("VP8 ", 16));
const animatedWebp = webpOf(riffChunk("VP8X", 10), riffChunk("ANIM", 6), riffChunk("ANMF", 20));

const pngChunk = (id: string, payloadBytes: number) => {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(payloadBytes, 0);
  header.write(id, 4, "ascii");
  return Buffer.concat([header, Buffer.alloc(payloadBytes), Buffer.alloc(4)]);
};
const pngOf = (...chunks: Buffer[]) =>
  Buffer.concat([hex("89504e470d0a1a0a"), pngChunk("IHDR", 13), ...chunks, pngChunk("IEND", 0)]);
const staticPng = pngOf(pngChunk("IDAT", 8));
const onePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const animatedPng = pngOf(pngChunk("acTL", 8), pngChunk("IDAT", 8));

describe("isAnimatedImage", () => {
  test("counts GIF frames rather than raw 0x2c bytes", () => {
    expect(isAnimatedImage(staticGif, "image/gif")).toBe(false);
    expect(isAnimatedImage(animatedGif, "image/gif")).toBe(true);
  });

  test("finds the WebP ANIM chunk", () => {
    expect(isAnimatedImage(staticWebp, "image/webp")).toBe(false);
    expect(isAnimatedImage(animatedWebp, "image/webp")).toBe(true);
  });

  test("finds the APNG acTL chunk before the first IDAT", () => {
    expect(isAnimatedImage(staticPng, "image/png")).toBe(false);
    expect(isAnimatedImage(animatedPng, "image/png")).toBe(true);
  });

  test("says no for formats that cannot animate", () => {
    expect(isAnimatedImage(hex("ffd8ffe0"), "image/jpeg")).toBe(false);
    expect(isAnimatedImage(hex("00"), "image/svg+xml")).toBe(false);
  });

  test("does not treat a truncated container as still", () => {
    expect(isAnimatedImage(hex("52494646"), "image/webp")).toBe(false);
    expect(isAnimatedImage(hex("474946383961"), "image/gif")).toBe(false);
  });

  test("reads a real still WebP from Bun as still", async () => {
    // Bun's WebP encoder emits the extended `VP8X` header even for a still image, so a reader that
    // took VP8X as the animation marker would pass every other test here and still be wrong.
    const webp = Buffer.from(await new Bun.Image(onePixelPng).webp({ quality: 60 }).bytes());
    expect(webp.toString("ascii", 12, 16)).toBe("VP8X");
    expect(isAnimatedImage(webp, "image/webp")).toBe(false);
    expect(isAnimatedImage(onePixelPng, "image/png")).toBe(false);
  });
});
