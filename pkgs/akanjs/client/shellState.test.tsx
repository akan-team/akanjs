import "../test/registerDom";
import { beforeEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { renderToString } from "react-dom/server";
import { mount } from "../store/mount.fixture";
import { ShellState } from "./shellState";

beforeEach(() => {
  globalThis.__AKAN_SHELL_STATE__ = undefined;
});

describe("ShellState", () => {
  test("starts from the address bar's path and query", () => {
    (window as unknown as { happyDOM: { setURL: (url: string) => void } }).happyDOM.setURL(
      "http://localhost/en/admin?topMenu=account&tag=a&tag=b",
    );
    expect(ShellState.get()).toMatchObject({
      pathname: "/en/admin",
      searchParams: { topMenu: "account", tag: ["a", "b"] },
      theme: "system",
      uiOperation: "sleep",
      messages: [],
    });
  });

  test("tells its listeners of a write that changes a key, and of no other", () => {
    let calls = 0;
    const unsubscribe = ShellState.subscribe(() => {
      calls += 1;
    });
    ShellState.set({ theme: "dark" });
    ShellState.set({ theme: "dark" });
    ShellState.set({});
    expect(calls).toBe(1);
    unsubscribe();
    ShellState.set({ theme: "light" });
    expect(calls).toBe(1);
    expect(ShellState.get().theme).toBe("light");
  });

  test("a reader re-renders on its own key's write", () => {
    const Reader = () => <p id="shell-reader">{ShellState.use("pathname")}</p>;
    ShellState.set({ pathname: "/first" });
    const unmount = mount(<Reader />);
    expect(document.getElementById("shell-reader")?.textContent).toBe("/first");
    act(() => ShellState.set({ pathname: "/second" }));
    expect(document.getElementById("shell-reader")?.textContent).toBe("/second");
    unmount();
  });

  test("a server render reads the state the shell started with", () => {
    const Reader = () => <p>{ShellState.use("theme")}</p>;
    ShellState.set({ theme: "dark" });
    expect(renderToString(<Reader />)).toContain("system");
  });

  test("a message with a shown key replaces that message, and an eighth pushes the oldest out", () => {
    ShellState.showMessage({ content: "saving", type: "loading", key: "save" });
    ShellState.showMessage({ content: "saved", type: "success", key: "save" });
    expect(ShellState.get().messages).toEqual([{ type: "success", content: "saved", duration: 3, key: "save" }]);

    for (let idx = 0; idx < 7; idx += 1) ShellState.showMessage({ content: `note ${idx}` });
    const { messages } = ShellState.get();
    expect(messages).toHaveLength(7);
    expect(messages.map((message) => message.content)).not.toContain("saved");
    expect(messages.at(-1)?.content).toBe("note 6");

    ShellState.hideMessage(messages[0].key);
    expect(ShellState.get().messages).toHaveLength(6);
  });

  test("two messages sent without a key are two toasts, each hidden on its own", () => {
    ShellState.showMessage({ content: "saved", key: undefined });
    ShellState.showMessage({ content: "failed", type: "error", key: undefined });
    const { messages } = ShellState.get();
    expect(messages.map((message) => message.content)).toEqual(["saved", "failed"]);
    expect(new Set(messages.map((message) => message.key)).size).toBe(2);

    ShellState.hideMessage(messages[0].key);
    expect(ShellState.get().messages.map((message) => message.content)).toEqual(["failed"]);
  });

  test("a mount listener runs on each shell mount, and at once when the shell is already up", () => {
    let early = 0;
    let late = 0;
    const off = ShellState.onMount(() => {
      early += 1;
    });
    expect(early).toBe(0);
    const unmount = ShellState.mount();
    expect(early).toBe(1);
    ShellState.onMount(() => {
      late += 1;
    });
    expect(late).toBe(1);
    unmount();
    off();
    ShellState.mount();
    expect(early).toBe(1);
    expect(late).toBe(2);
  });
});
