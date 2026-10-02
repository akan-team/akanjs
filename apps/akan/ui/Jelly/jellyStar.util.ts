interface StarShape {
  outer: number;
  inner: number;
  sharpness: number;
  twist: number;
  sx: number;
  sy: number;
}

interface Point {
  x: number;
  y: number;
}

export class JellyStarPath {
  static readonly center = { x: 100, y: 106 } as const;
  static readonly samples = 60;
  static readonly base: StarShape = { outer: 90, inner: 56, sharpness: 1.6, twist: 0, sx: 1, sy: 1 };

  static of(shape: Partial<StarShape> = {}) {
    return new JellyStarPath({ ...JellyStarPath.base, ...shape }).toString();
  }

  readonly #shape: StarShape;

  constructor(shape: StarShape) {
    this.#shape = shape;
  }

  get floor() {
    return JellyStarPath.center.y + this.#shape.outer * Math.sin((54 * Math.PI) / 180);
  }

  #points(): Point[] {
    const { outer, inner, sharpness, twist, sx, sy } = this.#shape;
    const { x: cx, y: cy } = JellyStarPath.center;
    const floor = this.floor;
    return Array.from({ length: JellyStarPath.samples }, (_, idx) => {
      const theta = (idx / JellyStarPath.samples) * Math.PI * 2;
      //? r(θ) = inner + (outer − inner)·((1 + cos 5θ) / 2)^sharpness: one smooth lobe per 72°, so tips and valleys
      //? are both curves and every keyframe has the same sample count to morph between.
      const lobe = ((1 + Math.cos(5 * theta)) / 2) ** sharpness;
      const radius = inner + (outer - inner) * lobe;
      const angle = theta - Math.PI / 2 + ((twist * Math.PI) / 180) * lobe;
      const x = cx + Math.cos(angle) * radius * sx;
      const y = floor - (floor - (cy + Math.sin(angle) * radius)) * sy;
      return { x, y };
    });
  }

  toString() {
    const points = this.#points();
    const at = (idx: number) => points[(idx + points.length) % points.length];
    const fmt = (p: Point) => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
    //? Catmull-Rom to cubic Bézier: the control points sit a sixth of the neighbour chord away from each end.
    const segments = points.map((p1, idx) => {
      const p0 = at(idx - 1);
      const p2 = at(idx + 1);
      const p3 = at(idx + 2);
      const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
      const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
      return `C ${fmt(c1)} ${fmt(c2)} ${fmt(p2)}`;
    });
    return `M ${fmt(points[0])} ${segments.join(" ")} Z`;
  }
}
