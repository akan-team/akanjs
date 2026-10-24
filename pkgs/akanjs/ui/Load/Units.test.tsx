import "../../test/registerDom";
import { beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import type { PageActivity } from "akanjs/client";
import type { ServerInit, ServerView } from "akanjs/fetch";
import { Activity, act, type ReactNode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { AgenticSurface, AgentProvider } from "use-agentic";
import { itemFixtureOf, l, setTestEnv, waitFor } from "../testHelpers.fixture";

let Units: typeof import("./Units").default;
let View: typeof import("./View").default;
let makeStore: (state?: Record<string, unknown>) => void;
let makeProjectStore: (state?: Record<string, unknown>) => void;
let calls: Record<string, ReturnType<typeof mock>>;
let projectCalls: Record<string, ReturnType<typeof mock>>;
let pathContext: typeof import("akanjs/client").pathContext;
let pageActivityContext: typeof import("akanjs/client").pageActivityContext;
let sliceState: {
  get: () => Record<string, unknown>;
  set: (state: Record<string, unknown>) => void;
  do: Record<string, (...args: unknown[]) => Promise<void>>;
};

const projectRows = {
  p1: { id: "aaaaaaaaaaaaaaaaaaaaaaaa", title: "One" },
  p2: { id: "bbbbbbbbbbbbbbbbbbbbbbbb", title: "Two" },
  p3: { id: "cccccccccccccccccccccccc", title: "Three" },
} as const;
type Project = keyof typeof projectRows;

beforeAll(async () => {
  setTestEnv("loadtest");
  const { Light, Full, Insight, storeMaker } = await itemFixtureOf("loadTestItem");
  const client = await import("akanjs/client");
  const { st } = await import("akanjs/store");
  ({ pathContext, pageActivityContext } = client);
  sliceState = st as unknown as typeof sliceState;
  calls = {
    loadTestItemList: mock(async () => [new Light({ id: "aaaaaaaaaaaaaaaaaaaaaaaa", title: "Ada" })]),
    loadTestItemInsight: mock(async () => new Insight({ count: 1 })),
    loadTestItem: mock(async (id: string) => new Full({ id, title: "Fresh" })),
  };
  projectCalls = {
    loadTestItemList: mock(async (projectId: Project) => [new Light(projectRows[projectId])]),
    loadTestItemInsight: mock(async () => new Insight({ count: 1 })),
  };
  client.registerClientRuntime({
    usePage: () => ({ path: "/", lang: "en", l }),
    fetch: { sortKeyMap: new Map([["loadTestItem", ["latest"]]]), filterQueryMap: new Map([["loadTestItem", {}]]) },
  } as never);
  makeStore = storeMaker({ root: "loadRoot", calls });
  makeProjectStore = storeMaker({
    root: "loadProjectRoot",
    calls: projectCalls,
    sliceArgs: [{ type: "param", name: "projectId", refName: "String" }],
  });
  ({ default: Units } = await import("./Units"));
  ({ default: View } = await import("./View"));
});

interface Item {
  id: string;
  title: string;
}

interface InitOptions {
  insight?: boolean;
  args?: unknown[];
  id?: string;
  title?: string;
  initAt?: Date;
}

const serverInit = ({
  insight = true,
  args = [],
  id = "aaaaaaaaaaaaaaaaaaaaaaaa",
  title = "Ada",
  initAt = new Date(),
}: InitOptions = {}): ServerInit<"loadTestItem", Item> => ({
  refName: "loadTestItem",
  sliceName: "loadTestItem",
  argLength: args.length,
  loadTestItemObjList: [{ id, title }],
  loadTestItemObjInsight: insight ? { count: 1 } : null,
  pageOfLoadTestItem: 1,
  lastPageOfLoadTestItem: 1,
  limitOfLoadTestItem: 0,
  hasMoreOfLoadTestItem: false,
  queryArgsOfLoadTestItem: args,
  sortOfLoadTestItem: "latest",
  loadTestItemInitAt: initAt,
});

interface ViewOptions {
  id?: string;
  title?: string;
  viewAt?: Date;
}

const serverView = ({
  id = "aaaaaaaaaaaaaaaaaaaaaaaa",
  title = "Ada",
  viewAt = new Date(),
}: ViewOptions = {}): ServerView<"loadTestItem", Item> => ({
  refName: "loadTestItem",
  loadTestItemObj: { id, title },
  loadTestItemViewAt: viewAt,
});

const wrap = (node: ReactNode, surface: AgenticSurface) => (
  <AgentProvider surface={surface}>
    <Suspense>{node}</Suspense>
  </AgentProvider>
);

const handleOf = (container: HTMLElement, root: ReturnType<typeof createRoot>, surface: AgenticSurface) => ({
  container,
  flush: async () => {
    await act(async () => {});
  },
  /** Same root, same surface, same element position — so React updates the mounted instance instead of remounting it. */
  rerender: async (node: ReactNode) => {
    await act(async () => {
      root.render(wrap(node, surface));
    });
  },
  unmount: async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  },
});

/** Synchronous, so a fallback that appeared and was replaced within one flush would still fail the assertion. */
const mount = (node: ReactNode) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const surface = new AgenticSurface();
  act(() => root.render(wrap(node, surface)));
  return handleOf(container, root, surface);
};

/** A suspending first render has to settle inside an awaited `act`, or React warns and commits nothing. */
const mountAsync = async (node: ReactNode) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const surface = new AgenticSurface();
  await act(async () => {
    root.render(wrap(node, surface));
  });
  return handleOf(container, root, surface);
};

describe("Load.Units", () => {
  test("renders an awaited init in the first commit, with no fallback", async () => {
    makeStore();
    const { container, unmount } = mount(
      <Units<"loadTestItem", Item> init={serverInit()} renderItem={(item: Item) => <span>{item.title}</span>} />,
    );
    expect(container.textContent).toContain("Ada");
    await unmount();
  });

  test("renders the fallback for an unawaited init, then the items", async () => {
    makeStore();
    let release!: (value: ReturnType<typeof serverInit>) => void;
    const held = new Promise<ReturnType<typeof serverInit>>((resolve) => {
      release = resolve;
    });
    const { container, flush, unmount } = await mountAsync(
      <Units<"loadTestItem", Item>
        init={held}
        loading={<span>loading-units</span>}
        renderItem={(item: Item) => <span>{item.title}</span>}
      />,
    );
    expect(container.textContent).toBe("loading-units");

    release(serverInit());
    await flush();
    expect(container.textContent).toContain("Ada");
    await unmount();
  });

  test("renders an init whose caller opted out of the insight", async () => {
    makeStore();
    const { container, unmount } = mount(
      <Units init={serverInit({ insight: false })} renderItem={(item: Item) => <span>{item.title}</span>} />,
    );
    expect(container.textContent).toContain("Ada");
    await unmount();
  });

  test("refetches without the insight an init opted out of", async () => {
    makeStore();
    const { flush, unmount } = mount(
      <Units<"loadTestItem", Item>
        init={serverInit({ insight: false, initAt: new Date(Date.now() - 1000) })}
        staleTime={0}
        renderItem={(item: Item) => <span>{item.title}</span>}
      />,
    );
    await flush();
    expect(calls.loadTestItemList).toHaveBeenCalled();
    expect(calls.loadTestItemInsight).not.toHaveBeenCalled();
    await unmount();
  });

  test("rehydrates when a route change hands the mounted instance an init with different query args", async () => {
    makeStore();
    const renderItem = (item: Item) => <span>{item.title}</span>;
    const { container, rerender, unmount } = mount(
      <Units<"loadTestItem", Item> init={serverInit({ args: ["a"] })} renderItem={renderItem} />,
    );
    expect(container.textContent).toContain("Ada");

    await rerender(
      <Units<"loadTestItem", Item>
        init={serverInit({ args: ["b"], id: "bbbbbbbbbbbbbbbbbbbbbbbb", title: "Grace" })}
        renderItem={renderItem}
      />,
    );
    expect(container.textContent).toContain("Grace");
    expect(container.textContent).not.toContain("Ada");
    await unmount();
  });

  test("keeps client-side slice state when the same query args arrive again", async () => {
    makeStore();
    const renderItem = (item: Item) => <span>{item.title}</span>;
    const { container, rerender, unmount } = mount(
      <Units<"loadTestItem", Item> init={serverInit({ args: ["a"] })} renderItem={renderItem} />,
    );
    await act(async () => {
      sliceState.set({ pageOfLoadTestItem: 3 });
    });

    await rerender(<Units<"loadTestItem", Item> init={serverInit({ args: ["a"] })} renderItem={renderItem} />);
    expect(sliceState.get().pageOfLoadTestItem).toBe(3);
    expect(container.textContent).toContain("Ada");
    await unmount();
  });

  test("draws the reload overlay only when loading is omitted, never for null", async () => {
    makeStore();
    const renderItem = (item: Item) => <span>{item.title}</span>;
    const silent = mount(<Units<"loadTestItem", Item> init={serverInit()} loading={null} renderItem={renderItem} />);
    await act(async () => {
      sliceState.set({ loadTestItemListLoading: true });
    });
    expect(silent.container.querySelector(".backdrop-blur-sm")).toBeNull();
    await silent.unmount();

    makeStore();
    const fallback = mount(<Units<"loadTestItem", Item> init={serverInit()} renderItem={renderItem} />);
    await act(async () => {
      sliceState.set({ loadTestItemListLoading: true });
    });
    expect(fallback.container.querySelector(".backdrop-blur-sm")).not.toBeNull();
    await fallback.unmount();
  });

  test("keeps each row mounted when the slice re-renders", async () => {
    makeStore();
    const { container, unmount } = mount(
      <Units<"loadTestItem", Item> init={serverInit()} renderItem={(item: Item) => <span>{item.title}</span>} />,
    );
    const row = container.querySelector("span");
    expect(row?.textContent).toBe("Ada");

    await act(async () => {
      sliceState.set({ pageOfLoadTestItem: 2 });
    });
    expect(container.querySelector("span")).toBe(row);
    await unmount();
  });

  /** The RSC navigation cache replays the payload a route was first rendered with, mutation or no mutation. */
  test("refetches when it re-hydrates from a payload older than the last local write", async () => {
    makeStore();
    const renderItem = (item: Item) => <span>{item.title}</span>;
    const cachedInit = serverInit({ args: ["a"], initAt: new Date(Date.now() - 1000) });
    const { rerender, flush, unmount } = mount(
      <Units<"loadTestItem", Item> init={cachedInit} renderItem={renderItem} />,
    );
    expect(calls.loadTestItemList).not.toHaveBeenCalled();

    await act(async () => {
      sliceState.set({ loadTestItemStaleAt: new Date() });
    });
    await rerender(
      <Units<"loadTestItem", Item>
        init={serverInit({ args: ["b"], id: "bbbbbbbbbbbbbbbbbbbbbbbb", title: "Grace" })}
        renderItem={renderItem}
      />,
    );
    expect(calls.loadTestItemList).not.toHaveBeenCalled();

    await rerender(<Units<"loadTestItem", Item> init={cachedInit} renderItem={renderItem} />);
    await flush();
    expect(calls.loadTestItemList).toHaveBeenCalled();
    await unmount();
  });

  test("refetches the rows it seeds from a replayed navigation, stamp or no stamp", async () => {
    makeStore();
    sliceState.set({ loadTestItemStaleAt: new Date(0) });
    const renderItem = (item: Item) => <span>{item.title}</span>;
    const firstVisit = serverInit({ args: ["a"], initAt: new Date(Date.now() - 1000) });
    const { rerender, flush, unmount } = mount(
      <Units<"loadTestItem", Item> init={firstVisit} renderItem={renderItem} />,
    );
    await rerender(
      <Units<"loadTestItem", Item>
        init={serverInit({ args: ["b"], id: "bbbbbbbbbbbbbbbbbbbbbbbb", title: "Grace" })}
        renderItem={renderItem}
      />,
    );
    expect(calls.loadTestItemList).not.toHaveBeenCalled();

    globalThis.__AKAN_RSC_IS_FROM_CACHE__ = () => true;
    try {
      await rerender(<Units<"loadTestItem", Item> init={firstVisit} renderItem={renderItem} />);
      await flush();
    } finally {
      globalThis.__AKAN_RSC_IS_FROM_CACHE__ = undefined;
    }
    expect(calls.loadTestItemList).toHaveBeenCalled();
    await unmount();
  });
});

describe("Load.Units sharing a slice with another list", () => {
  let inits: Record<Project, ServerInit<"loadTestItem", Item>>;
  beforeEach(() => {
    makeProjectStore();
    inits = Object.fromEntries(
      Object.entries(projectRows).map(([project, row]) => [project, serverInit({ args: [project], ...row })]),
    ) as typeof inits;
  });
  const listOf = (project: Project) => (
    <Units<"loadTestItem", Item> init={inits[project]} renderItem={(item: Item) => <span>{item.title}</span>} />
  );
  const pageOf = (pageKey: string, activity: PageActivity, children: ReactNode) => (
    <Activity key={pageKey} mode={activity === "hidden" ? "hidden" : "visible"}>
      <pathContext.Provider value={{ pageKey } as never}>
        <pageActivityContext.Provider value={{ activity, focused: activity === "current" }}>
          <div id={pageKey}>{children}</div>
        </pageActivityContext.Provider>
      </pathContext.Provider>
    </Activity>
  );
  const stackOf = (pages: [pageKey: string, activity: PageActivity, project: Project | null][]) => (
    <>{pages.map(([pageKey, activity, project]) => pageOf(pageKey, activity, project ? listOf(project) : null))}</>
  );
  const textOf = (container: HTMLElement, id: string) => container.querySelector(`#${id}`)?.textContent;
  const listedProjects = () => projectCalls.loadTestItemList.mock.calls.map(([project]) => project);

  test.each(["hidden", "prev"] as const)(
    "a page shown again from %s takes back the slice a page pushed over it replaced",
    async (under) => {
      const { container, rerender, unmount } = mount(stackOf([["a", "current", "p1"]]));
      expect(textOf(container, "a")).toBe("One");

      await rerender(
        stackOf([
          ["a", "current", "p1"],
          ["b", "pending", "p2"],
        ]),
      );
      await rerender(
        stackOf([
          ["a", under, "p1"],
          ["b", "current", "p2"],
        ]),
      );
      expect(textOf(container, "b")).toBe("Two");
      expect(listedProjects()).toEqual([]);

      await rerender(stackOf([["a", "current", "p1"]]));
      await waitFor(() => textOf(container, "a") === "One");
      expect(textOf(container, "a")).toBe("One");
      expect(listedProjects()).toEqual(["p1"]);
      expect(sliceState.get().queryArgsOfLoadTestItem).toEqual(["p1"]);
      await unmount();
    },
  );

  test("a page shown again keeps the filter it showed, and makes no call while still in step", async () => {
    const { container, rerender, flush, unmount } = mount(stackOf([["a", "current", "p1"]]));
    await act(async () => {
      await sliceState.do.setQueryArgsOfLoadTestItem("p3");
    });
    expect(textOf(container, "a")).toBe("Three");

    await rerender(
      stackOf([
        ["a", "hidden", "p1"],
        ["c", "current", null],
      ]),
    );
    await rerender(stackOf([["a", "current", "p1"]]));
    await flush();
    expect(listedProjects()).toEqual(["p3"]);

    await rerender(
      stackOf([
        ["a", "hidden", "p1"],
        ["b", "current", "p2"],
      ]),
    );
    await rerender(stackOf([["a", "current", "p1"]]));
    await waitFor(() => textOf(container, "a") === "Three");
    expect(listedProjects()).toEqual(["p3", "p3"]);
    await unmount();
  });

  test("lists take the slice back with one call once the list that replaced them on their screen unmounts", async () => {
    const both = (showsSecond: boolean) => (
      <>
        <div id="first">{listOf("p1")}</div>
        <div id="twin">{listOf("p1")}</div>
        {showsSecond ? <div id="second">{listOf("p2")}</div> : null}
      </>
    );
    const { container, rerender, unmount } = mount(both(false));
    await rerender(both(true));
    expect(textOf(container, "second")).toBe("Two");

    await rerender(both(false));
    await waitFor(() => textOf(container, "first") === "One");
    expect(textOf(container, "twin")).toBe("One");
    expect(listedProjects()).toEqual(["p1"]);
    await unmount();
  });

  test("two lists of one slice on a page shown again leave it to the one that seeded it last", async () => {
    const page = (activity: PageActivity) =>
      pageOf(
        "a",
        activity,
        <>
          <div id="first">{listOf("p1")}</div>
          <div id="second">{listOf("p2")}</div>
        </>,
      );
    const { container, rerender, flush, unmount } = mount(page("current"));
    await rerender(page("hidden"));
    await rerender(page("current"));
    await flush();
    await flush();
    expect(listedProjects()).toEqual([]);
    expect(textOf(container, "first")).toBe("Two");
    await unmount();
  });
});

describe("Load.View", () => {
  test("renders an awaited view in the first commit", async () => {
    makeStore();
    const { container, unmount } = mount(
      <View<"loadTestItem", Item> view={serverView()} renderView={(item: Item) => <span>{item.title}</span>} />,
    );
    expect(container.textContent).toContain("Ada");
    await unmount();
  });

  test("renders the fallback for an unawaited view, then the model", async () => {
    makeStore();
    let release!: (value: ReturnType<typeof serverView>) => void;
    const held = new Promise<ReturnType<typeof serverView>>((resolve) => {
      release = resolve;
    });
    const { container, flush, unmount } = await mountAsync(
      <View<"loadTestItem", Item>
        view={held}
        loading={<span>loading-view</span>}
        renderView={(item: Item) => <span>{item.title}</span>}
      />,
    );
    expect(container.textContent).toBe("loading-view");

    release(serverView());
    await flush();
    expect(container.textContent).toContain("Ada");
    await unmount();
  });

  test("refetches when it re-hydrates from a view payload older than the last local write", async () => {
    makeStore();
    const renderView = (item: Item) => <span>{item.title}</span>;
    const cachedView = serverView({ viewAt: new Date(Date.now() - 1000) });
    const { container, rerender, flush, unmount } = mount(
      <View<"loadTestItem", Item> view={cachedView} renderView={renderView} />,
    );
    expect(calls.loadTestItem).not.toHaveBeenCalled();

    await act(async () => {
      sliceState.set({ loadTestItemStaleAt: new Date() });
    });
    await rerender(
      <View<"loadTestItem", Item>
        view={serverView({ id: "bbbbbbbbbbbbbbbbbbbbbbbb", title: "Grace" })}
        renderView={renderView}
      />,
    );
    expect(calls.loadTestItem).not.toHaveBeenCalled();

    await rerender(<View<"loadTestItem", Item> view={cachedView} renderView={renderView} />);
    await flush();
    expect(calls.loadTestItem).toHaveBeenCalled();
    expect(container.textContent).toContain("Fresh");
    await unmount();
  });
});
