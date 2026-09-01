import "../../test/registerDom";
import { beforeAll, describe, expect, mock, test } from "bun:test";
import type { ClientSignal } from "akanjs/fetch";
import { act, type ReactNode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { AgenticSurface, AgentProvider } from "use-agentic";

let EditWrapper: typeof import("./EditWrapper").default;
let ViewWrapper: typeof import("./ViewWrapper").default;
let RemoveWrapper: typeof import("./RemoveWrapper").default;
let calls: Record<string, ReturnType<typeof mock>>;
let makeStore: () => void;

const slice = { refName: "rowTestItem", sliceName: "rowTestItem", argLength: 1 };
const rowIds = ["aaaaaaaaaaaaaaaaaaaaaa01", "aaaaaaaaaaaaaaaaaaaaaa02", "aaaaaaaaaaaaaaaaaaaaaa03"];
const l = Object.assign((key: string) => key, {
  _: (key: string) => key,
  rich: (key: string) => key,
  trans: (translation: Record<string, string>) => translation.en,
});

/** Imported after the environment is set: `akanjs/store`'s baseSt reads the env while the module evaluates. */
beforeAll(async () => {
  process.env.AKAN_PUBLIC_APP_NAME = "rowwrappertest";
  process.env.AKAN_PUBLIC_REPO_NAME = "rowwrappertest";
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
  const cnst = ConstantRegistry.buildModel("rowTestItem", Input, Obj, Full, Light, Insight, {});
  calls = { rowTestItem: mock(async (id: string) => new Full({ id, title: "Ada" })) };
  registerClientRuntime({
    usePage: () => ({ path: "/", lang: "en", l }),
    fetch: { sortKeyMap: new Map([["rowTestItem", ["latest"]]]) },
  } as never);
  const signal = {
    refName: "rowTestItem",
    _slice: { [SLICE_META]: {} },
    cnst,
    fetch: new Proxy(calls, {
      get(target, key: string) {
        target[key] ??= mock(async () => null);
        return target[key];
      },
    }),
    serializedSignal: { prefix: "rowTestItem", endpoint: {}, slice: { "": { args: [] } } },
    slices: [],
  } as unknown as ClientSignal<"rowTestItem">;
  makeStore = () => {
    for (const call of Object.values(calls)) call.mockClear();
    class ItemStore extends store(signal, () => ({})) {}
    StoreRegistry.register(ItemStore);
    StoreRegistry.build(StoreRegistry.merge("rowWrapperRoot", ItemStore));
  };
  ({ default: EditWrapper } = await import("./EditWrapper"));
  ({ default: ViewWrapper } = await import("./ViewWrapper"));
  ({ default: RemoveWrapper } = await import("./RemoveWrapper"));
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

describe("Model row wrappers", () => {
  test("every row registers the one verb, and the id it acts on comes from the call", async () => {
    makeStore();
    const surface = new AgenticSurface();
    const warnings: string[] = [];
    const warn = console.warn;
    console.warn = (message: string) => warnings.push(message);
    try {
      const { container, unmount } = await mount(
        <AgentProvider surface={surface}>
          {rowIds.map((id) => (
            <EditWrapper key={id} slice={slice} modelId={id}>
              <span>{id}</span>
            </EditWrapper>
          ))}
        </AgentProvider>,
      );

      const tools = surface.snapshot().tools;
      expect(tools.map((tool) => tool.name)).toEqual(["editRowTestItem"]);
      expect(warnings).toEqual([]);
      // Every row carries the annotation, because every row is a working entry point to the same verb.
      expect(container.querySelectorAll('[data-akan-action="editRowTestItem"]')).toHaveLength(rowIds.length);
      expect(tools[0].parameters?.properties).toEqual({ modelId: { type: "string" } });

      await act(async () => {
        await surface.call("editRowTestItem", { modelId: rowIds[1] });
      });
      expect(calls.rowTestItem).toHaveBeenCalledWith(rowIds[1], expect.any(Object));
      unmount();
    } finally {
      console.warn = warn;
    }
  });

  test("the detail and removal wrappers publish their own verb, and removal asks first", async () => {
    makeStore();
    const surface = new AgenticSurface();
    const { unmount } = await mount(
      <AgentProvider surface={surface}>
        <ViewWrapper slice={slice} modelId={rowIds[0]}>
          <span>view</span>
        </ViewWrapper>
        <RemoveWrapper slice={slice} modelId={rowIds[0]} name="Ada">
          <span>remove</span>
        </RemoveWrapper>
      </AgentProvider>,
    );

    const tools = surface.snapshot().tools;
    expect(tools.map((tool) => tool.name).sort()).toEqual(["removeRowTestItem", "viewRowTestItem"]);
    // The Popconfirm a person answers; the approval card is the agent's half of it.
    expect(tools.find((tool) => tool.name === "removeRowTestItem")?.needsConfirm).toBe(true);
    expect(tools.find((tool) => tool.name === "viewRowTestItem")?.needsConfirm).toBe(false);
    unmount();
  });
});
