import { describe, expect, test } from "bun:test";
import type { Location, PageState, PathRoute } from "akanjs/client";
import { defaultPageState } from "akanjs/client";

process.env.AKAN_PUBLIC_APP_NAME = "test";
process.env.AKAN_PUBLIC_REPO_NAME = "akanjs";
process.env.AKAN_PUBLIC_SERVE_DOMAIN = "akanjs.com";
process.env.AKAN_PUBLIC_OPERATION_MODE = "local";

const pageState = (override: Partial<PageState> = {}): PageState => ({
  ...defaultPageState,
  ...override,
});

const route = (path: string, override: Partial<PathRoute> = {}): PathRoute => ({
  path,
  pathSegments: path.split("/").filter(Boolean),
  renderPage: { render: () => null },
  pageState: pageState(),
  renderRootLayouts: [],
  renderLayouts: [],
  ...override,
});

const location = (path: string, pathRoute = route(path)): Location => ({
  href: path,
  pathname: path,
  search: "",
  params: {},
  searchParams: {},
  pathRoute,
  hash: "",
});

describe("useFrameRuntime", () => {
  test("resolves keyboard offset by platform policy", async () => {
    const { resolveKeyboardFrame } = await import("./useFrameRuntime");

    expect(
      resolveKeyboardFrame({
        keyboardHeight: 320,
        bottomSafeArea: 20,
        visualViewportKeyboardHeight: 320,
        platformProfile: "ios",
        sticky: true,
      }),
    ).toMatchObject({ height: 320, offset: 320, visible: true, sticky: true });

    expect(
      resolveKeyboardFrame({
        keyboardHeight: 320,
        bottomSafeArea: 20,
        visualViewportKeyboardHeight: 180,
        platformProfile: "android",
        sticky: true,
      }),
    ).toMatchObject({ offset: 140 });

    expect(
      resolveKeyboardFrame({
        keyboardHeight: 320,
        bottomSafeArea: 20,
        visualViewportKeyboardHeight: 0,
        platformProfile: "ios",
        sticky: false,
      }),
    ).toMatchObject({ offset: 0, sticky: false });
  });

  test("uses visual viewport keyboard fallback on ios when native height is missing", async () => {
    const { resolveKeyboardFrame, resolveKeyboardLayout } = await import("./useFrameRuntime");

    const viewport = { width: 390, height: 844, visualWidth: 390, visualHeight: 544, visualOffsetTop: 0 };
    const keyboard = resolveKeyboardFrame({
      keyboardHeight: 0,
      bottomSafeArea: 20,
      visualViewportKeyboardHeight: 300,
      platformProfile: "ios",
      sticky: true,
    });
    const layout = resolveKeyboardLayout({ viewport, keyboard, accessoryHeight: 72, bottomSafeArea: 20 });

    expect(keyboard).toMatchObject({ height: 300, offset: 300, visible: true, sticky: true, source: "visualViewport" });
    expect(layout.keyboardAccessory).toMatchObject({ top: 472, bottom: 544, height: 72, visible: true });
  });

  test("resolves keyboard layout as a content viewport reducer", async () => {
    const { resolveKeyboardFrame, resolveKeyboardLayout } = await import("./useFrameRuntime");

    const viewport = { width: 390, height: 844, visualWidth: 390, visualHeight: 844, visualOffsetTop: 0 };
    const keyboard = resolveKeyboardFrame({
      keyboardHeight: 320,
      bottomSafeArea: 20,
      visualViewportKeyboardHeight: 320,
      platformProfile: "ios",
      sticky: true,
    });
    const layout = resolveKeyboardLayout({ viewport, keyboard, accessoryHeight: 72, bottomSafeArea: 20 });

    expect(layout.keyboardAccessory).toMatchObject({
      top: 452,
      bottom: 524,
      height: 72,
      visible: true,
      slotHeight: 72,
    });
    expect(layout.contentViewport).toMatchObject({ top: 0, bottom: 452, height: 452 });
  });

  test("keeps content viewport above keyboard accessory even while keyboard is hidden", async () => {
    const { resolveKeyboardFrame, resolveKeyboardLayout } = await import("./useFrameRuntime");

    const viewport = { width: 390, height: 844, visualWidth: 390, visualHeight: 844, visualOffsetTop: 0 };
    const keyboard = resolveKeyboardFrame({
      keyboardHeight: 0,
      bottomSafeArea: 20,
      visualViewportKeyboardHeight: 0,
      platformProfile: "ios",
      sticky: true,
    });
    const layout = resolveKeyboardLayout({ viewport, keyboard, accessoryHeight: 72, bottomSafeArea: 20 });

    expect(layout.keyboardAccessory).toMatchObject({ top: 752, bottom: 824, height: 72, visible: true });
    expect(layout.contentViewport.height).toBe(752);
  });

  test("keeps keyboard accessory mounted while keyboard state is frozen", async () => {
    const { resolveKeyboardFrame, resolveKeyboardLayout } = await import("./useFrameRuntime");

    const viewport = { width: 390, height: 844, visualWidth: 390, visualHeight: 844, visualOffsetTop: 0 };
    const keyboard = resolveKeyboardFrame({
      keyboardHeight: 320,
      bottomSafeArea: 20,
      visualViewportKeyboardHeight: 320,
      platformProfile: "ios",
      sticky: true,
      freeze: true,
    });
    const layout = resolveKeyboardLayout({ viewport, keyboard, accessoryHeight: 72, bottomSafeArea: 20 });

    expect(keyboard).toMatchObject({ offset: 0, visible: false, sticky: true, frozen: true });
    expect(layout.keyboardAccessory).toMatchObject({ top: 752, bottom: 824, height: 72, visible: true });
  });

  test("uses max keyboard accessory slot height for route layout", async () => {
    const { resolveKeyboardAccessoryHeight } = await import("./useFrameRuntime");

    expect(
      resolveKeyboardAccessoryHeight("/chat", {
        "/chat": {
          input: { type: "bottomInset", role: "keyboardAccessory", height: 72, source: "bottomInset" },
          toolbar: { type: "bottomInset", role: "keyboardAccessory", estimatedHeight: 48, source: "bottomInset" },
          tab: { type: "bottomInset", role: "bottomChrome", height: 64, source: "bottomTab" },
        },
      }),
    ).toBe(72);
  });

  test("keeps inset reservation explicit while preserving the base page state", async () => {
    const { applyFrameSlots } = await import("./useFrameRuntime");

    const activeRoute = route("/chat", { pageState: pageState({ bottomInset: 0 }) });
    const base = pageState({ bottomInset: 0 });
    const resolved = applyFrameSlots(
      activeRoute,
      base,
      {
        "/chat": {
          input: {
            type: "bottomInset",
            role: "keyboardAccessory",
            height: 72,
            source: "bottomInset",
          },
        },
      },
      [activeRoute],
      new Set(["/chat"]),
    );

    expect(resolved.bottomInset).toBe(0);
    expect(base.bottomInset).toBe(0);
  });

  test("keeps cached layout slots but excludes inactive page-scoped slots", async () => {
    const { getFrameSlotsForPath } = await import("./useFrameRuntime");

    const layout = { render: () => null };
    const chatRoute = route("/chat", { renderLayouts: [layout] });
    const tabRoute = route("/tab", { renderLayouts: [layout] });
    const slots = getFrameSlotsForPath(
      tabRoute,
      {
        "/chat": {
          input: {
            type: "bottomInset",
            role: "keyboardAccessory",
            height: 72,
            source: "bottomInset",
            scope: "page",
          },
          tab: {
            type: "bottomInset",
            role: "bottomChrome",
            height: 64,
            source: "bottomTab",
            scope: "layout",
            cache: true,
          },
        },
      },
      [chatRoute, tabRoute],
      new Set(["/tab"]),
    );

    expect(slots).toHaveLength(1);
    expect(slots[0]?.source).toBe("bottomTab");
  });

  test("keeps page-scoped slots for visible previous pages during transitions", async () => {
    const { getFrameSlotsForPath } = await import("./useFrameRuntime");

    const prevRoute = route("/list");
    const currentRoute = route("/list/detail");
    const slots = getFrameSlotsForPath(
      prevRoute,
      {
        "/list": {
          navbar: {
            type: "topInset",
            role: "topChrome",
            height: 48,
            source: "navbar",
            scope: "page",
          },
        },
      },
      [prevRoute, currentRoute],
      new Set(["/list/detail", "/list"]),
    );

    expect(slots).toHaveLength(1);
    expect(slots[0]?.source).toBe("navbar");
  });

  test("applies pending frame slots only to the pending route", async () => {
    const { resolveFramePageStateMap } = await import("./useFrameRuntime");

    const listRoute = route("/trips", { pageState: pageState({ bottomInset: 64 }) });
    const detailRoute = route("/trips/detail", { pageState: pageState({ bottomInset: 192 }) });
    const resolved = resolveFramePageStateMap({
      pathRoutes: [listRoute, detailRoute],
      frameSlots: {
        "/trips": {
          tab: { type: "bottomInset", role: "bottomChrome", height: 64, source: "bottomTab" },
        },
      },
      pendingFrameSlots: {
        "/trips/detail": {
          sheet: { type: "bottomInset", role: "bottomChrome", height: 192, source: "bottomInset" },
        },
      },
      pendingPath: "/trips/detail",
      visiblePaths: ["/trips", "/trips/detail"],
      basePageStateMap: new WeakMap(),
    });

    expect(resolved.get("/trips")?.bottomInset).toBe(64);
    expect(resolved.get("/trips/detail")?.bottomInset).toBe(192);
  });

  test("marks pending frame ready with measured or fallback heights", async () => {
    const { isPendingFrameReady, PENDING_FRAME_READY_MAX_TIMEOUT_MS, PENDING_FRAME_READY_TIMEOUT_MS } = await import(
      "./useFrameRuntime"
    );

    expect(
      isPendingFrameReady({
        path: "/trips/detail",
        pendingFrameSlots: {
          "/trips/detail": {
            sheet: { type: "bottomInset", role: "bottomChrome", height: 192, source: "bottomInset" },
          },
        },
        elapsedMs: 16,
      }),
    ).toBe(true);
    expect(
      isPendingFrameReady({
        path: "/trips/detail",
        pendingFrameSlots: { "/trips/detail": {} },
        elapsedMs: PENDING_FRAME_READY_TIMEOUT_MS,
      }),
    ).toBe(true);
    expect(
      isPendingFrameReady({
        path: "/trips/detail",
        pendingFrameSlots: {
          "/trips/detail": {
            sheet: { type: "bottomInset", role: "bottomChrome", source: "bottomInset" },
          },
        },
        elapsedMs: PENDING_FRAME_READY_MAX_TIMEOUT_MS,
      }),
    ).toBe(true);
  });

  test("creates transition plans with fixed frame snapshots", async () => {
    const { createFrameSnapshot, createTransitionPlan } = await import("./useFrameRuntime");

    const fromRoute = route("/trips", { pageState: pageState({ bottomInset: 64 }) });
    const toRoute = route("/trips/detail", { pageState: pageState({ bottomInset: 192, transition: "stack" }) });
    const from = location("/trips", fromRoute);
    const to = location("/trips/detail", toRoute);
    const viewport = { width: 390, height: 844, visualWidth: 390, visualHeight: 844, visualOffsetTop: 0 };
    const fromFrame = createFrameSnapshot({
      location: from,
      pageState: fromRoute.pageState,
      viewport,
      frameSlots: [{ type: "bottomInset", role: "bottomChrome", height: 64, source: "bottomTab" }],
    });
    const toFrame = createFrameSnapshot({
      location: to,
      pageState: toRoute.pageState,
      viewport,
      frameSlots: [{ type: "bottomInset", role: "bottomChrome", height: 192, source: "bottomInset" }],
    });
    const plan = createTransitionPlan({
      id: 1,
      intent: { id: 1, kind: "push", from, to, scrollTop: 0, createdAt: Date.now() },
      type: "stack",
      direction: "forward",
      fromFrame,
      toFrame,
    });

    expect(plan.actions.map((action) => action.type)).toEqual([
      "safeArea",
      "topChrome",
      "bottomChrome",
      "keyboard",
      "page",
    ]);
    expect(plan.fromFrame.pageState.bottomInset).toBe(64);
    expect(plan.toFrame.pageState.bottomInset).toBe(192);
  });
});
