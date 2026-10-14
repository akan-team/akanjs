import "../../test/registerDom";
import { beforeAll, describe, expect, test } from "bun:test";
import type { CsrContextType, RouterInstance } from "akanjs/client";
import { mount, setTestEnv } from "../testHelpers.fixture";

let CSR: typeof import("./CSR").CSR;
let client: typeof import("akanjs/client");

beforeAll(async () => {
  setTestEnv("csrtest");
  ({ CSR } = await import("./CSR"));
  client = await import("akanjs/client");
});

const frameOf = (name: string, calls: string[], idx: number, stackEntries: unknown[] = []) => {
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
});
