import { describe, expect, test } from "bun:test";
import { RenderScope } from "akanjs/fetch";
import type { LayoutModule } from "../csrTypes";
import { layout, rootLayout } from "./routeBuilders";

describe("a layout's fallback stages", () => {
  test("render in the render scope, as every other stage does, and hand their props through", async () => {
    const seen: Record<string, unknown> = {};
    const mod = layout()
      .notFound(({ pathname }) => {
        seen.notFound = [RenderScope.active(), pathname];
        return "nf";
      })
      .error(async ({ digest }) => {
        await Promise.resolve();
        seen.error = [RenderScope.active(), digest];
        return "err";
      })
      .render(({ children }) => children)
      .toRouteModule() as LayoutModule;

    const props = { params: { lang: "en" }, searchParams: {}, pathname: "/en/missing" };
    expect(await mod.NotFound?.(props)).toBe("nf");
    expect(await mod.Error?.({ ...props, error: new Error("boom"), digest: "d1" })).toBe("err");
    expect(seen).toEqual({ notFound: [true, "/en/missing"], error: [true, "d1"] });
    expect(RenderScope.active()).toBe(false);
  });

  test("a root layout's fallback is scoped too", () => {
    let active = false;
    const mod = rootLayout()
      .notFound(() => {
        active = RenderScope.active();
        return null;
      })
      .render(({ children }) => children)
      .toRouteModule() as LayoutModule;
    mod.NotFound?.({ params: { lang: "en" }, searchParams: {}, pathname: "/en/x" });
    expect(active).toBe(true);
  });
});
