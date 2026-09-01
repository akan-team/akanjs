import "../test/registerDom";
import { beforeAll, describe, expect, test } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";

let instance: import("./storeInstance").StoreInstance;

beforeAll(async () => {
  process.env.AKAN_PUBLIC_APP_NAME = "livetest";
  process.env.AKAN_PUBLIC_REPO_NAME = "livetest";
  process.env.AKAN_PUBLIC_SERVE_DOMAIN = "localhost";
  process.env.AKAN_PUBLIC_ENV = "testing";
  const { store } = await import("./store");
  const { StoreInstance } = await import("./storeInstance");
  const { StoreRegistry } = await import("./storeRegistry");
  class LiveStore extends store("liveNote" as const, () => ({ alpha: 1, beta: "b", gamma: false })) {}
  instance = new StoreInstance(StoreRegistry.merge("liveRoot", LiveStore));
});

const mount = (node: React.ReactNode) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(node));
  return () => act(() => root.unmount());
};

describe("StoreInstance liveness", () => {
  test("st.use counts a key while mounted and releases it on unmount", () => {
    const Reader = () => <span>{String(instance.use.alpha())}</span>;
    const unmount = mount(<Reader />);
    expect(instance.liveKeys.get("alpha")).toBe(1);
    unmount();
    expect(instance.liveKeys.has("alpha")).toBe(false);
  });

  test("sel and ref record the keys their selector reaches", () => {
    const Selector = () => <span>{String(instance.sel((s) => `${String(s.alpha)}-${String(s.beta)}`))}</span>;
    const Referrer = () => {
      instance.ref((s) => s.gamma);
      return null;
    };
    const unmount = mount(
      <>
        <Selector />
        <Referrer />
      </>,
    );
    expect(instance.liveKeys.get("alpha")).toBe(1);
    expect(instance.liveKeys.get("beta")).toBe(1);
    expect(instance.liveKeys.get("gamma")).toBe(1);
    unmount();
    expect(instance.liveKeys.size).toBe(0);
  });

  test("use with agent: false subscribes without joining the live set", () => {
    const Quiet = () => <span>{String(instance.use.alpha({ agent: false }))}</span>;
    const unmount = mount(<Quiet />);
    expect(instance.liveKeys.has("alpha")).toBe(false);
    act(() => instance.set({ alpha: 2 }));
    expect(document.body.textContent).toContain("2");
    unmount();
    act(() => instance.set({ alpha: 1 }));
  });

  test("a declared action wins its name over the generated set<Key> convenience", () => {
    expect(instance.generatedSetters.has("setAlpha")).toBe(true);
    expect(instance.actionArity.get("setAlpha")).toBe(1);
  });
});

describe("StoreInstance zone liveness", () => {
  test("a subscription inside an agent scope counts for that zone's view and for the root alike", async () => {
    const { ScopeContext } = await import("use-agentic");
    const Reader = () => <span>{String(instance.use.alpha())}</span>;
    const unmount = mount(
      <ScopeContext.Provider value={["comments"]}>
        <Reader />
      </ScopeContext.Provider>,
    );
    expect(instance.liveKeysIn("comments").get("alpha")).toBe(1);
    expect(instance.liveKeysIn("posts").has("alpha")).toBe(false);
    expect(instance.liveKeys.get("alpha")).toBe(1);
    unmount();
    expect(instance.liveKeysIn("comments").size).toBe(0);
    expect(instance.liveKeys.size).toBe(0);
  });

  test("nested scopes count for every ancestor view", () => {
    instance.retainLive("beta", "comments.thread");
    expect(instance.liveKeysIn("comments").get("beta")).toBe(1);
    expect(instance.liveKeysIn("comments.thread").get("beta")).toBe(1);
    expect(instance.liveKeysIn("posts").has("beta")).toBe(false);
    instance.releaseLive("beta", "comments.thread");
    expect(instance.liveKeys.size).toBe(0);
  });
});
