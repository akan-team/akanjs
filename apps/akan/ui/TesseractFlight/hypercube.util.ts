export type Vec4 = [number, number, number, number];
export type Attitude = readonly [xy: number, xz: number, xw: number, yz: number, yw: number];
export type CellAxis = readonly [axis: number, sign: 1 | -1];

export interface Projected {
  x: number;
  y: number;
  near: number;
}

export interface FrameBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

const attitudePlanes = [
  [0, 1],
  [0, 2],
  [0, 3],
  [1, 2],
  [1, 3],
] as const;
const eyeW = 3.2;
const eyeZ = 4.6;
export const quarterTurn = Math.PI / 2;

export class Hypercube {
  static readonly vertices: Vec4[] = Array.from({ length: 16 }, (_, idx): Vec4 => {
    const [x, y, z, w] = [0, 1, 2, 3].map((bit) => ((idx >> bit) & 1 ? 1 : -1));
    return [x, y, z, w];
  });
  static readonly edges: [number, number][] = Array.from({ length: 16 }, (_, idx) =>
    [0, 1, 2, 3].filter((bit) => !((idx >> bit) & 1)).map((bit): [number, number] => [idx, idx | (1 << bit)]),
  ).flat();

  //* ZW goes last: once the attitude and the XW spin are quarter turns, x and y stay ±1, so any ZW angle keeps a frame rectangular.
  static turn(vertex: Vec4, attitude: Attitude, xw = 0, zw = 0): Vec4 {
    const turned: Vec4 = [...vertex];
    for (const [idx, [a, b]] of attitudePlanes.entries()) Hypercube.#rotate(turned, a, b, attitude[idx]);
    Hypercube.#rotate(turned, 0, 3, xw);
    Hypercube.#rotate(turned, 2, 3, zw);
    return turned;
  }

  static perspective([x, y, z, w]: Vec4, yaw: number, pitch: number): Projected {
    const scaleW = eyeW / (eyeW - w);
    const [px, py, pz] = [x * scaleW, y * scaleW, z * scaleW];
    const [yawX, yawZ] = [px * Math.cos(yaw) + pz * Math.sin(yaw), pz * Math.cos(yaw) - px * Math.sin(yaw)];
    const [pitchY, pitchZ] = [
      py * Math.cos(pitch) - yawZ * Math.sin(pitch),
      py * Math.sin(pitch) + yawZ * Math.cos(pitch),
    ];
    const scaleZ = eyeZ / (eyeZ - pitchZ);
    return { x: yawX * scaleZ, y: pitchY * scaleZ, near: Hypercube.#unit((scaleW * scaleZ - 0.6) / 1.9) };
  }

  //? Seen head-on, the four (z, w) sign pairs are four nested rectangles; depth 0 is the pair nearest the eye.
  static frame([x, y, z, w]: Vec4, box: FrameBox, gap: number, margin: number): Projected {
    const depth = (1 - z) / 2 + (1 - w);
    const outset = margin + (3 - depth) * gap;
    return {
      x: box.left - outset + ((x + 1) / 2) * (box.width + outset * 2),
      y: box.top - outset + ((1 - y) / 2) * (box.height + outset * 2),
      near: Hypercube.#unit(1 - depth / 3),
    };
  }

  static cellEdges(attitude: Attitude, cells: readonly CellAxis[]): number[][] {
    const turned = Hypercube.vertices.map((vertex) => Hypercube.turn(vertex, attitude).map(Math.round));
    return cells.map(([axis, sign]) =>
      Hypercube.edges.flatMap(([a, b], idx) => (turned[a][axis] === sign && turned[b][axis] === sign ? [idx] : [])),
    );
  }

  static #unit(value: number) {
    return Math.min(1, Math.max(0, value));
  }

  static #rotate(vector: Vec4, a: number, b: number, angle: number) {
    if (!angle) return;
    const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
    [vector[a], vector[b]] = [vector[a] * cos - vector[b] * sin, vector[a] * sin + vector[b] * cos];
  }
}
