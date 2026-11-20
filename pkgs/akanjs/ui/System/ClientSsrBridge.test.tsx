import "../../test/registerDom";
import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import { act } from "react";
import { PendingNavigation } from "../../client/pendingNavigation";
import { mount, setTestEnv } from "../testHelpers.fixture";

let ClientSsrBridge: typeof import("./Client").ClientSsrBridge;
let ShellState: typeof import("akanjs/client").ShellState;

beforeAll(async () => {
  setTestEnv("bridgetest");
  (window as unknown as { happyDOM: { setURL: (url: string) => void } }).happyDOM.setURL("http://localhost/en/from");
  ({ ShellState } = await import("akanjs/client"));
  ({ ClientSsrBridge } = await import("./Client"));
});

describe("ClientSsrBridge", () => {
  afterEach(() => PendingNavigation.clear());

  test("the store's path follows a navigation the RSC client started itself, as a redirect does", () => {
    const { unmount } = mount(<ClientSsrBridge lang="en" />);
    expect(ShellState.get().pathname).toBe("/en/from");

    act(() => {
      PendingNavigation.begin("http://localhost/en/to?step=2");
    });

    expect(ShellState.get()).toMatchObject({ pathname: "/en/to", path: "/to", searchParams: { step: "2" } });
    unmount();
  });

  test("a navigation to the location a push already moved the store to writes nothing", () => {
    const { unmount } = mount(<ClientSsrBridge lang="en" />);
    act(() => ShellState.set({ pathname: "/en/chat/b", path: "/chat/b", searchParams: { thread: "1" } }));
    let writes = 0;
    const unsubscribe = ShellState.subscribe(() => {
      writes += 1;
    });

    act(() => {
      PendingNavigation.begin("http://localhost/en/chat/b?thread=1");
    });
    unsubscribe();

    expect(writes).toBe(0);
    unmount();
  });
});
