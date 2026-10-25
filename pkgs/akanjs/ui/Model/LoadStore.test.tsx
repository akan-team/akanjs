import "../../test/registerDom";
import { beforeAll, describe, expect, mock, test } from "bun:test";
import type { ServerInit } from "akanjs/fetch";
import { act, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { AgenticSurface, AgentProvider } from "use-agentic";
import { itemFixtureOf, l, setTestEnv, waitFor } from "../testHelpers.fixture";

let LoadInit: typeof import("./LoadStore").LoadInit;
let makeStore: (state?: Record<string, unknown>) => void;
let calls: Record<string, ReturnType<typeof mock>>;
let sliceState: { get: () => Record<string, unknown> };

beforeAll(async () => {
  setTestEnv("loadstoretest");
  const { Light, Insight, storeMaker } = await itemFixtureOf("loadInitItem");
  const { registerClientRuntime } = await import("akanjs/client");
  const { st } = await import("akanjs/store");
  sliceState = st as unknown as typeof sliceState;
  calls = {
    loadInitItemList: mock(async () =>
      Array.from({ length: 20 }, (_, idx) => new Light({ id: `b${String(idx).padStart(23, "0")}`, title: "More" })),
    ),
    loadInitItemInsight: mock(async () => new Insight({ count: 45 })),
  };
  registerClientRuntime({
    usePage: () => ({ path: "/", lang: "en", l }),
    fetch: { sortKeyMap: new Map([["loadInitItem", ["latest"]]]), filterQueryMap: new Map([["loadInitItem", {}]]) },
  } as never);
  makeStore = storeMaker({ root: "loadInitRoot", calls });
  ({ LoadInit } = await import("./LoadStore"));
});

interface Item {
  id: string;
  title: string;
}

const serverInit = (): ServerInit<"loadInitItem", Item> => ({
  refName: "loadInitItem",
  sliceName: "loadInitItem",
  argLength: 0,
  loadInitItemObjList: Array.from({ length: 20 }, (_, idx) => ({
    id: `a${String(idx).padStart(23, "0")}`,
    title: `Row ${idx}`,
  })),
  loadInitItemObjInsight: { count: 45 },
  pageOfLoadInitItem: 1,
  lastPageOfLoadInitItem: 3,
  limitOfLoadInitItem: 20,
  hasMoreOfLoadInitItem: true,
  queryArgsOfLoadInitItem: [],
  sortOfLoadInitItem: "latest",
  loadInitItemInitAt: new Date(),
});

const mountLoadInit = async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const surface = new AgenticSurface();
  await act(async () => {
    root.render(
      <AgentProvider surface={surface}>
        <Suspense>
          <LoadInit init={serverInit()} />
        </Suspense>
      </AgentProvider>,
    );
  });
  // `Load.Units` is a lazy boundary, so the slice is seeded only once it has loaded.
  await waitFor(() => (sliceState.get().loadInitItemList as { length: number }).length > 0);
  return {
    container,
    surface,
    unmount: async () => {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    },
  };
};

describe("Model.LoadInit", () => {
  test("renders nothing and publishes no pager for a slice with more rows than its limit", async () => {
    makeStore();
    const { container, surface, unmount } = await mountLoadInit();
    expect(container.innerHTML).toBe("");
    expect(surface.snapshot().tools.map((tool) => tool.name)).not.toContain("setPageOfLoadInitItem");
    await unmount();
  });

  test("loads no further rows on a touch screen", async () => {
    const { matchMedia } = window;
    const { IntersectionObserver } = globalThis;
    window.matchMedia = ((query: string) => ({
      matches: query.includes("coarse"),
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
    globalThis.IntersectionObserver = class {
      readonly #onChange: IntersectionObserverCallback;
      constructor(onChange: IntersectionObserverCallback) {
        this.#onChange = onChange;
      }
      observe(target: Element) {
        setTimeout(() => {
          this.#onChange([{ isIntersecting: true, target } as IntersectionObserverEntry], this as never);
        }, 0);
      }
      disconnect() {}
      unobserve() {}
    } as unknown as typeof IntersectionObserver;
    try {
      makeStore();
      const { unmount } = await mountLoadInit();
      await waitFor(() => calls.loadInitItemList.mock.calls.length > 0);
      expect(calls.loadInitItemList).not.toHaveBeenCalled();
      await unmount();
    } finally {
      window.matchMedia = matchMedia;
      globalThis.IntersectionObserver = IntersectionObserver;
    }
  });
});
