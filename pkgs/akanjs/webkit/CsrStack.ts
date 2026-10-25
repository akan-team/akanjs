import {
  type CsrNavigationPhase,
  type CsrPageType,
  type CsrStackEntry,
  csrLocation,
  type History,
  type Location,
} from "akanjs/client";
import { decodeJwtPayload, isQueryEqual } from "akanjs/common";

interface CsrStackState {
  history: History;
  location: Location;
  prevLocation: Location | null;
  pendingLocation: Location | null;
  phase: CsrNavigationPhase;
}

interface StoredStack {
  idx: number;
  entries: { href: string; entryId: string }[];
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
  static readonly #storageKey = "akan.csr.stack";

  /** Kept per tab, so a reload — or a WebView whose content process died and reloaded — gets its stack back. */
  static save(history: History) {
    const entries = history.locations.flatMap(({ href, entryId }) => (entryId ? [{ href, entryId }] : []));
    if (entries.length !== history.locations.length) return;
    try {
      sessionStorage.setItem(CsrStack.#storageKey, JSON.stringify({ idx: history.idx, entries } satisfies StoredStack));
    } catch {
      // Storage refused (quota, a locked-down WebView): the stack simply starts over after a reload.
    }
  }

  /**
   * The stack this tab had, when the entry it reopened on is the one the stack was on. Only the current and previous
   * entries are mounted at once; the rest come back dormant and mount when they are visited.
   */
  static restore(current: Location, locate: (href: string) => Location) {
    const stored = CsrStack.#stored();
    const entryId = (csrLocation.state as { akanEntryId?: string } | null)?.akanEntryId;
    const at = stored?.entries[stored.idx];
    if (!stored || !at || !entryId || at.entryId !== entryId || at.href !== current.href) return null;
    try {
      const locations = stored.entries.map((entry, idx) =>
        idx === stored.idx ? { ...current, entryId } : { ...locate(entry.href), entryId: entry.entryId },
      );
      const dormant = new Set(
        stored.entries.filter((_, idx) => idx < stored.idx - 1 || idx > stored.idx).map((entry) => entry.entryId),
      );
      return { locations, idx: stored.idx, dormant };
    } catch {
      return null;
    }
  }

  static #stored(): StoredStack | null {
    try {
      const stored = JSON.parse(sessionStorage.getItem(CsrStack.#storageKey) ?? "null") as StoredStack | null;
      return stored && Array.isArray(stored.entries) && Number.isInteger(stored.idx) ? stored : null;
    } catch {
      return null;
    }
  }

  static nextEntryId() {
    CsrStack.#seq += 1;
    return `${CsrStack.#session}-${CsrStack.#seq}`;
  }

  static keyOf(location: Location) {
    return location.pathRoute.pageState.cache ? location.pathRoute.path : (location.entryId ?? location.href);
  }

  /**
   * When `token` names another account than the one the stack's pages were drawn for, every page but the one on screen
   * is drawn again for the new account — the one under it at once, the rest when they are shown — and that one stays
   * until it is left. A token refreshed for the same account changes nothing.
   */
  static redrawFor(history: History, current: Location, token: string | null) {
    const account = history.account ?? { token, generation: 0 };
    history.account = account;
    if (CsrStack.#isSameAccount(account.token, token)) return false;
    history.dormant ??= new Set();
    for (const kept of [...history.locations, ...history.cachedLocationMap.values()])
      if (kept.entryId && kept.entryId !== current.entryId) history.dormant.add(kept.entryId);
    const key = CsrStack.keyOf(current);
    const leaving = account.leaving?.key === key ? account.leaving : { key, generation: account.generation };
    history.account = { token, generation: account.generation + 1, leaving };
    return true;
  }

  //? The payload whole, but for the claims a refresh moves: the one naming the account lives in the app's own `AddData`.
  static #isSameAccount(drawnFor: string | null, token: string | null) {
    if (drawnFor === token) return true;
    const claimsOf = (jwt: string | null) => {
      if (!jwt) return null;
      try {
        const claims = decodeJwtPayload<Record<string, unknown>>(jwt);
        for (const claim of ["iat", "exp", "nbf", "jti"]) delete claims[claim];
        return claims;
      } catch {
        return null;
      }
    };
    const drawnClaims = claimsOf(drawnFor);
    return !!drawnClaims && isQueryEqual(drawnClaims, claimsOf(token));
  }

  static leave(history: History, current: Location) {
    if (history.account?.leaving && history.account.leaving.key !== CsrStack.keyOf(current))
      delete history.account.leaving;
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
    const dormant = (kept: Location) => !!kept.entryId && !!history.dormant?.has(kept.entryId);
    let retained = 0;
    for (let idx = history.idx - 1; idx >= 0 && retained < CsrStack.retainLimit; idx -= 1) {
      const kept = history.locations[idx];
      if (kept.pathRoute.pageState.cache || dormant(kept) || entries.has(CsrStack.keyOf(kept))) continue;
      claim(kept, "cached", 0);
      retained += 1;
    }
    for (const cached of history.cachedLocationMap.values()) if (!dormant(cached)) claim(cached, "cached", 0);
    const { account } = history;
    const drawn = (entry: CsrStackEntry) => {
      const kept = account?.leaving?.key === entry.key && (entry.pageType === "current" || phase !== "idle");
      const generation = (kept ? account?.leaving?.generation : account?.generation) ?? 0;
      return generation ? { ...entry, key: `${generation}:${entry.key}` } : entry;
    };
    //? Sorted by key so a page keeps its place among its siblings however its role changes.
    return [...entries.values()].sort((a, b) => (a.key < b.key ? -1 : 1)).map(drawn);
  }
}
