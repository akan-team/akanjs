import { describe, expect, test } from "bun:test";

import { ServerClock } from "./serverClock";

const hour = 3600;
const serverNow = 1_800_000_000;
const deviceAt = (serverSec: number, aheadMs: number) => serverSec * 1000 + aheadMs;

describe("ServerClock", () => {
  test("a device whose clock was never measured reads a token's expiry as it stands", () => {
    const clock = new ServerClock();
    expect(clock.aheadMs).toBeNull();
    expect(clock.expiresAt(serverNow + hour, serverNow)).toBe((serverNow + hour) * 1000);
    expect(clock.doubts(serverNow, deviceAt(serverNow, 0))).toBe(false);
  });

  test("a token just answered places its expiry one lifetime after the asking, on a clock an hour slow or two hours fast", () => {
    for (const aheadMs of [-hour * 1000, 2 * hour * 1000]) {
      const clock = new ServerClock();
      const askedAt = deviceAt(serverNow, aheadMs);
      clock.measure(serverNow, askedAt);
      expect(clock.aheadMs).toBe(aheadMs);
      expect(clock.expiresAt(serverNow + hour, serverNow)).toBe(askedAt + hour * 1000);
    }
  });

  test("a clock fast by less than half the lifetime is taken as it reads, so the token is only renewed early", () => {
    const clock = new ServerClock(20 * 60 * 1000);
    expect(clock.expiresAt(serverNow + hour, serverNow)).toBe((serverNow + hour) * 1000);
    expect(new ServerClock(30 * 60 * 1000).expiresAt(serverNow + hour, serverNow)).toBe(
      (serverNow + hour) * 1000 + 30 * 60 * 1000,
    );
    expect(clock.expiresAt(serverNow + 7 * 24 * hour, serverNow)).toBe((serverNow + 7 * 24 * hour) * 1000);
  });

  test("a slow clock always moves the expiry earlier, however small the lag", () => {
    const clock = new ServerClock(-5 * 60 * 1000);
    expect(clock.expiresAt(serverNow + hour, serverNow)).toBe((serverNow + hour) * 1000 - 5 * 60 * 1000);
  });

  test("a token without an issue time is read by its expiry alone", () => {
    expect(new ServerClock(2 * hour * 1000).expiresAt(serverNow + hour)).toBe((serverNow + hour) * 1000);
  });

  test("a found token that reads younger than nothing is doubted, past a minute of slack", () => {
    const unmeasured = new ServerClock();
    expect(unmeasured.doubts(serverNow, deviceAt(serverNow, -59 * 1000))).toBe(false);
    expect(unmeasured.doubts(serverNow, deviceAt(serverNow, -61 * 1000))).toBe(true);
    expect(unmeasured.doubts(serverNow, deviceAt(serverNow + 30 * 60, -hour * 1000))).toBe(true);
    expect(unmeasured.doubts(serverNow, deviceAt(serverNow + 2 * hour, -hour * 1000))).toBe(false);

    const fast = new ServerClock(2 * hour * 1000);
    expect(fast.doubts(serverNow, deviceAt(serverNow + 600, 2 * hour * 1000))).toBe(false);
    expect(fast.doubts(serverNow, deviceAt(serverNow + 600, 0))).toBe(true);
  });

  test("conceding takes the doubted token at its youngest, and never reads the device as further ahead", () => {
    const fast = new ServerClock(2 * hour * 1000);
    fast.concede(serverNow, deviceAt(serverNow + 600, 0));
    expect(fast.aheadMs).toBe(600 * 1000);
    expect(fast.doubts(serverNow, deviceAt(serverNow + 600, 0))).toBe(false);

    const slow = new ServerClock(-hour * 1000);
    slow.concede(serverNow, deviceAt(serverNow + 600, 0));
    expect(slow.aheadMs).toBe(-hour * 1000);

    const unmeasured = new ServerClock();
    unmeasured.concede(serverNow, deviceAt(serverNow, -hour * 1000));
    expect(unmeasured.aheadMs).toBe(-hour * 1000);
  });
});
