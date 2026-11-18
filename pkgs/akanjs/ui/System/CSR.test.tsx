import "../../test/registerDom";
import { beforeAll, describe, expect, test } from "bun:test";
import type { CsrContextType, RouterInstance } from "akanjs/client";
import { type ReactNode, useEffect } from "react";
import { mount, setTestEnv } from "../testHelpers.fixture";

let CSR: typeof import("./CSR").CSR;
let client: typeof import("akanjs/client");

beforeAll(async () => {
  setTestEnv("csrtest");
  ({ CSR } = await import("./CSR"));
  client = await import("akanjs/client");
});

const frameOf = (name: string, calls: string[], idx: number, stackEntries: unknown[] = [], state: object = {}) => {
  const router: RouterInstance = {
    push: (href) => void calls.push(`${name} push ${href}`),
    replace: (href) => void calls.push(`${name} replace ${href}`),
    back: () => void calls.push(`${name} back`),
    refresh: () => void calls.push(`${name} refresh`),
  };
  const csr = {
    router,
    history: { current: { idx } },
    pathRoutes: [],
    stackEntries,
    frameRootRef: { current: null },
    topSafeAreaRef: { current: null },
    bottomSafeAreaRef: { current: null },
    frameLayout: { keyboard: { sticky: false, visible: false }, keyboardAccessory: { top: 0, height: 0 } },
    ...state,
  };
  return (
    <client.csrContext.Provider value={csr as unknown as CsrContextType}>
      <CSR.Wrapper appName="csrtest" lang="en">
        {null}
      </CSR.Wrapper>
    </client.csrContext.Provider>
  );
};

describe("CSR.Wrapper", () => {
  test("a frame mounted afresh, as a view's reload mounts one, is the frame the router drives", () => {
    const calls: string[] = [];
    const first = mount(frameOf("first", calls, 0));
    expect(client.router.canGoBack()).toBe(false);
    first.unmount();
    const second = mount(frameOf("second", calls, 1));

    client.router.push("/next");

    expect(calls).toEqual(["second push /en/next"]);
    expect(client.router.canGoBack()).toBe(true);
    second.unmount();
  });

  test("an empty top-left slot lets a click through to the chrome under it, and a filled one takes it", () => {
    const pathRoute = {
      path: "/:lang/a",
      pageState: { ...client.defaultPageState, topInset: 48 },
      renderRootLayouts: [],
      renderLayouts: [],
      renderPage: { kind: "page", render: () => null },
    };
    const location = { href: "/en/a", pathname: "/en/a", params: {}, searchParams: {}, pathRoute };
    const entries = [{ key: "a", location, pageType: "current", zIndex: 1 }];
    const frame = mount(frameOf("frame", [], 0, entries));
    const container = document.getElementById("topLeftActionContainer");
    const target = document.getElementById("topLeftActionContent-a");

    expect(container?.className).toContain("pointer-events-none");
    expect(target?.className).toContain("pointer-events-auto");
    frame.unmount();
  });

  test("a navbar riding its page has a box and fill of its own, and the layer around it lets a tap through", () => {
    const entryOf = (key: string, topInset: number, pageType: string, zIndex: number) => {
      const pathRoute = {
        path: `/:lang/${key}`,
        pageState: { ...client.defaultPageState, topInset, navbarMotion: "page" },
        renderRootLayouts: [],
        renderLayouts: [],
        renderPage: { kind: "page", render: () => null },
      };
      const location = { href: `/en/${key}`, pathname: `/en/${key}`, params: {}, searchParams: {}, pathRoute };
      return { key, location, pageType, zIndex };
    };
    const [under, top] = [entryOf("under", 0, "prev", 1), entryOf("top", 56, "current", 2)];
    const frame = mount(frameOf("frame", [], 1, [under, top], { location: top.location }));
    const layer = document.getElementById("topInsetContainer");
    const bar = document.getElementById("topInsetContent-top");

    expect(layer?.className).toContain("pointer-events-none");
    expect(layer?.className).toContain("bg-transparent");
    expect(bar?.className).toContain("bg-background");
    expect(bar?.className).toContain("pointer-events-auto");
    expect(bar?.style.height).toBe("56px");
    expect(document.getElementById("topInsetContent-under")?.style.height).toBe("0px");
    frame.unmount();
  });

  test("publishes what the current page registers for the agent, and parks the page kept under it", async () => {
    const { useAgentGate } = await import("use-agentic");
    const seen: Record<string, boolean | undefined> = {};
    const Probe = ({ name }: { name: string }) => {
      seen[name] = useAgentGate()?.active;
      return null;
    };
    const entryOf = (key: string, pageType: string, zIndex: number) => {
      const pathRoute = {
        path: `/:lang/${key}`,
        pageState: client.defaultPageState,
        renderRootLayouts: [],
        renderLayouts: [],
        renderPage: { kind: "page", render: () => <Probe name={key} /> },
      };
      const location = { href: `/en/${key}`, pathname: `/en/${key}`, params: {}, searchParams: {}, pathRoute };
      return { key, location, pageType, zIndex };
    };
    const [under, top] = [entryOf("under", "prev", 1), entryOf("top", "current", 2)];
    const frame = mount(frameOf("frame", [], 1, [under, top], { location: top.location, phase: "transitioning" }));

    expect(seen).toEqual({ under: false, top: true });
    frame.unmount();
  });

  test("the page under stays asleep while a switch in place draws its page ahead, and wakes under a slide", () => {
    const woken: string[] = [];
    const Under = () => {
      useEffect(() => void woken.push("under"), []);
      return null;
    };
    const locationOf = (segment: string, transition: "none" | "stack", render: () => ReactNode = () => null) => ({
      href: `/en/${segment}`,
      pathname: `/en/${segment}`,
      params: {},
      searchParams: {},
      pathRoute: {
        path: `/:lang/${segment}`,
        pageState: { ...client.defaultPageState, transition },
        renderRootLayouts: [],
        renderLayouts: [],
        renderPage: { kind: "page", render },
      },
    });
    const under = locationOf("under", "none", () => <Under />);
    const current = locationOf("current", "none");
    const frameWaitingOn = (pending: ReturnType<typeof locationOf>) =>
      frameOf(
        "frame",
        [],
        1,
        [
          { key: "under", location: under, pageType: "prev", zIndex: 0 },
          { key: "current", location: current, pageType: "current", zIndex: 1 },
          { key: "pending", location: pending, pageType: "pending", zIndex: 2 },
        ],
        { location: current, pendingLocation: pending, phase: "preparing" },
      );

    const drawnAhead = mount(frameWaitingOn(locationOf("tab", "none")));
    expect(woken).toEqual([]);
    drawnAhead.unmount();

    const sliding = mount(frameWaitingOn(locationOf("detail", "stack")));
    expect(woken).toEqual(["under"]);
    sliding.unmount();
  });
});
