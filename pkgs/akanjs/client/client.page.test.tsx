import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";
import { interpolateTranslation } from "../common/interpolateTranslation";
import { pathGetLoose } from "../common/objectPath";
import { RequestLocale } from "../common/requestLocale";

type EnvMode = "browser" | "server";

const envState = {
  mode: "browser" as EnvMode,
};
const requestState = {
  headers: new Map<string, string>(),
  request: undefined as Request | undefined,
};
const buildCalls: unknown[] = [];
const serializedSignal = { service: { ping: { endpoint: {} } } };
const generatedFetch = { setJwt: () => undefined, ping: () => "pong" };
const generatedSig = { ping: "signal" };
const dictionary = {
  en: { user: { hello: { t: "Hello {name}" }, rich: { t: "Line{br}" } } },
  ko: { user: { hello: { t: "안녕 {name}" } } },
};

beforeAll(() => {
  mock.module("react/jsx-dev-runtime", () => ({
    Fragment: ({ children }: { children: unknown }) => children,
    jsxDEV: (type: unknown, props: Record<string, unknown>) => ({ type, props }),
  }));
  mock.module("react/jsx-runtime", () => ({
    Fragment: ({ children }: { children: unknown }) => children,
    jsx: (type: unknown, props: Record<string, unknown>) => ({ type, props }),
    jsxs: (type: unknown, props: Record<string, unknown>) => ({ type, props }),
  }));
  mock.module("akanjs/base", () => ({
    getEnv: () => ({
      side: envState.mode === "server" ? "server" : "client",
      renderMode: "csr",
      appName: "test-app",
      environment: "debug",
    }),
  }));
  mock.module("akanjs/common", () => ({
    Logger: { log: () => undefined, verbose: () => undefined, error: () => undefined },
    parseAkanI18nEnv: () => ({ locales: ["en", "ko"], defaultLocale: "en" }),
    parseBasePaths: (value?: string) => (value ? value.split(",").filter(Boolean) : []),
    getBasePathFromPathname: () => null,
    pathGet: (path: string, obj: Record<string, unknown>, separator = ".", fallback?: unknown) =>
      path.split(separator).reduce<unknown>((acc, key) => {
        if (!acc || typeof acc !== "object") return fallback;
        return (acc as Record<string, unknown>)[key] ?? fallback;
      }, obj),
    interpolateTranslation,
    pathGetLoose,
    RequestLocale,
  }));
  mock.module("akanjs/fetch", () => ({
    FetchClient: {
      build: (...args: unknown[]) => {
        buildCalls.push(args);
        return { fetch: generatedFetch, sig: generatedSig };
      },
    },
    defaultAccount: { appName: "test-app", environment: "debug" },
    requestStorage: { getStore: () => undefined },
    getRequest: () => requestState.request,
    headers: () => requestState.headers,
    untrackedRequest: () => requestState.request,
    untrackedHeaders: () => requestState.headers,
  }));
  mock.module("akanjs/signal", () => ({
    Exception: class Exception extends Error {
      constructor(
        readonly statusCode: number,
        message: string,
        readonly details?: unknown,
        readonly data?: unknown,
      ) {
        super(message);
      }
      toJSON() {
        return {
          error: this.message,
          statusCode: this.statusCode,
          ...(this.details !== undefined ? { details: this.details } : {}),
          ...(this.data !== undefined ? { data: this.data } : {}),
        };
      }
    },
    getSerializedSignal: () => serializedSignal,
  }));
  mock.module("akanjs/dictionary", () => ({
    getAllDictionary: () => dictionary,
  }));
  mock.module("akanjs/constant", () => ({
    String: String,
  }));
});

const installWindow = (pathname: string) => {
  Object.defineProperty(globalThis, "window", {
    value: { location: { pathname } },
    configurable: true,
  });
};

afterEach(() => {
  envState.mode = "browser";
  requestState.headers = new Map();
  requestState.request = undefined;
  buildCalls.length = 0;
  Object.defineProperty(globalThis, "window", { value: undefined, configurable: true });
});

describe("makePageProto", () => {
  test("derives browser locale and path from window location", async () => {
    envState.mode = "browser";
    installWindow("/ko/dashboard");
    const { makePageProto } = await import("./makePageProto");
    const { usePage } = makePageProto(dictionary);

    const page = usePage();

    expect(page.lang).toBe("ko");
    expect(page.path).toBe("/dashboard");
    expect(page.l("user.hello" as never, { name: "민" })).toBe("안녕 민");
    expect(page.l._("user.missing")).toBe("user.missing");
    expect(page.l.trans({ en: "English", ko: "Korean" })).toBe("Korean");
  });

  test("falls back to the default locale for a key and for an inline trans record", async () => {
    envState.mode = "browser";
    installWindow("/dashboard");
    const { Translator } = await import("./translator");
    const { makePageProto } = await import("./makePageProto");
    const { usePage } = makePageProto(dictionary);

    Translator.setActiveLocale("zhChs");
    Translator.setActivePath("/dashboard");
    const page = usePage();
    Translator.markHydrated();

    expect(page.lang).toBe("zhChs");
    expect(page.l("user.hello" as never, { name: "Ada" })).toBe("Hello Ada");
    expect(page.l.trans({ en: "English", ko: "Korean" })).toBe("English");
    // `l.trans` requires `en` and `ko`; only a locale-widened app reaches this last resort.
    expect(page.l.trans({ ko: "Korean" } as unknown as Record<"en" | "ko", string>)).toBe("Korean");
  });

  test("uses server-seeded browser path until hydration completes", async () => {
    envState.mode = "browser";
    installWindow("/en/client-path");
    const { Translator } = await import("./translator");
    const { makePageProto } = await import("./makePageProto");
    const { usePage } = makePageProto(dictionary);

    Translator.setActiveLocale("en");
    Translator.setActivePath("/server-path");
    expect(usePage()).toMatchObject({ lang: "en", path: "/server-path" });

    Translator.markHydrated();
    expect(usePage()).toMatchObject({ lang: "en", path: "/client-path" });
  });

  test("reads the path of the route render it runs in, and the URL outside one", async () => {
    envState.mode = "browser";
    installWindow("/en/chat");
    const { Translator } = await import("./translator");
    const { makePageProto } = await import("./makePageProto");
    const { usePage } = makePageProto(dictionary);

    Translator.markHydrated();
    expect(Translator.renderAt("/en/chat/7", () => usePage().path)).toBe("/chat/7");
    expect(Translator.renderAt("/en/chat/7", () => Translator.renderAt("/en/chat", () => usePage().path))).toBe(
      "/chat",
    );
    expect(() =>
      Translator.renderAt("/en/chat/7", () => {
        throw new Error("render failed");
      }),
    ).toThrow("render failed");
    expect(usePage().path).toBe("/chat");
  });

  test("uses server headers first and falls back to request URL", async () => {
    envState.mode = "server";
    const { makePageProto } = await import("./makePageProto");
    const { usePage, Err } = makePageProto(dictionary);

    requestState.headers = new Map([
      ["x-locale", "ko"],
      ["x-path", "/from-header"],
    ]);
    expect(usePage()).toMatchObject({ lang: "ko", path: "/from-header" });

    requestState.headers = new Map();
    requestState.request = new Request("https://example.test/en/from-request?x=1");
    expect(usePage()).toMatchObject({ lang: "en", path: "/from-request" });

    const rich = usePage().l.rich("user.rich" as never);
    expect(rich).toMatchObject({ props: { dangerouslySetInnerHTML: { __html: "Line<br />" } } });
    expect(new Err("user.failure" as never).message).toBe("user.failure");
    expect(new Err.NotFound("user.failure" as never).statusCode).toBe(404);
    expect(
      Err.fromJSON({
        error: "user.failure",
        statusCode: 409,
        data: { id: "1" },
        path: "/users",
        timestamp: "2026-05-25T00:00:00.000Z",
      }).toJSON(),
    ).toMatchObject({
      error: "user.failure",
      statusCode: 409,
      data: { id: "1" },
      path: "/users",
      timestamp: "2026-05-25T00:00:00.000Z",
    });
  });
});

describe("generated client glue", () => {
  test("useClient.ts exposes registered client runtime proxies", async () => {
    const { registerClientRuntime } = await import("./clientRuntime");
    const { makePageProto } = await import("./makePageProto");
    const pageProto = makePageProto(dictionary);
    const runtimeFetch = Object.assign(() => "ok", generatedFetch);
    const shownMessages: unknown[] = [];

    registerClientRuntime({ ...pageProto, fetch: runtimeFetch, sig: generatedSig });
    const client = await import("./useClient");

    expect(client.fetch).toBeDefined();
    expect(client.msg).toBeDefined();
    expect(client.Err).toBeDefined();
    expect((client.fetch.ping as () => string)()).toBe("pong");
    expect(client.sig.ping).toBe("signal");

    Object.assign(client.msg, {
      success: (key: string, option?: unknown) => shownMessages.push({ key, option }),
    });
    client.msg.success("user.hello", { key: "inviteOwnerFromOrg" });
    expect(shownMessages).toEqual([{ key: "user.hello", option: { key: "inviteOwnerFromOrg" } }]);
  });
});
