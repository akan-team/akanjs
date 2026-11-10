import { describe, expect, test } from "bun:test";
import { setTestEnv, stubSignal } from "./store.fixture";

setTestEnv("storewritecost");
const { Int } = await import("akanjs/base");
const { ConstantRegistry, via } = await import("akanjs/constant");
const { store } = await import("./store");
const { StoreInstance } = await import("./storeInstance");
const { StoreRegistry } = await import("./storeRegistry");

const NoteInput = via((f) => ({ title: f(String) }));
const NoteObject = via(NoteInput, () => ({}));
const NoteLight = via(NoteObject, ["title"] as const, () => ({}));
const NoteFull = via(NoteObject, NoteLight, () => ({}));
const NoteInsight = via(NoteFull, (f) => ({ count: f(Int, { default: 0 }) }));
const noteConstant = ConstantRegistry.buildModel(
  "writeCostNote",
  NoteInput,
  NoteObject,
  NoteFull,
  NoteLight,
  NoteInsight,
  {},
);
const noteSignal = stubSignal("writeCostNote", noteConstant, {
  prefix: "writeCostNote",
  endpoint: {},
  slice: { "": { args: [] } },
});

const KEYS_PER_STORE = 29;

const buildRoot = (
  keyNum: number,
  tag: string,
  onCompute: () => void = () => undefined,
  ...extraStores: ReturnType<typeof store>[]
) => {
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
  return new StoreInstance(StoreRegistry.merge(`${tag}Root`, ...stores, ...extraStores));
};

const nanosOf = (run: () => unknown, iterations: number) => {
  const startedAt = Bun.nanoseconds();
  for (let idx = 0; idx < iterations; idx++) run();
  return Bun.nanoseconds() - startedAt;
};

//? Alternating rounds puts a load burst on both sides of one ratio, so the median ratio shrugs it off.
const medianRatio = (run: () => unknown, base: () => unknown, iterations: number) => {
  const ratios = Array.from({ length: 11 }, () => nanosOf(run, iterations) / nanosOf(base, iterations));
  return ratios.sort((a, b) => a - b)[5] ?? 0;
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
      medianRatio(write, copy, 50);
      expect(medianRatio(write, copy, 100)).toBeLessThan(3);
    }
  });

  test("a form field setter costs about one copy of the state, at 1,740 keys and at twice that", () => {
    for (const keyNum of [1740, 3480]) {
      class WriteCostNoteStore extends store(noteSignal, () => ({})) {}
      const instance = buildRoot(keyNum, `form${keyNum}S`, undefined, WriteCostNoteStore);
      const setTitle = instance.do.setTitleOnWriteCostNote as (title: string) => unknown;
      let writeIdx = 0;
      const write = () => setTitle(`title${writeIdx++}`);
      const copy = () => ({ ...instance.get(), writeCostNoteForm: writeIdx });
      medianRatio(write, copy, 50);
      expect(medianRatio(write, copy, 100)).toBeLessThan(4.5);
      expect((instance.get().writeCostNoteForm as { title: string }).title).toBe(`title${writeIdx - 1}`);
    }
  });
});
