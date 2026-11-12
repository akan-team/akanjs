import { afterEach, describe, expect, test } from "bun:test";
import { Err } from "akanjs/common";
import { FetchClient, type FetchProxy } from "akanjs/fetch";
import type { SerializedSignal } from "akanjs/signal";
import { registerClientRuntime, fetch as runtimeFetch } from "./clientRuntime";

const origin = "https://api.example";
const originalFetch = globalThis.fetch;

const makeRuntime = (fetchProto: { fetch: unknown; sig: unknown }) =>
  ({
    ...fetchProto,
    Err,
    msg: { info: () => undefined },
    usePage: () => ({ path: "/", lang: "en", l: () => "" }),
  }) as never;

const libSignal: SerializedSignal = {
  prefix: "libThing",
  endpoint: {
    libRoom: {
      type: "pubsub",
      args: [{ type: "room", name: "roomId", refName: "String" }],
      returns: { refName: "String" },
    },
  },
};
const appSignal: SerializedSignal = {
  prefix: "appThing",
  endpoint: { appQuery: { type: "query", args: [], returns: { refName: "String" } } },
};

afterEach(() => {
  FetchClient.resetSharedClient();
  FetchClient.resetSharedRegistry();
  globalThis.fetch = originalFetch;
  Reflect.deleteProperty(globalThis, "window");
});

describe("client runtime", () => {
  test("app and lib resolve to one fetch client, whichever registered first", async () => {
    Object.assign(globalThis, { window: {} });

    const libProto = FetchClient.build<{ fetch: unknown }>({}, { libThing: libSignal }, { origin });
    registerClientRuntime(makeRuntime(libProto as never), { scope: "lib" });
    const appProto = FetchClient.build<{ fetch: unknown }>({}, { appThing: appSignal }, { origin });
    registerClientRuntime(makeRuntime(appProto as never), { scope: "app" });

    const appFetch = appProto.fetch as FetchProxy;
    expect(libProto.fetch).toBe(appProto.fetch);
    expect(runtimeFetch.instance).toBe(appFetch.instance);
    expect(Object.keys(appFetch.instance.serializedSignal)).toEqual(["libThing", "appThing"]);

    globalThis.fetch = (async () =>
      Response.json({ error: "app.error.boom", statusCode: 400 }, { status: 400 })) as unknown as typeof fetch;
    await expect(appFetch.instance.http.get("/boom")).rejects.toBeInstanceOf(Err);
  });

  test("a lib registered after the app does not replace the app runtime", () => {
    Object.assign(globalThis, { window: {} });

    const appProto = FetchClient.build<{ fetch: unknown }>({}, { appThing: appSignal }, { origin });
    registerClientRuntime(makeRuntime(appProto as never), { scope: "app" });
    const libProto = FetchClient.build<{ fetch: unknown }>({}, { libThing: libSignal }, { origin });
    registerClientRuntime(makeRuntime(libProto as never), { scope: "lib" });

    expect(runtimeFetch.instance).toBe((appProto.fetch as FetchProxy).instance);
    expect(libProto.fetch).toBe(appProto.fetch);
  });
});
