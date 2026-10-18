import "../../test/registerDom";
import { beforeAll, describe, expect, test } from "bun:test";
import type { ProtoFile } from "akanjs/constant";
import type { ClientSignal } from "akanjs/fetch";
import { act } from "react";
import { AgenticSurface, AgentProvider } from "use-agentic";
import { l, mountSuspense, setTestEnv, waitFor } from "../testHelpers.fixture";

let EditModal: typeof import("./EditModal").default;
let ViewEditModal: typeof import("./ViewEditModal").default;
let st: typeof import("akanjs/store").st;
let makeStore: () => { uploads: Deferred[] };

interface Deferred {
  resolve: (files: ProtoFile[]) => void;
  reject: (error: Error) => void;
}
type Do = { [key: string]: (...args: unknown[]) => Promise<void> };

const slice = { refName: "uploadModalItem", sliceName: "uploadModalItem", argLength: 1 };
const picked = [new File(["a"], "a.png")];

beforeAll(async () => {
  setTestEnv("uploadmodaltest");
  const { SLICE_META } = await import("akanjs/base");
  const { ConstantRegistry, via } = await import("akanjs/constant");
  const { registerClientRuntime } = await import("akanjs/client");
  const { store, StoreRegistry } = await import("akanjs/store");
  const FileInput = via((f) => ({ url: f(String), status: f(String) }));
  const FileObj = via(FileInput, () => ({}));
  const LightFile = via(FileObj, ["url", "status"] as const, () => ({}));
  const ModalFile = via(FileObj, LightFile, () => ({}));
  ConstantRegistry.buildModel(
    "modalFile",
    FileInput,
    FileObj,
    ModalFile,
    LightFile,
    via(ModalFile, () => ({})),
    {},
  );
  const Input = via((f) => ({ title: f(String), image: f(ModalFile).optional() }));
  const Obj = via(Input, () => ({}));
  const Light = via(Obj, ["title"] as const, () => ({}));
  const Full = via(Obj, Light, () => ({}));
  const cnst = ConstantRegistry.buildModel(
    "uploadModalItem",
    Input,
    Obj,
    Full,
    Light,
    via(Full, () => ({})),
    {},
  );
  registerClientRuntime({
    usePage: () => ({ path: "/", lang: "en", l }),
    fetch: { sortKeyMap: new Map([["uploadModalItem", ["latest"]]]) },
  } as never);
  makeStore = () => {
    const uploads: Deferred[] = [];
    const handlers: { [key: string]: unknown } = {
      serializedSignal: { modalFile: { endpoint: { addFiles: { fileUpload: true } } } },
      addUploadModalItemFiles: () =>
        new Promise<ProtoFile[]>((resolve, reject) => {
          uploads.push({ resolve, reject });
        }),
    };
    const signal = {
      refName: "uploadModalItem",
      _slice: { [SLICE_META]: {} },
      cnst,
      fetch: new Proxy(handlers, { get: (target, key: string) => (target[key] ??= async () => null) }),
      serializedSignal: { prefix: "uploadModalItem", endpoint: {}, slice: { "": { args: [] } } },
      slices: [],
    } as unknown as ClientSignal<"uploadModalItem">;
    class UploadModalStore extends store(signal, () => ({})) {}
    StoreRegistry.register(UploadModalStore);
    StoreRegistry.build(StoreRegistry.merge("uploadModalRoot", UploadModalStore));
    return { uploads };
  };
  ({ st } = await import("akanjs/store"));
  ({ default: EditModal } = await import("./EditModal"));
  ({ default: ViewEditModal } = await import("./ViewEditModal"));
});

const open = async () => {
  const { uploads } = makeStore();
  const surface = new AgenticSurface();
  const mounted = await mountSuspense(
    <AgentProvider surface={surface}>
      <EditModal slice={slice}>
        <div>item form</div>
      </EditModal>
    </AgentProvider>,
  );
  await act(async () => {
    await (st.do as unknown as Do).newUploadModalItem?.({ title: "ok" });
  });
  await waitFor(() => document.body.textContent?.includes("item form") ?? false);
  const submitButton = () =>
    [...document.querySelectorAll("button")].find((button) => button.textContent?.includes("createModel"));
  const submitDisabled = () =>
    (st.get() as unknown as { uploadModalItemSubmit: { disabled?: boolean } }).uploadModalItemSubmit.disabled;
  await waitFor(() => !submitDisabled());
  return { ...mounted, uploads, surface, submitButton, submitDisabled };
};

describe("Model.ViewEditModal upload gating", () => {
  test("the save button and its agent tool refuse while an upload is in flight", async () => {
    const { uploads } = makeStore();
    const surface = new AgenticSurface();
    const { unmount } = await mountSuspense(
      <AgentProvider surface={surface}>
        <ViewEditModal
          slice={slice}
          renderView={() => <div>item view</div>}
          renderTemplate={() => <div>item form</div>}
        />
      </AgentProvider>,
    );
    await act(async () => {
      await (st.do as unknown as Do).newUploadModalItem?.({ title: "ok" });
      await (st.do as unknown as Do).writeOnUploadModalItem?.("id", "aaaaaaaaaaaaaaaaaaaaaaaa");
    });
    await waitFor(() => document.body.textContent?.includes("item form") ?? false);
    const saveButton = () =>
      [...document.querySelectorAll("button")].find((button) => button.textContent?.includes("save"));
    expect(saveButton()?.disabled).toBe(false);
    let upload: Promise<void> | undefined;
    await act(async () => {
      upload = (st.do as unknown as Do).uploadImageOnUploadModalItem?.(picked);
    });
    await waitFor(() => saveButton()?.disabled === true);
    expect(saveButton()?.disabled).toBe(true);
    await expect(surface.call("submitUploadModalItem")).rejects.toThrow("not ready to submit");
    await act(async () => {
      uploads[0]?.resolve([{ id: "f1", url: "/f/f1", status: "active" } as unknown as ProtoFile]);
      await upload;
    });
    await waitFor(() => saveButton()?.disabled === false);
    expect(saveButton()?.disabled).toBe(false);
    unmount();
  });
});

describe("Model.EditModal upload gating", () => {
  test("the submit button and its agent tool refuse while an upload is in flight, and re-open when it lands", async () => {
    const { unmount, uploads, surface, submitButton } = await open();
    expect(submitButton()?.disabled).toBe(false);
    let upload: Promise<void> | undefined;
    await act(async () => {
      upload = (st.do as unknown as Do).uploadImageOnUploadModalItem?.(picked);
    });
    await waitFor(() => submitButton()?.disabled === true);
    expect(submitButton()?.disabled).toBe(true);
    await expect(surface.call("submitUploadModalItem")).rejects.toThrow("not ready to submit");
    await act(async () => {
      uploads[0]?.resolve([{ id: "f1", url: "/f/f1", status: "active" } as unknown as ProtoFile]);
      await upload;
    });
    await waitFor(() => submitButton()?.disabled === false);
    expect(submitButton()?.disabled).toBe(false);
    unmount();
  });

  test("re-opens submit once a dropped upload settles without touching the form", async () => {
    const { unmount, uploads, submitDisabled } = await open();
    let upload: Promise<void> | undefined;
    await act(async () => {
      upload = (st.do as unknown as Do).uploadImageOnUploadModalItem?.(picked);
      await (st.do as unknown as Do).writeOnUploadModalItem?.("id", "other");
    });
    await waitFor(() => submitDisabled() === true);
    expect(submitDisabled()).toBe(true);
    await act(async () => {
      uploads[0]?.resolve([{ id: "late", url: "/f/late", status: "active" } as unknown as ProtoFile]);
      await upload;
    });
    await waitFor(() => !submitDisabled());
    expect(submitDisabled()).toBeFalsy();
    unmount();
  });

  test("re-opens submit once a failed upload settles without touching the form", async () => {
    const { unmount, uploads, submitDisabled } = await open();
    let upload: Promise<void> | undefined;
    await act(async () => {
      upload = (st.do as unknown as Do).uploadImageOnUploadModalItem?.(picked).catch(() => undefined);
      await (st.do as unknown as Do).setTitleOnUploadModalItem?.("ok again");
    });
    await waitFor(() => submitDisabled() === true);
    expect(submitDisabled()).toBe(true);
    await act(async () => {
      uploads[0]?.reject(new Error("network"));
      await upload;
    });
    await waitFor(() => !submitDisabled());
    expect(submitDisabled()).toBeFalsy();
    unmount();
  });
});
