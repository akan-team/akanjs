import "../../test/registerDom";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import type { PageState, PathContextType } from "akanjs/client";
import { act, type ReactNode } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToReadableStream } from "react-dom/server.browser";
import { mount, setTestEnv } from "../testHelpers.fixture";

let FrameSlotPortal: typeof import("./FrameSlotPortal").FrameSlotPortal;
let Layout: typeof import("./index").Layout;
let SSR: typeof import("../System/SSR").SSR;
let client: typeof import("akanjs/client");
let base: typeof import("akanjs/base");

beforeAll(async () => {
  setTestEnv("frameslotportaltest");
  process.env.AKAN_PUBLIC_RENDER_ENV = "ssr";
  ({ FrameSlotPortal } = await import("./FrameSlotPortal"));
  ({ Layout } = await import("./index"));
  ({ SSR } = await import("../System/SSR"));
  client = await import("akanjs/client");
  base = await import("akanjs/base");
});

const renderToText = async (node: ReactNode) => new Response(await renderToReadableStream(node)).text();

const slots: HTMLElement[] = [];
const slotOf = (id: string) => {
  const slot = document.createElement("div");
  slot.id = id;
  document.body.appendChild(slot);
  slots.push(slot);
  return slot;
};
afterEach(() => {
  for (const slot of slots.splice(0)) slot.remove();
});

describe("FrameSlotPortal on the server", () => {
  test("draws the chrome in place in its slot's box, and lets it through the frame's top slots while they are empty", async () => {
    const html = await renderToText(
      <>
        <FrameSlotPortal slot="topInset">
          <b>bar</b>
        </FrameSlotPortal>
        <FrameSlotPortal slot="topLeftAction">
          <i>back</i>
        </FrameSlotPortal>
      </>,
    );

    expect(html).toContain('data-akan-frame-fallback="topInset"');
    expect(html).toContain("top:calc(var(--akan-top-safe-area) + var(--akan-viewport-offset-top, 0px))");
    expect(html).toContain(
      "#topInsetContainer:has(> #topInsetContent:empty){background-color:transparent;pointer-events:none}",
    );
    expect(html).toContain("#topLeftActionContainer:has(> #topLeftActionContent:empty){pointer-events:none}");
    expect(html).toContain("<b>bar</b>");
    expect(html).toContain("<i>back</i>");
  });

  test("bottom chrome needs no such rule: its slots are already transparent and let clicks through", async () => {
    const html = await renderToText(
      <FrameSlotPortal slot="bottomInset">
        <p>composer</p>
      </FrameSlotPortal>,
    );

    expect(html).not.toContain("<style");
    expect(html).toContain("bottom:var(--akan-bottom-safe-area)");
    expect(html).toContain("<p>composer</p>");
  });
});

describe("FrameSlotPortal through hydration", () => {
  const rendered: { container: HTMLElement; root?: Root }[] = [];
  afterEach(async () => {
    for (const { container, root } of rendered.splice(0)) {
      if (root) await act(async () => root.unmount());
      container.remove();
    }
  });
  const serverRendered = async (node: ReactNode) => {
    const page: { container: HTMLElement; root?: Root } = { container: document.createElement("div") };
    page.container.innerHTML = await renderToText(node);
    document.body.appendChild(page.container);
    rendered.push(page);
    return page;
  };
  const pageOf = ({ back = true, composer = false } = {}) => {
    const pageState: PageState = { ...client.defaultPageState, topInset: 48, bottomInset: 72 };
    return (
      <SSR.Wrapper appName="frameslotportaltest" lang="en" path="/chat" pageState={pageState}>
        <main>
          <Layout.Navbar title="Host" back={back} />
          {composer ? (
            <Layout.BottomInset keyboardSticky>
              <input aria-label="Message" />
            </Layout.BottomInset>
          ) : null}
        </main>
      </SSR.Wrapper>
    );
  };

  test("the server's top bar is visible and clickable before hydration, and what was typed and focused in the chrome survives it", async () => {
    const page = await serverRendered(pageOf({ composer: true }));
    const { container } = page;
    const topInsetContainer = container.querySelector("#topInsetContainer") as HTMLElement;
    const topInsetBox = container.querySelector('[data-akan-frame-fallback="topInset"]') as HTMLElement;
    const keyboardSlot = container.querySelector("#keyboardInsetContent") as HTMLElement;
    const input = container.querySelector("input") as HTMLInputElement;

    expect(topInsetBox.textContent).toBe("Host");
    expect(container.querySelector("#topInsetContent")?.childElementCount).toBe(0);
    expect(getComputedStyle(topInsetContainer).pointerEvents).toBe("none");
    expect(getComputedStyle(topInsetContainer).backgroundColor).toBe("transparent");
    input.focus();
    input.value = "on my way";
    input.setSelectionRange(3, 5);

    const failures: unknown[] = [];
    const consoleError = console.error;
    console.error = (...args: unknown[]) => {
      if (/hydrat|did not match/i.test(String(args[0]))) failures.push(args[0]);
    };
    try {
      await act(async () => {
        page.root = hydrateRoot(container, pageOf({ composer: true }), {
          onRecoverableError: (error) => failures.push(error),
        });
      });
    } finally {
      console.error = consoleError;
    }

    expect(failures).toEqual([]);
    expect(keyboardSlot.querySelector("input")).toBe(input);
    expect(input.value).toBe("on my way");
    expect(document.activeElement).toBe(input);
    expect([input.selectionStart, input.selectionEnd]).toEqual([3, 5]);
    expect(container.querySelector("#topInsetContent")?.textContent).toBe("Host");
    expect(container.querySelector("#topLeftActionContent")?.childElementCount).toBe(1);
    expect(topInsetBox.childElementCount).toBe(0);
    expect(getComputedStyle(topInsetContainer).pointerEvents).not.toBe("none");

    await act(async () => page.root?.render(pageOf()));
    expect(keyboardSlot.childElementCount).toBe(0);
    expect(container.querySelector('[data-akan-frame-fallback="keyboardInset"]')).toBeNull();
    expect(container.querySelector("#topInsetContent")?.textContent).toBe("Host");
  });

  test("an empty top-left action slot keeps letting clicks through to the bar under it after hydration", async () => {
    const page = await serverRendered(pageOf({ back: false }));
    await act(async () => {
      page.root = hydrateRoot(page.container, pageOf({ back: false }));
    });
    const topLeftActionContainer = page.container.querySelector("#topLeftActionContainer") as HTMLElement;

    expect(page.container.querySelector("#topInsetContent")?.textContent).toBe("Host");
    expect(page.container.querySelector("#topLeftActionContent")?.childElementCount).toBe(0);
    expect(getComputedStyle(topLeftActionContainer).pointerEvents).toBe("none");
  });

  test("moves with moveBefore where the browser has it, which keeps focus and scroll without help", () => {
    const slot = slotOf("topInsetContent");
    const moved: Node[] = [];
    Object.defineProperty(slot, "moveBefore", {
      value: (node: Node, child: Node | null) => {
        moved.push(node);
        slot.insertBefore(node, child);
      },
    });
    const { container, unmount } = mount(
      <FrameSlotPortal slot="topInset">
        <b>bar</b>
      </FrameSlotPortal>,
    );

    expect(moved).toHaveLength(1);
    expect(slot.textContent).toBe("bar");
    expect(container.querySelector('[data-akan-frame-fallback="topInset"]')?.childElementCount).toBe(0);
    unmount();
    expect(slot.textContent).toBe("");
  });
});

describe("FrameSlotPortal in a CSR frame", () => {
  beforeAll(() => {
    process.env.AKAN_PUBLIC_RENDER_ENV = "csr";
    base.resetEnvCache();
  });
  afterAll(() => {
    process.env.AKAN_PUBLIC_RENDER_ENV = "ssr";
    base.resetEnvCache();
  });

  test("portals into the slot of the stacked page it belongs to, and draws nothing in place", () => {
    const own = slotOf("topInsetContent-second");
    const under = slotOf("topInsetContent-first");
    const path = { location: { pathRoute: { path: "/memo" } }, pageKey: "second" };
    const { container, unmount } = mount(
      <client.pathContext.Provider value={path as unknown as PathContextType}>
        <FrameSlotPortal slot="topInset">
          <b>bar</b>
        </FrameSlotPortal>
      </client.pathContext.Provider>,
    );

    expect(own.innerHTML).toBe("<b>bar</b>");
    expect(under.innerHTML).toBe("");
    expect(container.innerHTML).toBe("");
    unmount();
    expect(own.innerHTML).toBe("");
  });
});
