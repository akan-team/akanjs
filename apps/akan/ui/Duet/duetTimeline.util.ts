import type { CSSProperties } from "react";

type Values = { [name: string]: number };
type Point = readonly [at: number, value: number];

interface Tween {
  name: string;
  start: number;
  end: number;
  to: number;
}

export class DuetTimeline {
  readonly #initial: Values;
  readonly #tweens: Tween[] = [];

  constructor(initial: Values) {
    this.#initial = initial;
  }

  to(start: number, end: number, values: Values) {
    for (const [name, to] of Object.entries(values)) this.#tweens.push({ name, start, end, to });
    return this;
  }

  pulse(name: string, start: number, end: number) {
    return this.to(start, end, { [name]: 1 }).to(end, end + 0.01, { [name]: 0 });
  }

  css(name: string) {
    const registrations = Object.keys(this.#initial)
      .map(
        (variable) => `@property ${DuetTimeline.property(variable)}{syntax:"<number>";inherits:true;initial-value:0}`,
      )
      .join("");
    return `${registrations}@keyframes ${name}{${this.#frames()}}`;
  }

  still(at: number, overrides: Values = {}): CSSProperties {
    const values = Object.fromEntries(
      [...this.#points()].map(([variable, points]) => [
        DuetTimeline.property(variable),
        DuetTimeline.#format(overrides[variable] ?? DuetTimeline.#valueAt(points, at)),
      ]),
    );
    return values as CSSProperties;
  }

  //* CSS interpolates a property only between the keyframes that name it, so each variable holds until its next tween.
  #frames() {
    const frames = new Map<number, string[]>();
    for (const [variable, points] of this.#points())
      for (const [at, value] of points)
        frames.set(at, [
          ...(frames.get(at) ?? []),
          `${DuetTimeline.property(variable)}:${DuetTimeline.#format(value)}`,
        ]);
    return [...frames.entries()]
      .sort(([a], [b]) => a - b)
      .map(([at, declarations]) => `${DuetTimeline.#format(at)}%{${declarations.join(";")}}`)
      .join("");
  }

  #points() {
    const points = new Map<string, Point[]>();
    for (const [variable, initial] of Object.entries(this.#initial)) {
      const tweens = this.#tweens.filter(({ name }) => name === variable).sort((a, b) => a.start - b.start);
      let value = initial;
      const track: Point[] = [[0, value]];
      for (const { start, end, to } of tweens) {
        track.push([DuetTimeline.#round(start), value], [DuetTimeline.#round(end), to]);
        value = to;
      }
      track.push([100, value]);
      points.set(
        variable,
        track.filter(([at, val], idx) => idx === 0 || at !== track[idx - 1][0] || val !== track[idx - 1][1]),
      );
    }
    return points;
  }

  static property(name: string) {
    return `--duet-${name.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`)}`;
  }

  static #valueAt(points: Point[], at: number) {
    const next = points.findIndex(([time]) => time >= at);
    if (next === -1) return points[points.length - 1][1];
    if (next === 0) return points[0][1];
    const [[fromAt, from], [toAt, to]] = [points[next - 1], points[next]];
    return toAt === fromAt ? to : from + ((to - from) * (at - fromAt)) / (toAt - fromAt);
  }

  static #round(value: number) {
    return Math.round(value * 100) / 100;
  }

  static #format(value: number) {
    return String(Math.round(value * 10000) / 10000);
  }
}
