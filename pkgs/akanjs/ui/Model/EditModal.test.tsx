import "../../test/registerDom";
import { beforeAll, describe, expect, test } from "bun:test";
import { act, type ReactNode } from "react";
import { AgenticSurface, AgentProvider } from "use-agentic";
import { itemFixtureOf, l, mountSuspense, setTestEnv, waitFor } from "../testHelpers.fixture";

let EditModal: typeof import("./EditModal").default;
let NewWrapper: typeof import("./NewWrapper").default;
let st: typeof import("akanjs/store").st;
let makeStore: () => void;

const slice = { refName: "editModalTestItem", sliceName: "editModalTestItem", argLength: 1 };
const inParent = { ...slice, sliceName: "editModalTestItemInParent" };

beforeAll(async () => {
  setTestEnv("editmodaltest");
  const { storeMaker } = await itemFixtureOf("editModalTestItem");
  const { registerClientRuntime } = await import("akanjs/client");
  registerClientRuntime({
    usePage: () => ({ path: "/", lang: "en", l }),
    fetch: { sortKeyMap: new Map([["editModalTestItem", ["latest"]]]) },
  } as never);
  makeStore = storeMaker({ root: "editModalRoot" });
  ({ st } = await import("akanjs/store"));
  ({ default: EditModal } = await import("./EditModal"));
  ({ default: NewWrapper } = await import("./NewWrapper"));
});

const openFromParentTrigger = async (editors: ReactNode) => {
  makeStore();
  st.set({ editModalTestItemModal: null } as never);
  const surface = new AgenticSurface();
  const mounted = await mountSuspense(
    <AgentProvider surface={surface}>
      <NewWrapper slice={inParent}>
        <button type="button">new</button>
      </NewWrapper>
      {editors}
    </AgentProvider>,
  );
  const names = () => surface.snapshot().tools.map((tool) => tool.name);
  await waitFor(() => names().includes("newEditModalTestItemInParent"));
  await act(async () => {
    await surface.call("newEditModalTestItemInParent", {});
  });
  return mounted;
};

describe("Model.EditModal", () => {
  test("opens a new form a trigger of another slice opened while no editor of that slice is on screen", async () => {
    const { unmount } = await openFromParentTrigger(
      <EditModal slice={slice}>
        <div>item form</div>
      </EditModal>,
    );
    await waitFor(() => document.body.textContent?.includes("item form") ?? false);
    expect(document.body.textContent).toContain("item form");
    unmount();
  });

  test("stays shut for a trigger of another slice while an editor of that slice is on screen to open it", async () => {
    const { unmount } = await openFromParentTrigger(
      <>
        <EditModal slice={slice}>
          <div>item form</div>
        </EditModal>
        <EditModal slice={inParent}>
          <div>parent form</div>
        </EditModal>
      </>,
    );
    await waitFor(() => document.body.textContent?.includes("parent form") ?? false);
    expect(document.body.textContent).toContain("parent form");
    expect(document.body.textContent).not.toContain("item form");
    unmount();
  });
});
