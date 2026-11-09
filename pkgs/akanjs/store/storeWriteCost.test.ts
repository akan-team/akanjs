import { describe, expect, test } from "bun:test";
import { setTestEnv } from "./store.fixture";

setTestEnv("storewritecost");
const { store } = await import("./store");
const { StoreInstance } = await import("./storeInstance");
const { StoreRegistry } = await import("./storeRegistry");

const KEYS_PER_STORE = 29;

const buildRoot = (keyNum: number, tag: string, onCompute: () => void = () => undefined) => {
  const stores = Array.from({ length: Math.round(keyNum / KEYS_PER_STORE) }, (_, storeIdx) => {
    const name = `${tag}${storeIdx}`;
    const plain = Object.fromEntries(Array.from({ length: KEYS_PER_STORE - 2 }, (_, idx) => [`${name}K${idx}`, idx]));
    return store(
      name as "writeCost",
      () => plain,
      ({ computed, search }) => ({
        [`${name}Sum`]: computed([`${name}K0`, `${name}K1`] as never, (a: number, b: number) => {
          onCompute();
          return a + b;
        }),
        [`${name}Tags`]: search(`${name}Tags`, [String]),
      }),
    );
  });
  return new StoreInstance(StoreRegistry.merge(`${tag}Root`, ...stores));
};

const medianMicros = (run: () => unknown, iterations: number) => {
  const rounds = Array.from({ length: 9 }, () => {
    const startedAt = Bun.nanoseconds();
    for (let idx = 0; idx < iterations; idx++) run();
    return (Bun.nanoseconds() - startedAt) / iterations / 1000;
  });
  return rounds.sort((a, b) => a - b)[4] ?? 0;
};

describe("store write cost", () => {
  test("a write derives only what its keys reach, however many stores the root holds", () => {
    for (const keyNum of [870, 1740]) {
      let computeNum = 0;
      const instance = buildRoot(keyNum, `derive${keyNum}S`, () => {
        computeNum++;
      });
      const derived = { ...instance.get() };
      computeNum = 0;

      instance.set({ [`derive${keyNum}S0K5`]: -1 });
      expect(computeNum).toBe(0);
      for (const key of Object.keys(derived).filter((key) => /(Sum|Tags)$/.test(key)))
        expect(instance.get()[key]).toBe(derived[key]);

      instance.set({ [`derive${keyNum}S0K0`]: 10 });
      expect(computeNum).toBe(1);
      expect(instance.get()[`derive${keyNum}S0Sum`]).toBe(11);
    }
  });

  //? A write must make a new top-level object, so one copy is the floor; everything above it follows the patch.
  test("a write costs about one copy of the state, at 1,740 keys and at twice that", () => {
    for (const keyNum of [1740, 3480]) {
      const instance = buildRoot(keyNum, `copy${keyNum}S`);
      const keys = Object.keys(instance.get()).filter((key) => key.endsWith("K5"));
      let writeIdx = 0;
      const write = () => instance.set({ [keys[writeIdx++ % keys.length] as string]: writeIdx });
      const copy = () => ({ ...instance.get(), [keys[0] as string]: writeIdx });
      medianMicros(write, 100);
      medianMicros(copy, 100);
      const writeMicros = medianMicros(write, 150);
      const copyMicros = medianMicros(copy, 150);
      expect(writeMicros / copyMicros).toBeLessThan(2);
    }
  });
});
