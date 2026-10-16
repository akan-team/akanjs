import { describe, expect, test } from "bun:test";
import { matchRoutePattern, matchRoutePrefix } from "../../common/routeConvention";
import type { MatchedRoute, RouteSeedEntry } from "./routeSeedIndexStore";
import { RouteSeedMatcher } from "./routeSeedMatcher";

// What `RouteSeedIndexStore` answered before the patterns were compiled, kept as the reference the matcher must equal.
const referenceMatch = (pathname: string, entries: RouteSeedEntry[]): MatchedRoute | null => {
  for (const entry of entries) {
    const params = matchRoutePattern(entry.pattern ?? entry.routeId, pathname);
    if (params) return { entry, params };
  }
  return null;
};
const referencePrefix = (pathname: string, entries: RouteSeedEntry[]): MatchedRoute | null =>
  entries
    .map((entry) => ({ entry, params: matchRoutePrefix(entry.pattern ?? entry.routeId, pathname) }))
    .filter((entry): entry is MatchedRoute => Boolean(entry.params))
    .sort((a, b) => {
      const lengthDelta =
        b.entry.pattern.split("/").filter(Boolean).length - a.entry.pattern.split("/").filter(Boolean).length;
      if (lengthDelta !== 0) return lengthDelta;
      return a.entry.pattern < b.entry.pattern ? -1 : a.entry.pattern > b.entry.pattern ? 1 : 0;
    })[0] ?? null;

const entryOf = (pattern: string): RouteSeedEntry => ({ routeId: pattern, pattern, seeds: [] });
const entries = [
  "/:lang",
  "/:lang/explore",
  "/:lang/explore/:id",
  "/:lang/explore/book",
  "/:lang/profile/payments/methods",
  "/:lang/profile/:section",
  "/:lang/inbox/chat",
  "/:lang/:basePath/admin",
  "/:lang/orders/:orderId/items/:itemId",
].map(entryOf);
const pathnames = [
  "/en",
  "/en/",
  "/en/explore",
  "/en/explore/book",
  "/en/explore/42",
  "/en/explore/a%20b",
  "/ko/profile/payments/methods",
  "/ko/profile/self",
  "/ko/profile/self/edit",
  "/en/inbox/chat/extra/deep",
  "/en/shop/admin",
  "/en/orders/7/items/9",
  "/en/orders/7/items",
  "/",
  "/en/nothing/here",
];

describe("RouteSeedMatcher", () => {
  test("answers every pathname as the uncompiled match and prefix match did", () => {
    const matcher = RouteSeedMatcher.of(entries);
    for (const pathname of pathnames) {
      expect(matcher.match(pathname)).toEqual(referenceMatch(pathname, entries));
      expect(matcher.matchPrefix(pathname)).toEqual(referencePrefix(pathname, entries));
    }
  });

  test("compiles once per entries array, and again for a new array or one that grew", () => {
    const own = entries.slice(0, 3);
    const first = RouteSeedMatcher.of(own);
    expect(RouteSeedMatcher.of(own)).toBe(first);
    own.push(entryOf("/:lang/late"));
    expect(RouteSeedMatcher.of(own)).not.toBe(first);
    expect(RouteSeedMatcher.of(own).match("/en/late")?.entry.pattern).toBe("/:lang/late");
  });
});
