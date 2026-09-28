import type { CsrNavigationPhase, CsrPageType, CsrStackEntry, History, Location } from "akanjs/client";

interface CsrStackState {
  history: History;
  location: Location;
  prevLocation: Location | null;
  pendingLocation: Location | null;
  phase: CsrNavigationPhase;
}

/**
 * Which history entries keep a mounted page. The current, previous and pending entries are live. Below them the
 * nearest `retainLimit` stack entries stay mounted but hidden, so going back reveals each with its state instead of
 * mounting it again, and every `cache` route visited keeps one page for the whole session.
 */
export class CsrStack {
  static retainLimit = 3;
  static #seq = 0;
  static readonly #session = Math.random().toString(36).slice(2, 8);

  static nextEntryId() {
    CsrStack.#seq += 1;
    return `${CsrStack.#session}-${CsrStack.#seq}`;
  }

  static keyOf(location: Location) {
    return location.pathRoute.pageState.cache ? location.pathRoute.path : (location.entryId ?? location.href);
  }

  static entriesOf({ history, location, prevLocation, pendingLocation, phase }: CsrStackState): CsrStackEntry[] {
    const entries = new Map<string, CsrStackEntry>();
    const claim = (entryLocation: Location, pageType: CsrPageType, zIndex: number) => {
      const key = CsrStack.keyOf(entryLocation);
      if (!entries.has(key)) entries.set(key, { key, location: entryLocation, pageType, zIndex });
    };
    claim(location, "current", history.idx);
    if (prevLocation) claim(prevLocation, "prev", Math.max(history.idx - 1, 0));
    if (pendingLocation && phase === "preparing") claim(pendingLocation, "pending", history.idx + 1);
    let retained = 0;
    for (let idx = history.idx - 1; idx >= 0 && retained < CsrStack.retainLimit; idx -= 1) {
      const kept = history.locations[idx];
      if (kept.pathRoute.pageState.cache || entries.has(CsrStack.keyOf(kept))) continue;
      claim(kept, "cached", 0);
      retained += 1;
    }
    for (const cached of history.cachedLocationMap.values()) claim(cached, "cached", 0);
    //? Sorted by key so a page keeps its place among its siblings however its role changes.
    return [...entries.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
  }
}
