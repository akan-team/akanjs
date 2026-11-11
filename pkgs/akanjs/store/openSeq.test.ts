import { describe, expect, test } from "bun:test";
import { markOpenedIn, openSeqIn, seedOpen } from "./openSeq";

type OpenSeqModule = typeof import("./openSeq");

describe("open counters", () => {
  test("a seed through a second copy of the module, as a route bundle inlines it, is seen by the store's copy", async () => {
    const routeCopy = (await import(`${import.meta.dir}/openSeq.ts?routeCopy`)) as OpenSeqModule;
    expect(routeCopy.seedOpen).not.toBe(seedOpen);
    let state = {};
    const store = {
      get: () => state,
      set: (seed: object) => {
        state = { ...state, ...seed };
      },
    };

    routeCopy.seedOpen(store, "item", "form", { itemModal: "edit" });
    expect(openSeqIn(store, "item")).toEqual({ open: 1, form: 1 });
    expect(state).toEqual({ itemModal: "edit" });

    markOpenedIn(store, "item", { form: false });
    expect(routeCopy.openSeqIn(store, "item")).toEqual({ open: 2, form: 1 });
    expect(openSeqIn(store, "other")).toEqual({ open: 0, form: 0 });
  });
});
