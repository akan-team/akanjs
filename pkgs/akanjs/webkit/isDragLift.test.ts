import { describe, expect, test } from "bun:test";
import { isDragLift } from "./isDragLift";

describe("isDragLift", () => {
  test("a pointer, touch or mouse let go is a lift", () => {
    for (const type of ["pointerup", "touchend", "mouseup"]) expect(isDragLift(new Event(type))).toBe(true);
  });

  test("a drag taken over or cut short, with the finger still down, is not", () => {
    for (const type of ["pointercancel", "touchcancel", "lostpointercapture", "pointermove"])
      expect(isDragLift(new Event(type))).toBe(false);
    expect(isDragLift(undefined)).toBe(false);
  });
});
