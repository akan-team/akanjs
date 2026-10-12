import "../../test/registerDom";
import { beforeAll, describe, expect, test } from "bun:test";
import type { ReactNode } from "react";
import { renderToReadableStream } from "react-dom/server.browser";
import { mount, setTestEnv } from "../testHelpers.fixture";

let Layout: typeof import("./index").Layout;

beforeAll(async () => {
  setTestEnv("layouttest");
  process.env.AKAN_PUBLIC_RENDER_ENV = "ssr";
  ({ Layout } = await import("./index"));
});

const renderToText = async (node: ReactNode) => new Response(await renderToReadableStream(node)).text();

describe("Layout chrome on the server", () => {
  test("the navbar is in the server HTML, in its slot's box, with its title and side slots", async () => {
    const html = await renderToText(
      <Layout.Navbar title="Ticket" left={<i>L</i>} right={<b>R</b>} back backFallback="/org">
        <span>extra</span>
      </Layout.Navbar>,
    );

    expect(html).toContain('data-akan-frame-fallback="topInset"');
    //? Below the safe area, moved down by the keyboard's pan on iOS, and clipped when its inset is 0 at a breakpoint.
    expect(html).toContain("top:calc(var(--akan-top-safe-area) + var(--akan-viewport-offset-top, 0px))");
    expect(html).toContain('data-akan-frame-fallback="topInset" class="fixed inset-x-0 z-10 isolate overflow-hidden');
    expect(html).toContain(">Ticket</div>");
    expect(html).toContain("<i>L</i>");
    expect(html).toContain("<b>R</b>");
    expect(html).toContain("<span>extra</span>");
    expect(html).toContain('data-akan-frame-fallback="topLeftAction"');
    expect(html).toContain('<button type="button"');
  });

  test("bottom chrome is in the server HTML above the bottom safe area", async () => {
    const html = await renderToText(
      <>
        <Layout.BottomInset>
          <p>composer</p>
        </Layout.BottomInset>
        <Layout.BottomInset keyboardSticky>
          <p>sticky</p>
        </Layout.BottomInset>
      </>,
    );

    expect(html).toContain('data-akan-frame-fallback="bottomInset"');
    expect(html).toContain('data-akan-frame-fallback="keyboardInset"');
    expect(html).toContain("bottom:var(--akan-bottom-safe-area)");
    expect(html).toContain("<p>composer</p>");
    expect(html).toContain("<p>sticky</p>");
  });

  test("once mounted, the chrome moves into the frame's slot and leaves no fallback behind", () => {
    const slot = document.createElement("div");
    slot.id = "topInsetContent";
    document.body.appendChild(slot);
    const { container, unmount } = mount(<Layout.Navbar title="Ticket" />);

    expect(slot.textContent).toBe("Ticket");
    expect(container.querySelector("[data-akan-frame-fallback]")).toBeNull();
    unmount();
    slot.remove();
  });
});

describe("Layout.BottomTab", () => {
  test("lights a tab by segment, exactly or over extra paths, marks it the current page, and keeps badges under renderTab", async () => {
    const { st } = await import("akanjs/store");
    const { registerClientRuntime } = await import("akanjs/client");
    registerClientRuntime({ usePage: () => ({ path: "/", lang: "en", l: (key: string) => key }) } as never);
    const render = async (pathname: string, renderTab?: (tab: { name: ReactNode }) => ReactNode) => {
      st.set({ pathname } as never);
      const { container, unmount } = await mount(
        <Layout.BottomTab
          tabs={[
            { name: "Home", icon: <i />, href: "/org/1", exact: true },
            { name: "Tasks", icon: <i />, href: "/org/1/tasks", notiCount: 3 },
            { name: "More", icon: <i />, href: "/org/1/more", match: ["/org/1/members", "/org/1/billing"] },
          ]}
          renderTab={renderTab ? (tab) => renderTab(tab) : undefined}
        />,
      );
      const html = container.innerHTML;
      unmount();
      return html;
    };
    const current = (html: string) => {
      const tag = html.match(/<a\b[^>]*>/g)?.find((anchor) => anchor.includes('aria-current="page"'));
      return tag ? (/href="([^"]+)"/.exec(tag)?.[1] ?? null) : null;
    };

    expect(current(await render("/en/org/1"))).toBe("/en/org/1");
    expect(current(await render("/en/org/1/tasks/42"))).toBe("/en/org/1/tasks");
    expect(current(await render("/en/org/1/billing/plan"))).toBe("/en/org/1/more");
    expect(current(await render("/en/org/12"))).toBeNull();
    const custom = await render("/en/org/1/tasks", (tab) => <b>{tab.name}</b>);
    expect(custom).toContain("<b>Tasks</b>");
    expect(custom).toContain(">3</span>");
  });

  test("is a named navigation landmark, and takes each tab's drawing as nodes a server component can pass", async () => {
    const { st } = await import("akanjs/store");
    st.set({ pathname: "/en/org/1/tasks" } as never);
    const { container, unmount } = await mount(
      <Layout.BottomTab
        label="Sections"
        tabs={[
          { name: "Home", href: "/org/1", exact: true, content: <u>home</u> },
          { name: "Tasks", href: "/org/1/tasks", notiCount: 2, content: <u>tasks</u>, activeContent: <s>tasks</s> },
        ]}
      />,
    );
    const html = container.innerHTML;
    unmount();

    expect(html).toContain('<nav aria-label="Sections"');
    expect(html).toContain("<u>home</u>");
    expect(html).toContain("<s>tasks</s>");
    expect(html).not.toContain("<u>tasks</u>");
    expect(html).toContain(">2</span>");
  });
});
