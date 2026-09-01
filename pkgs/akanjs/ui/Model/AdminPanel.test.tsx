import "../../test/registerDom";
import { beforeAll, describe, expect, mock, test } from "bun:test";
import type { ClientSignal } from "akanjs/fetch";
import { act, type ReactNode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { AgenticSurface, AgentProvider } from "use-agentic";

let AdminPanel: typeof import("./AdminPanel").default;
let makeStore: (state?: Record<string, unknown>) => void;
let calls: Record<string, ReturnType<typeof mock>>;
let setState: (state: Record<string, unknown>) => void;

const slice = { refName: "adminTestItem", sliceName: "adminTestItem", argLength: 2 };
const components = { Template: {}, Unit: {}, View: {} };
const l = Object.assign((key: string) => key, {
  _: (key: string) => key,
  rich: (key: string) => key,
  trans: (translation: Record<string, string>) => translation.en,
});

/** Imported after the environment is set: `akanjs/store`'s baseSt reads the env while the module evaluates. */
beforeAll(async () => {
  process.env.AKAN_PUBLIC_APP_NAME = "adminpaneltest";
  process.env.AKAN_PUBLIC_REPO_NAME = "adminpaneltest";
  process.env.AKAN_PUBLIC_SERVE_DOMAIN = "localhost";
  process.env.AKAN_PUBLIC_ENV = "testing";
  const { Int, SLICE_META } = await import("akanjs/base");
  const { ConstantRegistry, via } = await import("akanjs/constant");
  const { registerClientRuntime } = await import("akanjs/client");
  const { st, store, StoreRegistry } = await import("akanjs/store");
  setState = (state) => (st as unknown as { set: (state: Record<string, unknown>) => void }).set(state);

  const Input = via((f) => ({ title: f(String) }));
  const Obj = via(Input, () => ({}));
  const Light = via(Obj, ["title"] as const, () => ({}));
  const Full = via(Obj, Light, () => ({}));
  const Insight = via(Full, (f) => ({ count: f(Int, { default: 0 }) }));
  // Mirrors a real `summary` model: the counter field names the query it counts, which is where a tile without
  // an entry in `queryMap` finds its filter.
  const SummaryInput = via((f) => ({
    pendingItem: f(Int, { default: 0 }).meta({
      refName: "adminTestItem",
      queryKey: "byStatuses",
      queryArgs: [["prepare"]],
    }),
    hourlyItem: f(Int, { default: 0 }).meta({
      refName: "adminTestItem",
      queryKey: "byTitle",
      queryArgs: () => ["Ada"],
    }),
    otherItem: f(Int, { default: 0 }).meta({ refName: "somethingElse", queryKey: "byTitle", queryArgs: ["x"] }),
  }));
  const SummaryObj = via(SummaryInput, () => ({}));
  const SummaryLight = via(SummaryObj, ["pendingItem"] as const, () => ({}));
  const SummaryFull = via(SummaryObj, SummaryLight, () => ({}));
  const SummaryInsight = via(SummaryFull, (f) => ({ count: f(Int, { default: 0 }) }));
  ConstantRegistry.buildModel("summary", SummaryInput, SummaryObj, SummaryFull, SummaryLight, SummaryInsight, {});
  const cnst = ConstantRegistry.buildModel("adminTestItem", Input, Obj, Full, Light, Insight, {});
  calls = {
    adminTestItemList: mock(async () => [new Light({ id: "aaaaaaaaaaaaaaaaaaaaaaaa", title: "Ada" })]),
    adminTestItemInsight: mock(async () => new Insight({ count: 1 })),
  };
  const signalFetch = new Proxy(calls, {
    get(target, key: string) {
      target[key] ??= mock(async () => null);
      return target[key];
    },
  });
  registerClientRuntime({
    usePage: () => ({ path: "/", lang: "en", l }),
    fetch: {
      sortKeyMap: new Map([["adminTestItem", ["latest", "oldest", "titleAsc"]]]),
      filterQueryMap: new Map([
        [
          "adminTestItem",
          {
            any: [],
            byTitle: [{ type: "search", name: "title", refName: "String" }],
            byStatuses: [{ type: "search", name: "statuses", refName: "String", arrDepth: 1, nullable: true }],
          },
        ],
      ]),
    },
  } as never);
  const signal = {
    refName: "adminTestItem",
    _slice: { [SLICE_META]: {} },
    cnst,
    fetch: signalFetch,
    serializedSignal: {
      prefix: "adminTestItem",
      endpoint: {},
      slice: {
        "": {
          args: [
            { type: "search", name: "queryKey", refName: "String", nullable: true },
            { type: "search", name: "args", refName: "Any", nullable: true },
          ],
        },
      },
    },
    slices: [],
  } as unknown as ClientSignal<"adminTestItem">;
  makeStore = (state: Record<string, unknown> = {}) => {
    for (const call of Object.values(calls)) call.mockClear();
    class ItemStore extends store(signal, () => state) {}
    StoreRegistry.register(ItemStore);
    StoreRegistry.build(StoreRegistry.merge("adminPanelRoot", ItemStore));
  };
  ({ default: AdminPanel } = await import("./AdminPanel"));
});

/** The Data barrel is a React.lazy over a real dynamic import, so the first paint is the suspense fallback. */
const waitFor = async (done: () => boolean) => {
  for (let i = 0; i < 200 && !done(); i += 1)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
};

const mount = async (node: ReactNode, ready: () => boolean) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<Suspense>{node}</Suspense>);
  });
  await waitFor(ready);
  return { container, unmount: () => act(() => root.unmount()) };
};

/** A tile's label span sits directly under whatever element the tile is — a button when it carries a filter. */
const tileOf = (container: HTMLElement, label: string) =>
  [...container.querySelectorAll("span")].find((span) => span.textContent === label)?.parentElement;

describe("Model.AdminPanel", () => {
  test("renders the list chrome on a store that has no app-level summary state", async () => {
    makeStore();
    const { container, unmount } = await mount(
      <AdminPanel slice={slice} components={components} />,
      () => calls.adminTestItemList.mock.calls.length > 0,
    );

    expect(container.textContent).toContain("Admin Test Item");
    // The dashboard reads `summary`, which only an app store declares — a panel without one still renders.
    expect(container.querySelector("[data-akan-error]")).toBeNull();
    expect(calls.adminTestItemList).toHaveBeenCalled();
    unmount();
  });

  test("fills every slice argument before the init form so the query is not read as the form", async () => {
    makeStore();
    const { unmount } = await mount(
      <AdminPanel
        slice={slice}
        components={components}
        query={{ queryKey: "byTitle", args: ["Ada"] }}
        init={{ limit: 50 }}
      />,
      () => calls.adminTestItemList.mock.calls.length > 0,
    );

    expect(calls.adminTestItemList).toHaveBeenCalledWith("byTitle", ["Ada"], 0, 50, "latest", expect.any(Object));
    unmount();
  });

  test("opens on the query a `?filter=` link names through the query map", async () => {
    makeStore();
    setState({ searchParams: { filter: "pendingItem" } });
    const { unmount } = await mount(
      <AdminPanel
        slice={slice}
        components={components}
        queryMap={{ pendingItem: { queryKey: "byPending" } }}
        init={{ limit: 20 }}
      />,
      () => calls.adminTestItemList.mock.calls.length > 0,
    );

    expect(calls.adminTestItemList).toHaveBeenCalledWith("byPending", [], 0, 20, "latest", expect.any(Object));
    unmount();
    setState({ searchParams: {} });
  });

  test("keeps the query maker mounted across a re-render, so the picked filter survives", async () => {
    makeStore();
    const { container, unmount } = await mount(
      <AdminPanel slice={slice} components={components} />,
      () => calls.adminTestItemList.mock.calls.length > 0,
    );

    // The filter select sits in the toolbar, left of the sort select. Rendering it through a wrapper this
    // render creates would remount it on every store update and reset the filter the user picked.
    const filterSelect = container.querySelector("[data-open]");
    expect(filterSelect).not.toBeNull();
    await act(async () => {
      setState({ adminTestItemListLoading: true });
    });
    expect(container.querySelector("[data-open]")).toBe(filterSelect);
    unmount();
    setState({ adminTestItemListLoading: false });
  });

  test("offers every sort key the model's serialized signal carries", async () => {
    makeStore();
    const { container, unmount } = await mount(
      <AdminPanel slice={slice} components={components} />,
      () => calls.adminTestItemList.mock.calls.length > 0,
    );

    // Read off the document, not the panel: the sort Select portals its options to `document.body` so no
    // overflow ancestor clips them, and only the field itself is left inside the container.
    expect(container.textContent ?? "").toContain("Latest");
    expect(document.body.textContent ?? "").toContain("Title Asc");
    unmount();
  });

  test("publishes every toolbar control it draws, and withholds the name of one it does not", async () => {
    makeStore();
    const surface = new AgenticSurface();
    const { container, unmount } = await mount(
      <AgentProvider surface={surface}>
        <AdminPanel slice={slice} components={components} />
      </AgentProvider>,
      () => calls.adminTestItemList.mock.calls.length > 0,
    );

    // The same names reach `readScreen`, so the agent can tie a control it reads to the tool that works it.
    expect(container.querySelector('[data-akan-action="refreshAdminTestItem"]')).not.toBeNull();
    expect(container.querySelector('[data-akan-action="setSortOfAdminTestItem"]')).not.toBeNull();
    const tools = surface.snapshot().tools;
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      "exportCsvOfAdminTestItem",
      "exportJsonOfAdminTestItem",
      "refreshAdminTestItem",
      "removeAdminTestItem",
      "setLimitOfAdminTestItem",
      "setSortOfAdminTestItem",
      "setViewOfAdminTestItem",
    ]);
    // No Template and no View component, so the panel draws neither editor nor detail and neither is published —
    // the row's remove button is the one action it does draw.
    expect(tools.some((tool) => tool.name.endsWith("AdminTestItem") && tool.name.startsWith("edit"))).toBe(false);
    // Row tools take an id, and this is where an agent reads one.
    expect(surface.read("adminTestItem.items")).toEqual({
      total: 1,
      items: [{ id: "aaaaaaaaaaaaaaaaaaaaaaaa", label: "Ada" }],
    });
    const sort = tools.find((tool) => tool.name === "setSortOfAdminTestItem");
    const sortProperties = sort?.parameters?.properties as { sortKey?: unknown } | undefined;
    expect(sortProperties?.sortKey).toEqual({ type: "string", enum: ["latest", "oldest", "titleAsc"] });
    await expect(surface.call("setLimitOfAdminTestItem", { limit: 33 })).rejects.toThrow(
      'Argument "limit" of setLimitOfAdminTestItem must be one of: 10, 20, 50, 100.',
    );
    unmount();
  });

  test("publishes the editor verbs once a template gives the panel a form to draw", async () => {
    makeStore();
    const surface = new AgenticSurface();
    const { unmount } = await mount(
      <AgentProvider surface={surface}>
        <AdminPanel slice={slice} components={{ ...components, Template: { General: () => null } }} />
      </AgentProvider>,
      () => calls.adminTestItemList.mock.calls.length > 0,
    );

    const names = () => surface.snapshot().tools.map((tool) => tool.name);
    expect(names()).toContain("newAdminTestItem");
    expect(names()).toContain("editAdminTestItem");
    // The editor owns its own verbs, and no editor is on screen until one is opened.
    expect(names()).not.toContain("submitAdminTestItem");
    expect(names()).not.toContain("cancelEditOfAdminTestItem");
    // Still no View component, so the detail verbs stay unpublished.
    expect(names()).not.toContain("viewAdminTestItem");
    expect(names()).not.toContain("closeViewOfAdminTestItem");

    await act(async () => {
      await surface.call("newAdminTestItem", {});
    });
    await waitFor(() => names().includes("submitAdminTestItem"));
    expect(names()).toContain("submitAdminTestItem");
    expect(names()).toContain("cancelEditOfAdminTestItem");
    unmount();
  });

  test("renders summary tiles from the app summary state, and leaves a column with no filter inert", async () => {
    makeStore({ summary: { totalItem: 7, plainItem: 2 }, summaryLoading: false });
    const { container, unmount } = await mount(
      <AdminPanel
        slice={slice}
        components={components}
        summaryColumns={["totalItem", "plainItem"]}
        queryMap={{ totalItem: { queryKey: "any" } }}
      />,
      () => calls.adminTestItemList.mock.calls.length > 0,
    );

    expect(container.textContent).toContain("Total Item");
    expect(container.textContent).toContain("7");
    // The tag is what says whether the tile applies a filter. `plainItem` is named by neither the map nor a
    // field declaration, so it counts something this listing cannot narrow to and stays inert.
    expect(tileOf(container, "Total Item")?.tagName).toBe("BUTTON");
    expect(tileOf(container, "Plain Item")?.tagName).toBe("DIV");
    unmount();
  });

  test("applies the tile's own filter in place, reading args written as a thunk at the moment of the click", async () => {
    makeStore();
    setState({ summary: { recentItem: 3 }, summaryLoading: false });
    let readAt = 0;
    const { container, unmount } = await mount(
      <AdminPanel
        slice={slice}
        components={components}
        summaryColumns={["recentItem"]}
        queryMap={{
          recentItem: {
            queryKey: "byTitle",
            // A thunk is how an arg relative to now stays current; it must be read on click, not at declaration.
            args: () => {
              readAt += 1;
              return [`Ada-${readAt}`];
            },
          },
        }}
        init={{ limit: 20 }}
      />,
      () => calls.adminTestItemList.mock.calls.length > 0,
    );
    calls.adminTestItemList.mockClear();
    calls.adminTestItemList.mockClear();

    await act(async () => {
      (tileOf(container, "Recent Item") as HTMLElement).click();
    });
    await waitFor(() => calls.adminTestItemList.mock.calls.length > 0);

    // The resolved array reaches the wire — a thunk would have serialized to the literal "undefined".
    expect(calls.adminTestItemList.mock.calls[0]?.slice(0, 5)).toEqual(["byTitle", ["Ada-1"], 0, 20, "latest"]);
    expect(readAt).toBe(1);
    // The tile the filter came from reads as the active one, which needs the dashboard to survive the re-render
    // the request causes.
    expect(tileOf(container, "Recent Item")?.className).toContain("border-primary");
    unmount();
    setState({ summary: undefined });
  });

  test("resolves a thunk on the query a `?filter=` link names, before the first request", async () => {
    makeStore();
    setState({ searchParams: { filter: "recentItem" } });
    const { unmount } = await mount(
      <AdminPanel
        slice={slice}
        components={components}
        queryMap={{ recentItem: { queryKey: "byTitle", args: () => ["Ada"] } }}
        init={{ limit: 20 }}
      />,
      () => calls.adminTestItemList.mock.calls.length > 0,
    );

    expect(calls.adminTestItemList).toHaveBeenCalledWith("byTitle", ["Ada"], 0, 20, "latest", expect.any(Object));
    unmount();
    setState({ searchParams: {} });
  });
  test("PROBE args ui", async () => {
    makeStore();
    setState({ summary: { recentItem: 3 }, summaryLoading: false });
    const { container, unmount } = await mount(
      <AdminPanel
        slice={slice}
        components={components}
        summaryColumns={["recentItem"]}
        queryMap={{ recentItem: { queryKey: "byStatuses", args: [["prepare"]] } }}
        init={{ limit: 20 }}
      />,
      () => calls.adminTestItemList.mock.calls.length > 0,
    );
    console.info(
      "BEFORE inputs:",
      [...container.querySelectorAll("input")].map((i) => i.value),
    );
    await act(async () => {
      (tileOf(container, "Recent Item") as HTMLElement).click();
    });
    await waitFor(() => calls.adminTestItemList.mock.calls.length > 1);
    console.info(
      "AFTER inputs:",
      [...container.querySelectorAll("input")].map((i) => i.value),
    );
    console.info("CALL:", JSON.stringify(calls.adminTestItemList.mock.calls.at(-1)?.slice(0, 3)));
    unmount();
    setState({ summary: undefined });
  });

  test("takes a tile's filter from the summary field's own query metadata when the query map names none", async () => {
    makeStore();
    setState({ summary: { pendingItem: 3, otherItem: 9 }, summaryLoading: false });
    const { container, unmount } = await mount(
      <AdminPanel
        slice={slice}
        components={components}
        summaryColumns={["pendingItem", "otherItem"]}
        init={{ limit: 20 }}
      />,
      () => calls.adminTestItemList.mock.calls.length > 0,
    );

    // `otherItem` counts another model's rows, so it narrows nothing here and stays inert.
    expect(tileOf(container, "Pending Item")?.tagName).toBe("BUTTON");
    expect(tileOf(container, "Other Item")?.tagName).toBe("DIV");

    await act(async () => {
      (tileOf(container, "Pending Item") as HTMLElement).click();
    });
    await waitFor(() => calls.adminTestItemList.mock.calls.length > 1);

    expect(calls.adminTestItemList.mock.calls.at(-1)?.slice(0, 2)).toEqual(["byStatuses", [["prepare"]]]);
    expect([...container.querySelectorAll("input")].map((input) => input.value)).toEqual(["prepare"]);
    unmount();
    setState({ summary: undefined });
  });

  test("reads a metadata thunk at the moment the tile is clicked", async () => {
    makeStore();
    setState({ summary: { hourlyItem: 5 }, summaryLoading: false });
    const { container, unmount } = await mount(
      <AdminPanel slice={slice} components={components} summaryColumns={["hourlyItem"]} init={{ limit: 20 }} />,
      () => calls.adminTestItemList.mock.calls.length > 0,
    );

    await act(async () => {
      (tileOf(container, "Hourly Item") as HTMLElement).click();
    });
    await waitFor(() => calls.adminTestItemList.mock.calls.length > 1);

    expect(calls.adminTestItemList.mock.calls.at(-1)?.slice(0, 2)).toEqual(["byTitle", ["Ada"]]);
    unmount();
    setState({ summary: undefined });
  });

  test("lets an explicit query map override what the field declares", async () => {
    makeStore();
    setState({ summary: { pendingItem: 3 }, summaryLoading: false });
    const { container, unmount } = await mount(
      <AdminPanel
        slice={slice}
        components={components}
        summaryColumns={["pendingItem"]}
        queryMap={{ pendingItem: { queryKey: "byTitle", args: ["Override"] } }}
        init={{ limit: 20 }}
      />,
      () => calls.adminTestItemList.mock.calls.length > 0,
    );

    await act(async () => {
      (tileOf(container, "Pending Item") as HTMLElement).click();
    });
    await waitFor(() => calls.adminTestItemList.mock.calls.length > 1);

    expect(calls.adminTestItemList.mock.calls.at(-1)?.slice(0, 2)).toEqual(["byTitle", ["Override"]]);
    unmount();
    setState({ summary: undefined });
  });

  test("takes a query map entry that names its list `queryArgs`, the way a field declaration does", async () => {
    makeStore();
    setState({ summary: { pendingItem: 3 }, summaryLoading: false });
    const { container, unmount } = await mount(
      <AdminPanel
        slice={slice}
        components={components}
        summaryColumns={["pendingItem"]}
        // The shape a `.meta(...)` declaration already has: forwarding one needs no renaming at the call site.
        queryMap={{ pendingItem: { queryKey: "byTitle", queryArgs: () => ["FromMeta"] } }}
        init={{ limit: 20 }}
      />,
      () => calls.adminTestItemList.mock.calls.length > 0,
    );

    await act(async () => {
      (tileOf(container, "Pending Item") as HTMLElement).click();
    });
    await waitFor(() => calls.adminTestItemList.mock.calls.length > 1);

    expect(calls.adminTestItemList.mock.calls.at(-1)?.slice(0, 2)).toEqual(["byTitle", ["FromMeta"]]);
    expect([...container.querySelectorAll("input")].map((input) => input.value)).toEqual(["FromMeta"]);
    unmount();
    setState({ summary: undefined });
  });
});
