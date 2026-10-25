import "../../test/registerDom";
import { beforeAll, describe, expect, test } from "bun:test";
import { act } from "react";
import { AgenticSurface, AgentProvider } from "use-agentic";
import { itemFixtureOf, l, mountSuspense, setTestEnv, waitFor } from "../testHelpers.fixture";

let New: typeof import("./New").default;
let st: typeof import("akanjs/store").st;
let makeStore: () => void;

const slice = { refName: "newTestItem", sliceName: "newTestItem", argLength: 1 };

beforeAll(async () => {
  setTestEnv("newwrappertest");
  const { storeMaker } = await itemFixtureOf("newTestItem");
  const { registerClientRuntime } = await import("akanjs/client");
  registerClientRuntime({
    usePage: () => ({ path: "/", lang: "en", l }),
    fetch: { sortKeyMap: new Map([["newTestItem", ["latest"]]]) },
  } as never);
  makeStore = storeMaker({ root: "newWrapperRoot" });
  ({ st } = await import("akanjs/store"));
  ({ default: New } = await import("./New"));
});

describe("Model.New", () => {
  test("publishes the create trigger, and the editor's verbs once the form it opens is on screen", async () => {
    makeStore();
    const surface = new AgenticSurface();
    const { container, unmount } = await mountSuspense(
      <AgentProvider surface={surface}>
        <New slice={slice}>
          <div>form</div>
        </New>
      </AgentProvider>,
    );
    const names = () => surface.snapshot().tools.map((tool) => tool.name);
    await waitFor(() => names().includes("newNewTestItem"));

    expect(container.querySelector('[data-akan-action="newNewTestItem"]')).not.toBeNull();
    expect(names()).not.toContain("submitNewTestItem");

    await act(async () => {
      await surface.call("newNewTestItem", {});
    });
    await waitFor(() => names().includes("submitNewTestItem"));
    expect(names()).toContain("cancelEditOfNewTestItem");
    expect(names()).toContain("fillNewTestItemForm");

    await act(async () => {
      await surface.call("cancelEditOfNewTestItem", {});
    });
    await waitFor(() => !names().includes("submitNewTestItem"));
    expect(names()).not.toContain("submitNewTestItem");
    unmount();
  });

  test("opens its own form under the modal name it was given", async () => {
    makeStore();
    const surface = new AgenticSurface();
    const { unmount } = await mountSuspense(
      <AgentProvider surface={surface}>
        <New slice={slice} modal="quick">
          <div>quick form</div>
        </New>
      </AgentProvider>,
    );
    const names = () => surface.snapshot().tools.map((tool) => tool.name);
    await waitFor(() => names().includes("newNewTestItem"));
    await act(async () => {
      await surface.call("newNewTestItem", {});
    });
    await waitFor(() => document.body.textContent?.includes("quick form") ?? false);
    expect(document.body.textContent).toContain("quick form");
    unmount();
  });

  test("refuses another create while its own form is open, so the agent cannot replace what was typed", async () => {
    makeStore();
    st.set({ newTestItemModal: null } as never);
    const surface = new AgenticSurface();
    const { unmount } = await mountSuspense(
      <AgentProvider surface={surface}>
        <New slice={slice} modal="quick">
          <div>quick form</div>
        </New>
      </AgentProvider>,
    );
    try {
      const names = () => surface.snapshot().tools.map((tool) => tool.name);
      await waitFor(() => names().includes("newNewTestItem"));
      await act(async () => {
        await surface.call("newNewTestItem", {});
      });
      await waitFor(() => document.body.textContent?.includes("quick form") ?? false);
      act(() => {
        (st.do as unknown as { setTitleOnNewTestItem: (title: string) => void }).setTitleOnNewTestItem("typed");
      });

      await act(async () => {
        await expect(surface.call("newNewTestItem", {})).rejects.toThrow("already open");
      });
      expect((st.get() as unknown as { newTestItemForm: { title: string } }).newTestItemForm.title).toBe("typed");
    } finally {
      unmount();
    }
  });

  test("of two create buttons of one model on different slices, opens only the form of the one pressed", async () => {
    makeStore();
    const surface = new AgenticSurface();
    const other = { ...slice, sliceName: "newTestItemInParent" };
    const { unmount } = await mountSuspense(
      <AgentProvider surface={surface}>
        <New slice={slice}>
          <div>self form</div>
        </New>
        <New slice={other}>
          <div>parent form</div>
        </New>
      </AgentProvider>,
    );
    const names = () => surface.snapshot().tools.map((tool) => tool.name);
    await waitFor(() => names().includes("newNewTestItemInParent"));
    await act(async () => {
      await surface.call("newNewTestItemInParent", {});
    });
    await waitFor(() => document.body.textContent?.includes("parent form") ?? false);
    expect(document.body.textContent).toContain("parent form");
    expect(document.body.textContent).not.toContain("self form");
    unmount();
  });

  test("suffixes the tool name so a second create trigger on one screen is reachable too", async () => {
    makeStore();
    const surface = new AgenticSurface();
    const { unmount } = await mountSuspense(
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
