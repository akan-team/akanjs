import { type Attitude, Extrusion } from "./extrusion.util";

export const labelSets = ["line", "layers", "platforms", "audiences", "surfaces"] as const;
export type LabelSet = (typeof labelSets)[number];
export type LabelWeights = { [key in LabelSet]: number };
type Kind = "seed" | "stage" | "frame" | "rest";

interface Keyframe {
  el: HTMLElement;
  kind: Kind;
  dim: number;
  show: LabelSet | null;
  spin: number;
  attitude: Attitude;
  seed: HTMLElement | null;
  stage: HTMLElement | null;
}

interface Span {
  box: DOMRect;
  from: number;
  to: number;
}

export interface Placement {
  x: number;
  y: number;
  unit: number;
}

export interface Scene {
  dim: number;
  place: Placement;
  attitude: Attitude;
  phi: number;
  box: DOMRect;
  spin: number;
  show: LabelWeights;
  stage: number;
  alpha: number;
}

const flightMoves = [
  [0, 0, 1, 0, 0],
  [0, 0, 0, 0, 1],
  [0, 1, 0, 0, -1],
  [0, 0, -1, 1, 0],
  [0, 0, 0, 0, -1],
  [0, -1, 0, 0, 0],
] as const;

export class AscentScript {
  #frames: Keyframe[] = [];

  scan() {
    let attitude = Extrusion.still;
    let flights = 0;
    this.#frames = [...document.querySelectorAll<HTMLElement>("[data-ascent]")].map((el) => {
      const seed = el.querySelector<HTMLElement>("[data-ascent-seed]");
      const kind: Kind = seed
        ? "seed"
        : el.hasAttribute("data-ascent-frame")
          ? "frame"
          : el.hasAttribute("data-ascent-rest")
            ? "rest"
            : "stage";
      if (kind === "frame") {
        attitude = AscentScript.#turnBy(attitude, flightMoves[flights % flightMoves.length]);
        flights += 1;
      }
      const scope = el.closest("section") ?? el;
      return {
        el,
        kind,
        dim: Number(el.dataset.ascent) || 0,
        show: labelSets.find((set) => set === el.dataset.ascentShow) ?? null,
        spin: el.hasAttribute("data-ascent-spin") ? 1 : 0,
        attitude: kind === "frame" ? attitude : Extrusion.still,
        seed,
        stage:
          el.querySelector<HTMLElement>("[data-ascent-stage]") ??
          scope.querySelector<HTMLElement>("[data-ascent-stage]"),
      };
    });
  }

  scene(vw: number, vh: number): Scene | null {
    if (!this.#frames.length) return null;
    const spans = this.#frames.map(({ el }) => AscentScript.#span(el.getBoundingClientRect(), vh));
    AscentScript.#spread(spans, vh * 0.45, vh * 0.12);
    const next = spans.findIndex((span) => span.to >= 0);
    if (next === -1) return this.#hold(spans.length - 1, spans, vh);
    if (next === 0 || spans[next].from <= 0) return this.#hold(next, spans, vh);
    return this.#fly(next - 1, -spans[next - 1].to / (spans[next].from - spans[next - 1].to), spans, vw, vh);
  }

  #hold(idx: number, spans: Span[], vh: number): Scene {
    const frame = this.#frames[idx];
    return {
      dim: frame.dim,
      place: this.#placement(frame, vh),
      attitude: frame.attitude,
      phi: frame.kind === "frame" ? 1 : 0,
      box: spans[idx].box,
      spin: frame.spin,
      show: AscentScript.#weights((set) => (frame.show === set ? 1 : 0)),
      stage: frame.kind === "stage" ? 1 : 0,
      alpha: frame.kind === "rest" ? 0 : 1,
    };
  }

  //* A rest hands the screen to its section, so the figure never flies across it: it fades where it stood and reappears where it lands.
  #fade(idx: number, t: number, spans: Span[], vh: number): Scene {
    const isLeaving = this.#frames[idx + 1].kind === "rest";
    const scene = this.#hold(isLeaving ? idx : idx + 1, spans, vh);
    const fade = isLeaving ? 1 - AscentScript.#smooth(0, 0.6, t) : AscentScript.#smooth(0.4, 1, t);
    return { ...scene, alpha: scene.alpha * fade };
  }

  //* A flight that touches a frame takes the side margin so it never crosses the copy; one that doesn't fades through instead.
  #fly(idx: number, t: number, spans: Span[], vw: number, vh: number): Scene {
    const [from, to] = [this.#frames[idx], this.#frames[idx + 1]];
    if (from.kind === "rest" || to.kind === "rest") return this.#fade(idx, t, spans, vh);
    const ease = AscentScript.#smooth(0, 1, t);
    const mix = (a: number, b: number) => a + (b - a) * ease;
    const isAerial = from.kind === "frame" || to.kind === "frame";
    const side = idx % 2 ? -1 : 1;
    const way = AscentScript.#waypoint(side, t, vw, vh);
    const place = !isAerial
      ? AscentScript.#mixPlace(this.#placement(from, vh), this.#placement(to, vh), ease)
      : t < 0.5
        ? AscentScript.#mixPlace(this.#placement(from, vh, side), way, AscentScript.#smooth(0, 0.5, t))
        : AscentScript.#mixPlace(way, this.#placement(to, vh, side), AscentScript.#smooth(0.5, 1, t));
    const [leave, arrive] = [1 - AscentScript.#smooth(0, 0.4, t), AscentScript.#smooth(0.6, 1, t)];
    const isRelocating = !isAerial && from.kind !== to.kind;
    return {
      dim: mix(from.dim, to.dim),
      place,
      attitude: AscentScript.#mixAttitude(from.attitude, to.attitude, AscentScript.#smooth(0.18, 0.82, t)),
      phi:
        (from.kind === "frame" ? 1 - AscentScript.#smooth(0, 0.42, t) : 0) +
        (to.kind === "frame" ? AscentScript.#smooth(0.58, 1, t) : 0),
      box: t < 0.5 ? spans[idx].box : spans[idx + 1].box,
      spin: mix(from.spin, to.spin),
      show: AscentScript.#weights((set) =>
        from.show === set && to.show === set ? 1 : (from.show === set ? leave : 0) + (to.show === set ? arrive : 0),
      ),
      stage: mix(from.kind === "stage" ? 1 : 0, to.kind === "stage" ? 1 : 0),
      alpha: isRelocating ? 1 - 0.97 * AscentScript.#smooth(0, 0.18, t) * (1 - AscentScript.#smooth(0.82, 1, t)) : 1,
    };
  }

  #placement(frame: Keyframe, vh: number, side = 0): Placement {
    if (frame.seed) {
      const box = frame.seed.getBoundingClientRect();
      return { x: box.left + box.width / 2, y: box.bottom + box.height * 0.14, unit: box.width / 2 };
    }
    const reach = Extrusion.reach(frame.dim);
    if (frame.kind === "frame") {
      const box = frame.el.getBoundingClientRect();
      const unit = AscentScript.#between(Math.min(box.width, box.height) / (2.36 * reach), 18, 50);
      const extent = unit * reach;
      const x = side > 0 ? box.right - extent : side < 0 ? box.left + extent : box.left + box.width / 2;
      return { x, y: AscentScript.#between(box.top + box.height / 2, extent + 96, vh - extent - 32), unit };
    }
    const box = frame.stage?.getBoundingClientRect();
    if (!box) return { x: 0, y: 0, unit: 0 };
    return {
      x: box.left + box.width / 2,
      y: box.top + box.height / 2,
      unit: Math.min(box.width, box.height) / (2.36 * reach * (1 + 0.26 * frame.spin)),
    };
  }

  static #spread(spans: Span[], minFlight: number, minHold: number) {
    spans.slice(1).forEach((after, idx) => {
      const before = spans[idx];
      const deficit = minFlight - (after.from - before.to);
      if (deficit <= 0) return;
      const beforeSlack = Math.max(0, before.to - before.from - minHold);
      const afterSlack = Math.max(0, after.to - after.from - minHold);
      const beforeCut = Math.min(beforeSlack, Math.max(deficit / 2, deficit - afterSlack));
      before.to -= beforeCut;
      after.from += deficit - beforeCut;
      after.to = Math.max(after.to, after.from + minHold);
    });
  }

  static #span(box: DOMRect, vh: number): Span {
    const middle = box.top + box.height / 2 - vh / 2;
    const reach = Math.max(0, (box.height - vh) / 2) + vh * 0.15;
    return { box, from: middle - reach, to: middle + reach };
  }

  static #waypoint(side: number, t: number, vw: number, vh: number): Placement {
    const unit = AscentScript.#between(Math.min(vw, vh) * 0.036, 15, 30);
    const edge = unit * Extrusion.reach(4) + 12;
    const x = AscentScript.#between(vw / 2 + side * (Math.min(vw, 1280) / 2 + 8), edge, vw - edge);
    return { x, y: vh * (0.5 + (0.5 - t) * 0.3), unit };
  }

  static #turnBy(attitude: Attitude, move: Attitude): Attitude {
    const [xy, xz, xw, yz, yw] = attitude.map((angle, idx) => {
      const turned = angle + move[idx] * (Math.PI / 2);
      return turned - Math.round(turned / (Math.PI * 2)) * Math.PI * 2;
    });
    return [xy, xz, xw, yz, yw];
  }

  static #mixAttitude(from: Attitude, to: Attitude, t: number): Attitude {
    const [xy, xz, xw, yz, yw] = from.map((angle, idx) => angle + (to[idx] - angle) * t);
    return [xy, xz, xw, yz, yw];
  }

  static #mixPlace(from: Placement, to: Placement, t: number): Placement {
    return {
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t,
      unit: from.unit + (to.unit - from.unit) * t,
    };
  }

  static #weights(weigh: (set: LabelSet) => number): LabelWeights {
    const [line, layers, platforms, audiences, surfaces] = labelSets.map(weigh);
    return { line, layers, platforms, audiences, surfaces };
  }

  static #smooth(edge0: number, edge1: number, value: number) {
    const t = AscentScript.#between((value - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
  }

  static #between(value: number, min: number, max: number) {
    return min > max ? (min + max) / 2 : Math.min(max, Math.max(min, value));
  }
}
