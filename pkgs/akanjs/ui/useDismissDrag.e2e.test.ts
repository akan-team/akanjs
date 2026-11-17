import { describe, expect, test } from "bun:test";
import path from "node:path";

//? Drives headless Chrome through Bun.WebView with trusted pointer events: AKAN_BROWSER_E2E=1 turns it on.
const enabled = process.env.AKAN_BROWSER_E2E === "1";

type Entry = { drag: number } | { release: boolean } | { click: true };
const outcomeOf = (log: Entry[]) => ({
  clicks: log.filter((entry) => "click" in entry).length,
  releases: log.flatMap((entry) => ("release" in entry ? [entry.release] : [])),
  farthest: Math.max(0, ...log.flatMap((entry) => ("drag" in entry ? [entry.drag] : []))),
});

describe.skipIf(!enabled)("useDismissDrag in a browser", () => {
  test("loads the gesture library on the first press, and drags held while it loads land as live ones do", async () => {
    const proc = Bun.spawn([process.execPath, path.join(import.meta.dir, "useDismissDrag.browser.fixture.ts")], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    const run = JSON.parse(stdout.trim().split("\n").at(-1) || "{}");

    expect(stderr).toBe("");
    expect(run.gestureChunks).toHaveLength(1);
    expect({
      beforePress: run.beforePress,
      whileLoading: run.whileLoading,
      requestedOnPress: run.requestedOnPress,
      errors: run.errors,
    }).toEqual({ beforePress: [], whileLoading: [], requestedOnPress: true, errors: [] });
    expect(outcomeOf(run.heldWhole)).toMatchObject({ clicks: 0, releases: [true] });
    expect(outcomeOf(run.heldWhole).farthest).toBeGreaterThan(120);
    expect(outcomeOf(run.live)).toMatchObject({ clicks: 0, releases: [false] });
    expect(outcomeOf(run.heldSlow)).toMatchObject({ clicks: 1, releases: [false] });
    expect(outcomeOf(run.pressHeld)).toMatchObject({ clicks: 0, releases: [true] });
    expect(outcomeOf(run.tap).clicks).toBe(1);
  }, 120_000);
});
