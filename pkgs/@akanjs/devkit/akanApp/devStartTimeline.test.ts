import { describe, expect, test } from "bun:test";
import type { Logger } from "akanjs/common";
import { DevStartTimeline } from "./devStartTimeline";

const timeline = () => {
  const lines: string[] = [];
  const clock = { at: 0 };
  const logger = { info: (line: string) => void lines.push(line) } as unknown as Logger;
  return { lines, clock, timeline: new DevStartTimeline(logger, () => clock.at) };
};

const phases = { runtime: 70, routes: 200, styles: 900, dictionary: 6, pages: 500, total: 1700 };

describe("DevStartTimeline", () => {
  test("names every phase of a start in one line, once the builder and the backend are both ready", () => {
    const { lines, clock, timeline: start } = timeline();
    clock.at = 800;
    start.begin();
    clock.at = 2700;
    start.baseBuilt(phases);
    start.mark("backendSpawned");
    clock.at = 2900;
    start.mark("builderReady");
    expect(lines).toEqual([]);
    clock.at = 3200;
    start.mark("backendReady");

    expect(lines).toEqual([
      "ready in 3200ms (prepare 800 · builder 2100: spawn 200 + base build 1700 [runtime 70 · routes 200 · styles 900 · dictionary 6 · pages 500] + watch 200 · backend 500 · first artifact at 2700)",
    ]);
  });

  test("reports at the builder's ready when the backend was ready first", () => {
    const { lines, clock, timeline: start } = timeline();
    start.begin();
    clock.at = 100;
    start.mark("backendSpawned");
    clock.at = 400;
    start.mark("backendReady");
    expect(lines).toEqual([]);
    clock.at = 2000;
    start.baseBuilt(phases);
    clock.at = 2100;
    start.mark("builderReady");

    expect(lines).toHaveLength(1);
    expect(lines[0]).toStartWith("ready in 2100ms (prepare 0 · builder 2100: spawn 300 + base build 1700 [");
    expect(lines[0]).toEndWith("+ watch 100 · backend 300 · first artifact at 2000)");
  });

  test("leaves the build's parts out when the boot build wrote no artifact", () => {
    const { lines, clock, timeline: start } = timeline();
    start.begin();
    clock.at = 900;
    start.mark("builderReady");
    start.mark("backendSpawned");
    clock.at = 1300;
    start.mark("backendReady");

    expect(lines).toEqual(["ready in 1300ms (prepare 0 · builder 900 · backend 400)"]);
  });

  test("times a backend replaced before it was ready from its last spawn", () => {
    const { lines, clock, timeline: start } = timeline();
    start.begin();
    start.mark("builderReady");
    start.mark("backendSpawned");
    clock.at = 700;
    start.mark("backendSpawned");
    clock.at = 1000;
    start.mark("backendReady");

    expect(lines).toEqual(["ready in 1000ms (prepare 0 · builder 0 · backend 300)"]);
  });

  test("says nothing after its one line until the next start, and nothing before the first", () => {
    const { lines, clock, timeline: start } = timeline();
    start.mark("builderReady");
    start.mark("backendReady");
    expect(lines).toEqual([]);

    start.begin();
    start.mark("builderReady");
    start.mark("backendReady");
    clock.at = 50;
    start.mark("backendSpawned");
    start.mark("backendReady");
    expect(lines).toHaveLength(1);

    start.begin();
    start.mark("builderReady");
    clock.at = 80;
    start.mark("backendReady");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe("ready in 80ms (prepare 50 · builder 0)");
  });
});
