import "../../test/registerDom";
import { beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { act } from "react";
import { itemFixtureOf, l, mountSuspense, rootSliceArgs, setTestEnv } from "../testHelpers.fixture";

let ListContainer: typeof import("./ListContainer").default;
let makeStore: (state?: Record<string, unknown>) => void;
let calls: Record<string, ReturnType<typeof mock>>;
let st: typeof import("akanjs/store").st;

const slice = { refName: "listContainerTestItem", sliceName: "listContainerTestItem", argLength: 2 };

beforeAll(async () => {
  setTestEnv("listcontainertest");
  const { Insight, storeMaker } = await itemFixtureOf("listContainerTestItem");
  const { registerClientRuntime } = await import("akanjs/client");
  calls = {
    listContainerTestItemList: mock(async () => []),
    listContainerTestItemInsight: mock(async () => new Insight({ count: 3 })),
  };
  registerClientRuntime({
    usePage: () => ({ path: "/", lang: "en", l }),
    fetch: { sortKeyMap: new Map(), filterQueryMap: new Map([[slice.refName, { any: [], byTitle: [] }]]) },
  } as never);
  makeStore = storeMaker({ root: "listContainerTestRoot", calls, sliceArgs: rootSliceArgs });
  ({ st } = await import("akanjs/store"));
  ({ default: ListContainer } = await import("./ListContainer"));
});

beforeEach(() => {
  makeStore();
  // A rebuilt store keeps the slice it loaded, and an init over the same query reloads nothing unless it sleeps.
  st.set({ listContainerTestItemOperation: "sleep" } as never);
});

describe("Data.ListContainer", () => {
  test("loads the listing on mount and draws its toolbar, own tools and exports included", async () => {
    const tools = [{ key: "mine", render: () => <span>own tool</span> }];
    const { container, unmount } = await mountSuspense(<ListContainer slice={slice} title="Items" tools={tools} />);

    expect(calls.listContainerTestItemInsight).toHaveBeenCalledTimes(1);
    expect(container.querySelector("h2")?.textContent).toBe("Items");
    expect(container.querySelector("h2 + span")?.textContent).toBe("3");
    const menu = document.body.textContent;
    expect(menu).toContain("own tool");
    expect(menu).toContain("base.exportCsv");
    expect(menu).toContain("base.exportJson");
    unmount();
  });

  test("switches between cards and the table through the toolbar's view toggle", async () => {
    const { container, unmount } = await mountSuspense(<ListContainer slice={slice} />);
    expect(container.querySelector("table")).toBeNull();

    const [, tableToggle] = container.querySelectorAll("button[aria-pressed]");
    await act(async () => {
      tableToggle?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(tableToggle?.getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector("table")).not.toBeNull();
    unmount();
  });

  test("hands the dashboard the app's summary and the listing's filter, and applies the filter it picks", async () => {
    makeStore({ summary: { total: 5 }, summaryLoading: false });
    const renderDashboard = mock((_: { onSelect: (setting: { queryKey: string }) => void; queryKey: string }) => (
      <p>dashboard</p>
    ));
    const { container, unmount } = await mountSuspense(
      <ListContainer slice={slice} renderDashboard={renderDashboard} />,
    );

    expect(container.textContent).toContain("dashboard");
    expect(renderDashboard).toHaveBeenLastCalledWith(
      expect.objectContaining({ summary: { total: 5 }, hidePresents: true, queryKey: "any" }),
    );

    calls.listContainerTestItemList?.mockClear();
    await act(async () => {
      renderDashboard.mock.lastCall?.[0].onSelect({ queryKey: "byTitle" });
      await new Promise((resolve) => setTimeout(resolve, 200));
    });

    expect(renderDashboard.mock.lastCall?.[0].queryKey).toBe("byTitle");
    expect(calls.listContainerTestItemList?.mock.lastCall?.[0]).toBe("byTitle");
    unmount();
  });
});
