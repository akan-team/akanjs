import { describe, expect, test } from "bun:test";
import { CsrPageReadiness } from "./csrPageReadiness";

describe("CsrPageReadiness", () => {
  test("a page counts as drawn once a layer has reported and none of them shows its fallback", () => {
    expect(CsrPageReadiness.isDrawn("/home/news")).toBe(false);
    CsrPageReadiness.report("/home/news", "layout", true);
    CsrPageReadiness.report("/home/news", "page", false);
    expect(CsrPageReadiness.isDrawn("/home/news")).toBe(false);
    CsrPageReadiness.report("/home/news", "layout", false);
    expect(CsrPageReadiness.isDrawn("/home/news")).toBe(true);
  });

  test("a page whose layers all left, hidden or unmounted, is not drawn until they report again", () => {
    CsrPageReadiness.report("/home/org", "layout", false);
    CsrPageReadiness.drop("/home/org", "layout");
    expect(CsrPageReadiness.isDrawn("/home/org")).toBe(false);
    CsrPageReadiness.drop("/home/org", "layout");
    expect(CsrPageReadiness.isDrawn("/home/org")).toBe(false);
  });
});
