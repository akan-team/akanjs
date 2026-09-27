import { describe, expect, test } from "bun:test";
import { applyDelta, createDelta } from "../src/delta.ts";

/** Deterministic pseudo-random bytes. */
function bytes(n: number, seed: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(n);
  let x = seed >>> 0 || 1;
  for (let i = 0; i < n; i++) {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    out[i] = x & 255;
  }
  return out;
}

const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) out.set(p, at), (at += p.length);
  return out;
};

describe("app update deltas (UP-1)", () => {
  test("a shifted, partly changed file becomes a small delta and round-trips", () => {
    const old = bytes(2_000_000, 7);
    // Drop 1234 bytes at the front, replace 50 KB in the middle, append 20 KB.
    const next = concat(old.subarray(1234, 900_000), bytes(50_000, 9), old.subarray(950_000), bytes(20_000, 11));
    const delta = createDelta(old, next);
    expect(delta.length).toBeLessThan(90_000); // the literal 70 KB plus framing, not 2 MB
    expect(Buffer.from(applyDelta(old, delta)).equals(Buffer.from(next))).toBe(true);
  });

  test("identical, empty and tiny files", () => {
    const old = bytes(100_000, 3);
    // Whole 8 KiB blocks are copied; the tail after the last whole block is stored literally.
    expect(createDelta(old, old).length).toBeLessThan((100_000 % 8192) + 200);
    expect(applyDelta(old, createDelta(old, old))).toEqual(old);
    expect(applyDelta(new Uint8Array(0), createDelta(new Uint8Array(0), Uint8Array.of(1, 2, 3)))).toEqual(
      Uint8Array.of(1, 2, 3),
    );
    expect(applyDelta(old, createDelta(old, new Uint8Array(0)))).toEqual(new Uint8Array(0));
  });

  test("the wrong base or a damaged delta fails instead of producing a bad file", () => {
    const old = bytes(50_000, 5);
    const next = concat(old.subarray(0, 40_000), bytes(100, 6));
    const delta = createDelta(old, next);
    expect(() => applyDelta(bytes(50_000, 99), delta)).toThrow("made for another base file");
    const damaged = delta.slice();
    const at = damaged.length - 20; // inside the literal bytes
    damaged[at] = damaged[at]! ^ 0xff;
    expect(() => applyDelta(old, damaged)).toThrow("result does not match");
    expect(() => applyDelta(old, new Uint8Array(10))).toThrow("not an akan-native delta");
  });
});
