export type Vec4 = [number, number, number, number];
export type Scales = readonly [x: number, y: number, z: number, w: number];
export type Edge = readonly [from: number, to: number, axis: number];
export type Attitude = readonly [xy: number, xz: number, xw: number, yz: number, yw: number];

export interface Camera {
  yaw: number;
  pitch: number;
  xw: number;
  zw: number;
  attitude?: Attitude;
}

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
const eyeZ = 5;
const reachByDim = [0.2, 1, 1.02, 1.58, 2.3] as const;

export class Extrusion {
  static readonly still: Attitude = [0, 0, 0, 0, 0];
  static readonly vertices: Vec4[] = Array.from({ length: 16 }, (_, idx): Vec4 => {
    const [x, y, z, w] = [0, 1, 2, 3].map((bit) => ((idx >> bit) & 1 ? 1 : -1));
    return [x, y, z, w];
  });
  static readonly edges: Edge[] = Array.from({ length: 16 }, (_, idx) =>
    [0, 1, 2, 3].filter((bit) => !((idx >> bit) & 1)).map((bit): Edge => [idx, idx | (1 << bit), bit]),
  ).flat();
  static readonly sweepCopies = 4;
  static readonly axisEdges: Edge[][] = [0, 1, 2, 3].map((axis) =>
    Extrusion.edges.filter(([, , edgeAxis]) => edgeAxis === axis),
  );

  static scales(dim: number): Scales {
    const [x, y, z, w] = [0, 1, 2, 3].map((axis) => Extrusion.#ease(dim - axis));
    return [x, y, z, w];
  }

  //? A vertex with bit k set sits on its twin until axis k starts to extrude; drawing both would double every stroke.
  static presence(idx: number, scales: Scales) {
    return [0, 1, 2, 3].reduce(
      (weight, axis) => ((idx >> axis) & 1 ? weight * Extrusion.#unit(scales[axis] * 8) : weight),
      1,
    );
  }

  static tilt(dim: number) {
    return Extrusion.#ease(dim - 2);
  }

  static reach(dim: number) {
    const floor = Math.max(0, Math.min(3, Math.floor(dim)));
    return reachByDim[floor] + (reachByDim[floor + 1] - reachByDim[floor]) * Extrusion.#unit(dim - floor);
  }

  static center(dim: number, camera: Camera) {
    const points = Extrusion.vertices.map((vertex) =>
      Extrusion.project(Extrusion.place(vertex, Extrusion.scales(dim)), camera),
    );
    const [xs, ys] = [points.map((point) => point.x), points.map((point) => point.y)];
    return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
  }

  static place(vertex: Vec4, scales: Scales): Vec4 {
    return [vertex[0] * scales[0], vertex[1] * scales[1], vertex[2] * scales[2], vertex[3] * scales[3]];
  }

  static project(vertex: Vec4, { yaw, pitch, xw, zw, attitude = Extrusion.still }: Camera): Projected {
    return Extrusion.perspective(Extrusion.turn(vertex, attitude, xw, zw), yaw, pitch);
  }

  //* ZW goes last: once the attitude and the XW spin are quarter turns, x and y stay ±1, so any ZW angle keeps a frame rectangular.
  static turn(vertex: Vec4, attitude: Attitude, xw: number, zw: number): Vec4 {
    const turned: Vec4 = [...vertex];
    for (const [idx, [a, b]] of attitudePlanes.entries()) Extrusion.#rotate(turned, a, b, attitude[idx]);
    Extrusion.#rotate(turned, 0, 3, xw);
    Extrusion.#rotate(turned, 2, 3, zw);
    return turned;
  }

  static perspective([x1, y0, z1, w]: Vec4, yaw: number, pitch: number): Projected {
    const scaleW = eyeW / (eyeW - w);
    const [x, y, z] = [x1 * scaleW, y0 * scaleW, z1 * scaleW];
    const [yawX, yawZ] = [x * Math.cos(yaw) + z * Math.sin(yaw), z * Math.cos(yaw) - x * Math.sin(yaw)];
    const [pitchY, pitchZ] = [
      y * Math.cos(pitch) - yawZ * Math.sin(pitch),
      y * Math.sin(pitch) + yawZ * Math.cos(pitch),
    ];
    const scaleZ = eyeZ / (eyeZ - pitchZ);
    return { x: yawX * scaleZ, y: pitchY * scaleZ, near: Extrusion.#unit((scaleW * scaleZ - 0.55) / 0.9) };
  }

  //? Seen head-on, the four (z, w) sign pairs are four nested rectangles; depth 0 is the pair nearest the eye.
  static frame([x, y, z, w]: Vec4, box: FrameBox, gap: number, margin: number): Projected {
    const depth = (1 - z) / 2 + (1 - w);
    const outset = margin + (3 - depth) * gap;
    return {
      x: box.left - outset + ((x + 1) / 2) * (box.width + outset * 2),
      y: box.top - outset + ((1 - y) / 2) * (box.height + outset * 2),
      near: Extrusion.#unit(1 - depth / 3),
    };
  }

  static ghostEdges(axis: number): Edge[] {
    return Extrusion.edges.filter(([, to, edgeAxis]) => edgeAxis < axis && to < 1 << axis);
  }

  static ghost(vertex: Vec4, axis: number, offset: number, scales: Scales): Vec4 {
    const placed = Extrusion.place(vertex, scales);
    placed[axis] = offset * scales[axis];
    return placed;
  }

  static #rotate(vector: Vec4, a: number, b: number, angle: number) {
    if (!angle) return;
    const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
    [vector[a], vector[b]] = [vector[a] * cos - vector[b] * sin, vector[a] * sin + vector[b] * cos];
  }

  static #ease(value: number) {
    const t = Extrusion.#unit(value);
    return t * t * (3 - 2 * t);
  }

  static #unit(value: number) {
    return Math.min(1, Math.max(0, value));
  }
}
