import { describe, expect, test } from "bun:test";
import { type Attitude, type Camera, Extrusion } from "./extrusion.util";

const still: Camera = { yaw: 0, pitch: 0, xw: 0, zw: 0 };
const restOf = (dim: number): Camera => {
  const tilt = Extrusion.tilt(dim);
  return { yaw: -0.58 * tilt, pitch: 0.36 * tilt, xw: 0, zw: 0 };
};
const drawnAt = (dim: number) => {
  const scales = Extrusion.scales(dim);
  return {
    vertices: Extrusion.vertices.filter((_, idx) => Extrusion.presence(idx, scales) === 1).length,
    edges: Extrusion.edges.filter(([, to]) => Extrusion.presence(to, scales) === 1).length,
  };
};

const box = { left: 100, top: 200, width: 600, height: 300 };
const [centerX, centerY] = [box.left + box.width / 2, box.top + box.height / 2];
const quarterTurn = Math.PI / 2;
const outsetsOf = (attitude: Attitude, xw: number, zw: number) =>
  Extrusion.vertices.map((vertex) => {
    const corner = Extrusion.frame(Extrusion.turn(vertex, attitude, xw, zw), box, 7, 8);
    return [Math.abs(corner.x - centerX) - box.width / 2, Math.abs(corner.y - centerY) - box.height / 2];
  });

describe("Extrusion", () => {
  test("draws a point, a line, a square, a cube and a tesseract at whole dimensions", () => {
    expect([0, 1, 2, 3, 4].map(drawnAt)).toEqual([
      { vertices: 1, edges: 0 },
      { vertices: 2, edges: 1 },
      { vertices: 4, edges: 4 },
      { vertices: 8, edges: 12 },
      { vertices: 16, edges: 32 },
    ]);
    expect(Extrusion.axisEdges.map((edges) => edges.length)).toEqual([8, 8, 8, 8]);
  });

  test("keeps the square flat and unit-sized before depth is added", () => {
    const scales = Extrusion.scales(2);
    for (const idx of [0, 1, 2, 3]) {
      const projected = Extrusion.project(Extrusion.place(Extrusion.vertices[idx], scales), restOf(2));
      expect([projected.x, projected.y]).toEqual([Extrusion.vertices[idx][0], Extrusion.vertices[idx][1]]);
    }
  });

  test("lands a sweep's outermost copies on the faces of the extruded shape", () => {
    const scales = Extrusion.scales(3);
    for (const [from, to] of Extrusion.ghostEdges(2))
      for (const offset of [-1, 1]) {
        const ghost = [from, to].map((idx) => Extrusion.ghost(Extrusion.vertices[idx], 2, offset, scales));
        for (const vertex of ghost) expect(Math.abs(vertex[2])).toBe(1);
      }
  });

  test("returns every vertex home after a whole XW turn, but collapses x after a quarter turn once w is gone", () => {
    const cube = Extrusion.scales(3);
    for (const vertex of Extrusion.vertices) {
      const placed = Extrusion.place(vertex, cube);
      const home = Extrusion.project(placed, still);
      const turned = Extrusion.project(placed, { ...still, xw: Math.PI * 2 });
      expect(turned.x).toBeCloseTo(home.x, 9);
      expect(turned.y).toBeCloseTo(home.y, 9);
      expect(Extrusion.project(placed, { ...still, xw: Math.PI / 2 }).x).toBeCloseTo(0, 9);
    }
  });

  test("fits the resting shape inside its reach at every whole dimension", () => {
    for (const dim of [1, 2, 3, 4]) {
      const camera = restOf(dim);
      const center = Extrusion.center(dim, camera);
      const scales = Extrusion.scales(dim);
      const extent = Math.max(
        ...Extrusion.vertices.map((vertex) => {
          const projected = Extrusion.project(Extrusion.place(vertex, scales), camera);
          return Math.max(Math.abs(projected.x - center.x), Math.abs(projected.y - center.y));
        }),
      );
      expect(extent).toBeLessThanOrEqual(Extrusion.reach(dim));
    }
  });

  test("keeps every vertex on a frame corner at quarter-turn attitudes, whatever the ZW angle", () => {
    const attitudes: Attitude[] = [
      Extrusion.still,
      [0, 0, quarterTurn, 0, 0],
      [quarterTurn, -quarterTurn, 0, quarterTurn * 2, quarterTurn],
    ];
    for (const attitude of attitudes)
      for (const zw of [0, 0.37, 1.1, 2.9])
        for (const [outsetX, outsetY] of outsetsOf(attitude, quarterTurn * 3, zw))
          expect(outsetX).toBeCloseTo(outsetY, 6);
  });

  test("loses the frame once the XW spin stops between quarter turns", () => {
    const skews = outsetsOf(Extrusion.still, 0.3, 0).map(([outsetX, outsetY]) => Math.abs(outsetX - outsetY));
    expect(Math.max(...skews)).toBeGreaterThan(1);
  });

  test("puts the (z, w) pair nearest the eye on the outermost rectangle", () => {
    const outer = Extrusion.frame([1, 1, 1, 1], box, 7, 8);
    const inner = Extrusion.frame([1, 1, -1, -1], box, 7, 8);
    expect(outer.x).toBe(box.left + box.width + 8 + 3 * 7);
    expect(inner.x).toBe(box.left + box.width + 8);
    expect(outer.near).toBeGreaterThan(inner.near);
  });
});
