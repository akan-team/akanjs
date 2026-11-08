import { describe, expect, test } from "bun:test";
import { dayjs } from "akanjs/base";

import { seoulTime } from "./seoulTime";

describe("seoulTime", () => {
  test("reads an instant as Seoul's wall clock, whatever zone the runtime is in", () => {
    const instant = dayjs("2026-10-10T15:30:00Z");
    expect(seoulTime(instant).format("YYYY-MM-DD HH:mm")).toBe("2026-10-11 00:30");
  });

  test("puts two instants on the same Seoul day when they share one, and apart when they do not", () => {
    const lateEvening = seoulTime(dayjs("2026-10-10T14:00:00Z"));
    const justBefore = seoulTime(dayjs("2026-10-10T14:59:00Z"));
    const pastMidnight = seoulTime(dayjs("2026-10-10T15:01:00Z"));
    expect(lateEvening.isSame(justBefore, "day")).toBe(true);
    expect(justBefore.isSame(pastMidnight, "day")).toBe(false);
  });
});
