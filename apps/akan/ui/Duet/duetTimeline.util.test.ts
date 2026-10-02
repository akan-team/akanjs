import { describe, expect, test } from "bun:test";
import { DuetTimeline } from "./duetTimeline.util";

const framesOf = (css: string) =>
  Object.fromEntries(
    [...css.matchAll(/([\d.]+)%\{([^}]*)\}/g)].map(([, at, declarations]) => [Number(at), declarations.split(";")]),
  );

describe("DuetTimeline", () => {
  test("holds a variable between its tweens by naming it at both ends of each", () => {
    const frames = framesOf(new DuetTimeline({ x: 0 }).to(20, 30, { x: 1 }).to(60, 70, { x: 0 }).css("k"));
    expect(Object.keys(frames).map(Number)).toEqual([0, 20, 30, 60, 70, 100]);
    expect([frames[30], frames[60]]).toEqual([["--duet-x:1"], ["--duet-x:1"]]);
  });

  test("registers every variable as an inherited number, kebab-cased", () => {
    const css = new DuetTimeline({ ringTop: 0 }).css("k");
    expect(css.startsWith('@property --duet-ring-top{syntax:"<number>";inherits:true;initial-value:0}')).toBe(true);
  });

  test("snaps a pulse back to zero right after it peaks", () => {
    const frames = framesOf(new DuetTimeline({ tap: 0 }).pulse("tap", 40, 42).css("k"));
    expect([frames[42], frames[42.01], frames[100]]).toEqual([["--duet-tap:1"], ["--duet-tap:0"], ["--duet-tap:0"]]);
  });

  test("interpolates a still frame inside a tween and lets an override win", () => {
    const timeline = new DuetTimeline({ x: 0, y: 2 }).to(10, 30, { x: 4 });
    expect(timeline.still(20)).toEqual({ "--duet-x": "2", "--duet-y": "2" });
    expect(timeline.still(80, { y: 5 })).toEqual({ "--duet-x": "4", "--duet-y": "5" });
  });
});
