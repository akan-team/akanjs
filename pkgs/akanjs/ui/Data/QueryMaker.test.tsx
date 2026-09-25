import "../../test/registerDom";
import { beforeAll, describe, expect, mock, test } from "bun:test";
import type { ClientSignal } from "akanjs/fetch";
import { act, type ReactNode, Suspense } from "react";
import { createRoot } from "react-dom/client";

let QueryMaker: typeof import("./QueryMaker").default;
let makeStore: () => void;
let calls: Record<string, ReturnType<typeof mock>>;
let ownerRows: { id: string; nickname: string }[];

// ObjectId-shaped, because building a Light row validates its id.
const adaId = "6650000000000000000000a1";
const linusId = "6650000000000000000000b2";

const slice = { refName: "queryMakerTestItem", sliceName: "queryMakerTestItem", argLength: 2 };
const l = Object.assign((key: string) => key, {
  _: (key: string) => key,
  rich: (key: string) => key,
  trans: (translation: Record<string, string>) => translation.en,
});
const filterQuery = {
  any: [],
  byTitle: [{ type: "search", name: "title", refName: "String" }],
  byAuthor: [{ type: "search", name: "authorId", refName: "ID", modelType: "object" }],
  byOwner: [{ type: "search", name: "ownerId", refName: "ID", ref: "queryMakerTestOwner" }],
};
const ownerFilterQuery = {
  any: [],
  // The ref model's own filter points back at a model, which is what makes a picker open inside a picker.
  byManager: [{ type: "search", name: "managerId", refName: "ID", ref: "queryMakerTestOwner" }],
};

/** The options portal out of the maker, so a pick is a click on the panel React mounted on `document.body`. */
const pickOption = async (label: string) => {
  // The option's own row carries the click handler; its `.group` wrapper does not, so dispatch on the row.
  const option = [...document.querySelectorAll("[data-akan-overlay] .group > div")].find((node) =>
    node.textContent?.startsWith(label),
  );
  if (!option) throw new Error(`No "${label}" option is offered`);
  await act(async () => {
    option.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
};

/** Clicks the first button whose text contains `text`, anywhere on the page — the picker modal portals out. */
const clickButton = async (text: string) => {
  const button = [...document.querySelectorAll("button")].find((node) => node.textContent?.includes(text));
  if (!button) throw new Error(`No "${text}" button is rendered`);
  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
};

/** The maker debounces its writes, so a pick lands one timer later. */
const settleDebounce = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 200));
  });
};

/** Imported after the environment is set: `akanjs/store`'s baseSt reads the env while the module evaluates. */
beforeAll(async () => {
  process.env.AKAN_PUBLIC_APP_NAME = "querymakertest";
  process.env.AKAN_PUBLIC_REPO_NAME = "querymakertest";
  process.env.AKAN_PUBLIC_SERVE_DOMAIN = "localhost";
  process.env.AKAN_PUBLIC_ENV = "testing";
  const { Int, SLICE_META } = await import("akanjs/base");
  const { ConstantRegistry, via } = await import("akanjs/constant");
  const { registerClientRuntime } = await import("akanjs/client");
  const { store, StoreRegistry } = await import("akanjs/store");

  const Input = via((f) => ({ title: f(String) }));
  const Obj = via(Input, () => ({}));
  const Light = via(Obj, ["title"] as const, () => ({}));
  const Full = via(Obj, Light, () => ({}));
  const Insight = via(Full, (f) => ({ count: f(Int, { default: 0 }) }));
  const cnst = ConstantRegistry.buildModel("queryMakerTestItem", Input, Obj, Full, Light, Insight, {});
  calls = {
    queryMakerTestItemList: mock(async () => []),
    queryMakerTestItemInsight: mock(async () => new Insight({ count: 0 })),
  };
  const signalFetch = new Proxy(calls, {
    get(target, key: string) {
      target[key] ??= mock(async () => null);
      return target[key];
    },
  });
  const OwnerInput = via((f) => ({ nickname: f(String) }));
  const OwnerObj = via(OwnerInput, () => ({}));
  // A model that writes its own one-liner, which is what a picker row should show instead of the id.
  class OwnerLight extends via(OwnerObj, ["nickname"] as const, () => ({})) {
    label() {
      return this.nickname ? `@${this.nickname}` : "";
    }
  }
  const OwnerFull = via(OwnerObj, OwnerLight, () => ({}));
  const OwnerInsight = via(OwnerFull, (f) => ({ count: f(Int, { default: 0 }) }));
  ConstantRegistry.buildModel("queryMakerTestOwner", OwnerInput, OwnerObj, OwnerFull, OwnerLight, OwnerInsight, {});
  ownerRows = [];
  const ownerList = mock(async () => ownerRows.map((row) => new OwnerLight(row)));
  registerClientRuntime({
    usePage: () => ({ path: "/", lang: "en", l }),
    fetch: {
      filterQueryMap: new Map([
        ["queryMakerTestItem", filterQuery],
        ["queryMakerTestOwner", ownerFilterQuery],
      ]),
      slice: {
        queryMakerTestOwner: { refName: "queryMakerTestOwner", sliceName: "queryMakerTestOwner", argLength: 2 },
      },
      queryMakerTestOwnerList: ownerList,
    },
  } as never);
  const signal = {
    refName: "queryMakerTestItem",
    _slice: { [SLICE_META]: {} },
    cnst,
    fetch: signalFetch,
    serializedSignal: {
      prefix: "queryMakerTestItem",
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
  } as unknown as ClientSignal<"queryMakerTestItem">;
  makeStore = () => {
    for (const call of Object.values(calls)) call.mockClear();
    class ItemStore extends store(signal, () => ({})) {}
    StoreRegistry.register(ItemStore);
    StoreRegistry.build(StoreRegistry.merge("queryMakerRoot", ItemStore));
  };
  ({ default: QueryMaker } = await import("./QueryMaker"));
});

const mount = async (node: ReactNode) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<Suspense>{node}</Suspense>);
  });
  return { container, unmount: () => act(() => root.unmount()) };
};

describe("Data.QueryMaker", () => {
  test("offers the filters the client can fill, and the args the selected one takes", async () => {
    makeStore();
    const { container, unmount } = await mount(<QueryMaker slice={slice} query={{ queryKey: "byTitle" }} />);

    // The options live in the select's portal, not under the maker itself.
    const options = document.querySelector("[data-akan-overlay]")?.textContent ?? "";
    expect(options).toContain("Any");
    expect(options).toContain("By Title");
    // `byAuthor` takes a model, which no input here can type, so the filter that needs it is not offered.
    expect(options).not.toContain("By Author");
    // The selected filter and the one arg it declares, both labelled through the dictionary.
    expect(container.textContent).toContain("By Title");
    expect(container.textContent).toContain("Title");
    unmount();
  });

  test("holds a filter whose required arg is still empty instead of sending a query the server refuses", async () => {
    makeStore();
    const { container, unmount } = await mount(<QueryMaker slice={slice} />);

    await pickOption("By Title");
    // The pick lands — the maker keeps the filter the user chose — but `byTitle` has nowhere to read a title
    // from yet, and the server refuses a filter arg it was not given. Only the request waits.
    expect(container.textContent).toContain("By Title");
    expect(calls.queryMakerTestItemList).not.toHaveBeenCalled();

    await pickOption("Any");
    await settleDebounce();
    expect(calls.queryMakerTestItemList).toHaveBeenCalled();
    expect(calls.queryMakerTestItemList.mock.calls[0]?.slice(0, 2)).toEqual(["any", []]);
    unmount();
  });

  test("picks an id the filter declared against a model from that model's own rows", async () => {
    makeStore();
    ownerRows = [
      { id: adaId, nickname: "ada" },
      { id: linusId, nickname: "linus" },
    ];
    const { container, unmount } = await mount(<QueryMaker slice={slice} query={{ queryKey: "byOwner" }} />);

    // An id pointing at a model is picked, not typed, so the arg gets a picker instead of a hex field.
    expect(container.querySelector("input")).toBeNull();
    await clickButton("Select");

    // Rows are labelled by the method the ref model's Light class wrote, with the id kept beside it.
    const modal = document.querySelector("[role=dialog]");
    expect(modal?.textContent).toContain("@ada");
    expect(modal?.textContent).toContain("@linus");
    expect(modal?.textContent).toContain(adaId);

    await clickButton("@ada");
    await settleDebounce();
    expect(calls.queryMakerTestItemList.mock.calls[0]?.slice(0, 2)).toEqual(["byOwner", [adaId]]);
    // The modal closes onto the row that was picked, by its label rather than its id.
    expect(document.querySelector("[role=dialog]")).toBeNull();
    expect(container.textContent).toContain("@ada");
    unmount();
  });

  test("says how to give the referenced model a label when none of its rows has one", async () => {
    makeStore();
    ownerRows = [{ id: adaId, nickname: "" }];
    const { unmount } = await mount(<QueryMaker slice={slice} query={{ queryKey: "byOwner" }} />);

    await clickButton("Select");
    const modal = document.querySelector("[role=dialog]");
    expect(modal?.textContent).toContain(adaId);
    expect(modal?.textContent).toContain("label() method to LightQueryMakerTestOwner");
    unmount();
  });

  test("keeps nesting when the referenced model's own filter points at a model too", async () => {
    makeStore();
    ownerRows = [{ id: adaId, nickname: "ada" }];
    const { unmount } = await mount(<QueryMaker slice={slice} query={{ queryKey: "byOwner" }} />);

    await clickButton("Select");
    expect(document.querySelectorAll("[role=dialog]")).toHaveLength(1);

    await pickOption("By Manager");
    const nested = [...document.querySelectorAll("[role=dialog] button")].filter((node) =>
      node.textContent?.includes("Select"),
    );
    expect(nested).toHaveLength(1);
    await act(async () => {
      nested[0]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(document.querySelectorAll("[role=dialog]")).toHaveLength(2);
    unmount();
  });

  test("renders nothing when the model declares no filter beyond the one every model has", async () => {
    makeStore();
    const { container, unmount } = await mount(<QueryMaker slice={{ ...slice, refName: "unfiltered" }} />);

    expect(container.textContent).toBe("");
    unmount();
  });
});
