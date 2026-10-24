"use client";
import type { PageActivity } from "akanjs/client";
import { isQueryEqual } from "akanjs/common";
import { st } from "akanjs/store";
import type { sliceNamesOf } from "../sliceNamesOf";

type SliceNames = ReturnType<typeof sliceNamesOf>["namesOfSlice"];

interface SliceView {
  queryArgs: object[];
  page: number;
  limit: number;
  sort: string;
  insight: boolean;
}

interface SliceHolder {
  epoch: number;
  pageKey: string | undefined;
  queryArgs: object[];
  restoring: string | null;
}

interface ClaimRegistry {
  epoch: number;
  holders: Map<string, SliceHolder>;
  shown: Map<string, Set<SliceClaim>>;
}

declare global {
  var __AKAN_SLICE_CLAIMS__: ClaimRegistry | undefined;
}

//* A slice has one list for all its `Load.Units`, so each reloads the view it showed when it regains the slice.
export class SliceClaim {
  static readonly #registry = SliceClaim.#internRegistry();

  //? On globalThis: two client bundles can each carry their own copy of this module.
  static #internRegistry() {
    globalThis.__AKAN_SLICE_CLAIMS__ ??= { epoch: 0, holders: new Map(), shown: new Map() };
    return globalThis.__AKAN_SLICE_CLAIMS__;
  }

  #epoch = 0;
  #shown: SliceView | null = null;
  #seen = "";
  #hidden: boolean = false;
  #activity: PageActivity = "current";

  constructor(
    readonly sliceName: string,
    readonly names: SliceNames,
    readonly pageKey: string | undefined,
  ) {}

  seeded(queryArgs: object[]) {
    this.#hold(queryArgs);
  }

  show() {
    const shown = SliceClaim.#registry.shown.get(this.sliceName) ?? new Set<SliceClaim>();
    SliceClaim.#registry.shown.set(this.sliceName, shown);
    shown.add(this);
    return () => {
      this.#hidden = true;
      shown.delete(this);
      //? A tick later, as StrictMode or a remount lets go and shows again within one commit.
      queueMicrotask(() => SliceClaim.#settle(this.sliceName));
    };
  }

  sync(activity: PageActivity) {
    const view = this.#viewOfStore();
    const signature = SliceClaim.#signatureOf(view);
    const changed = signature !== this.#seen;
    const activated = activity === "current" && (this.#hidden || this.#activity !== "current");
    this.#seen = signature;
    this.#hidden = false;
    this.#activity = activity;
    if (!this.#shown) {
      this.#hold(view.queryArgs);
      this.#shown = view;
      return;
    }
    if (activated) {
      this.#takeBack(false);
      return;
    }
    const holder = this.#holder();
    if (!holder || holder.epoch !== this.#epoch || !changed || activity !== "current") return;
    this.#shown = view;
    holder.queryArgs = view.queryArgs;
  }

  static #settle(sliceName: string) {
    const holder = SliceClaim.#registry.holders.get(sliceName);
    const shown = [...(SliceClaim.#registry.shown.get(sliceName) ?? [])];
    if (!holder || shown.some((claim) => claim.#epoch === holder.epoch)) return;
    for (const claim of shown) if (claim.#activity === "current") claim.#takeBack(true);
  }

  #takeBack(orphaned: boolean) {
    const shown = this.#shown;
    const holder = this.#holder();
    if (!shown || !holder) return;
    if (holder.epoch !== this.#epoch) {
      // While it stays, the list of this page that seeded the slice last keeps it.
      if (!orphaned && holder.pageKey === this.pageKey) {
        this.#epoch = holder.epoch;
        return;
      }
      this.#hold(shown.queryArgs);
    }
    this.#restore(shown);
  }

  #restore(view: SliceView) {
    const holder = this.#holder();
    const target = SliceClaim.#signatureOf(view);
    if (!holder || target === holder.restoring || target === SliceClaim.#signatureOf(this.#viewOfStore())) return;
    holder.restoring = target;
    const { queryArgs, page, limit, sort, insight } = view;
    const storeDo = st.do as unknown as { [key: string]: (form: object) => Promise<void> };
    st.set({ [this.names.isCumulativeOfModel]: false });
    void storeDo[this.names.refreshModel]({ invalidate: true, queryArgs, page, limit, sort, insight }).finally(() => {
      if (holder.restoring === target) holder.restoring = null;
    });
  }

  #hold(queryArgs: object[]) {
    const holder = this.#holder();
    if (!holder || holder.pageKey !== this.pageKey || !isQueryEqual(holder.queryArgs, queryArgs))
      this.#claim(queryArgs);
    else this.#epoch = holder.epoch;
  }

  #claim(queryArgs: object[]) {
    SliceClaim.#registry.epoch += 1;
    this.#epoch = SliceClaim.#registry.epoch;
    SliceClaim.#registry.holders.set(this.sliceName, {
      epoch: this.#epoch,
      pageKey: this.pageKey,
      queryArgs,
      restoring: null,
    });
  }

  #holder() {
    return SliceClaim.#registry.holders.get(this.sliceName) ?? null;
  }

  #viewOfStore() {
    const state = st.get() as unknown as { [key: string]: unknown };
    return {
      queryArgs: state[this.names.queryArgsOfModel] as object[],
      page: state[this.names.pageOfModel] as number,
      limit: state[this.names.limitOfModel] as number,
      sort: state[this.names.sortOfModel] as string,
      insight: state[this.names.hasInsightOfModel] as boolean,
    };
  }

  static #signatureOf({ queryArgs, page, limit, sort }: SliceView) {
    return JSON.stringify([queryArgs, page, limit, sort]);
  }
}
