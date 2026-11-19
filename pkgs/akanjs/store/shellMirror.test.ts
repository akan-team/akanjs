import "../test/registerDom";
import { beforeAll, describe, expect, test } from "bun:test";
import { STATE_META } from "akanjs/base";
import { ShellState } from "../client/shellState";
import { setTestEnv } from "./store.fixture";

interface LooseStore {
  get: () => { [key: string]: unknown };
  set: (state: { [key: string]: unknown }) => void;
  do: { [key: string]: (...args: unknown[]) => unknown };
}

let BaseStore: typeof import("./baseSt").BaseStore;
let st: LooseStore;

beforeAll(async () => {
  (window as unknown as { happyDOM: { setURL: (url: string) => void } }).happyDOM.setURL(
    "http://localhost/en/admin?topMenu=account",
  );
  setTestEnv("shellmirrortest");
  const baseSt = await import("./baseSt");
  BaseStore = baseSt.BaseStore;
  st = baseSt.st as unknown as LooseStore;
});

describe("ShellMirror", () => {
  test("the shell starts from the values the store starts its keys of the same name from", () => {
    const storeStart = (BaseStore as unknown as { [STATE_META]: { [key: string]: unknown } })[STATE_META];
    const shellStart = ShellState.initial() as unknown as { [key: string]: unknown };
    for (const key of ShellState.keys) expect([key, shellStart[key]]).toEqual([key, storeStart[key]]);
  });

  test("a shell write reaches the store", () => {
    ShellState.set({ theme: "dark", pathname: "/en/docs", keyboardHeight: 120 });
    expect(st.get()).toMatchObject({ theme: "dark", pathname: "/en/docs", keyboardHeight: 120 });
  });

  test("a store write reaches the shell, a toast shown through the store included", () => {
    st.set({ theme: "light", searchParams: { tab: "members" } });
    expect(ShellState.get()).toMatchObject({ theme: "light", searchParams: { tab: "members" } });

    void st.do.showMessage({ content: "saved", type: "success", key: "save" });
    expect(ShellState.get().messages).toEqual([{ type: "success", content: "saved", duration: 3, key: "save" }]);
    ShellState.hideMessage("save");
    expect(st.get().messages).toEqual([]);
  });

  test("a store bound after the shell moved takes the shell's state", async () => {
    const { ShellMirror } = await import("./shellMirror");
    const { StoreInstance } = await import("./storeInstance");
    const { StoreRegistry } = await import("./storeRegistry");
    ShellState.set({ theme: "dark", pathname: "/en/late", uiOperation: "idle" });
    const late = new StoreInstance(StoreRegistry.merge("lateRoot" as const, BaseStore));
    expect(late.get().uiOperation).toBe("sleep");
    ShellMirror.bind(late);
    expect(late.get()).toMatchObject({ theme: "dark", pathname: "/en/late", uiOperation: "idle" });
  });

  test("a mounting shell hands the store its saved dev mode and the window size", () => {
    localStorage.setItem("devMode", "true");
    expect(st.get().innerWidth).toBe(0);
    const unmount = ShellState.mount();
    expect(st.get()).toMatchObject({ devMode: true, innerWidth: window.innerWidth, innerHeight: window.innerHeight });
    unmount();
  });
});
