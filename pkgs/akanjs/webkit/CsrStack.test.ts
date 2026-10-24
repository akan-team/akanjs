import "../test/registerDom";
import { afterEach, describe, expect, test } from "bun:test";
import type { CsrNavigationPhase, History, Location, PathRoute } from "akanjs/client";
import { CsrStack } from "./CsrStack";

const route = (path: string, cache = false) => ({ path, pageState: { cache } }) as unknown as PathRoute;
const tab = route("/tab", true);
const item = route("/item");
const at = (pathRoute: PathRoute, entryId: string) =>
  ({ href: `${pathRoute.path}?at=${entryId}`, pathRoute, entryId }) as unknown as Location;

const stackOf = (
  locations: Location[],
  {
    idx = locations.length - 1,
    pending = null,
    phase = "idle",
  }: { idx?: number; pending?: Location | null; phase?: CsrNavigationPhase } = {},
) => {
  const history: History = {
    type: "forward",
    locations,
    idx,
    scrollMap: new Map(),
    idxMap: new Map(),
    cachedLocationMap: new Map(
      locations
        .slice(0, idx + 1)
        .flatMap((location) => (location.pathRoute.pageState.cache ? [[location.pathRoute.path, location]] : [])),
    ),
  };
  return CsrStack.entriesOf({
    history,
    location: locations[idx],
    prevLocation: locations[idx - 1] ?? null,
    pendingLocation: pending,
    phase,
  }).map(({ key, pageType, zIndex }) => ({ key, pageType, zIndex }));
};

describe("CsrStack", () => {
  test("a push to the same route is a page of its own, and a cache route is one page however often it is visited", () => {
    expect(stackOf([at(tab, "t1"), at(item, "i1"), at(item, "i2")])).toEqual([
      { key: "/tab", pageType: "cached", zIndex: 0 },
      { key: "i1", pageType: "prev", zIndex: 1 },
      { key: "i2", pageType: "current", zIndex: 2 },
    ]);
    expect(stackOf([at(tab, "t1"), at(item, "i1"), at(tab, "t2")])).toEqual([
      { key: "/tab", pageType: "current", zIndex: 2 },
      { key: "i1", pageType: "prev", zIndex: 1 },
    ]);
  });

  test("the nearest three stack entries under the previous one stay mounted, and older ones are released", () => {
    const entries = stackOf([at(tab, "t1"), ...["i1", "i2", "i3", "i4", "i5", "i6"].map((id) => at(item, id))]);
    expect(entries.map(({ key, pageType }) => `${key}:${pageType}`)).toEqual([
      "/tab:cached",
      "i2:cached",
      "i3:cached",
      "i4:cached",
      "i5:prev",
      "i6:current",
    ]);
  });

  test("an entry the user went back from is released", () => {
    expect(stackOf([at(tab, "t1"), at(item, "i1"), at(item, "i2")], { idx: 1 }).map(({ key }) => key)).toEqual([
      "/tab",
      "i1",
    ]);
  });

  test("the pending entry is mounted only while it is being prepared", () => {
    const locations = [at(tab, "t1"), at(item, "i1")];
    const pending = at(item, "i2");
    expect(stackOf(locations, { pending, phase: "preparing" })).toContainEqual({
      key: "i2",
      pageType: "pending",
      zIndex: 2,
    });
    expect(stackOf(locations, { pending, phase: "transitioning" }).map(({ key }) => key)).not.toContain("i2");
  });

  test("a location without an entry id falls back to its href", () => {
    const loose = { href: "/item?id=9", pathRoute: item } as unknown as Location;
    expect(CsrStack.keyOf(loose)).toBe("/item?id=9");
    expect(CsrStack.keyOf(at(tab, "t9"))).toBe("/tab");
    expect(CsrStack.nextEntryId()).not.toBe(CsrStack.nextEntryId());
  });
});

describe("CsrStack across a reload", () => {
  afterEach(() => {
    sessionStorage.clear();
    window.history.replaceState(null, "");
  });

  const historyOf = (locations: Location[], idx = locations.length - 1): History => ({
    type: "forward",
    locations,
    idx,
    scrollMap: new Map(),
    idxMap: new Map(),
    cachedLocationMap: new Map(),
  });
  const locate = (href: string) =>
    ({ href, pathRoute: href.startsWith("/tab") ? tab : item, entryId: "fresh" }) as unknown as Location;

  test("the tab gets its stack back, with only the current and previous entries mounted", () => {
    const saved = [at(tab, "t1"), at(item, "i1"), at(item, "i2"), at(item, "i3")];
    CsrStack.save(historyOf(saved));
    window.history.replaceState({ akanEntryId: "i3" }, "");

    const restored = CsrStack.restore({ ...at(item, "i3"), entryId: "booted" }, locate);
    expect(restored?.idx).toBe(3);
    expect(restored?.locations.map((location) => location.entryId)).toEqual(["t1", "i1", "i2", "i3"]);
    expect([...(restored?.dormant ?? [])]).toEqual(["t1", "i1"]);

    const history: History = {
      ...historyOf(restored?.locations ?? []),
      cachedLocationMap: new Map([["/tab", restored?.locations[0] as Location]]),
      dormant: restored?.dormant,
    };
    const entries = CsrStack.entriesOf({
      history,
      location: history.locations[3],
      prevLocation: history.locations[2],
      pendingLocation: null,
      phase: "idle",
    });
    expect(entries.map(({ key, pageType }) => `${key}:${pageType}`)).toEqual(["i2:prev", "i3:current"]);
  });

  test("a stack the tab was not on is not restored", () => {
    CsrStack.save(historyOf([at(item, "i1"), at(item, "i2")]));
    expect(CsrStack.restore(at(item, "i2"), locate)).toBeNull();
    window.history.replaceState({ akanEntryId: "i1" }, "");
    expect(CsrStack.restore(at(item, "i2"), locate)).toBeNull();
    window.history.replaceState({ akanEntryId: "i2" }, "");
    expect(CsrStack.restore(at(item, "i1"), locate)).toBeNull();
    sessionStorage.setItem("akan.csr.stack", "{not json");
    expect(CsrStack.restore(at(item, "i2"), locate)).toBeNull();
  });
});

describe("CsrStack across an account change", () => {
  const historyOf = (locations: Location[]): History => ({
    type: "forward",
    locations,
    idx: locations.length - 1,
    scrollMap: new Map(),
    idxMap: new Map(),
    cachedLocationMap: new Map(
      locations.flatMap((location) =>
        location.pathRoute.pageState.cache ? [[location.pathRoute.path, location]] : [],
      ),
    ),
  });
  const keysOf = (
    history: History,
    { pending = null, phase = "idle" }: { pending?: Location | null; phase?: CsrNavigationPhase } = {},
  ) =>
    CsrStack.entriesOf({
      history,
      location: history.locations[history.idx],
      prevLocation: history.locations[history.idx - 1] ?? null,
      pendingLocation: pending,
      phase,
    }).map(({ key, pageType }) => `${key}:${pageType}`);

  test("the same token changes nothing, and another lets go of every page but the ones on and under the screen", () => {
    const history = historyOf([at(tab, "t1"), at(item, "i1"), at(item, "i2"), at(item, "i3")]);
    expect(CsrStack.redrawFor(history, history.locations[3], "someone")).toBe(false);
    expect(CsrStack.redrawFor(history, history.locations[3], "someone")).toBe(false);
    expect(keysOf(history)).toEqual(["/tab:cached", "i1:cached", "i2:prev", "i3:current"]);

    expect(CsrStack.redrawFor(history, history.locations[3], null)).toBe(true);
    expect(keysOf(history)).toEqual(["1:i2:prev", "i3:current"]);
  });

  test("a token refreshed for the same account keeps every page, and one for another account draws them again", () => {
    const encode = (part: object) => Buffer.from(JSON.stringify(part)).toString("base64url");
    const jwtOf = (claims: object) => `${encode({ alg: "HS256", typ: "JWT" })}.${encode(claims)}.sig`;
    const account = { appName: "app", environment: "local", sid: "s1", self: { id: "u1", roles: ["user"] } };
    const history = historyOf([at(tab, "t1"), at(item, "i1"), at(item, "i2"), at(item, "i3")]);
    expect(CsrStack.redrawFor(history, history.locations[3], jwtOf({ ...account, iat: 1, exp: 2, jti: "a" }))).toBe(
      false,
    );
    expect(CsrStack.redrawFor(history, history.locations[3], jwtOf({ jti: "b", exp: 4, iat: 3, ...account }))).toBe(
      false,
    );
    expect(keysOf(history)).toEqual(["/tab:cached", "i1:cached", "i2:prev", "i3:current"]);

    const other = { ...account, sid: "s2", self: { id: "u2", roles: ["user"] } };
    expect(CsrStack.redrawFor(history, history.locations[3], jwtOf({ ...other, iat: 5, exp: 6, jti: "c" }))).toBe(true);
    expect(keysOf(history)).toEqual(["1:i2:prev", "i3:current"]);
  });

  test("the page on screen keeps its key through the transition that takes it off, and is drawn again after", () => {
    const history = historyOf([at(item, "i1"), at(item, "i2")]);
    CsrStack.redrawFor(history, history.locations[1], "someone");
    CsrStack.redrawFor(history, history.locations[1], "someone else");
    const next = at(item, "i3");
    expect(keysOf(history, { pending: next, phase: "preparing" })).toEqual(["1:i1:prev", "i2:current", "1:i3:pending"]);

    history.locations.push(next);
    history.idx = 2;
    expect(keysOf(history, { phase: "transitioning" })).toEqual(["i2:prev", "1:i3:current"]);
    expect(keysOf(history)).toEqual(["1:i2:prev", "1:i3:current"]);

    CsrStack.leave(history, history.locations[1]);
    expect(history.account?.leaving).toBeDefined();
    CsrStack.leave(history, next);
    expect(history.account?.leaving).toBeUndefined();
  });

  test("a page that stays on screen through two changes keeps the key it was drawn under", () => {
    const history = historyOf([at(item, "i1")]);
    CsrStack.redrawFor(history, history.locations[0], "someone");
    CsrStack.redrawFor(history, history.locations[0], "someone else");
    CsrStack.redrawFor(history, history.locations[0], null);
    expect(history.account?.generation).toBe(2);
    expect(keysOf(history)).toEqual(["i1:current"]);
  });
});
