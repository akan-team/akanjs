import "../../test/registerDom";
import { beforeAll, describe, expect, mock, test } from "bun:test";
import { act, type ReactNode } from "react";
import { AgenticSurface, AgentProvider } from "use-agentic";
import { itemFixtureOf, l, mountSuspense, rootSliceArgs, setTestEnv, waitFor } from "../testHelpers.fixture";

let AdminPanel: typeof import("./AdminPanel").default;
let makeStore: (state?: Record<string, unknown>) => void;
let calls: Record<string, ReturnType<typeof mock>>;
let setState: (state: Record<string, unknown>) => void;
let storeDo: Record<string, (...args: unknown[]) => Promise<void>>;
let Full: Awaited<ReturnType<typeof itemFixtureOf>>["Full"];
let ClientPathWrapper: typeof import("../System/Client").ClientPathWrapper;

const slice = { refName: "adminTestItem", sliceName: "adminTestItem", argLength: 2 };
const components = { Template: {}, Unit: {}, View: {} };

beforeAll(async () => {
  setTestEnv("adminpaneltest");
  const { Int } = await import("akanjs/base");
  const { ConstantRegistry, via } = await import("akanjs/constant");
  const { Light, Full: FullModel, Insight, storeMaker } = await itemFixtureOf("adminTestItem");
  Full = FullModel;
  const { registerClientRuntime } = await import("akanjs/client");
  const { st } = await import("akanjs/store");
  setState = (state) => (st as unknown as { set: (state: Record<string, unknown>) => void }).set(state);
  storeDo = st.do as unknown as typeof storeDo;
  // A counter names the query it counts, which is where a tile with no `queryMap` entry finds its filter.
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
  calls = {
    adminTestItemList: mock(async () => [new Light({ id: "aaaaaaaaaaaaaaaaaaaaaaaa", title: "Ada" })]),
    adminTestItemInsight: mock(async () => new Insight({ count: 1 })),
  };
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
  makeStore = storeMaker({ root: "adminPanelRoot", calls, sliceArgs: rootSliceArgs });
  ({ default: AdminPanel } = await import("./AdminPanel"));
  ({ ClientPathWrapper } = await import("../System/Client"));
});

/** The Data barrel is a React.lazy over a real dynamic import, so the first paint is the suspense fallback. */
const mount = async (node: ReactNode, ready: () => boolean) => {
  const mounted = await mountSuspense(node);
  await waitFor(ready);
  return mounted;
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

    // Off the document: the sort Select portals its options to `document.body`.
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

    expect(container.querySelector('[data-akan-action="refreshAdminTestItem"]')).not.toBeNull();
    expect(container.querySelector('[data-akan-action="setSortOfAdminTestItem"]')).not.toBeNull();
    const tools = surface.snapshot().tools;
    expect(tools.map((tool) => tool.name).sort((a, b) => a.localeCompare(b))).toEqual([
      "exportCsvOfAdminTestItem",
      "exportJsonOfAdminTestItem",
      "refreshAdminTestItem",
      "removeAdminTestItem",
      "setLimitOfAdminTestItem",
      "setSortOfAdminTestItem",
      "setViewOfAdminTestItem",
    ]);
    expect(tools.some((tool) => tool.name.endsWith("AdminTestItem") && tool.name.startsWith("edit"))).toBe(false);
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
    expect(names()).not.toContain("submitAdminTestItem");
    expect(names()).not.toContain("cancelEditOfAdminTestItem");
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

    expect(calls.adminTestItemList.mock.calls[0]?.slice(0, 5)).toEqual(["byTitle", ["Ada-1"], 0, 20, "latest"]);
    expect(readAt).toBe(1);
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
  test("a tile click applies its filter and fills the arg controls it takes", async () => {
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
    const inputValues = () => [...container.querySelectorAll("input")].map((input) => input.value);
    expect(inputValues()).toEqual([]);

    await act(async () => {
      (tileOf(container, "Recent Item") as HTMLElement).click();
    });
    await waitFor(() => calls.adminTestItemList.mock.calls.length > 1);

    expect(calls.adminTestItemList.mock.calls.at(-1)?.slice(0, 3)).toEqual(["byStatuses", [["prepare"]], 0]);
    expect(inputValues()).toEqual(["prepare"]);
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

describe("Model.AdminPanel view modal", () => {
  const listedId = "aaaaaaaaaaaaaaaaaaaaaaaa";
  const offPageId = "bbbbbbbbbbbbbbbbbbbbbbbb";
  const otherId = "dddddddddddddddddddddddd";
  const viewComponents = {
    Template: {},
    Unit: {},
    View: {
      General: ({ adminTestItem }: { adminTestItem: { title: string } }) => <p>view of {adminTestItem.title}</p>,
    },
  };
  const replaces: { href: string; options?: { shallow?: boolean } }[] = [];
  const paramsOf = (href = "") => Object.fromEntries(new URL(href, "http://localhost").searchParams);
  const dialog = () => document.body.querySelector("[role=dialog]");
  const viewing = (title: string) => () => document.body.textContent?.includes(`view of ${title}`) ?? false;
  const barLabels = () =>
    [...(dialog()?.querySelector(".border-t")?.querySelectorAll("button") ?? [])].map((button) =>
      button.textContent?.trim(),
    );
  const buttonOf = (text: string) =>
    [...document.body.querySelectorAll("button")].find((button) => button.textContent?.trim() === text) as
      | HTMLButtonElement
      | undefined;
  const click = (element: HTMLElement | null | undefined) =>
    act(async () => {
      element?.click();
    });

  beforeAll(async () => {
    const { router } = await import("akanjs/client");
    globalThis.__AKAN_RSC_NAVIGATE__ = () => Promise.resolve();
    router.init({
      type: "ssr",
      side: "client",
      lang: "en",
      router: {
        push: () => undefined,
        replace: (href, options) => {
          replaces.push({ href, options });
        },
        back: () => undefined,
        refresh: () => undefined,
      },
    });
    calls.adminTestItem = mock(async (id: string) => new Full({ id, title: id === otherId ? "Linus" : "Grace" }));
  });

  test("opens the record a link names though the page does not list it, and follows a link to another", async () => {
    makeStore();
    replaces.length = 0;
    setState({ searchParams: { topMenu: "account", action: "view", modelId: offPageId } });
    const { unmount } = await mount(
      <AdminPanel slice={slice} components={viewComponents} actions={["view"]} viewInUrl renderViewTitle={false} />,
      viewing("Grace"),
    );

    expect(calls.adminTestItem).toHaveBeenCalledWith(offPageId, expect.anything());
    expect(dialog()?.getAttribute("aria-labelledby")).toBeNull();
    expect(dialog()?.querySelector(".border-t")).toBeNull();
    expect(dialog()?.querySelector('[aria-label="Close"]')).not.toBeNull();
    expect(replaces).toEqual([]);

    setState({ searchParams: { topMenu: "account", action: "view", modelId: otherId } });
    await waitFor(viewing("Linus"));
    expect(document.body.textContent).not.toContain("view of Grace");
    expect(replaces).toEqual([]);
    unmount();
    setState({ searchParams: {} });
  });

  test("writes the open view into the URL beside the other params, and takes it out on close", async () => {
    makeStore();
    replaces.length = 0;
    setState({ searchParams: { topMenu: "account", subMenu: "user" } });
    const { unmount } = await mount(
      <AdminPanel slice={slice} components={viewComponents} viewInUrl />,
      () => calls.adminTestItemList.mock.calls.length > 0,
    );

    await act(() => storeDo.viewAdminTestItem(listedId));
    await waitFor(() => replaces.length === 1);
    expect(paramsOf(replaces[0]?.href)).toEqual({
      topMenu: "account",
      subMenu: "user",
      action: "view",
      modelId: listedId,
    });
    expect(replaces[0]?.options).toMatchObject({ shallow: true, scrollToTop: false });
    //* The fake router leaves the store's params alone, where the real one writes the href it was handed.
    setState({ searchParams: paramsOf(replaces[0]?.href) });
    expect(dialog()?.querySelector("[id]")?.textContent).toBe(`Admin Test Item - ${listedId}`);

    await act(() => storeDo.resetAdminTestItem());
    await waitFor(() => replaces.length === 2);
    expect(paramsOf(replaces[1]?.href)).toEqual({ topMenu: "account", subMenu: "user" });
    unmount();
    setState({ searchParams: {} });
  });

  test("closes a link whose record fails to load and takes its params out of the URL", async () => {
    makeStore();
    replaces.length = 0;
    calls.adminTestItem.mockImplementationOnce(async () => {
      throw new Error("adminTestItem.error.notFound");
    });
    setState({ searchParams: { topMenu: "account", action: "view", modelId: offPageId } });
    const { unmount } = await mount(
      <AdminPanel slice={slice} components={viewComponents} viewInUrl />,
      () => replaces.length === 1,
    );

    expect(paramsOf(replaces[0]?.href)).toEqual({ topMenu: "account" });
    expect(dialog()).toBeNull();
    unmount();
    setState({ searchParams: {} });
  });

  test("draws the row's actions but view in the view's bar, and no bar when view is all that is left", async () => {
    const barFor = async (props: Record<string, unknown>) => {
      makeStore();
      const { unmount } = await mount(
        <AdminPanel slice={slice} components={viewComponents} {...props} />,
        () => calls.adminTestItemList.mock.calls.length > 0,
      );
      await act(() => storeDo.viewAdminTestItem(listedId));
      await waitFor(viewing("Grace"));
      const bar = dialog()?.querySelector(".border-t") ? barLabels() : null;
      unmount();
      return bar;
    };

    expect(await barFor({ actions: ["edit", "view", "remove"] })).toEqual(["base.edit", "base.remove"]);
    expect(await barFor({})).toEqual(["base.remove", "base.edit"]);
    expect(await barFor({ actions: ["view"] })).toBeNull();
    expect(await barFor({ actions: ["edit", "view"], viewActions: false })).toBeNull();
  });

  test("asks an `actions` function for the viewed record, off the page too, and drops the bar it empties", async () => {
    makeStore();
    const { unmount } = await mount(
      <AdminPanel
        slice={slice}
        components={viewComponents}
        actions={(item: { id: string }, idx: number) =>
          item.id === otherId
            ? ["view"]
            : [
                "view",
                <button key="custom" type="button">
                  custom {idx}
                </button>,
                null,
                "edit",
              ]
        }
      />,
      () => calls.adminTestItemList.mock.calls.length > 0,
    );

    await act(() => storeDo.viewAdminTestItem(listedId));
    await waitFor(() => barLabels().length > 0);
    expect(barLabels()).toEqual(["custom 0", "base.edit"]);
    await act(() => storeDo.viewAdminTestItem(offPageId));
    await waitFor(() => barLabels()[0] === "custom -1");
    expect(barLabels()).toEqual(["custom -1", "base.edit"]);
    await act(() => storeDo.viewAdminTestItem(otherId));
    await waitFor(viewing("Linus"));
    expect(dialog()?.querySelector(".border-t")).toBeNull();
    unmount();
  });

  test("goes back to the view an edit was opened from, which the URL names all along", async () => {
    makeStore();
    replaces.length = 0;
    calls.updateAdminTestItem = mock(async (id: string) => new Full({ id, title: "Hopper" }));
    setState({ searchParams: { topMenu: "account", action: "view", modelId: offPageId } });
    const { unmount } = await mount(
      <AdminPanel slice={slice} components={viewComponents} actions={["edit", "view"]} viewInUrl />,
      viewing("Grace"),
    );

    await click(buttonOf("base.edit"));
    await waitFor(() => !!buttonOf("base.updateModel"));
    expect(document.body.textContent).not.toContain("view of Grace");
    await click(dialog()?.querySelector<HTMLElement>('[aria-label="Close"]'));
    await waitFor(viewing("Grace"));

    await click(buttonOf("base.edit"));
    await waitFor(() => !!buttonOf("base.updateModel") && !buttonOf("base.updateModel")?.disabled);
    await click(buttonOf("base.updateModel"));
    await waitFor(viewing("Hopper"));
    expect(calls.updateAdminTestItem).toHaveBeenCalledWith(offPageId, expect.anything(), expect.anything());
    expect(replaces).toEqual([]);

    await act(() => storeDo.resetAdminTestItem());
    await waitFor(() => replaces.length === 1);
    expect(paramsOf(replaces[0]?.href)).toEqual({ topMenu: "account" });
    unmount();
    setState({ searchParams: {} });
  });

  test("removes from the view behind the row's confirm, then closes it and takes its params out", async () => {
    makeStore();
    replaces.length = 0;
    calls.removeAdminTestItem = mock(async (id: string) => new Full({ id, title: "Grace" }));
    setState({ searchParams: { topMenu: "account", action: "view", modelId: listedId } });
    const { unmount } = await mount(
      <AdminPanel slice={slice} components={viewComponents} actions={["remove", "view"]} viewInUrl />,
      viewing("Grace"),
    );

    await click(buttonOf("base.remove"));
    expect(calls.removeAdminTestItem).not.toHaveBeenCalled();
    await click(buttonOf("base.ok"));
    await waitFor(() => replaces.length === 1);
    expect(calls.removeAdminTestItem).toHaveBeenCalledWith(listedId, expect.anything());
    expect(paramsOf(replaces[0]?.href)).toEqual({ topMenu: "account" });
    expect(dialog()).toBeNull();
    unmount();
    setState({ searchParams: {} });
  });

  describe("on an SSR page", () => {
    const setUrl = (url: string) =>
      (window as unknown as { happyDOM: { setURL: (url: string) => void } }).happyDOM.setURL(url);
    //* Mounted the way `SSR.tsx` draws a page, the wrapper holding the request's location. The store starts from the
    //* address bar, as the base store does in a browser, where it loads after the URL is set (`baseSt.test.ts`).
    const mountSsr = async (url: string, node: ReactNode, ready: () => boolean) => {
      setUrl(url);
      makeStore();
      const { pathname, search } = new URL(url);
      setState({ searchParams: Object.fromEntries(new URLSearchParams(search)) });
      return mount(
        <ClientPathWrapper
          initialHref={url}
          initialPath={pathname.replace(/^\/en/, "") || "/"}
          initialPathname={pathname}
          initialParams={{ lang: "en" }}
          initialSearch={search}
          initialHash=""
        >
          {node}
        </ClientPathWrapper>,
        ready,
      );
    };

    test("opens the record a link names and keeps the page's own params when the view closes", async () => {
      replaces.length = 0;
      const { unmount } = await mountSsr(
        `http://localhost/en/admin?topMenu=account&subMenu=user&action=view&modelId=${offPageId}`,
        <AdminPanel slice={slice} components={viewComponents} actions={["view"]} viewInUrl />,
        viewing("Grace"),
      );

      expect(calls.adminTestItem).toHaveBeenCalledWith(offPageId, expect.anything());
      await act(() => storeDo.resetAdminTestItem());
      await waitFor(() => replaces.length === 1);
      expect(paramsOf(replaces[0]?.href)).toEqual({ topMenu: "account", subMenu: "user" });
      unmount();
      setUrl("http://localhost/");
      setState({ searchParams: {} });
    });

    test("writes a row's view beside the page's params, and follows the store as the URL moves", async () => {
      replaces.length = 0;
      const { unmount } = await mountSsr(
        "http://localhost/en/admin?topMenu=account&subMenu=user",
        <AdminPanel slice={slice} components={viewComponents} actions={["view"]} viewInUrl />,
        () => calls.adminTestItemList.mock.calls.length > 0,
      );

      await act(() => storeDo.viewAdminTestItem(listedId));
      await waitFor(() => replaces.length === 1);
      expect(paramsOf(replaces[0]?.href)).toEqual({
        topMenu: "account",
        subMenu: "user",
        action: "view",
        modelId: listedId,
      });
      setState({ searchParams: paramsOf(replaces[0]?.href) });
      setState({ searchParams: { topMenu: "account", subMenu: "user", action: "view", modelId: otherId } });
      await waitFor(viewing("Linus"));
      expect(replaces).toHaveLength(1);
      unmount();
      setUrl("http://localhost/");
      setState({ searchParams: {} });
    });

    test("opens the listing on the query a `?filter=` link names", async () => {
      const { unmount } = await mountSsr(
        "http://localhost/en/admin?topMenu=account&filter=pendingItem",
        <AdminPanel
          slice={slice}
          components={viewComponents}
          queryMap={{ pendingItem: { queryKey: "byPending" } }}
          init={{ limit: 20 }}
        />,
        () => calls.adminTestItemList.mock.calls.length > 0,
      );

      expect(calls.adminTestItemList).toHaveBeenCalledWith("byPending", [], 0, 20, "latest", expect.any(Object));
      unmount();
      setUrl("http://localhost/");
      setState({ searchParams: {} });
    });
  });

  test("leaves the URL alone and ignores its params without `viewInUrl`", async () => {
    makeStore();
    replaces.length = 0;
    setState({ searchParams: { action: "view", modelId: offPageId } });
    const { unmount } = await mount(
      <AdminPanel slice={slice} components={viewComponents} />,
      () => calls.adminTestItemList.mock.calls.length > 0,
    );

    await act(() => storeDo.viewAdminTestItem(listedId));
    await waitFor(viewing("Grace"));
    expect(calls.adminTestItem.mock.calls.map(([id]) => id)).toEqual([listedId]);
    expect(replaces).toEqual([]);
    unmount();
    setState({ searchParams: {} });
  });
});
