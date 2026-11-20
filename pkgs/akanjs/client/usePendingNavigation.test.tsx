import "../test/registerDom";
import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import { act } from "react";
import { renderToString } from "react-dom/server";
import { mount } from "../store/mount.fixture";
import { setTestEnv } from "../store/store.fixture";
import { registerClientRuntime } from "./clientRuntime";
import { PendingNavigation } from "./pendingNavigation";
import { usePendingNavigation } from "./usePendingNavigation";

let seen: ReturnType<typeof usePendingNavigation> | undefined;
const Pending = () => {
  seen = usePendingNavigation();
  return <p>{JSON.stringify(seen)}</p>;
};

beforeAll(() => {
  setTestEnv("pendingtest");
  registerClientRuntime({ usePage: () => ({ path: "/", lang: "en", l: (key: string) => key }) } as never);
});

describe("usePendingNavigation", () => {
  afterEach(() => PendingNavigation.clear());

  test("answers null with no navigation in flight, on the server as in the browser", () => {
    PendingNavigation.begin("http://localhost/en/chat/b");
    expect(renderToString(<Pending />)).toContain("null");
    PendingNavigation.clear();

    const unmount = mount(<Pending />);
    expect(seen).toBeNull();
    unmount();
  });

  test("answers the loading location, its path without the locale, until the navigation ends", () => {
    const unmount = mount(<Pending />);

    let pending: ReturnType<typeof PendingNavigation.begin> | undefined;
    act(() => {
      pending = PendingNavigation.begin("http://localhost/en/chat/b?thread=1&tag=x&tag=y#latest");
    });
    expect(seen).toEqual({
      href: "/en/chat/b?thread=1&tag=x&tag=y#latest",
      pathname: "/en/chat/b",
      path: "/chat/b",
      searchParams: { thread: "1", tag: ["x", "y"] },
    });

    act(() => {
      if (pending) PendingNavigation.end(pending);
    });
    expect(seen).toBeNull();
    unmount();
  });
});
