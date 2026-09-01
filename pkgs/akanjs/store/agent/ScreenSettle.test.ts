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
    // It cannot have resolved during the mutation stream, and it must not have needed the timeout either.
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
