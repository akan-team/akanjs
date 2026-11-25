import "../../test/registerDom";
import { describe, expect, test } from "bun:test";
import { ScreenSettle } from "./ScreenSettle";

const elapsed = async (run: () => Promise<void>) => {
  const started = performance.now();
  await run();
  return performance.now() - started;
};

describe("ScreenSettle", () => {
  test("resolves once the DOM holds still, and waits while it does not", async () => {
    const node = document.createElement("div");
    document.body.appendChild(node);
    let ticks = 0;
    const timer = setInterval(() => {
      ticks += 1;
      node.textContent = `tick ${ticks}`;
    }, 15);
    const took = await elapsed(async () => {
      setTimeout(() => clearInterval(timer), 120);
      await ScreenSettle.wait({ quietMs: 40, timeoutMs: 2000 });
    });
    expect(took).toBeGreaterThanOrEqual(120);
    expect(took).toBeLessThan(1000);
    expect(ticks).toBeGreaterThan(2);
    node.remove();
  });

  test("appearMs waits for a change that has not started, and gives up rather than hanging on one that never comes", async () => {
    const node = document.createElement("div");
    document.body.appendChild(node);
    const late = await elapsed(async () => {
      setTimeout(() => {
        node.textContent = "arrived";
      }, 80);
      await ScreenSettle.wait({ quietMs: 30, appearMs: 400, timeoutMs: 2000 });
    });
    expect(late).toBeGreaterThanOrEqual(80);
    expect(late).toBeLessThan(400);
    const never = await elapsed(() => ScreenSettle.wait({ quietMs: 30, appearMs: 60, timeoutMs: 2000 }));
    expect(never).toBeLessThan(400);
    node.remove();
  });

  test("loaded waits while a load on screen is pending, and not for one on a page parked out of view", async () => {
    const section = document.createElement("section");
    section.innerHTML = "<template data-akan-loading></template>";
    const parked = document.createElement("div");
    parked.setAttribute("inert", "");
    parked.innerHTML = "<p><template data-akan-loading></template></p>";
    document.body.append(section, parked);
    let waited: boolean | undefined;
    const took = await elapsed(async () => {
      setTimeout(() => {
        section.innerHTML = "<ul><li>card</li></ul>";
      }, 120);
      waited = await ScreenSettle.loaded({ timeoutMs: 2000 });
    });
    expect(waited).toBe(true);
    expect(took).toBeGreaterThanOrEqual(120);
    expect(took).toBeLessThan(1000);
    expect(await ScreenSettle.loaded({ timeoutMs: 2000 })).toBe(false);
    section.remove();
    parked.remove();
  });

  test("loaded waits for a load under a `display: contents` wrapper, which has no box of its own", async () => {
    const section = document.createElement("section");
    section.innerHTML =
      '<div style="display: contents"><div style="display: contents"><template data-akan-loading></template></div></div>';
    document.body.appendChild(section);
    setTimeout(() => {
      section.innerHTML = "<p>board</p>";
    }, 80);
    const took = await elapsed(async () => void (await ScreenSettle.loaded({ timeoutMs: 2000 })));
    expect(took).toBeGreaterThanOrEqual(80);
    expect(took).toBeLessThan(1000);
    section.remove();
  });

  test("loaded is bounded by its timeout when a load never lands", async () => {
    const section = document.createElement("section");
    section.innerHTML = "<template data-akan-loading></template>";
    document.body.appendChild(section);
    const took = await elapsed(async () => void (await ScreenSettle.loaded({ timeoutMs: 150 })));
    expect(took).toBeGreaterThanOrEqual(150);
    expect(took).toBeLessThan(600);
    section.remove();
  });

  test("a screen that never holds still is bounded by the timeout", async () => {
    const node = document.createElement("div");
    document.body.appendChild(node);
    const timer = setInterval(() => {
      node.setAttribute("data-tick", String(Math.random()));
    }, 5);
    const took = await elapsed(() => ScreenSettle.wait({ quietMs: 50, timeoutMs: 150 }));
    clearInterval(timer);
    expect(took).toBeGreaterThanOrEqual(150);
    expect(took).toBeLessThan(600);
    node.remove();
  });
});
