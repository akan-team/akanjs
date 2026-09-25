import "../test/registerDom";
import { describe, expect, test } from "bun:test";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { store } from "./store";
import { StoreInstance } from "./storeInstance";
import { StoreRegistry } from "./storeRegistry";

class LiveStore extends store("liveTest" as const, () => ({ tab: "a", draft: "" })) {}
StoreRegistry.register(LiveStore);
const instance = new StoreInstance(StoreRegistry.merge("liveRoot", LiveStore));

const mount = (node: ReactNode) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(node));
  return () => {
    act(() => root.unmount());
    container.remove();
  };
};

const TabReader = () => {
  instance.use.tab?.();
  return null;
};

describe("StoreInstance.liveKeys", () => {
  test("counts mounted readers per key and forgets a key nobody reads", () => {
    expect(instance.liveKeys.has("tab")).toBe(false);
    const unmount = mount(
      <>
        <TabReader />
        <TabReader />
      </>,
    );
    expect(instance.liveKeys.get("tab")).toBe(2);
    expect(instance.liveKeys.has("draft")).toBe(false);
    unmount();
    expect(instance.liveKeys.has("tab")).toBe(false);
  });
});
