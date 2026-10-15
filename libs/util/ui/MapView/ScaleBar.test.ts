import { describe, expect, test } from "bun:test";
import { computeScale } from "./ScaleBar";

describe("computeScale", () => {
  test("picks the largest round distance that fits the bar at the live zoom", () => {
    expect(computeScale(13, 37.56)).toEqual({ barWidthPx: 66, label: "1 km" });
    expect(computeScale(14, 37.56)).toEqual({ barWidthPx: 66, label: "500 m" });
    expect(computeScale(18, 37.56)).toEqual({ barWidthPx: 42, label: "20 m" });
  });

  test("shrinks the distance toward the poles, where a pixel covers less ground", () => {
    expect(computeScale(10, 0).label).toBe("10 km");
    expect(computeScale(10, 60).label).toBe("5 km");
  });
});
