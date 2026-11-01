import "../test/registerDom";
import { beforeAll, describe, expect, mock, test } from "bun:test";
import type { NavigationAttempt, NavigationGuard, PageActivityState } from "akanjs/client";
import { act, createContext } from "react";
import { createRoot } from "react-dom/client";

const guards = new Set<NavigationGuard>();
const pageActivityContext = createContext<PageActivityState>({ activity: "current", focused: true });
const attempt: NavigationAttempt = { kind: "push", from: "/doc/1", to: "/list" };
const ask = () => [...guards].map((guard) => guard(attempt));

beforeAll(() => {
  mock.module("akanjs/client", () => ({
    pageActivityContext,
    router: {
      addNavigationGuard: (guard: NavigationGuard) => {
        guards.add(guard);
        return () => guards.delete(guard);
      },
    },
  }));
});

describe("useNavigationGuard", () => {
  test("holds the guard only while its page is current, and asks the latest one", async () => {
    const { useNavigationGuard } = await import("./useNavigationGuard");
    const Page = ({ isDirty }: { isDirty: boolean }) => {
      useNavigationGuard(() => !isDirty);
      return null;
    };
    const host = document.createElement("div");
    const root = createRoot(host);
    const render = (activity: PageActivityState["activity"], isDirty: boolean) =>
      act(() =>
        root.render(
          <pageActivityContext.Provider value={{ activity, focused: activity === "current" }}>
            <Page isDirty={isDirty} />
          </pageActivityContext.Provider>,
        ),
      );
    try {
      render("current", false);
      expect(ask()).toEqual([true]);
      render("current", true);
      expect(ask()).toEqual([false]);

      render("prev", true);
      expect(guards.size).toBe(0);
      render("current", true);
      expect(ask()).toEqual([false]);
    } finally {
      act(() => root.unmount());
    }
    expect(guards.size).toBe(0);
  });
});
