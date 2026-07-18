import { describe, expect, test } from "bun:test";
import { RouteSeedIndexStore } from "./routeSeedIndexStore";

describe("route seed index artifact paths", () => {
  test("restores relative seed paths from the artifact directory", () => {
    const artifactDir = "/repo/dist/apps/akan/.akan/artifact";
    const normalized = RouteSeedIndexStore.normalize(
      {
        entries: [
          {
            routeId: "/profile",
            pattern: "/profile",
            seeds: ["../generated/implicit-root-layout.tsx", "../../../../../apps/akan/page/profile.tsx"],
          },
        ],
        globalLayoutFiles: ["../generated/implicit-root-layout.tsx"],
      },
      artifactDir,
    );

    expect(normalized.entries[0]?.seeds).toEqual([
      "/repo/dist/apps/akan/.akan/generated/implicit-root-layout.tsx",
      "/repo/apps/akan/page/profile.tsx",
    ]);
    expect(normalized.globalLayoutFiles).toEqual(["/repo/dist/apps/akan/.akan/generated/implicit-root-layout.tsx"]);
  });

  test("restores slim production seed index defaults", () => {
    const normalized = RouteSeedIndexStore.normalize(
      {
        entries: [{ routeId: "/:lang/profile" }],
      },
      "/repo/dist/apps/akan/.akan/artifact",
    );

    expect(normalized).toEqual({
      entries: [{ routeId: "/:lang/profile", pattern: "/:lang/profile", seeds: [] }],
      globalLayoutFiles: [],
    });
    expect(RouteSeedIndexStore.match("/ko/profile", normalized.entries)?.entry.routeId).toBe("/:lang/profile");
  });

  test("finds the nearest route seed prefix for unmatched layout fallbacks", () => {
    const entries = [
      { routeId: "/:lang/blog", pattern: "/:lang/blog", seeds: ["blog-layout"] },
      { routeId: "/:lang/blog/benchmark", pattern: "/:lang/blog/benchmark", seeds: ["benchmark-page"] },
      { routeId: "/:lang/docs", pattern: "/:lang/docs", seeds: ["docs-layout"] },
    ];

    const matched = RouteSeedIndexStore.matchPrefix("/ko/blog/missing", entries);

    expect(matched?.entry.routeId).toBe("/:lang/blog");
    expect(matched?.params).toEqual({ lang: "ko" });
    expect(RouteSeedIndexStore.matchPrefix("/ko/unknown/missing", entries)).toBeNull();
  });
});
