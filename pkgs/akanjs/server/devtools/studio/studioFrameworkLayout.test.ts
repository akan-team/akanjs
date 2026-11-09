import { describe, expect, test } from "bun:test";
import type { FrameworkFacet, FrameworkImport, FrameworkMap } from "akanjs/common";
import { StudioFrameworkLayout } from "./studioFrameworkLayout";

const at = (file: string) => ({ file, line: 1, column: 1 });
const facet = (name: string, layer: number, classes: string[] = []): FrameworkFacet => ({
  id: `akanjs/${name}`,
  name,
  packageName: "akanjs",
  layer,
  files: 1,
  classes: classes.map((cls, idx) => ({ name: cls, members: classes.length - idx, at: at(`pkgs/akanjs/${name}.ts`) })),
});
const link = (from: string, to: string, value: number, type: number, dynamic: number): FrameworkImport => ({
  from: `akanjs/${from}`,
  to: `akanjs/${to}`,
  value,
  type,
  dynamic,
  at: at(`pkgs/akanjs/${from}.ts`),
});

const map: FrameworkMap = {
  version: 1,
  packages: [{ name: "akanjs", root: "pkgs/akanjs" }],
  facets: [
    facet("base", 0, ["Scalar"]),
    facet("common", 1, ["A", "B", "C", "D", "E", "F", "G"]),
    facet("server", 2),
    facet("client", 2),
  ],
  imports: [
    link("common", "base", 3, 1, 0),
    link("server", "common", 0, 0, 2),
    link("base", "server", 0, 1, 0),
    link("client", "gone", 1, 0, 0),
  ],
  channels: [],
  missing: [],
  cycles: [],
};

describe("StudioFrameworkLayout", () => {
  test("puts the highest layer first, one column per layer, and lists a facet's largest classes", () => {
    const scene = StudioFrameworkLayout.of(map);
    expect(scene.columns.map(({ label }) => label)).toEqual(["Layer 2", "Layer 1", "Layer 0"]);
    const boxOf = Object.fromEntries(scene.boxes.map((box) => [box.facet.name, box]));
    expect(boxOf.server.x).toBe(boxOf.client.x);
    expect(boxOf.server.y).toBeLessThan(boxOf.client.y);
    expect(boxOf.server.x).toBeLessThan(boxOf.common.x);
    expect(boxOf.common.x).toBeLessThan(boxOf.base.x);
    expect(boxOf.common.rows.map(({ text, hint }) => `${text}:${hint}`)).toEqual([
      "A:7",
      "B:6",
      "C:5",
      "D:4",
      "E:3",
      "F:2",
    ]);
    expect(scene.width).toBeGreaterThanOrEqual(boxOf.base.x + boxOf.base.width);
  });

  test("draws value, lazy and type-only imports apart, and skips an import to a facet it has no box for", () => {
    const scene = StudioFrameworkLayout.of(map);
    expect(scene.links.map(({ link, kind }) => `${link.from}>${link.to}:${kind}`)).toEqual([
      "akanjs/common>akanjs/base:value",
      "akanjs/server>akanjs/common:lazy",
      "akanjs/base>akanjs/server:type",
    ]);
    expect(scene.links.every(({ path }) => path.startsWith("M"))).toBe(true);
  });
});
