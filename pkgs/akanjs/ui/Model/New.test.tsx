import "../../test/registerDom";
import { beforeAll, describe, expect, mock, test } from "bun:test";
import type { ClientSignal } from "akanjs/fetch";
import { act, type ReactNode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { AgenticSurface, AgentProvider } from "use-agentic";

let New: typeof import("./New").default;
let makeStore: () => void;

const slice = { refName: "newTestItem", sliceName: "newTestItem", argLength: 1 };
const l = Object.assign((key: string) => key, {
  _: (key: string) => key,
  rich: (key: string) => key,
  trans: (translation: Record<string, string>) => translation.en,
});

/** Imported after the environment is set: `akanjs/store`'s baseSt reads the env while the module evaluates. */
beforeAll(async () => {
  process.env.AKAN_PUBLIC_APP_NAME = "newwrappertest";
  process.env.AKAN_PUBLIC_REPO_NAME = "newwrappertest";
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
  const cnst = ConstantRegistry.buildModel("newTestItem", Input, Obj, Full, Light, Insight, {});
  registerClientRuntime({
    usePage: () => ({ path: "/", lang: "en", l }),
    fetch: { sortKeyMap: new Map([["newTestItem", ["latest"]]]) },
  } as never);
  const signal = {
    refName: "newTestItem",
    _slice: { [SLICE_META]: {} },
    cnst,
    fetch: new Proxy({} as Record<string, unknown>, {
      get(target, key: string) {
        target[key] ??= mock(async () => null);
        return target[key];
      },
    }),
    serializedSignal: { prefix: "newTestItem", endpoint: {}, slice: { "": { args: [] } } },
    slices: [],
  } as unknown as ClientSignal<"newTestItem">;
  makeStore = () => {
    class ItemStore extends store(signal, () => ({})) {}
    StoreRegistry.register(ItemStore);
    StoreRegistry.build(StoreRegistry.merge("newWrapperRoot", ItemStore));
  };
  ({ default: New } = await import("./New"));
});

const waitFor = async (done: () => boolean) => {
  for (let i = 0; i < 200 && !done(); i += 1)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
};

const mount = async (node: ReactNode) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<Suspense>{node}</Suspense>);
  });
  return { container, unmount: () => act(() => root.unmount()) };
};

describe("Model.New", () => {
  test("publishes the create trigger, and the editor's verbs once the form it opens is on screen", async () => {
    makeStore();
    const surface = new AgenticSurface();
    const { container, unmount } = await mount(
      <AgentProvider surface={surface}>
        <New slice={slice}>
          <div>form</div>
        </New>
      </AgentProvider>,
    );
    const names = () => surface.snapshot().tools.map((tool) => tool.name);
    await waitFor(() => names().includes("newNewTestItem"));

    // The trigger carries the same name `readScreen` reads, so an agent can tie the button to the tool.
    expect(container.querySelector('[data-akan-action="newNewTestItem"]')).not.toBeNull();
    expect(names()).not.toContain("submitNewTestItem");

    await act(async () => {
      await surface.call("newNewTestItem", {});
    });
    await waitFor(() => names().includes("submitNewTestItem"));
    expect(names()).toContain("cancelEditOfNewTestItem");
    // The open editor subscribes the form, which is what makes the fields writable.
    expect(names()).toContain("fillNewTestItemForm");

    await act(async () => {
      await surface.call("cancelEditOfNewTestItem", {});
    });
    await waitFor(() => !names().includes("submitNewTestItem"));
    expect(names()).not.toContain("submitNewTestItem");
    unmount();
  });

  test("suffixes the tool name so a second create trigger on one screen is reachable too", async () => {
    makeStore();
    const surface = new AgenticSurface();
    const { unmount } = await mount(
      <AgentProvider surface={surface}>
        <New slice={slice} namespace="draft">
          <div>form</div>
        </New>
      </AgentProvider>,
    );
    const names = () => surface.snapshot().tools.map((tool) => tool.name);
    await waitFor(() => names().includes("newNewTestItemInDraft"));

    expect(names()).toContain("newNewTestItemInDraft");
    expect(names()).not.toContain("newNewTestItem");
    unmount();
  });
});
