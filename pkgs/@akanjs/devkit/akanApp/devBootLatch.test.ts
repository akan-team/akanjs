import { describe, expect, test } from "bun:test";
import { DevBootLatch } from "./devBootLatch";

const latch = (waitMs = 60_000) => {
  const booted: number[] = [];
  return { booted, latch: new DevBootLatch(() => booted.push(Date.now()), { waitMs }) };
};

describe("DevBootLatch", () => {
  test("opens once the app serves and its boot builds have settled, in either order", () => {
    const readyFirst = latch();
    readyFirst.latch.ready();
    expect(readyFirst.booted).toHaveLength(0);
    readyFirst.latch.armed();
    expect(readyFirst.booted).toHaveLength(1);

    const armedFirst = latch();
    armedFirst.latch.armed();
    expect(armedFirst.booted).toHaveLength(0);
    armedFirst.latch.ready();
    expect(armedFirst.booted).toHaveLength(1);
  });

  test("opens once per session, however often the app restarts or the builder re-arms", () => {
    const { booted, latch: boot } = latch();
    boot.armed();
    boot.ready();
    boot.ready();
    boot.armed();
    expect(booted).toHaveLength(1);
  });

  test("opens after its wait past ready when the builder never reports", async () => {
    const { booted, latch: boot } = latch(20);
    boot.ready();
    await Bun.sleep(60);
    expect(booted).toHaveLength(1);
  });
});
