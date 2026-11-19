import "../test/registerDom";
import { beforeAll, describe, expect, test } from "bun:test";
import type { Location, PageState, RouteState, UseCsrTransition } from "akanjs/client";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { setTestEnv } from "../ui/testHelpers.fixture";

let useCsrTransitions: typeof import("./useCsrTransitions").useCsrTransitions;
let defaultPageState: PageState;

beforeAll(async () => {
  setTestEnv("csrtransitionstest");
  ({ useCsrTransitions } = await import("./useCsrTransitions"));
  ({ defaultPageState } = await import("akanjs/client"));
});

const locationOf = (pageState: Partial<PageState>) =>
  ({ pathRoute: { pageState: { ...defaultPageState, ...pageState } } }) as unknown as Location;

const transitionsOf = (pageState: Partial<PageState>, prevPageState: Partial<PageState>) => {
  const routeState = {
    clientWidth: 400,
    clientHeight: 800,
    location: locationOf(pageState),
    prevLocation: locationOf(prevPageState),
    history: { current: { type: "back" } },
    onBack: { current: {} },
    pageContentRef: { current: null },
    prevPageContentRef: { current: null },
    frameLayout: {
      keyboard: { sticky: false, avoidsContent: false },
      keyboardAccessory: { height: 0 },
      contentViewport: { height: 800 },
      viewport: { height: 800 },
    },
  } as unknown as RouteState;
  const seen: { styles?: ReturnType<typeof useCsrTransitions> } = {};
  const Probe = () => {
    seen.styles = useCsrTransitions(routeState);
    return null;
  };
  const root = createRoot(document.createElement("div"));
  act(() => root.render(<Probe />));
  const styles = seen.styles;
  if (!styles) throw new Error("the transitions did not render");
  return { styles, unmount: () => act(() => root.unmount()) };
};

interface Fluid {
  get: () => unknown;
  source?: unknown;
  calc?: unknown;
  advance?: () => void;
}
const isFluid = (value: unknown): value is Fluid => !!value && typeof value === "object" && "get" in value;
//? An interpolation nothing draws is not observed, so it reads its sources again only when advanced, innermost first.
const readFluid = (value: Fluid): unknown => {
  if (value.calc) {
    for (const source of [value.source].flat()) if (isFluid(source)) readFluid(source);
    value.advance?.();
  }
  return value.get();
};
const valueOf = (style: unknown, key: string) => {
  const value = (style as Record<string, unknown> | undefined)?.[key];
  return isFluid(value) ? readFluid(value) : value;
};

const at = (transition: UseCsrTransition, unit: number) => {
  transition.transUnit.set(unit);
  return {
    bar: (key: string) => valueOf(transition.topInset?.contentStyle, key),
    barUnder: (key: string) => valueOf(transition.topInset?.prevContentStyle, key),
    layer: (key: string) => valueOf(transition.topInset?.containerStyle, key),
  };
};

describe("useCsrTransitions navbar", () => {
  test("on a stack slide the bar of a page that rides goes with its page, and the bar under is cut where it is covered", () => {
    const { styles, unmount } = transitionsOf({ topInset: 56, navbarMotion: "page" }, { topInset: 48 });
    const half = at(styles.stack, 200);

    expect(half.bar("translateX")).toBe(200);
    expect(half.bar("opacity")).toBeUndefined();
    expect(half.barUnder("translateX")).toBe(-40);
    //? The bar under ends at 400 - 40 = 360 on screen and the page coming in starts at 200: 160px of it is covered.
    expect(half.barUnder("clipPath")).toBe("inset(0px 160px 0px 0px)");
    expect(half.layer("height")).toBe(56);
    expect(at(styles.stack, 400).barUnder("clipPath")).toBe("inset(0px 0px 0px 0px)");
    unmount();
  });

  test("which bar moves is the page on top's to say: a crossfading page over a riding one fades the two bars", () => {
    const { styles, unmount } = transitionsOf({ topInset: 56 }, { topInset: 48, navbarMotion: "page" });
    const half = at(styles.stack, 200);

    expect(half.bar("opacity")).toBe(0.5);
    expect(half.barUnder("opacity")).toBe(0.5);
    expect(half.barUnder("clipPath")).toBeUndefined();
    expect(half.layer("height")).toBe(52);
    unmount();
  });

  test("a sheet rising with its bar cuts the bar under from the sheet's top edge down", () => {
    const { styles, unmount } = transitionsOf(
      { topInset: 56, navbarMotion: "page", topSafeArea: 20 },
      { topInset: 48, topSafeArea: 20 },
    );

    expect(at(styles.bottomUp, 800).bar("translateY")).toBe(800);
    expect(at(styles.bottomUp, 800).barUnder("clipPath")).toBe("inset(0px 0px 0px 0px)");
    expect(at(styles.bottomUp, 50).barUnder("clipPath")).toBe("inset(0px 0px 18px 0px)");
    expect(at(styles.bottomUp, 0).barUnder("clipPath")).toBe("inset(0px 0px 48px 0px)");
    unmount();
  });
});
