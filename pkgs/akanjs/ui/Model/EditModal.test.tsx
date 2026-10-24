import "../../test/registerDom";
import { beforeAll, describe, expect, test } from "bun:test";
import { act, type ReactNode, useState } from "react";
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

type Seed = Record<string, unknown>;
interface ItemState {
  editModalTestItemForm: { id: string | null; title: string };
  editModalTestItemModal: string | null;
}
interface ItemDo {
  setTitleOnEditModalTestItem: (title: string) => void;
  resetEditModalTestItem: () => void;
  newEditModalTestItem: (partial: Seed) => void;
}
const itemState = () => st.get() as unknown as ItemState;
const itemDo = () => st.do as unknown as ItemDo;

const mountSeeded = async (first: Seed) => {
  makeStore();
  st.set({ editModalTestItemModal: null } as never);
  let reseed: (seed: Seed) => void = () => undefined;
  const Host = () => {
    const [seed, setSeed] = useState(first);
    reseed = setSeed;
    return (
      <EditModal slice={slice} type="empty" edit={seed as never} draft={false}>
        <div>item form</div>
      </EditModal>
    );
  };
  const mounted = await mountSuspense(
    <AgentProvider surface={new AgenticSurface()}>
      <Host />
    </AgentProvider>,
  );
  await waitFor(() => document.body.textContent?.includes("item form") ?? false);
  const rerender = (seed: Seed) =>
    act(async () => {
      reseed(seed);
    });
  const typeTitle = (title: string) =>
    act(async () => {
      itemDo().setTitleOnEditModalTestItem(title);
    });
  return { ...mounted, rerender, typeTitle };
};

const itemId = "6ad7bb63f23a4492fe89855b";
const editOf = (title: string, updatedAt: Date) => ({
  refName: "editModalTestItem",
  editModalTestItemObj: { id: itemId, title, updatedAt },
  editModalTestItemViewAt: new Date(),
});

describe("Model.EditModal", () => {
  test("keeps what was typed when the parent re-renders an equal new seed, and refills a changed one", async () => {
    const { rerender, typeTitle, unmount } = await mountSeeded({ title: "saved" });
    expect(itemState().editModalTestItemForm.title).toBe("saved");
    await typeTitle("typed");
    await rerender({ title: "saved" });
    expect(itemState().editModalTestItemForm.title).toBe("typed");
    await rerender({ title: "moved" });
    expect(itemState().editModalTestItemForm.title).toBe("moved");
    unmount();
  });

  test("keeps an edit form across a refresh of the same record version, and refills a newer one", async () => {
    const savedAt = new Date("2026-10-24T00:00:00.000Z");
    const { rerender, typeTitle, unmount } = await mountSeeded(editOf("saved", savedAt));
    expect(itemState().editModalTestItemForm).toMatchObject({ id: itemId, title: "saved" });
    await typeTitle("typed");
    await rerender(editOf("saved", new Date(savedAt)));
    expect(itemState().editModalTestItemForm.title).toBe("typed");
    await rerender(editOf("remote", new Date(savedAt.getTime() + 1_000)));
    expect(itemState().editModalTestItemForm.title).toBe("remote");
    unmount();
  });

  test("opens a fresh form for an equal seed once a submit or a cancel closed it", async () => {
    const { rerender, typeTitle, unmount } = await mountSeeded({ title: "saved" });
    await typeTitle("typed");
    await act(async () => {
      itemDo().resetEditModalTestItem();
    });
    expect(itemState().editModalTestItemModal).toBeNull();
    await rerender({ title: "saved" });
    expect(itemState()).toMatchObject({ editModalTestItemModal: "edit", editModalTestItemForm: { title: "saved" } });
    unmount();
  });

  test("leaves a form another editor of the model opened alone when an equal seed re-renders", async () => {
    const { rerender, unmount } = await mountSeeded(editOf("saved", new Date("2026-10-24T00:00:00.000Z")));
    await act(async () => {
      itemDo().newEditModalTestItem({ title: "other" });
    });
    await rerender(editOf("saved", new Date("2026-10-24T00:00:00.000Z")));
    expect(itemState().editModalTestItemForm).toMatchObject({ id: "", title: "other" });
    unmount();
  });

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
