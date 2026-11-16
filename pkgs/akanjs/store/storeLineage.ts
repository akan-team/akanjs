import type { RootStoreCls } from "./rootStore";
import type { StoreCls } from "./store";

type AnyStoreCls = StoreCls | RootStoreCls;

//? Global symbols, as the registry's own: a page can hold two copies of this module, and both must read one lineage.
const EXTENDED_META = Symbol.for("akan.store.extended");
const PART_META = Symbol.for("akan.store.part");

interface LineageHolder {
  [EXTENDED_META]?: StoreCls[];
  [PART_META]?: AnyStoreCls[];
}

export class StoreLineage {
  static extend(store: StoreCls, extended: StoreCls[]) {
    (store as LineageHolder)[EXTENDED_META] = extended;
  }

  static compose(root: RootStoreCls, stores: AnyStoreCls[]) {
    (root as LineageHolder)[PART_META] = stores.flatMap((store) => StoreLineage.partsOf(store));
  }

  static partsOf(store: AnyStoreCls): AnyStoreCls[] {
    return (store as LineageHolder)[PART_META] ?? [store];
  }

  static ancestorsOf(store: AnyStoreCls, seen = new Set<StoreCls>()): Set<StoreCls> {
    for (const extended of (store as LineageHolder)[EXTENDED_META] ?? []) {
      if (seen.has(extended)) continue;
      seen.add(extended);
      StoreLineage.ancestorsOf(extended, seen);
    }
    return seen;
  }

  static sameValue(a: unknown, b: unknown): boolean {
    if (Object.is(a, b)) return true;
    if (typeof a !== "object" || typeof b !== "object" || !a || !b) return false;
    const proto = Object.getPrototypeOf(a);
    if (proto !== Object.getPrototypeOf(b)) return false;
    if (Array.isArray(a))
      return Array.isArray(b) && a.length === b.length && a.every((item, idx) => StoreLineage.sameValue(item, b[idx]));
    if (proto !== Object.prototype && proto !== null) {
      const [left, right] = [a.valueOf(), b.valueOf()];
      return typeof left !== "object" && left === right;
    }
    const [left, right] = [a as Record<string, unknown>, b as Record<string, unknown>];
    const keys = Object.keys(left);
    return (
      keys.length === Object.keys(right).length &&
      keys.every((key) => Object.hasOwn(right, key) && StoreLineage.sameValue(left[key], right[key]))
    );
  }
}
