import "../test/registerDom";
import { beforeAll, describe, expect, test } from "bun:test";
import { Int, STATE_DERIVED_META } from "akanjs/base";
import { act, type ReactNode, Suspense, useEffect } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToReadableStream } from "react-dom/server.browser";
import { setTestEnv } from "./store.fixture";

type StoreInstance = import("./storeInstance").StoreInstance;
let makeInstance: () => StoreInstance;

beforeAll(async () => {
  setTestEnv("hydrationtest");
  const { store } = await import("./store");
  const { StoreInstance } = await import("./storeInstance");
  const { StoreRegistry } = await import("./storeRegistry");
  class SessionStore extends store("hydrationSession" as const, () => ({ me: "anon" })) {}
  const root = StoreRegistry.merge("hydrationRoot", SessionStore);
  makeInstance = () => new StoreInstance(root);
});

const renderServer = async (node: ReactNode) => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "document");
  Reflect.deleteProperty(globalThis, "document");
  try {
    return await new Response(await renderToReadableStream(node)).text();
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "document", descriptor);
  }
};

const hydrate = async (node: ReactNode) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  container.innerHTML = await renderServer(node);
  const serverHtml = container.innerHTML;
  const errors: unknown[] = [];
  let root: ReturnType<typeof hydrateRoot> | null = null;
  await act(async () => {
    root = hydrateRoot(container, node, { onRecoverableError: (error) => errors.push(error) });
  });
  return {
    container,
    serverHtml,
    errors,
    unmount: () => {
      act(() => root?.unmount());
      container.remove();
    },
  };
};

describe("StoreInstance hydration", () => {
  test("a boundary hydrating after an effect wrote the store still matches the server html", async () => {
    const instance = makeInstance();
    const Bridge = () => {
      useEffect(() => {
        instance.set({ me: "alice" });
      }, []);
      return null;
    };
    const Me = () => <span>{String(instance.use.me())}</span>;
    const { container, serverHtml, errors, unmount } = await hydrate(
      <>
        <Bridge />
        <Suspense fallback={<i>loading</i>}>
          <Me />
        </Suspense>
      </>,
    );
    expect(serverHtml).toContain("anon");
    expect(errors).toEqual([]);
    expect(container.textContent).toBe("alice");
    unmount();
  });

  test("the server snapshot ignores set but picks up a store added later", async () => {
    const instance = makeInstance();
    instance.set({ me: "alice" });
    const Me = () => <span>{String(instance.sel((s) => `${String(s.me)}:${String(s.late ?? "none")}`))}</span>;
    const { store } = await import("./store");
    const { StoreRegistry } = await import("./storeRegistry");
    class LateStore extends store("hydrationLate" as const, () => ({ late: "initial" })) {}
    instance.addStore(StoreRegistry.merge("hydrationLateRoot", LateStore));
    instance.set({ late: "changed" });
    const { container, serverHtml, errors, unmount } = await hydrate(<Me />);
    expect(serverHtml).toContain("anon:initial");
    expect(errors).toEqual([]);
    expect(container.textContent).toBe("alice:changed");
    unmount();
  });

  test("a persisted value hydrates as the default the server rendered, then shows", async () => {
    const { store } = await import("./store");
    const { StoreInstance } = await import("./storeInstance");
    const { StoreRegistry } = await import("./storeRegistry");
    class PreferenceStore extends store("hydrationPreference" as const, ({ persist }) => ({
      count: persist(Int, { default: 1, key: "hydrationCount" }),
    })) {}
    const storageKey = PreferenceStore[STATE_DERIVED_META].persistSession.count.storageKey;
    window.localStorage.setItem(storageKey, JSON.stringify(5));
    const instance = new StoreInstance(StoreRegistry.merge("hydrationPreferenceRoot", PreferenceStore));
    const Count = () => <span>{String(instance.use.count())}</span>;
    const { container, serverHtml, errors, unmount } = await hydrate(<Count />);
    expect(serverHtml).toContain("1");
    expect(errors).toEqual([]);
    expect(container.textContent).toBe("5");
    unmount();
    window.localStorage.removeItem(storageKey);
  });
});
