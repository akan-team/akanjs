import { describe, expect, test } from "bun:test";
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
