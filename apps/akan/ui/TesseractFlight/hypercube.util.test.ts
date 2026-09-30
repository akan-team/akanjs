import { describe, expect, test } from "bun:test";
import { type Attitude, Hypercube, quarterTurn } from "./hypercube.util";

const box = { left: 100, top: 200, width: 600, height: 300 };
const [centerX, centerY] = [box.left + box.width / 2, box.top + box.height / 2];

const outsetsOf = (attitude: Attitude, xw: number, zw: number) =>
  Hypercube.vertices.map((vertex) => {
    const corner = Hypercube.frame(Hypercube.turn(vertex, attitude, xw, zw), box, 7, 8);
    return [Math.abs(corner.x - centerX) - box.width / 2, Math.abs(corner.y - centerY) - box.height / 2];
  });

describe("Hypercube", () => {
  test("has the 16 vertices, 32 edges and 8 twelve-edge cells of a tesseract", () => {
    const cells = Hypercube.cellEdges(
      [0, 0, 0, 0, 0],
      [0, 1, 2, 3].flatMap((axis) => [[axis, 1] as const, [axis, -1] as const]),
    );
    expect(Hypercube.vertices).toHaveLength(16);
    expect(Hypercube.edges).toHaveLength(32);
    expect(cells.map((edges) => edges.length)).toEqual(Array(8).fill(12));
  });

  test("keeps every vertex on a rectangle corner at quarter-turn attitudes, whatever the ZW angle", () => {
    const attitudes: Attitude[] = [
      [0, 0, 0, 0, 0],
      [0, 0, quarterTurn, 0, 0],
      [quarterTurn, -quarterTurn, 0, quarterTurn * 2, quarterTurn],
    ];
    for (const attitude of attitudes)
      for (const zw of [0, 0.37, 1.1, 2.9])
        for (const [outsetX, outsetY] of outsetsOf(attitude, quarterTurn * 3, zw))
          expect(outsetX).toBeCloseTo(outsetY, 6);
  });

  test("loses the rectangle once the XW spin stops on a non-quarter angle", () => {
    const skews = outsetsOf([0, 0, 0, 0, 0], 0.3, 0).map(([outsetX, outsetY]) => Math.abs(outsetX - outsetY));
    expect(Math.max(...skews)).toBeGreaterThan(1);
  });

  test("puts the (z, w) pair nearest the eye on the outermost rectangle", () => {
    const outer = Hypercube.frame([1, 1, 1, 1], box, 7, 8);
    const inner = Hypercube.frame([1, 1, -1, -1], box, 7, 8);
    expect(outer.x).toBe(box.left + box.width + 8 + 3 * 7);
    expect(inner.x).toBe(box.left + box.width + 8);
    expect(outer.near).toBeGreaterThan(inner.near);
  });
});
