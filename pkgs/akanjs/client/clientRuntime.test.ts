import { afterEach, describe, expect, test } from "bun:test";
import { FetchClient, type FetchProxy } from "akanjs/fetch";
import type { SerializedSignal } from "akanjs/signal";
import { registerClientRuntime, fetch as runtimeFetch } from "./clientRuntime";

const origin = "https://api.example";
const originalFetch = globalThis.fetch;

const makeErrCls = (label: string) => {
  class RuntimeErr extends Error {
    readonly label = label;
    static fromJSON(payload: { error: string }) {
      return new RuntimeErr(payload.error);
    }
  }
  return RuntimeErr;
};

const makeRuntime = (fetchProto: { fetch: unknown; sig: unknown }, Err: unknown) =>
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
  delete (globalThis as typeof globalThis & { window?: unknown }).window;
});

describe("client runtime", () => {
  // The reported bug: a lib built its own FetchClient, only the app runtime got connected, and every subscribe
  // issued from lib UI sat on a socket that never opened.
  test("app and lib resolve to one fetch client, whichever registered first", async () => {
    (globalThis as typeof globalThis & { window?: unknown }).window = {};
    const LibErr = makeErrCls("lib");
    const AppErr = makeErrCls("app");

    const libProto = FetchClient.build<{ fetch: unknown }>({}, { libThing: libSignal }, { origin, Err: LibErr });
    registerClientRuntime(makeRuntime(libProto as never, LibErr), { scope: "lib" });
    const appProto = FetchClient.build<{ fetch: unknown }>({}, { appThing: appSignal }, { origin, Err: AppErr });
    registerClientRuntime(makeRuntime(appProto as never, AppErr), { scope: "app" });

    const appFetch = appProto.fetch as FetchProxy;
    expect(libProto.fetch).toBe(appProto.fetch);
    expect(runtimeFetch.instance).toBe(appFetch.instance);
    expect(Object.keys(appFetch.instance.serializedSignal)).toEqual(["libThing", "appThing"]);

    // The lib built the shared instance first, so it seeded its own Err; registration re-points it at the app's.
    globalThis.fetch = (async () =>
      Response.json({ error: "app.error.boom", statusCode: 400 }, { status: 400 })) as typeof fetch;
    await expect(appFetch.instance.http.get("/boom")).rejects.toBeInstanceOf(AppErr);
  });

  test("a lib registered after the app does not replace the app runtime", () => {
    (globalThis as typeof globalThis & { window?: unknown }).window = {};
    const AppErr = makeErrCls("app");
    const LibErr = makeErrCls("lib");

    const appProto = FetchClient.build<{ fetch: unknown }>({}, { appThing: appSignal }, { origin, Err: AppErr });
    registerClientRuntime(makeRuntime(appProto as never, AppErr), { scope: "app" });
    const libProto = FetchClient.build<{ fetch: unknown }>({}, { libThing: libSignal }, { origin, Err: LibErr });
    registerClientRuntime(makeRuntime(libProto as never, LibErr), { scope: "lib" });

    expect(runtimeFetch.instance).toBe((appProto.fetch as FetchProxy).instance);
    expect(libProto.fetch).toBe(appProto.fetch);
  });
});
