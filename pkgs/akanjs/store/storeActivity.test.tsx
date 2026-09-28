import "../test/registerDom";
import { beforeAll, describe, expect, test } from "bun:test";
import { Activity, act, memo } from "react";
import { createRoot } from "react-dom/client";
import { setTestEnv } from "./store.fixture";

type StoreInstance = import("./storeInstance").StoreInstance;
let makeInstance: () => StoreInstance;

beforeAll(async () => {
  setTestEnv("activitytest");
  const { store } = await import("./store");
  const { StoreInstance } = await import("./storeInstance");
  const { StoreRegistry } = await import("./storeRegistry");
  class CounterStore extends store("activityCounter" as const, () => ({ count: 0 })) {}
  const root = StoreRegistry.merge("activityRoot", CounterStore);
  makeInstance = () => new StoreInstance(root);
});

describe("store subscriptions under <Activity>", () => {
  test("a subscriber hidden while the store changed shows the new value once it is visible again", async () => {
    const instance = makeInstance();
    const use = instance.use as unknown as { count: () => number };
    //? memo, as a cached page's RenderLayer is: revealing it re-renders nothing above the subscriber.
    const Count = memo(() => <output>{use.count()}</output>);
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const renderIn = async (mode: "visible" | "hidden") => {
      await act(async () => {
        root.render(
          <Activity mode={mode}>
            <Count />
          </Activity>,
        );
      });
    };

    await renderIn("visible");
    expect(container.textContent).toBe("0");
    await renderIn("hidden");
    await act(async () => {
      instance.set({ count: 5 });
    });
    await renderIn("visible");
    expect(container.textContent).toBe("5");

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
