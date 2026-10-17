import "../../test/registerDom";
import { beforeAll, describe, expect, test } from "bun:test";
import { act } from "react";
import { AgenticSurface, AgentProvider } from "use-agentic";
import { itemFixtureOf, l, mountSuspense, setTestEnv, waitFor } from "../testHelpers.fixture";

let EditModal: typeof import("./EditModal").default;
let st: typeof import("akanjs/store").st;
let makeStore: () => void;

const slice = { refName: "uploadModalItem", sliceName: "uploadModalItem", argLength: 1 };

beforeAll(async () => {
  setTestEnv("uploadmodaltest");
  const { storeMaker } = await itemFixtureOf("uploadModalItem");
  const { registerClientRuntime } = await import("akanjs/client");
  registerClientRuntime({
    usePage: () => ({ path: "/", lang: "en", l }),
    fetch: { sortKeyMap: new Map([["uploadModalItem", ["latest"]]]) },
  } as never);
  makeStore = storeMaker({ root: "uploadModalRoot" });
  ({ st } = await import("akanjs/store"));
  ({ default: EditModal } = await import("./EditModal"));
});

describe("Model.EditModal upload gating", () => {
  test("re-opens submit once an upload settles without touching the form", async () => {
    makeStore();
    const { unmount } = await mountSuspense(
      <AgentProvider surface={new AgenticSurface()}>
        <EditModal slice={slice}>
          <div>item form</div>
        </EditModal>
      </AgentProvider>,
    );
    await act(async () => {
      await (st.do as unknown as { [key: string]: () => Promise<void> }).newUploadModalItem?.();
    });
    const state = () => st.get() as unknown as { uploadModalItemSubmit: { disabled: boolean } };
    const setTitle = (st.do as unknown as { [key: string]: (v: string) => Promise<void> }).setTitleOnUploadModalItem;
    await waitFor(() => document.body.textContent?.includes("item form") ?? false);
    await act(async () => {
      await setTitle?.("ok");
    });
    await waitFor(() => !state().uploadModalItemSubmit.disabled);
    expect(state().uploadModalItemSubmit.disabled).toBeFalsy();
    await act(async () => {
      st.set({ uploadModalItemFormUploading: { image: ["1"] } } as never);
      await setTitle?.("ok again");
    });
    await waitFor(() => state().uploadModalItemSubmit.disabled);
    expect(state().uploadModalItemSubmit.disabled).toBe(true);
    await act(async () => {
      st.set({ uploadModalItemFormUploading: {} } as never);
    });
    await waitFor(() => !state().uploadModalItemSubmit.disabled);
    expect(state().uploadModalItemSubmit.disabled).toBeFalsy();
    unmount();
  });
});
