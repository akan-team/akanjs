import { type Attitude, type FrameBox, Hypercube, quarterTurn } from "./hypercube.util";

interface Station {
  el: HTMLElement;
  isFrame: boolean;
  stage: HTMLElement;
  cells: HTMLElement[];
  isGlowing: boolean;
  attitude: Attitude;
  cellEdges: number[][];
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
  alpha: number;
}

export interface Pose {
  attitude: Attitude;
  phi: number;
  halo: number;
  place: Placement;
  box: FrameBox;
  scroll: number;
  cellEdges: number[][];
  lit: number[];
  cellWeight: number;
  glowWeight: number;
}

const flightMoves = [
  [0, 0, 1, 0, 0],
  [0, 0, 0, 0, 1],
  [0, 1, 0, 0, -1],
  [0, 0, -1, 1, 0],
  [0, 0, 0, 0, -1],
  [0, -1, 0, 0, 0],
] as const;
//* Cells run from the inner cube (w−) out to the outer cube (w+): the database at the core, the UI prop on the surface.
const cellAxes = [
  [3, -1],
  [2, -1],
  [1, -1],
  [0, -1],
  [0, 1],
  [1, 1],
  [2, 1],
  [3, 1],
] as const;
export const reachUnits = 3;

export class FlightPlan {
  #stations: Station[] = [];

  scan() {
    let attitude: Attitude = [0, 0, 0, 0, 0];
    this.#stations = [...document.querySelectorAll<HTMLElement>("[data-tesseract]")].map((el, idx) => {
      if (idx) attitude = FlightPlan.#turnBy(attitude, flightMoves[(idx - 1) % flightMoves.length]);
      const cells = [...el.querySelectorAll<HTMLElement>("[data-tesseract-cell]")];
      return {
        el,
        isFrame: el.dataset.tesseract === "frame",
        stage: el.querySelector<HTMLElement>("[data-tesseract-stage]") ?? el,
        cells,
        isGlowing: el.hasAttribute("data-tesseract-glow"),
        attitude,
        cellEdges: cells.length ? Hypercube.cellEdges(attitude, cellAxes) : [],
      };
    });
  }

  pose(vw: number, vh: number): Pose | null {
    if (!this.#stations.length) return null;
    const spans = this.#stations.map((station) => FlightPlan.#span(station, vh));
    this.#spread(spans, vh * 0.45, vh * 0.12);
    const next = spans.findIndex((span) => span.to >= 0);
    if (next === -1) return this.#hold(spans.length - 1, spans, vh);
    if (next === 0 || spans[next].from <= 0) return this.#hold(next, spans, vh);
    return this.#fly(next - 1, -spans[next - 1].to / (spans[next].from - spans[next - 1].to), spans, vw, vh);
  }

  #hold(idx: number, spans: Span[], vh: number): Pose {
    const station = this.#stations[idx];
    return {
      attitude: station.attitude,
      phi: station.isFrame ? 1 : 0,
      halo: 1,
      place: FlightPlan.#placement(station, vh),
      box: spans[idx].box,
      scroll: -spans[0].box.top,
      cellEdges: station.cellEdges,
      lit: station.cells.map((cell) => FlightPlan.#lit(cell, vh)),
      cellWeight: 1,
      glowWeight: station.isGlowing ? 1 : 0,
    };
  }

  #fly(idx: number, t: number, spans: Span[], vw: number, vh: number): Pose {
    const [depart, arrive] = [this.#stations[idx], this.#stations[idx + 1]];
    const side = idx % 2 ? -1 : 1;
    const way = FlightPlan.#waypoint(side, t, vw, vh);
    const place =
      t < 0.5
        ? FlightPlan.#mixPlace(FlightPlan.#placement(depart, vh, side), way, FlightPlan.#smooth(0, 0.5, t))
        : FlightPlan.#mixPlace(way, FlightPlan.#placement(arrive, vh, side), FlightPlan.#smooth(0.5, 1, t));
    const [leave, reach] = [1 - FlightPlan.#smooth(0, 0.5, t), FlightPlan.#smooth(0.5, 1, t)];
    const cellStation = depart.cells.length ? depart : arrive.cells.length ? arrive : null;
    return {
      attitude: FlightPlan.#mixAttitude(depart.attitude, arrive.attitude, FlightPlan.#smooth(0.18, 0.82, t)),
      phi:
        (depart.isFrame ? 1 - FlightPlan.#smooth(0, 0.42, t) : 0) +
        (arrive.isFrame ? FlightPlan.#smooth(0.58, 1, t) : 0),
      halo: 1 - Math.sin(Math.PI * t),
      place,
      box: t < 0.5 ? spans[idx].box : spans[idx + 1].box,
      scroll: -spans[0].box.top,
      cellEdges: cellStation?.cellEdges ?? [],
      lit: cellStation?.cells.map((cell) => FlightPlan.#lit(cell, vh)) ?? [],
      cellWeight: cellStation === depart ? leave : cellStation ? reach : 0,
      glowWeight: (depart.isGlowing ? leave : 0) + (arrive.isGlowing ? reach : 0),
    };
  }

  #spread(spans: Span[], minFlight: number, minHold: number) {
    spans.slice(1).forEach((after, idx) => {
      const before = spans[idx];
      const deficit = minFlight - (after.from - before.to);
      if (deficit <= 0) return;
      const isAfterFixed = this.#stations[idx + 1].cells.length > 0;
      const beforeSlack = this.#stations[idx].cells.length ? 0 : Math.max(0, before.to - before.from - minHold);
      const afterSlack = isAfterFixed ? 0 : Math.max(0, after.to - after.from - minHold);
      const beforeCut = Math.min(beforeSlack, Math.max(deficit / 2, deficit - afterSlack));
      before.to -= beforeCut;
      after.from += isAfterFixed ? 0 : deficit - beforeCut;
      after.to = Math.max(after.to, after.from + minHold);
    });
  }

  static #span(station: Station, vh: number): Span {
    const box = station.el.getBoundingClientRect();
    const focus = vh / 2;
    if (station.cells.length) {
      const first = FlightPlan.#middle(station.cells[0]) - focus;
      const last = FlightPlan.#middle(station.cells[station.cells.length - 1]) - focus;
      return { box, from: first - vh * 0.12, to: last + vh * 0.1 };
    }
    const middle = box.top + box.height / 2 - focus;
    const reach = Math.max(0, (box.height - vh) / 2) + vh * 0.15;
    return { box, from: middle - reach, to: middle + reach };
  }

  static #waypoint(side: number, t: number, vw: number, vh: number): Placement {
    const unit = FlightPlan.#between(Math.min(vw, vh) * 0.05, 22, 46);
    const edge = unit * reachUnits + 12;
    const x = FlightPlan.#between(vw / 2 + side * (Math.min(vw, 1280) / 2 - 32), edge, vw - edge);
    return { x, y: vh * (0.5 + (0.5 - t) * 0.3), unit, alpha: 1 };
  }

  static #placement(station: Station, vh: number, side = 0): Placement {
    const stage = station.stage.getBoundingClientRect();
    const fit = Math.min(stage.width, stage.height) / (reachUnits * 2);
    const unit = station.isFrame ? FlightPlan.#between(fit, 24, 64) : fit;
    const reach = unit * reachUnits;
    const y = stage.top + stage.height / 2;
    if (!station.isFrame) {
      const x = stage.left + stage.width / 2;
      const alpha = Number(getComputedStyle(station.stage).opacity);
      return { x, y: station.cells.length ? FlightPlan.#between(y, reach + 80, vh - reach - 64) : y, unit, alpha };
    }
    const x = side > 0 ? stage.right - reach : side < 0 ? stage.left + reach : stage.left + stage.width / 2;
    return { x, y: FlightPlan.#between(y, reach + 80, vh - reach - 24), unit, alpha: 1 };
  }

  //? Mirrors `animation-range: cover 44% cover 52%` of the `pass-lit` utility, so a row and its cell light together.
  static #lit(cell: HTMLElement, vh: number) {
    const box = cell.getBoundingClientRect();
    return FlightPlan.#clamp(((vh - box.top) / (vh + box.height) - 0.44) / 0.08);
  }

  static #middle(el: HTMLElement) {
    const box = el.getBoundingClientRect();
    return box.top + box.height / 2;
  }

  static #turnBy(attitude: Attitude, move: Attitude): Attitude {
    const [xy, xz, xw, yz, yw] = attitude.map((angle, idx) => angle + move[idx] * quarterTurn);
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
      alpha: from.alpha + (to.alpha - from.alpha) * t,
    };
  }

  static #smooth(edge0: number, edge1: number, value: number) {
    const t = FlightPlan.#clamp((value - edge0) / (edge1 - edge0));
    return t * t * (3 - 2 * t);
  }

  static #between(value: number, min: number, max: number) {
    return min > max ? (min + max) / 2 : Math.min(max, Math.max(min, value));
  }

  static #clamp(value: number) {
    return Math.min(1, Math.max(0, value));
  }
}
