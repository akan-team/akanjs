import "../../test/registerDom";
import { beforeAll, describe, expect, test } from "bun:test";
import { act } from "react";
import { AgenticSurface, AgentProvider } from "use-agentic";
import { itemFixtureOf, l, mountSuspense, setTestEnv, waitFor } from "../testHelpers.fixture";

let ViewEditModal: typeof import("./ViewEditModal").default;
let st: typeof import("akanjs/store").st;
let makeStore: () => void;
let Full: Awaited<ReturnType<typeof itemFixtureOf<"viewEditTestItem">>>["Full"];
const runtimeFetch: Record<string, unknown> = { sortKeyMap: new Map([["viewEditTestItem", ["latest"]]]) };

const slice = { refName: "viewEditTestItem", sliceName: "viewEditTestItem", argLength: 1 };

beforeAll(async () => {
  setTestEnv("vieweditmodaltest");
  const fixture = await itemFixtureOf("viewEditTestItem");
  Full = fixture.Full;
  const { registerClientRuntime } = await import("akanjs/client");
  ({ st } = await import("akanjs/store"));
  registerClientRuntime({ usePage: () => ({ path: "/", lang: "en", l }), fetch: runtimeFetch } as never);
  makeStore = fixture.storeMaker({ root: "viewEditModalRoot" });
  ({ default: ViewEditModal } = await import("./ViewEditModal"));
});

const openView = async (surface = new AgenticSurface()) => {
  makeStore();
  st.set({
    viewEditTestItem: new Full({ id: "aaaaaaaaaaaaaaaaaaaaaa01", title: "Ada" }),
    viewEditTestItemModal: "view",
    viewEditTestItemLoading: false,
  } as never);
  const mounted = await mountSuspense(
    <AgentProvider surface={surface}>
      <ViewEditModal
        slice={slice}
        renderView={(model: { title: string }) => <div>{model.title}</div>}
        renderTemplate={() => <div>form</div>}
      />
    </AgentProvider>,
  );
  await waitFor(() => document.body.textContent?.includes("Ada") ?? false);
  return mounted;
};
const editButton = () => document.body.querySelector('[data-akan-action="editViewEditTestItem"]');
const menuButton = () => document.body.querySelector("[role=dialog] button[aria-haspopup]");

describe("Model.ViewEditModal", () => {
  test("offers edit and the remove menu when the slice serves both verbs", async () => {
    runtimeFetch.updateViewEditTestItem = async () => null;
    runtimeFetch.removeViewEditTestItem = async () => null;
    const { unmount } = await openView();
    expect(document.body.textContent).toContain("Ada");
    expect(editButton()).not.toBeNull();
    expect(menuButton()).not.toBeNull();
    unmount();
  });

  test("leaves out edit and the remove menu when the slice's guards close them", async () => {
    delete runtimeFetch.updateViewEditTestItem;
    delete runtimeFetch.removeViewEditTestItem;
    const { unmount } = await openView();
    expect(document.body.textContent).toContain("Ada");
    expect(editButton()).toBeNull();
    expect(menuButton()).toBeNull();
    unmount();
  });

  test("lets an agent close the view whether or not the slice serves update", async () => {
    for (const servesUpdate of [true, false]) {
      if (servesUpdate) runtimeFetch.updateViewEditTestItem = async () => null;
      else delete runtimeFetch.updateViewEditTestItem;
      const surface = new AgenticSurface();
      const { unmount } = await openView(surface);
      const names = () => surface.snapshot().tools.map((tool) => tool.name);
      await waitFor(() => names().includes("closeViewOfViewEditTestItem"));
      expect(names()).toContain("closeViewOfViewEditTestItem");

      await act(async () => {
        await surface.call("closeViewOfViewEditTestItem", {});
      });
      await waitFor(() => !document.body.textContent?.includes("Ada"));
      expect(document.body.textContent).not.toContain("Ada");
      expect(names()).not.toContain("closeViewOfViewEditTestItem");
      unmount();
    }
  });
});
