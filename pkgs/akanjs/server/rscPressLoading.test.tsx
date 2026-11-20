import "../test/registerDom";
import { afterEach, describe, expect, test } from "bun:test";
import { act, type ReactNode, Suspense, useState } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { PendingNavigation, type PendingNavigationEntry } from "../client/pendingNavigation";
import { AkanPressLoading } from "./rscPressLoading";

const pattern = "/:lang/chat/:channelId";
const from = "http://localhost/en/chat/a";
const tick = (ms: number) => act(() => new Promise<void>((done) => setTimeout(done, ms)));

const Counter = () => {
  const [count, setCount] = useState(0);
  return (
    <button type="button" onClick={() => setCount(count + 1)}>
      count:{count}
    </button>
  );
};

const Page = ({ delayMs = 0, shadowedBy = [] }: { delayMs?: number; shadowedBy?: string[] }): ReactNode => (
  <Suspense fallback={<i>skeleton</i>}>
    <AkanPressLoading pattern={pattern} shadowedBy={shadowedBy} delayMs={delayMs} />
    <Counter />
  </Suspense>
);

const mount = (node: ReactNode) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(node));
  const shown = () =>
    [...container.children]
      .filter((child) => (child as HTMLElement).style.display !== "none")
      .map((child) => child.textContent)
      .join("|");
  return {
    container,
    shown,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
};

//? Async: beginning or ending a navigation settles the promise the page before it suspended on, read a microtask later.
const press = async (href: string, option: { traversal?: boolean; waits?: boolean } = {}) => {
  let entry: PendingNavigationEntry | undefined;
  await act(async () => {
    entry = PendingNavigation.begin(href, { from, traversal: option.traversal });
    if (option.waits ?? true) PendingNavigation.wait(entry);
  });
  return entry as PendingNavigationEntry;
};
const end = (entry: PendingNavigationEntry) => act(async () => PendingNavigation.end(entry));

describe("AkanPressLoading", () => {
  afterEach(async () => {
    await act(async () => PendingNavigation.clear());
  });

  test("shows the boundary's fallback once a press to another path of the page waits, and the page again when it ends", async () => {
    const page = mount(<Page />);
    act(() => page.container.querySelector("button")?.click());
    expect(page.shown()).toBe("count:1");

    const pending = await press("http://localhost/en/chat/b");
    await tick(5);
    expect(page.shown()).toBe("skeleton");

    await end(pending);
    await tick(5);
    expect(page.shown()).toBe("count:1");
    page.unmount();
  });

  test("keeps the page while the answer comes inside the delay", async () => {
    const page = mount(<Page delayMs={40} />);
    const pending = await press("http://localhost/en/chat/b");
    await tick(10);
    expect(page.shown()).toBe("count:0");
    await end(pending);
    await tick(50);
    expect(page.shown()).toBe("count:0");

    await press("http://localhost/en/chat/c");
    await tick(60);
    expect(page.shown()).toBe("skeleton");
    page.unmount();
  });

  test("keeps the fallback up across a navigation that takes over to a third path of the page", async () => {
    const page = mount(<Page delayMs={30} />);
    await press("http://localhost/en/chat/b");
    await tick(45);
    expect(page.shown()).toBe("skeleton");
    await press("http://localhost/en/chat/c");
    await tick(5);
    expect(page.shown()).toBe("skeleton");
    page.unmount();
  });

  test("keeps the fallback up when the answer redirects to another page, and gives the page back to Back", async () => {
    const page = mount(<Page />);
    await press("http://localhost/en/chat/b");
    await tick(5);
    expect(page.shown()).toBe("skeleton");
    await press("http://localhost/en/signin");
    await tick(5);
    expect(page.shown()).toBe("skeleton");
    await press("http://localhost/en/settings", { traversal: true });
    await tick(5);
    expect(page.shown()).toBe("count:0");
    page.unmount();
  });

  test("leaves the page for Back and Forward, a held payload, a query-only move, another page and a shadowing one", async () => {
    const page = mount(<Page shadowedBy={["/:lang/chat/new"]} />);
    for (const [href, option] of [
      ["http://localhost/en/chat/b", { traversal: true }],
      ["http://localhost/en/chat/b", { waits: false }],
      ["http://localhost/en/chat/a?thread=1", {}],
      ["http://localhost/en/settings", {}],
      ["http://localhost/en/chat/a/members", {}],
      ["http://localhost/ko/chat/a", {}],
      ["http://localhost/en/chat/new", {}],
    ] as const) {
      await press(href, option);
      await tick(5);
      expect([href, option, page.shown()]).toEqual([href, option, "count:0"]);
    }
    page.unmount();
  });

  test("the page a navigation brings does not hide behind the fallback of that same navigation", async () => {
    await press("http://localhost/en/chat/b");
    const page = mount(<Page />);
    await tick(5);
    expect(page.shown()).toBe("count:0");

    await press("http://localhost/en/chat/c");
    await tick(5);
    expect(page.shown()).toBe("skeleton");
    page.unmount();
  });

  test("renders the page on the server whatever is in flight", () => {
    PendingNavigation.wait(PendingNavigation.begin("http://localhost/en/chat/b", { from }));
    expect(renderToString(<Page />)).toContain("count:");
  });
});
