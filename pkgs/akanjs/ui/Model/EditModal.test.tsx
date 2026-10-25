import "../../test/registerDom";
import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";
import { act, type ReactNode, useState } from "react";
import { AgenticSurface, AgentProvider } from "use-agentic";
import { itemFixtureOf, l, mountSuspense, setTestEnv, waitFor } from "../testHelpers.fixture";

let EditModal: typeof import("./EditModal").default;
let NewWrapper: typeof import("./NewWrapper").default;
let st: typeof import("akanjs/store").st;
let DraftStore: typeof import("akanjs/store").DraftStore;
let ItemFull: Awaited<ReturnType<typeof itemFixtureOf<"editModalTestItem">>>["Full"];
let makeStore: () => void;
let refetchOf: (id: string) => Promise<unknown> = async () => null;

const slice = { refName: "editModalTestItem", sliceName: "editModalTestItem", argLength: 1 };
const inParent = { ...slice, sliceName: "editModalTestItemInParent" };

beforeAll(async () => {
  setTestEnv("editmodaltest");
  const { Full, storeMaker } = await itemFixtureOf("editModalTestItem");
  ItemFull = Full;
  const { registerClientRuntime } = await import("akanjs/client");
  registerClientRuntime({
    usePage: () => ({ path: "/", lang: "en", l }),
    fetch: { sortKeyMap: new Map([["editModalTestItem", ["latest"]]]) },
  } as never);
  makeStore = storeMaker({
    root: "editModalRoot",
    calls: { editModalTestItem: mock((id: string) => refetchOf(id)) },
  });
  ({ st, DraftStore } = await import("akanjs/store"));
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
interface ItemForm {
  id: string | null;
  title: string;
}
interface ItemState {
  editModalTestItemForm: ItemForm;
  editModalTestItemModal: string | null;
  editModalTestItemFormDraft: { pending: { form: ItemForm } | null } | null;
}
interface ItemDo {
  setTitleOnEditModalTestItem: (title: string) => void;
  resetEditModalTestItem: () => void;
  newEditModalTestItem: (partial: Seed) => void;
}
const itemState = () => st.get() as unknown as ItemState;
const itemDo = () => st.do as unknown as ItemDo;

const mountEditor = async (first: Seed, draft: boolean) => {
  let reseed: (seed: Seed) => void = () => undefined;
  const Host = () => {
    const [seed, setSeed] = useState(first);
    reseed = setSeed;
    return (
      <EditModal slice={slice} type="empty" edit={seed as never} draft={draft}>
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

const mountSeeded = async (first: Seed) => {
  makeStore();
  st.set({ editModalTestItemModal: null } as never);
  return mountEditor(first, false);
};

const itemId = "6ad7bb63f23a4492fe89855b";
const otherItemId = "6ad7bb63f23a4492fe89855c";
const editOf = (title: string, updatedAt: Date, id = itemId) => ({
  refName: "editModalTestItem",
  editModalTestItemObj: { id, title, updatedAt },
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

describe("Model.EditModal form drafts", () => {
  const savedAt = new Date("2026-10-24T00:00:00.000Z");

  const startDrafts = () => {
    makeStore();
    st.set({ editModalTestItemModal: null, editModalTestItemFormDraft: null } as never);
    localStorage.clear();
  };
  const storedFormOf = (id: string) => {
    const raw = localStorage.getItem(DraftStore.keyOf("editModalTestItem", DraftStore.editScope(id)));
    return raw ? (JSON.parse(raw) as { form: ItemForm }).form : null;
  };
  const pastDraftDebounce = () =>
    act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 450));
    });
  const holdRefetch = (record: Seed) => {
    let release: () => void = () => undefined;
    refetchOf = () =>
      new Promise((resolve) => {
        release = () => resolve(new ItemFull().set(record as never));
      });
    return () =>
      act(async () => {
        release();
      });
  };
  const replayedFromCache = async <T,>(open: () => Promise<T>) => {
    globalThis.__AKAN_RSC_IS_FROM_CACHE__ = () => true;
    try {
      return await open();
    } finally {
      globalThis.__AKAN_RSC_IS_FROM_CACHE__ = undefined;
    }
  };
  const leave = async ({ unmount }: { unmount: () => void }) => {
    unmount();
    await act(async () => undefined);
  };

  afterEach(() => {
    refetchOf = async () => null;
    st.set({ editModalTestItemModal: null, editModalTestItemFormDraft: null } as never);
    localStorage.clear();
  });

  test("restores the draft when Back replays the edit page and its refetch outlasts the save delay", async () => {
    startDrafts();
    const first = await mountEditor(editOf("saved", savedAt), true);
    await first.typeTitle("typed");
    await pastDraftDebounce();
    expect(storedFormOf(itemId)?.title).toBe("typed");
    await leave(first);

    const releaseRefetch = holdRefetch({ id: itemId, title: "saved", updatedAt: savedAt });
    const back = await replayedFromCache(() => mountEditor(editOf("saved", savedAt), true));
    await pastDraftDebounce();
    await releaseRefetch();
    expect(storedFormOf(itemId)?.title).toBe("typed");
    expect(itemState().editModalTestItemForm.title).toBe("typed");
    back.unmount();
  });

  test("keeps the offered draft stored when a refresh refills the form with a newer version", async () => {
    startDrafts();
    const editor = await mountEditor(editOf("saved", savedAt), true);
    await editor.typeTitle("typed");
    await pastDraftDebounce();
    await editor.typeTitle("typed more");
    await editor.rerender(editOf("remote", new Date(savedAt.getTime() + 1_000)));
    expect(itemState().editModalTestItemForm.title).toBe("remote");
    await pastDraftDebounce();
    expect(storedFormOf(itemId)?.title).toBe("typed more");
    expect(itemState().editModalTestItemFormDraft?.pending?.form.title).toBe("typed more");
    editor.unmount();
  });

  test("never stores another record's form under the draft of the record edited before it", async () => {
    startDrafts();
    const first = await mountEditor(editOf("saved", savedAt), true);
    await first.typeTitle("typed");
    await pastDraftDebounce();
    await leave(first);

    const releaseRefetch = holdRefetch({ id: otherItemId, title: "other", updatedAt: savedAt });
    const other = await replayedFromCache(() => mountEditor(editOf("other", savedAt, otherItemId), true));
    await pastDraftDebounce();
    await releaseRefetch();
    expect(storedFormOf(itemId)).toMatchObject({ id: itemId, title: "typed" });
    await leave(other);

    const again = await mountEditor(editOf("saved", savedAt), true);
    expect(itemState().editModalTestItemForm).toMatchObject({ id: itemId, title: "typed" });
    expect(document.body.textContent).toContain("item form");
    again.unmount();
  });
});
