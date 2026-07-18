import { afterEach, describe, expect, test } from "bun:test";
import { DataList, Int } from "akanjs/base";
import { ConstantRegistry, via } from "akanjs/constant";
import type {
  DatabaseSignal,
  EndpointCls,
  EndpointInfo,
  SerializedArg,
  SerializedSignal,
  SliceCls,
} from "akanjs/signal";
import { FetchClient, type FetchProxy } from "./client/fetchClient";
import { HttpClient } from "./client/httpClient";
import { WsClient } from "./client/wsClient";
import type { FetchClientType, FetchTypeOfSignal, MergeAllFetchTypes, SliceMeta } from "./fetchType";
import {
  cacheTag,
  cookies,
  createRequestStore,
  getRequest,
  getRequestDynamicUsage,
  getRequestPolicy,
  getRequestStore,
  getRequestTheme,
  headers,
  memoizeRequestQuery,
  parseCookieHeader,
  requestStorage,
  setRequestTheme,
  untrackedCookies,
  untrackedHeaders,
  untrackedRequest,
  updateRequestPolicy,
} from "./requestStorage";

type Equal<Left, Right> =
  (<Type>() => Type extends Left ? 1 : 2) extends <Type>() => Type extends Right ? 1 : 2 ? true : false;
type Expect<Type extends true> = Type;
type TypeRegressionBaseFetch = {
  sharedEndpoint: () => "base";
  baseOnlyEndpoint: () => "base-only";
};
type TypeRegressionAppFetch = {
  sharedEndpoint: () => "app";
  appOnlyEndpoint: () => "app-only";
};
type TypeRegressionBaseSlice = {
  baseList: SliceMeta;
};
type TypeRegressionAppSlice = {
  appList: SliceMeta;
};
type TypeRegressionMergedFetch = MergeAllFetchTypes<
  readonly [
    FetchProxy<TypeRegressionBaseFetch, TypeRegressionBaseSlice>,
    FetchProxy<TypeRegressionAppFetch, TypeRegressionAppSlice>,
  ]
>;
type TypeRegressionFetchClient = FetchClientType<
  readonly [
    FetchProxy<TypeRegressionBaseFetch, TypeRegressionBaseSlice>,
    FetchProxy<TypeRegressionAppFetch, TypeRegressionAppSlice>,
  ]
>;
type _FetchProxyTypeMarkerRegression = Expect<
  Equal<FetchTypeOfSignal<FetchProxy<TypeRegressionBaseFetch>>, TypeRegressionBaseFetch>
>;
type _FetchProxyMergeOverrideRegression = Expect<Equal<ReturnType<TypeRegressionMergedFetch["sharedEndpoint"]>, "app">>;
type _FetchProxyMergeRetainsBaseRegression = Expect<
  Equal<ReturnType<TypeRegressionFetchClient["baseOnlyEndpoint"]>, "base-only">
>;
type _FetchProxySliceMetaRetainsBaseRegression = Expect<
  Equal<TypeRegressionFetchClient["slice"]["baseList"], SliceMeta>
>;
type _FetchProxySliceMetaRetainsAppRegression = Expect<Equal<TypeRegressionFetchClient["slice"]["appList"], SliceMeta>>;
type TypeRegressionSharedUser = { id: string };
type TypeRegressionAppUser = TypeRegressionSharedUser & { githubInfo: { login: string } };
type TypeRegressionUserEndpoint = EndpointCls<
  never,
  {
    getSelf: EndpointInfo<
      "query",
      Record<string, unknown>,
      [],
      [],
      [],
      [],
      StringConstructor,
      TypeRegressionSharedUser
    >;
  }
>;
type TypeRegressionUserSlice = SliceCls<never> & {
  srv: {
    cnst: {
      _Full: TypeRegressionAppUser;
      _Light: Pick<TypeRegressionAppUser, "id">;
      _Insight: { count: number };
    };
  };
};
type TypeRegressionUserFetch = FetchTypeOfSignal<
  DatabaseSignal<never, TypeRegressionUserEndpoint, TypeRegressionUserSlice, never>
>;
type _DatabaseEndpointReturnExtendsToAppFullRegression = Expect<
  Equal<Awaited<ReturnType<TypeRegressionUserFetch["getSelf"]>>, TypeRegressionAppUser>
>;

type FetchCall = { url: string; init?: RequestInit };
const originalFetch = globalThis.fetch;
const originalWebSocket = globalThis.WebSocket;
const originalSetTimeout = globalThis.setTimeout;
const originalClearTimeout = globalThis.clearTimeout;
const originalEnv = {
  appName: process.env.AKAN_PUBLIC_APP_NAME,
  repoName: process.env.AKAN_PUBLIC_REPO_NAME,
  serveDomain: process.env.AKAN_PUBLIC_SERVE_DOMAIN,
  operationMode: process.env.AKAN_PUBLIC_OPERATION_MODE,
};
const fetchCalls: FetchCall[] = [];
const jsonResponses: unknown[] = [];
const responseStatuses: number[] = [];

const setMockFetch = () => {
  fetchCalls.length = 0;
  jsonResponses.length = 0;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    fetchCalls.push({ url: String(url), init });
    const value = jsonResponses.length ? jsonResponses.shift() : { ok: true };
    const status = responseStatuses.length ? responseStatuses.shift() : 200;
    return Response.json(value, { status });
  }) as typeof fetch;
};
const setAkanPublicEnv = () => {
  process.env.AKAN_PUBLIC_APP_NAME = "fetchTest";
  process.env.AKAN_PUBLIC_REPO_NAME = "akan";
  process.env.AKAN_PUBLIC_SERVE_DOMAIN = "example.test";
  process.env.AKAN_PUBLIC_OPERATION_MODE = "local";
};

afterEach(() => {
  FetchClient.resetSharedRegistry();
  globalThis.fetch = originalFetch;
  globalThis.WebSocket = originalWebSocket;
  globalThis.setTimeout = originalSetTimeout;
  globalThis.clearTimeout = originalClearTimeout;
  if (originalEnv.appName === undefined) delete process.env.AKAN_PUBLIC_APP_NAME;
  else process.env.AKAN_PUBLIC_APP_NAME = originalEnv.appName;
  if (originalEnv.repoName === undefined) delete process.env.AKAN_PUBLIC_REPO_NAME;
  else process.env.AKAN_PUBLIC_REPO_NAME = originalEnv.repoName;
  if (originalEnv.serveDomain === undefined) delete process.env.AKAN_PUBLIC_SERVE_DOMAIN;
  else process.env.AKAN_PUBLIC_SERVE_DOMAIN = originalEnv.serveDomain;
  if (originalEnv.operationMode === undefined) delete process.env.AKAN_PUBLIC_OPERATION_MODE;
  else process.env.AKAN_PUBLIC_OPERATION_MODE = originalEnv.operationMode;
  fetchCalls.length = 0;
  jsonResponses.length = 0;
  responseStatuses.length = 0;
});

const arg = (type: SerializedArg["type"], name: string, extra: Partial<SerializedArg> = {}): SerializedArg => ({
  type,
  name,
  refName: "String",
  ...extra,
});

class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: FakeWebSocket[] = [];
  readyState = FakeWebSocket.CONNECTING;
  sent: string[] = [];
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.({});
  }

  receive(data: unknown) {
    this.onmessage?.({ data: typeof data === "string" ? data : JSON.stringify(data) });
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.({ code: 1000, reason: "closed" });
  }

  send(data: string) {
    this.sent.push(data);
  }
}

class TestErr extends Error {
  readonly error: string;
  readonly statusCode?: number;
  readonly data?: Record<string, unknown>;
  readonly details?: unknown;
  readonly path?: string;
  readonly timestamp?: string;

  constructor(
    key: string,
    data?: Record<string, unknown>,
    option: { statusCode?: number; details?: unknown; path?: string; timestamp?: string } = {},
  ) {
    super(key);
    this.error = key;
    this.statusCode = option.statusCode ?? 400;
    this.data = data;
    this.details = option.details;
    this.path = option.path;
    this.timestamp = option.timestamp;
  }

  static fromJSON(payload: {
    error: string;
    statusCode?: number;
    data?: Record<string, unknown>;
    details?: unknown;
    path?: string;
    timestamp?: string;
  }) {
    return new TestErr(payload.error, payload.data, payload);
  }
}

const setFakeWebSocket = () => {
  FakeWebSocket.instances = [];
  globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
  Object.assign(globalThis.WebSocket, {
    CONNECTING: FakeWebSocket.CONNECTING,
    OPEN: FakeWebSocket.OPEN,
    CLOSING: FakeWebSocket.CLOSING,
    CLOSED: FakeWebSocket.CLOSED,
  });
};

const FetchTestNested = via((f) => ({
  label: f(String),
}));
ConstantRegistry.buildScalar("fetchTestNested", FetchTestNested, { FetchTestNested });
const FetchTestInput = via((f) => ({
  title: f(String),
  count: f(Int, { default: 0 }),
  nested: f(FetchTestNested),
}));
const FetchTestObject = via(FetchTestInput, (f) => ({
  memo: f(String).optional(),
}));
const FetchTestLight = via(FetchTestObject, ["title"] as const, () => ({}));
const FetchTestFull = via(FetchTestObject, FetchTestLight, () => ({}));
const FetchTestInsight = via(FetchTestFull, (f) => ({
  count: f(Int, { default: 0, accumulate: {} }),
}));
ConstantRegistry.buildModel(
  "fetchTestItem",
  FetchTestInput,
  FetchTestObject,
  FetchTestFull,
  FetchTestLight,
  FetchTestInsight,
  {
    FetchTestInput,
    FetchTestObject,
    FetchTestLight,
    FetchTestFull,
    FetchTestInsight,
  },
);

const serviceSignal: SerializedSignal = {
  endpoint: {
    getThing: {
      type: "query",
      path: "/custom/:id",
      args: [
        arg("param", "id", { refName: "ID" }),
        arg("search", "tags", { arrDepth: 1 }),
        arg("search", "empty", { nullable: true }),
      ],
      returns: { refName: "String" },
    },
    createThing: {
      type: "mutation",
      args: [arg("body", "title"), arg("body", "count", { refName: "Int" })],
      returns: { refName: "fetchTestItem", modelType: "full" },
    },
    uploadThing: {
      type: "mutation",
      args: [arg("upload", "file", { refName: "Upload" }), arg("body", "title")],
      returns: { refName: "String" },
    },
    sendThing: {
      type: "message",
      args: [arg("msg", "text")],
      returns: { refName: "String" },
    },
    roomThing: {
      type: "pubsub",
      args: [arg("room", "roomId")],
      returns: { refName: "fetchTestItem", modelType: "light" },
    },
  },
};

const databaseSignal: SerializedSignal = {
  prefix: "fetchTest",
  getGuards: ["Public"],
  cruGuards: ["Admin"],
  slice: {
    "": { args: [arg("search", "query", { refName: "Any", nullable: true })] },
    byOwner: { args: [arg("param", "ownerId", { refName: "ID" })], guards: ["Public"] },
  },
  filter: {
    sortKeys: ["latest", "oldest"],
    filter: {
      byTitle: [arg("param", "title")],
    },
  },
  endpoint: {
    custom: {
      type: "query",
      args: [arg("search", "q")],
      returns: { refName: "String" },
    },
  },
};

describe("HttpClient", () => {
  test("builds paths, urls, and bodies", () => {
    const argMap = new Map<string, unknown>([
      ["id", "id-1"],
      ["tags", ["a", "b"]],
      ["q", "hello"],
    ]);

    expect(HttpClient.makePath("getThing", [], undefined)).toBe("/getThing");
    expect(HttpClient.makePath("getThing", [arg("param", "id"), arg("param", "childId")], "api")).toBe(
      "/api/getThing/:id/:childId",
    );
    expect(
      HttpClient.makeUrl("/items/:id/:missing", [arg("search", "tags", { arrDepth: 1 }), arg("search", "q")], argMap),
    ).toBe("/items/id-1/:missing?tags=a&tags=b&q=hello");
    expect(HttpClient.makeUrl("/items", [arg("search", "empty", { nullable: true })], new Map())).toBe("/items");
    expect(
      FetchClient.makeHttpUrl(
        "ping",
        { type: "query", args: [], returns: { refName: "String" } },
        undefined,
        new Map(),
      ),
    ).toBe("/ping");
    expect(
      FetchClient.makeHttpUrl(
        "createUser",
        { type: "mutation", args: [], returns: { refName: "String" } },
        "user",
        new Map(),
      ),
    ).toBe("/user/createUser");
    expect(
      HttpClient.makeBody(
        [arg("body", "title"), arg("body", "optional", { nullable: true })],
        [],
        new Map([["title", "T"]]),
      ),
    ).toEqual({
      title: "T",
      optional: undefined,
    });
    expect(() => HttpClient.makeBody([arg("body", "title")], [], new Map())).toThrow("Argument title is required");

    const blob = new Blob(["hello"]);
    const formData = HttpClient.makeBody([], [arg("upload", "file", { refName: "Upload" })], new Map([["file", blob]]));
    expect(formData).toBeInstanceOf(FormData);
    expect((formData as FormData).get("file")).toBeInstanceOf(Blob);
  });

  test("calls fetch with expected methods, headers, and bodies", async () => {
    setMockFetch();
    jsonResponses.push({ value: "get" }, { value: "post" }, { value: "put" }, { value: "delete" });
    const client = new HttpClient("https://api.example");
    const formData = new FormData();
    formData.append("file", new Blob(["x"]));

    expect(await client.get<{ value: string }>("/items", { headers: { Authorization: "Bearer t" } })).toEqual({
      value: "get",
    });
    expect(await client.post<{ value: string }>("/items", { title: "A" })).toEqual({ value: "post" });
    expect(await client.put<{ value: string }>("/items/1", formData)).toEqual({ value: "put" });
    expect(await client.delete<{ value: string }>("/items/1")).toEqual({ value: "delete" });

    expect(fetchCalls[0]).toMatchObject({
      url: "https://api.example/items",
      init: { headers: { "Content-Type": "application/json", Authorization: "Bearer t" } },
    });
    expect(fetchCalls[1]?.init).toMatchObject({
      method: "POST",
      body: JSON.stringify({ title: "A" }),
      headers: { "Content-Type": "application/json" },
    });
    expect(fetchCalls[2]?.init?.headers).toEqual({});
    expect(fetchCalls[3]?.init).toMatchObject({ method: "DELETE" });
  });

  test("restores non-ok responses with the provided error constructor", async () => {
    setMockFetch();
    responseStatuses.push(409);
    jsonResponses.push({
      error: "fetchTest.error.conflict",
      statusCode: 409,
      data: { id: "1" },
      path: "/items/1",
      timestamp: "2026-05-25T00:00:00.000Z",
    });
    const client = new HttpClient("https://api.example", TestErr);

    const error = (await client.get("/items/1").catch((error) => error)) as TestErr;

    expect(error).toBeInstanceOf(TestErr);
    expect(error.message).toBe("fetchTest.error.conflict");
    expect(error).toMatchObject({
      error: "fetchTest.error.conflict",
      statusCode: 409,
      data: { id: "1" },
      path: "/items/1",
      timestamp: "2026-05-25T00:00:00.000Z",
    });
  });
});

describe("requestStorage utilities", () => {
  test("parses cookies and returns empty request data outside context", () => {
    const parsed = parseCookieHeader('jwt=abc; theme=j:"dark"; malformed; badJson=j:{nope}; spaced = value ');

    expect(parsed.get("jwt")).toEqual({ name: "jwt", value: "abc" });
    expect(parsed.get("theme")).toEqual({ name: "theme", value: "dark" });
    expect(parsed.get("badJson")).toEqual({ name: "badJson", value: "j:{nope}" });
    expect(parsed.has("malformed")).toBe(false);
    expect(headers()).toEqual(new Map());
    expect(cookies()).toEqual(new Map());
    expect(getRequestTheme()).toBeUndefined();
  });

  test("scopes headers, cookies, theme, and memoized queries per request", async () => {
    if (!requestStorage) return;
    const reqA = new Request("https://example.test/a", {
      headers: { authorization: "Bearer request", cookie: "jwt=requestJwt; theme=system" },
    });
    const reqB = new Request("https://example.test/b", {
      headers: { cookie: "jwt=otherJwt" },
    });
    let calls = 0;

    const first = await requestStorage.run(reqA, async () => {
      setRequestTheme("css");
      const a = await memoizeRequestQuery("same", async () => {
        calls += 1;
        return "a";
      });
      const b = await memoizeRequestQuery("same", async () => {
        calls += 1;
        return "b";
      });
      return {
        a,
        b,
        auth: headers().get("authorization"),
        jwt: cookies().get("jwt")?.value,
        theme: getRequestTheme(),
        request: getRequestStore()?.request,
      };
    });
    const second = await requestStorage.run(reqB, async () => {
      const value = await memoizeRequestQuery("same", async () => {
        calls += 1;
        return "b";
      });
      return { value, jwt: cookies().get("jwt")?.value, theme: getRequestTheme() };
    });
    const outsideA = await memoizeRequestQuery("outside", async () => {
      calls += 1;
      return "outside-a";
    });
    const outsideB = await memoizeRequestQuery("outside", async () => {
      calls += 1;
      return "outside-b";
    });

    expect(first).toEqual({
      a: "a",
      b: "a",
      auth: "Bearer request",
      jwt: "requestJwt",
      theme: "css",
      request: reqA,
    });
    expect(second).toEqual({ value: "b", jwt: "otherJwt", theme: undefined });
    expect(outsideA).toBe("outside-a");
    expect(outsideB).toBe("outside-b");
    expect(calls).toBe(4);
  });

  test("records dynamic usage and request policy without changing cache behavior", async () => {
    if (!requestStorage) return;
    const req = new Request("https://example.test/policy", {
      headers: { cookie: "theme=css", "x-locale": "ko" },
    });

    const result = await requestStorage.run(req, async () => {
      updateRequestPolicy({
        routeId: "/:lang/example",
        cacheable: true,
        revalidate: 60,
        tags: ["example"],
      });
      const before = { ...getRequestDynamicUsage() };
      headers();
      cookies();
      const after = getRequestDynamicUsage();
      const policy = getRequestPolicy();
      return {
        before,
        after,
        routeId: policy?.routeId,
        cacheable: policy?.cacheable,
        revalidate: policy?.revalidate,
        tags: [...(policy?.tags ?? [])],
      };
    });

    expect(result).toEqual({
      before: { headers: false, cookies: false },
      after: { headers: true, cookies: true },
      routeId: "/:lang/example",
      cacheable: true,
      revalidate: 60,
      tags: ["example"],
    });
  });

  test("combines request policy revalidate values with min lifetime semantics", async () => {
    if (!requestStorage) return;
    const req = new Request("https://example.test/revalidate");

    const result = await requestStorage.run(req, async () => {
      updateRequestPolicy({ revalidate: 60 });
      updateRequestPolicy({ revalidate: 120 });
      const afterLonger = getRequestPolicy()?.revalidate;
      updateRequestPolicy({ routeId: "/keep-existing" });
      const afterUndefinedPatch = getRequestPolicy()?.revalidate;
      updateRequestPolicy({ revalidate: false });
      const afterNoStore = getRequestPolicy()?.revalidate;
      updateRequestPolicy({ revalidate: 10 });
      return {
        afterLonger,
        afterUndefinedPatch,
        afterNoStore,
        afterShorterAfterNoStore: getRequestPolicy()?.revalidate,
      };
    });

    expect(result).toEqual({
      afterLonger: 60,
      afterUndefinedPatch: 60,
      afterNoStore: false,
      afterShorterAfterNoStore: false,
    });
  });

  test("accumulates cache tags on the active request policy", async () => {
    expect(cacheTag("outside")).toBeUndefined();
    if (!requestStorage) return;
    const req = new Request("https://example.test/tags");

    const tags = await requestStorage.run(req, async () => {
      cacheTag("docs", "", "intro");
      cacheTag("docs", "api");
      return [...(getRequestPolicy()?.tags ?? [])];
    });

    expect(tags).toEqual(["docs", "intro", "api"]);
  });

  test("runs with an explicit request store that remains observable after the callback", async () => {
    if (!requestStorage) return;
    const store = createRequestStore(new Request("https://example.test/explicit-store"));

    await requestStorage.run(store, async () => {
      headers();
      updateRequestPolicy({ revalidate: 30 });
    });

    expect(store.dynamicUsage).toEqual({ headers: true, cookies: false });
    expect(store.policy.revalidate).toBe(30);
  });

  test("marks public raw request access dynamic while keeping internal access untracked", async () => {
    if (!requestStorage) return;
    const req = new Request("https://example.test/raw", {
      headers: { cookie: "jwt=secret", authorization: "Bearer token" },
    });

    const result = await requestStorage.run(req, async () => {
      const internalReq = untrackedRequest();
      const afterInternalRead = { ...getRequestDynamicUsage() };
      const publicReq = getRequest();
      return {
        sameRequest: internalReq === req && publicReq === req,
        afterInternalRead,
        afterPublicRead: { ...getRequestDynamicUsage() },
      };
    });

    expect(result).toEqual({
      sameRequest: true,
      afterInternalRead: { headers: false, cookies: false },
      afterPublicRead: { headers: true, cookies: true },
    });
  });

  test("reads framework internals without marking the request dynamic", async () => {
    if (!requestStorage) return;
    const req = new Request("https://example.test/internal", {
      headers: { cookie: "theme=dark", "x-locale": "ko" },
    });

    const result = await requestStorage.run(req, async () => {
      const internal = {
        locale: untrackedHeaders().get("x-locale"),
        theme: untrackedCookies().get("theme")?.value,
        usage: { ...getRequestDynamicUsage() },
      };
      headers();
      cookies();
      return {
        internal,
        afterPublicRead: { ...getRequestDynamicUsage() },
      };
    });

    expect(result).toEqual({
      internal: {
        locale: "ko",
        theme: "dark",
        usage: { headers: false, cookies: false },
      },
      afterPublicRead: { headers: true, cookies: true },
    });
  });
});

describe("FetchClient HTTP generation", () => {
  test("classifies args and registers service query/mutation handlers", async () => {
    setMockFetch();
    jsonResponses.push("ok", { title: "Created", count: 2, nested: { label: "N" } });
    const client = new FetchClient("https://api.example", {}, { service: serviceSignal });
    client.setJwt("jwt-token");

    expect(
      FetchClient.classifyHttpArgs([
        arg("param", "id"),
        arg("search", "q"),
        arg("body", "payload"),
        arg("upload", "file"),
      ]),
    ).toMatchObject({
      paramArgs: [{ name: "id" }],
      searchArgs: [{ name: "q" }],
      bodyArgs: [{ name: "payload" }],
      uploadArgs: [{ name: "file" }],
    });

    expect(await client.handler.getThing("1234567890abcdef12345678", ["x", "y"], null)).toBe("ok");
    const created = await client.handler.createThing("Created", 2);

    expect(created).toBeInstanceOf(FetchTestFull);
    expect((created as InstanceType<typeof FetchTestFull>).title).toBe("Created");
    expect(fetchCalls[0]).toMatchObject({
      url: "https://api.example/custom/1234567890abcdef12345678?tags=x&tags=y",
      init: { headers: { "Content-Type": "application/json", Authorization: "Bearer jwt-token" } },
    });
    expect(fetchCalls[1]).toMatchObject({
      url: "https://api.example/createThing",
      init: {
        method: "POST",
        body: JSON.stringify({ title: "Created", count: 2 }),
        headers: { "Content-Type": "application/json", Authorization: "Bearer jwt-token" },
      },
    });
  });

  test("supports explicit auth token, request auth, crystalize false, upload bodies, and clone", async () => {
    setMockFetch();
    jsonResponses.push({ title: "Raw", count: 1, nested: { label: "N" } }, "RequestAuth", "uploaded", "cloned");
    const client = new FetchClient("https://api.example", {}, { service: serviceSignal });
    const file = new Blob(["file"]);

    const raw = await client.handler.createThing("Raw", 1, { token: "explicit", crystalize: false });
    const requestResult = requestStorage
      ? await requestStorage.run(
          new Request("https://example.test", { headers: { authorization: "Bearer request-token" } }),
          async () => {
            setAkanPublicEnv();
            return await client.handler.getThing("abcdefabcdefabcdefabcdef", [], null);
          },
        )
      : "RequestAuth";
    const uploaded = await client.handler.uploadThing(file, "file-title");
    const cloned = client.clone({ origin: "https://clone.example", connect: false, jwt: "clone-jwt" });
    const cloneResult = await (
      cloned as unknown as { getThing: (id: string, tags: string[], empty: null) => Promise<unknown> }
    ).getThing("bbbbbbbbbbbbbbbbbbbbbbbb", [], null);

    expect(raw).toEqual({ title: "Raw", count: 1, nested: { label: "N" } });
    expect(requestResult).toBe("RequestAuth");
    expect(uploaded).toBe("uploaded");
    expect(cloneResult).toBe("cloned");
    expect(fetchCalls[0]?.init?.headers).toMatchObject({ Authorization: "Bearer explicit" });
    expect(fetchCalls[1]?.init?.headers).toMatchObject({ Authorization: "Bearer request-token" });
    expect(fetchCalls[2]?.init?.body).toBeInstanceOf(FormData);
    expect(fetchCalls[2]?.init?.headers).toEqual({});
    expect(fetchCalls[3]).toMatchObject({
      url: "https://clone.example/custom/bbbbbbbbbbbbbbbbbbbbbbbb",
      init: { headers: { "Content-Type": "application/json", Authorization: "Bearer clone-jwt" } },
    });
  });

  test("sends requests to the FetchPolicy.origin host instead of the client origin", async () => {
    setMockFetch();
    jsonResponses.push("pong", { title: "Created", count: 2, nested: { label: "N" } });
    const client = new FetchClient("https://api.example", {}, { service: serviceSignal });

    // trailing slash on the override host must be normalized away
    const queried = await client.handler.getThing("1234567890abcdef12345678", [], null, {
      origin: "https://akasys-debug.akamir.com/",
    });
    const created = await client.handler.createThing("Created", 2, { origin: "https://akasys-debug.akamir.com" });

    expect(queried).toBe("pong");
    expect(created).toBeInstanceOf(FetchTestFull);
    expect(fetchCalls[0]?.url).toBe("https://akasys-debug.akamir.com/custom/1234567890abcdef12345678");
    expect(fetchCalls[1]?.url).toBe("https://akasys-debug.akamir.com/createThing");
  });

  test("uses FetchPolicy.origin verbatim, including the global api prefix supplied by the caller", async () => {
    setMockFetch();
    jsonResponses.push("pong", { title: "Created", count: 2, nested: { label: "N" } });
    const client = new FetchClient("https://api.example/api", {}, { service: serviceSignal });

    // the caller is responsible for including the server global prefix (e.g. "/api")
    const queried = await client.handler.getThing("1234567890abcdef12345678", [], null, {
      origin: "https://edge.example.com/api",
    });
    const created = await client.handler.createThing("Created", 2, { origin: "https://edge.example.com/api" });

    expect(queried).toBe("pong");
    expect(created).toBeInstanceOf(FetchTestFull);
    expect(fetchCalls[0]?.url).toBe("https://edge.example.com/api/custom/1234567890abcdef12345678");
    expect(fetchCalls[1]?.url).toBe("https://edge.example.com/api/createThing");
  });

  test("bypasses the request-query cache when FetchPolicy.origin is set", async () => {
    if (!requestStorage) return;
    setMockFetch();
    jsonResponses.push("origin", "override-1", "override-2");
    const client = new FetchClient("https://api.example", {}, { service: serviceSignal });

    const result = await requestStorage.run(new Request("https://example.test"), async () => {
      const cachedA = await client.handler.getThing("1234567890abcdef12345678", [], null);
      const cachedB = await client.handler.getThing("1234567890abcdef12345678", [], null);
      const overrideA = await client.handler.getThing("1234567890abcdef12345678", [], null, {
        origin: "https://akasys-debug.akamir.com",
      });
      const overrideB = await client.handler.getThing("1234567890abcdef12345678", [], null, {
        origin: "https://akasys-debug.akamir.com",
      });
      return { cachedA, cachedB, overrideA, overrideB };
    });

    // origin requests share the memoized cache: the second call reuses the first response
    expect(result.cachedA).toBe("origin");
    expect(result.cachedB).toBe("origin");
    // url overrides skip the cache entirely: each call performs a fresh fetch
    expect(result.overrideA).toBe("override-1");
    expect(result.overrideB).toBe("override-2");
    expect(fetchCalls.map((call) => call.url)).toEqual([
      "https://api.example/custom/1234567890abcdef12345678",
      "https://akasys-debug.akamir.com/custom/1234567890abcdef12345678",
      "https://akasys-debug.akamir.com/custom/1234567890abcdef12345678",
    ]);
  });

  test("clone targets the new origin for queries and mutations while leaving the original intact", async () => {
    setMockFetch();
    jsonResponses.push({ title: "Created", count: 2, nested: { label: "N" } }, "clone-query", "origin-query");
    const client = new FetchClient("https://api.example", {}, { service: serviceSignal });
    client.setJwt("origin-jwt");
    const cloned = client.clone({ origin: "https://clone.example", connect: false, jwt: "clone-jwt" }) as unknown as {
      getThing: (id: string, tags: string[], empty: null) => Promise<unknown>;
      createThing: (title: string, count: number) => Promise<unknown>;
    };

    const created = await cloned.createThing("Created", 2);
    const cloneQuery = await cloned.getThing("1234567890abcdef12345678", [], null);
    const originQuery = await client.handler.getThing("1234567890abcdef12345678", [], null);

    expect(created).toBeInstanceOf(FetchTestFull);
    expect(cloneQuery).toBe("clone-query");
    expect(originQuery).toBe("origin-query");
    // clone routes mutations and queries to the new origin with its own jwt
    expect(fetchCalls[0]).toMatchObject({
      url: "https://clone.example/createThing",
      init: { headers: { Authorization: "Bearer clone-jwt" } },
    });
    expect(fetchCalls[1]).toMatchObject({ url: "https://clone.example/custom/1234567890abcdef12345678" });
    // original client keeps its own origin and jwt, unaffected by the clone
    expect(fetchCalls[2]).toMatchObject({
      url: "https://api.example/custom/1234567890abcdef12345678",
      init: { headers: { Authorization: "Bearer origin-jwt" } },
    });
  });

  test("clone with a different origin does not share the request-query cache with the original", async () => {
    if (!requestStorage) return;
    setMockFetch();
    jsonResponses.push("origin-resp", "clone-resp");
    const client = new FetchClient("https://api.example", {}, { service: serviceSignal });
    const cloned = client.clone({ origin: "https://clone.example", connect: false }) as unknown as {
      getThing: (id: string, tags: string[], empty: null) => Promise<unknown>;
    };

    const result = await requestStorage.run(new Request("https://example.test"), async () => {
      const originA = await client.handler.getThing("1234567890abcdef12345678", [], null);
      const cloneA = await cloned.getThing("1234567890abcdef12345678", [], null);
      const originB = await client.handler.getThing("1234567890abcdef12345678", [], null);
      const cloneB = await cloned.getThing("1234567890abcdef12345678", [], null);
      return { originA, cloneA, originB, cloneB };
    });

    // the cache key is scoped by origin, so origin and clone resolve to different responses
    expect(result.originA).toBe("origin-resp");
    expect(result.cloneA).toBe("clone-resp");
    // repeated calls reuse each client's own cached response, so no extra fetches happen
    expect(result.originB).toBe("origin-resp");
    expect(result.cloneB).toBe("clone-resp");
    expect(fetchCalls.map((call) => call.url)).toEqual([
      "https://api.example/custom/1234567890abcdef12345678",
      "https://clone.example/custom/1234567890abcdef12345678",
    ]);
  });

  test("materializes handlers lazily from local and shared serialized signals", async () => {
    setMockFetch();
    jsonResponses.push("local", "shared");

    const local = new FetchClient("https://local.example", {}, { service: serviceSignal });
    expect(Object.keys(local.handler)).toEqual([]);

    const localResult = await local.handler.getThing("1234567890abcdef12345678", [], null);
    expect(localResult).toBe("local");
    expect(Object.keys(local.handler)).toContain("getThing");

    const shared = new FetchClient("https://shared.example");
    expect(Object.keys(shared.handler)).toEqual([]);

    const sharedResult = await shared.handler.getThing("abcdefabcdefabcdefabcdef", [], null);
    expect(sharedResult).toBe("shared");
    expect(Object.keys(shared.handler)).toContain("getThing");
    expect(fetchCalls.map((call) => call.url)).toEqual([
      "https://local.example/custom/1234567890abcdef12345678",
      "https://shared.example/custom/abcdefabcdefabcdefabcdef",
    ]);
  });

  test("refreshes cached handlers when a serialized signal is applied again", async () => {
    setMockFetch();
    jsonResponses.push("before", "after");
    const client = new FetchClient("https://api.example", {}, { service: serviceSignal });

    expect(await client.handler.getThing("1234567890abcdef12345678", [], null)).toBe("before");

    client.applySignal({
      service: {
        endpoint: {
          getThing: {
            type: "query",
            path: "/changed/:id",
            args: [arg("param", "id", { refName: "ID" }), arg("search", "version")],
            returns: { refName: "String" },
          },
        },
      },
    });

    expect(await client.handler.getThing("1234567890abcdef12345678", "v2")).toBe("after");
    expect(fetchCalls.map((call) => call.url)).toEqual([
      "https://api.example/custom/1234567890abcdef12345678",
      "https://api.example/changed/1234567890abcdef12345678?version=v2",
    ]);
  });

  test("does not require database constants while only indexing shared database signals", () => {
    const missingConstantSignal: SerializedSignal = {
      prefix: "missingConstant",
      getGuards: ["Public"],
      cruGuards: ["Admin"],
      slice: {
        "": { args: [] },
      },
      endpoint: {},
    };

    expect(() => new FetchClient("https://api.example", {}, { missingConstant: missingConstantSignal })).not.toThrow();
    expect(() => new FetchClient("https://shared.example")).not.toThrow();
    expect(() =>
      FetchClient.build<{ fetch: unknown }>({}, { missingConstant: missingConstantSignal }, { connect: false }),
    ).not.toThrow();
  });
});

describe("FetchClient database signal helpers", () => {
  test("registers database base model, slice, and filter metadata", async () => {
    setMockFetch();
    jsonResponses.push(
      { title: "Full", count: 1, nested: { label: "N" } },
      { title: "Light", count: 1, nested: { label: "N" } },
      { title: "Created", count: 2, nested: { label: "N" } },
      { title: "Updated", count: 3, nested: { label: "N" } },
      { title: "Removed", count: 4, nested: { label: "N" } },
      [{ title: "List", count: 1, nested: { label: "N" } }],
      { count: 1 },
      [{ title: "Init", count: 1, nested: { label: "N" } }],
      { count: 1 },
      [{ title: "DefaultInit", count: 1, nested: { label: "N" } }],
      { count: 1 },
    );
    const client = new FetchClient("https://api.example", {}, { fetchTestItem: databaseSignal });
    expect(Object.keys(client.handler)).toEqual([]);

    const full = await client.handler.fetchTestItem("1234567890abcdef12345678");
    const light = await client.handler.lightFetchTestItem("1234567890abcdef12345678");
    const created = await client.handler.createFetchTestItem({ title: "Created", count: 2, nested: { label: "N" } });
    const updated = await client.handler.updateFetchTestItem("1234567890abcdef12345678", {
      title: "Updated",
      count: 3,
      nested: { label: "N" },
    });
    const removed = await client.handler.removeFetchTestItem("1234567890abcdef12345678");
    const list = (await client.handler.fetchTestItemListByOwner(
      "abcdefabcdefabcdefabcdef",
      0,
      10,
      "latest",
    )) as unknown[];
    const insight = await client.handler.fetchTestItemInsightByOwner("abcdefabcdefabcdefabcdef");
    const init = (await client.handler.initFetchTestItemByOwner("abcdefabcdefabcdefabcdef", {
      page: 1,
      limit: 10,
      sort: "latest",
    })) as Record<string, unknown>;
    const defaultInit = (await client.handler.initFetchTestItem()) as Record<string, Record<string, unknown>>;

    expect(full).toBeInstanceOf(FetchTestFull);
    expect(light).toBeInstanceOf(FetchTestLight);
    expect(created).toBeInstanceOf(FetchTestFull);
    expect(updated).toBeInstanceOf(FetchTestFull);
    expect(removed).toBeInstanceOf(FetchTestFull);
    expect(list[0]).toBeInstanceOf(FetchTestLight);
    expect(insight).toBeInstanceOf(FetchTestInsight);
    expect(init.fetchTestItemListByOwner).toBeInstanceOf(DataList);
    expect(init.fetchTestItemInsightByOwner).toBeInstanceOf(FetchTestInsight);
    expect(defaultInit.fetchTestItemInit.queryArgsOfFetchTestItem).toEqual([]);
    expect(Object.keys(client.handler)).toEqual(
      expect.arrayContaining([
        "fetchTestItem",
        "lightFetchTestItem",
        "createFetchTestItem",
        "updateFetchTestItem",
        "removeFetchTestItem",
        "fetchTestItemListByOwner",
        "fetchTestItemInsightByOwner",
        "initFetchTestItemByOwner",
      ]),
    );
    expect(client.slice.fetchTestItemByOwner).toEqual({
      refName: "fetchTestItem",
      sliceName: "fetchTestItemByOwner",
      argLength: 1,
    });
    expect(client.sortKeyMap.get("fetchTestItem")).toEqual(["latest", "oldest"]);
    expect(fetchCalls.map((call) => call.url)).toEqual([
      "https://api.example/fetchTest/fetchTestItem/1234567890abcdef12345678",
      "https://api.example/fetchTest/lightFetchTestItem/1234567890abcdef12345678",
      "https://api.example/fetchTest/createFetchTestItem",
      "https://api.example/fetchTest/updateFetchTestItem/1234567890abcdef12345678",
      "https://api.example/fetchTest/removeFetchTestItem/1234567890abcdef12345678",
      "https://api.example/fetchTest/fetchTestItemListByOwner/abcdefabcdefabcdefabcdef?skip=0&limit=10&sort=latest",
      "https://api.example/fetchTest/fetchTestItemInsightByOwner/abcdefabcdefabcdefabcdef",
      "https://api.example/fetchTest/fetchTestItemListByOwner/abcdefabcdefabcdefabcdef?skip=0&limit=10&sort=latest",
      "https://api.example/fetchTest/fetchTestItemInsightByOwner/abcdefabcdefabcdefabcdef",
      "https://api.example/fetchTest/fetchTestItemList?skip=0&limit=20&sort=latest",
      "https://api.example/fetchTest/fetchTestItemInsight",
    ]);
  });

  test("creates view/edit helpers and merge helper from base model endpoints", async () => {
    setMockFetch();
    jsonResponses.push(
      { title: "View", count: 1, nested: { label: "N" } },
      { title: "ViewRaw", count: 1, nested: { label: "N" } },
      { title: "Updated", count: 2, nested: { label: "N" } },
    );
    const client = new FetchClient("https://api.example", {}, { fetchTestItem: databaseSignal });
    expect(Object.keys(client.handler)).toEqual([]);

    const view = (await client.handler.viewFetchTestItem("1234567890abcdef12345678")) as {
      fetchTestItem: unknown;
      fetchTestItemView: { fetchTestItemObj: unknown };
    };
    const edit = (await client.handler.getFetchTestItemEdit("abcdefabcdefabcdefabcdef")) as {
      fetchTestItemObj: unknown;
    };
    const merged = await client.handler.mergeFetchTestItem(
      { id: "bbbbbbbbbbbbbbbbbbbbbbbb" },
      { title: "Merged", count: 2, nested: { label: "N" } },
    );

    expect(view.fetchTestItem).toBeInstanceOf(FetchTestFull);
    expect(view.fetchTestItemView.fetchTestItemObj).toMatchObject({ title: "View" });
    expect(edit.fetchTestItemObj).toMatchObject({ title: "ViewRaw" });
    expect(merged).toBeInstanceOf(FetchTestFull);
    expect(Object.keys(client.handler)).toEqual(
      expect.arrayContaining(["viewFetchTestItem", "fetchTestItem", "getFetchTestItemEdit", "mergeFetchTestItem"]),
    );
    expect(fetchCalls.at(-1)?.url).toBe("https://api.example/fetchTest/updateFetchTestItem/bbbbbbbbbbbbbbbbbbbbbbbb");
  });
});

describe("WsClient", () => {
  test("warns when realtime APIs are used before websocket connection", () => {
    setFakeWebSocket();
    const originalConsoleWarn = console.warn;
    const warnings: string[] = [];
    console.warn = ((message: string) => {
      warnings.push(message);
    }) as typeof console.warn;
    try {
      const client = new WsClient("ws://example/ws");
      client.emit("send", ["hello"]);
      client.subscribe({ key: "roomKey", data: ["r1"], handleEvent: () => undefined });

      expect(warnings).toEqual([
        expect.stringContaining('before emit "send"'),
        expect.stringContaining('before subscribe "roomKey"'),
      ]);
    } finally {
      console.warn = originalConsoleWarn;
    }
  });

  test("manages websocket lifecycle, messages, listeners, and subscriptions", () => {
    setFakeWebSocket();
    const client = new WsClient("ws://example/ws");
    const messages: unknown[] = [];
    const onceMessages: unknown[] = [];
    const pubsubMessages: unknown[] = [];

    expect(WsClient.makeRoomId("room", ["a", "b"])).toBe("room-a-b");
    client.connect();
    const ws = FakeWebSocket.instances[0];
    ws.open();
    expect(client.connected).toBe(true);

    client.emit("send", ["hello"]);
    expect(JSON.parse(ws.sent.at(-1) ?? "{}")).toEqual({ key: "send", data: ["hello"] });

    const listener = (data: unknown) => messages.push(data);
    client.on("messageKey", listener).once("messageKey", (data) => onceMessages.push(data));
    expect(client.hasListeners("messageKey")).toBe(true);
    ws.receive({ type: "msg", key: "messageKey", data: { value: 1 } });
    ws.receive({ type: "msg", key: "messageKey", data: { value: 2 } });
    expect(messages).toEqual([{ value: 1 }, { value: 2 }]);
    expect(onceMessages).toEqual([{ value: 1 }]);
    client.off("messageKey", listener);
    expect(client.hasListeners("messageKey")).toBe(false);

    const handlePubsub = (data: unknown) => pubsubMessages.push(data);
    client.subscribe({ key: "roomKey", data: ["r1"], handleEvent: handlePubsub });
    expect(JSON.parse(ws.sent.at(-1) ?? "{}")).toEqual({ key: "roomKey", data: ["r1"], subscribe: true });
    ws.receive({ type: "pub", roomId: "roomKey-r1", data: { title: "event" } });
    expect(pubsubMessages).toEqual([{ title: "event" }]);
    expect(client.hasListeners("roomKey-r1")).toBe(true);
    client.unsubscribe({ key: "roomKey", data: ["r1"], handleEvent: handlePubsub });
    expect(JSON.parse(ws.sent.at(-1) ?? "{}")).toEqual({ key: "roomKey", data: ["r1"], subscribe: false });
    expect(client.hasListeners("roomKey-r1")).toBe(false);

    client.removeAllListeners("messageKey");
    client.destroy();
    expect(FakeWebSocket.instances[0]?.readyState).toBe(FakeWebSocket.CLOSED);
  });

  test("restores websocket error payloads with the provided error constructor", () => {
    setFakeWebSocket();
    const originalConsoleError = console.error;
    const errors: unknown[] = [];
    console.error = ((error: unknown) => {
      errors.push(error);
    }) as typeof console.error;
    try {
      const client = new WsClient("ws://example/ws", TestErr);
      client.connect();
      const ws = FakeWebSocket.instances[0];
      ws.open();

      ws.receive({
        error: "chatRoom.error.notMember",
        statusCode: 403,
        data: { chatRoomId: "room-1" },
        timestamp: "2026-05-25T00:00:00.000Z",
      });

      expect(errors[0]).toBeInstanceOf(TestErr);
      expect(errors[0]).toMatchObject({
        error: "chatRoom.error.notMember",
        statusCode: 403,
        data: { chatRoomId: "room-1" },
        timestamp: "2026-05-25T00:00:00.000Z",
      });
    } finally {
      console.error = originalConsoleError;
    }
  });

  test("resubscribes rooms on reconnect and destroy prevents reconnect", async () => {
    setFakeWebSocket();
    globalThis.setTimeout = ((handler: TimerHandler, _timeout?: number, ...args: unknown[]) =>
      originalSetTimeout(handler, 0, ...args)) as typeof setTimeout;
    const client = new WsClient("ws://example/ws");
    const handleEvent = () => undefined;
    client.connect();
    const firstWs = FakeWebSocket.instances[0];
    firstWs.open();
    client.subscribe({ key: "roomKey", data: ["r1"], handleEvent });

    firstWs.close();
    await new Promise((resolve) => originalSetTimeout(resolve, 5));
    const secondWs = FakeWebSocket.instances[1];
    secondWs.open();
    expect(JSON.parse(secondWs.sent[0] ?? "{}")).toEqual({ key: "roomKey", data: ["r1"], subscribe: true });

    client.destroy();
    const instanceCount = FakeWebSocket.instances.length;
    secondWs.close();
    await new Promise((resolve) => originalSetTimeout(resolve, 5));
    expect(FakeWebSocket.instances).toHaveLength(instanceCount);
  });
});

describe("FetchClient websocket generation", () => {
  test("registers message and pubsub handlers from serialized endpoints", async () => {
    setFakeWebSocket();
    const client = new FetchClient("https://api.example", {}, { service: serviceSignal });
    client.connect();
    const ws = FakeWebSocket.instances[0];
    ws.open();
    const listened: unknown[] = [];
    const published: unknown[] = [];

    await client.handler.sendThing("hello");
    const cleanupMessage = client.handler.listenSendThing((data: unknown) => listened.push(data)) as () => void;
    ws.receive({ type: "msg", key: "sendThing", data: "server-message" });
    cleanupMessage();
    ws.receive({ type: "msg", key: "sendThing", data: "after-cleanup" });
    const cleanupPubsub = (await client.handler.subscribeRoomThing("room-1", (data: unknown) =>
      published.push(data),
    )) as () => void;
    ws.receive({ type: "pub", roomId: "roomThing-room-1", data: { title: "Published" } });
    cleanupPubsub();

    expect(JSON.parse(ws.sent[0] ?? "{}")).toEqual({ key: "sendThing", data: ["hello"] });
    expect(listened).toEqual(["server-message"]);
    expect(JSON.parse(ws.sent[1] ?? "{}")).toEqual({ key: "roomThing", data: ["room-1"], subscribe: true });
    expect(published[0]).toBeInstanceOf(FetchTestLight);
    expect((published[0] as InstanceType<typeof FetchTestLight>).title).toBe("Published");
    expect(JSON.parse(ws.sent[2] ?? "{}")).toEqual({ key: "roomThing", data: ["room-1"], subscribe: false });
  });
});
