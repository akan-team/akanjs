import { describe, expect, test } from "bun:test";
import { waitForReveal } from "./rscReveal";

describe("waitForReveal", () => {
  test("resolves immediately when the navigation has no reveal to wait for", async () => {
    const start = performance.now();
    await waitForReveal(undefined, 500);
    expect(performance.now() - start).toBeLessThan(50);
  });

  test("resolves once the stream finishes, ahead of the cap", async () => {
    let finish = () => {};
    const revealed = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const start = performance.now();
    const pending = waitForReveal(revealed, 500);
    finish();
    await pending;
    expect(performance.now() - start).toBeLessThan(200);
  });

  test("resolves on the cap while the stream is still open", async () => {
    const start = performance.now();
    await waitForReveal(new Promise(() => {}), 40);
    expect(performance.now() - start).toBeGreaterThanOrEqual(35);
  });

  test("a stream that finishes after the cap does not resolve twice", async () => {
    let finish = () => {};
    const revealed = new Promise<void>((resolve) => {
      finish = resolve;
    });
    let resolved = 0;
    const pending = waitForReveal(revealed, 20).then(() => {
      resolved += 1;
    });
    await pending;
    finish();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(resolved).toBe(1);
  });
});
