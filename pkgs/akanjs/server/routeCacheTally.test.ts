import { describe, expect, test } from "bun:test";
import { RouteCacheTally } from "./routeCacheTally";

describe("RouteCacheTally", () => {
  test("starts every cache at zero for each outcome and every reason it can count", () => {
    const { rsc, html } = RouteCacheTally.snapshot();

    for (const counts of [rsc, html]) {
      expect(Object.keys(counts.hit)).toEqual(["requested-query", "rewritten-query"]);
      expect(Object.keys(counts.miss)).toEqual(["requested-query", "rewritten-query"]);
      expect(Object.keys(counts.bypass)).toEqual([
        "env-opt-out",
        "dev-default-off",
        "ttl-disabled",
        "path-excluded",
        "request-not-public",
        "dev-registry",
        "no-route",
        "script-hashes",
        "dynamic-request-api",
        "render-not-found",
        "render-redirect",
        "late-redirect",
        "body-too-large",
        "other",
      ]);
    }
  });

  test("counts each lookup and bypass under its cache, outcome and reason, an unknown reason as other", () => {
    const before = RouteCacheTally.snapshot();
    RouteCacheTally.lookup("rsc", true, "rewritten-query");
    RouteCacheTally.lookup("rsc", false, "requested-query");
    RouteCacheTally.lookup("html", true, "requested-query");
    RouteCacheTally.bypass("html", "request-not-public");
    RouteCacheTally.bypass("html", "script-hashes");
    RouteCacheTally.bypass("html", "a-reason-nobody-declared");
    RouteCacheTally.bypass("rsc", undefined);
    const after = RouteCacheTally.snapshot();

    expect(after.rsc.hit["rewritten-query"] - before.rsc.hit["rewritten-query"]).toBe(1);
    expect(after.rsc.miss["requested-query"] - before.rsc.miss["requested-query"]).toBe(1);
    expect(after.html.hit["requested-query"] - before.html.hit["requested-query"]).toBe(1);
    expect(after.html.bypass["request-not-public"] - before.html.bypass["request-not-public"]).toBe(1);
    expect(after.html.bypass.other - before.html.bypass.other).toBe(1);
    expect(after.rsc.bypass.other - before.rsc.bypass.other).toBe(1);
    expect(after.html.bypass["script-hashes"] - before.html.bypass["script-hashes"]).toBe(1);
    expect(Object.keys(after.html.bypass)).toHaveLength(14);
    expect(after.html.miss).toEqual(before.html.miss);
  });

  test("hands out a copy, so a reader cannot change the counts", () => {
    const snapshot = RouteCacheTally.snapshot();
    snapshot.rsc.hit["requested-query"] += 100;

    expect(RouteCacheTally.snapshot().rsc.hit["requested-query"]).toBe(snapshot.rsc.hit["requested-query"] - 100);
  });
});
