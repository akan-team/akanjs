import { describe, expect, test } from "bun:test";
import path from "node:path";
import { computeRouteSeedIndex, serializeRouteSeedIndexForArtifact } from "./routeSeedIndex";

describe("computeRouteSeedIndex", () => {
  test("uses layouts as route client seeds and skips sibling leaf layout ownership", () => {
    const index = computeRouteSeedIndex([
      {
        key: "./__root_layout.tsx",
        moduleAbsPath: "/app/.akan/generated/root-layouts/__root_layout.tsx",
        seedAbsPaths: ["/app/page/_layout.tsx"],
      },
      {
        key: "./foo/__root_layout.tsx",
        moduleAbsPath: "/app/.akan/generated/root-layouts/foo__root_layout.tsx",
        seedAbsPaths: ["/app/page/foo/_layout.tsx"],
      },
      { key: "./foo.tsx", moduleAbsPath: "/app/page/foo.tsx" },
      { key: "./foo/bar.tsx", moduleAbsPath: "/app/page/foo/bar.tsx" },
    ]);

    const leaf = index.entries.find((entry) => entry.routeId === "/:lang/foo");
    expect(leaf?.seeds).toContain(path.resolve("/app/page/foo.tsx"));
    expect(leaf?.seeds).not.toContain(path.resolve("/app/page/foo/_layout.tsx"));
    expect(leaf?.seeds).toContain(path.resolve("/app/.akan/generated/root-layouts/__root_layout.tsx"));
    expect(leaf?.seeds).toContain(path.resolve("/app/page/_layout.tsx"));

    expect(() =>
      computeRouteSeedIndex([
        { key: "./foo.tsx", moduleAbsPath: "/app/page/foo.tsx" },
        { key: "./foo/_index.tsx", moduleAbsPath: "/app/page/foo/_index.tsx" },
      ]),
    ).toThrow("route conflict");
  });

  test("keeps special route seeds outside implicit locale", () => {
    const index = computeRouteSeedIndex([
      {
        key: "./__root_layout.tsx",
        moduleAbsPath: "/app/.akan/generated/root-layouts/__root_layout.tsx",
        seedAbsPaths: ["/app/page/_layout.tsx"],
      },
      { key: "./robots.txt.tsx", moduleAbsPath: "/app/page/robots.txt.tsx" },
    ]);
    const robots = index.entries.find((entry) => entry.routeId === "/robots.txt");
    expect(robots?.seeds).not.toContain(path.resolve("/app/.akan/generated/root-layouts/__root_layout.tsx"));
    expect(robots?.seeds).not.toContain(path.resolve("/app/page/_layout.tsx"));
  });

  test("serializes seed paths relative to the artifact directory", () => {
    const artifactDir = "/repo/dist/apps/akan/.akan/artifact";
    const serialized = serializeRouteSeedIndexForArtifact(
      {
        entries: [
          {
            routeId: "/profile",
            pattern: "/profile",
            seeds: [
              "/repo/dist/apps/akan/.akan/generated/implicit-root-layout.tsx",
              "/repo/apps/akan/page/profile.tsx",
            ],
          },
        ],
        globalLayoutFiles: ["/repo/dist/apps/akan/.akan/generated/implicit-root-layout.tsx"],
      },
      artifactDir,
    );

    expect(serialized.entries[0]?.seeds).toEqual([
      "../generated/implicit-root-layout.tsx",
      "../../../../../apps/akan/page/profile.tsx",
    ]);
    expect(serialized.globalLayoutFiles).toEqual(["../generated/implicit-root-layout.tsx"]);
    expect(JSON.stringify(serialized)).not.toContain("/repo/");
  });

  test("omits source seed metadata for production artifacts", () => {
    const artifactDir = "/repo/dist/apps/akan/.akan/artifact";
    const serialized = serializeRouteSeedIndexForArtifact(
      {
        entries: [
          {
            routeId: "/:lang/profile",
            pattern: "/:lang/profile",
            seeds: ["/repo/apps/akan/page/profile.tsx"],
          },
        ],
        globalLayoutFiles: ["/repo/apps/akan/.akan/generated/implicit-root-layout.tsx"],
      },
      artifactDir,
      { production: true },
    );

    expect(serialized).toEqual({ entries: [{ routeId: "/:lang/profile" }] });
    expect(JSON.stringify(serialized)).not.toContain("seeds");
    expect(JSON.stringify(serialized)).not.toContain("pattern");
    expect(JSON.stringify(serialized)).not.toContain("globalLayoutFiles");
    expect(JSON.stringify(serialized)).not.toContain("/repo/");
  });
});
