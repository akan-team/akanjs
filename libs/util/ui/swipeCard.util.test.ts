import { describe, expect, test } from "bun:test";
import { calcSpeed, getSwipeDirection, normalize, rotationString, settings, translationString } from "./swipeCard.util";

describe("swipeCard.util", () => {
  test("reads a swipe direction from the dominant axis once it passes the threshold", () => {
    expect(getSwipeDirection({ x: 400, y: 100 })).toBe("right");
    expect(getSwipeDirection({ x: -400, y: 100 })).toBe("left");
    expect(getSwipeDirection({ x: 10, y: 400 })).toBe("up");
    expect(getSwipeDirection({ x: 10, y: -400 })).toBe("down");
    expect(getSwipeDirection({ x: 200, y: 100 })).toBe("none");
  });

  test("takes a per-card threshold without touching the shared default", () => {
    expect(getSwipeDirection({ x: 200, y: 0 }, 100)).toBe("right");
    expect(getSwipeDirection({ x: 200, y: 0 }, 500)).toBe("none");
    expect(settings.swipeThreshold).toBe(300);
  });

  test("measures speed in px/s with screen y flipped to point up", () => {
    expect(calcSpeed({ x: 0, y: 0, time: 0 }, { x: 50, y: -20, time: 500 })).toEqual({ x: 100, y: 40 });
  });

  test("normalizes a vector to the given length and formats CSS transforms", () => {
    expect(normalize({ x: 3, y: 4 }, 10)).toEqual({ x: 6, y: 8 });
    expect(translationString(1, -2)).toBe("translate(1px, -2px)");
    expect(rotationString(5)).toBe("rotate(5deg)");
  });
});
