import { describe, expect, test } from "bun:test";
import type { Location, RouteRender } from "akanjs/client";
import { CsrPageReadiness } from "./csrPageReadiness";

const locationOf = (renders: { root?: RouteRender[]; layouts?: RouteRender[]; page: RouteRender }) =>
  ({
    pathRoute: {
      renderRootLayouts: renders.root ?? [],
      renderLayouts: renders.layouts ?? [],
      renderPage: renders.page,
    },
  }) as unknown as Location;

describe("CsrPageReadiness", () => {
  test("a page counts as drawn once a layer has reported and none of them shows its fallback", () => {
    expect(CsrPageReadiness.isDrawn("entry-1")).toBe(false);
    CsrPageReadiness.report("entry-1", "layout", true);
    CsrPageReadiness.report("entry-1", "page", false);
    expect(CsrPageReadiness.isDrawn("entry-1")).toBe(false);
    CsrPageReadiness.report("entry-1", "layout", false);
    expect(CsrPageReadiness.isDrawn("entry-1")).toBe(true);
  });

  test("a page whose layers all left, hidden or unmounted, is not drawn until they report again", () => {
    CsrPageReadiness.report("entry-2", "layout", false);
    CsrPageReadiness.drop("entry-2", "layout");
    expect(CsrPageReadiness.isDrawn("entry-2")).toBe(false);
    CsrPageReadiness.drop("entry-2", "layout");
    expect(CsrPageReadiness.isDrawn("entry-2")).toBe(false);
  });

  test("a page draws later under an async render or a guard, a root layout's guard included", () => {
    const sync: RouteRender = { render: () => null };
    const guarded: RouteRender = { render: () => null, guard: async () => undefined };
    expect(CsrPageReadiness.drawsLater(locationOf({ layouts: [sync], page: sync }))).toBe(false);
    expect(CsrPageReadiness.drawsLater(locationOf({ page: { render: async () => null } }))).toBe(true);
    expect(CsrPageReadiness.drawsLater(locationOf({ layouts: [{ ...sync, isAsync: true }], page: sync }))).toBe(true);
    expect(CsrPageReadiness.drawsLater(locationOf({ root: [guarded], page: sync }))).toBe(true);
    expect(CsrPageReadiness.drawsLater(locationOf({ root: [{ render: async () => null }], page: sync }))).toBe(false);
  });
});
