import { afterEach, describe, expect, setSystemTime, test } from "bun:test";
import { Any, DataList, getEnv, ID, Int, Upload } from "akanjs/base";
import { Logger, websocketBinaryFrameContract } from "akanjs/common";
import { ConstantRegistry, via } from "akanjs/constant";
import {
  buildEndpoint,
  type DatabaseSignal,
  type EndpointCls,
  type EndpointInfo,
  HttpExecutionContext,
  isExceptionLike,
  type SerializedArg,
  type SerializedSignal,
  type SliceCls,
} from "akanjs/signal";
import { FetchClient, type FetchProxy } from "./client/fetchClient";
import { HttpClient } from "./client/httpClient";
import { type ErrorResponsePayload, type RestoredError, restoreRemoteError } from "./client/remoteError";
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
// What a type carries, where `Equal` (identity) would tell an intersection apart from the object it resolves to.
type Mutual<Left, Right> = [Left] extends [Right] ? ([Right] extends [Left] ? true : false) : false;
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
    // The trailing `false` is `Nullable`, whose `boolean` default would make this guard assert `… | null`.
    getSelf: EndpointInfo<
      "query",
      Record<string, unknown>,
      [],
      [],
      [],
      [],
      StringConstructor,
      TypeRegressionSharedUser,
      TypeRegressionSharedUser,
      false
    >;
  }
>;
type TypeRegressionUserSlice = SliceCls & {
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
  Mutual<Awaited<ReturnType<TypeRegressionUserFetch["getSelf"]>>, TypeRegressionAppUser>
>;

type FetchCall = { url: string; init?: RequestInit };
const originalFetch = globalThis.fetch;
const originalWebSocket = globalThis.WebSocket;
const originalSetTimeout = globalThis.setTimeout;
const originalClearTimeout = globalThis.clearTimeout;
const originalSetInterval = globalThis.setInterval;
const originalClearInterval = globalThis.clearInterval;
const originalEnv = {
  appName: process.env.AKAN_PUBLIC_APP_NAME,
  repoName: process.env.AKAN_PUBLIC_REPO_NAME,
  serveDomain: process.env.AKAN_PUBLIC_SERVE_DOMAIN,
  operationMode: process.env.AKAN_PUBLIC_OPERATION_MODE,
};
const fetchCalls: FetchCall[] = [];
const jsonResponses: unknown[] = [];
const responseStatuses: number[] = [];
const rawResponses: (Response | Error)[] = [];

const setMockFetch = () => {
  fetchCalls.length = 0;
  jsonResponses.length = 0;
  rawResponses.length = 0;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    fetchCalls.push({ url: String(url), init });
    if (rawResponses.length) {
      const next = rawResponses.shift();
      if (next instanceof Error) throw next;
      return next as Response;
    }
    const value = jsonResponses.length ? jsonResponses.shift() : { ok: true };
    const status = responseStatuses.length ? responseStatuses.shift() : 200;
    return Response.json(value, { status });
  }) as typeof fetch;
};
const setHangingFetch = () => {
  const signals: (AbortSignal | null | undefined)[] = [];
  globalThis.fetch = ((_url: string, init?: RequestInit) => {
    signals.push(init?.signal);
    return new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject((init.signal as AbortSignal).reason));
    });
  }) as typeof globalThis.fetch;
  return signals;
};
const setAnsweringFetch = () => {
  const signals: (AbortSignal | null | undefined)[] = [];
  globalThis.fetch = ((_url: string, init?: RequestInit) => {
    signals.push(init?.signal);
    return Promise.resolve(new Response("{}", { headers: { "content-type": "application/json" } }));
  }) as typeof globalThis.fetch;
  return signals;
};
//? A fixed delay loses to a stalled event loop: the timers it outwaits fire in its pass and schedule theirs after it.
const waitUntil = async (done: () => boolean) => {
  for (let tries = 0; !done() && tries < 1000; tries += 1) {
    await new Promise((resolve) => originalSetTimeout(resolve, 1));
  }
};
const captureWarnings = async (run: (warnings: string[]) => Promise<void>) => {
  const originalConsoleWarn = console.warn;
  const warnings: string[] = [];
  console.warn = ((message: string) => {
    warnings.push(message);
  }) as typeof console.warn;
  try {
    await run(warnings);
  } finally {
    console.warn = originalConsoleWarn;
  }
};
const setAkanPublicEnv = () => {
  process.env.AKAN_PUBLIC_APP_NAME = "fetchTest";
  process.env.AKAN_PUBLIC_REPO_NAME = "akan";
  process.env.AKAN_PUBLIC_SERVE_DOMAIN = "example.test";
  process.env.AKAN_PUBLIC_OPERATION_MODE = "local";
};

afterEach(() => {
  FetchClient.resetSharedRegistry();
  FetchClient.resetSharedClient();
  globalThis.fetch = originalFetch;
  globalThis.WebSocket = originalWebSocket;
  globalThis.setTimeout = originalSetTimeout;
  globalThis.clearTimeout = originalClearTimeout;
  globalThis.setInterval = originalSetInterval;
  globalThis.clearInterval = originalClearInterval;
  setSystemTime();
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
  rawResponses.length = 0;
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

  constructor(
    readonly url: string,
    readonly options?: { headers?: Record<string, string>; tls?: unknown },
  ) {
    FakeWebSocket.instances.push(this);
  }

  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.({});
  }

  receive(data: unknown) {
    this.onmessage?.({ data: typeof data === "string" ? data : JSON.stringify(data) });
  }

  receiveBinary(frame: Uint8Array) {
    this.onmessage?.({ data: frame.buffer.slice(frame.byteOffset, frame.byteOffset + frame.byteLength) });
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
    streamThing: {
      type: "pubsub",
      args: [arg("room", "channel")],
      returns: { refName: "Binary" },
    },
  },
};

const databaseSignal: SerializedSignal = {
  prefix: "fetchTest",
  getGuards: ["Public"],
  cruGuards: ["Admin"],
  slice: {
    "": {
      args: [
        arg("search", "queryKey", { refName: "String", nullable: true, oneOf: ["any", "byTitle"] }),
        arg("search", "args", { refName: "Any", nullable: true }),
      ],
    },
    byOwner: { args: [arg("param", "ownerId", { refName: "ID" })], guards: ["Public"] },
    inRoot: {
      args: [arg("param", "rootId", { refName: "ID" })],
      guards: ["Public"],
      live: { sort: ["latest"] },
    },
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
  test("gives up on a request nothing answers, as the slow-server error rather than a bare abort", async () => {
    const client = new HttpClient("http://127.0.0.1:1");
    setHangingFetch();
    const failure = await client.get("/slow", { timeout: 10 }).catch((error: unknown) => error);
    expect((failure as { statusCode?: number }).statusCode).toBe(408);
    expect((failure as Error).message).toBe("base.error.gatewayTimeout");
  });

  test("leaves an upload without a deadline, since a large body on a slow uplink is working", async () => {
    const client = new HttpClient("http://127.0.0.1:1");
    const signals = setAnsweringFetch();
    const form = new FormData();
    form.set("files", new Blob(["x"]));
    await client.post("/upload", form);
    await client.post("/plain", { title: "x" });
    expect(signals[0]).toBeUndefined();
    expect(signals[1]).toBeInstanceOf(AbortSignal);
  });

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
      HttpClient.makeUrl(
        "/search/:text",
        [arg("search", "q")],
        new Map([
          ["text", "a/b?c#d %"],
          ["q", "x"],
        ]),
      ),
    ).toBe("/search/a%2Fb%3Fc%23d%20%25?q=x");
    // `Any` has a structure the query string cannot spell, and `String(value)` would send "[object Object]".
    expect(
      HttpClient.makeUrl(
        "/items",
        [arg("search", "args", { refName: "Any", nullable: true })],
        new Map<string, unknown>([["args", ["a", 2, null]]]),
      ),
    ).toBe(`/items?args=${encodeURIComponent('["a",2,null]')}`);
    // Unspellable in JSON, it stringifies to `undefined`, which `set` would send as "undefined" and the reader 400s.
    expect(
      HttpClient.makeUrl(
        "/items",
        [arg("search", "args", { refName: "Any", nullable: true })],
        new Map<string, unknown>([["args", () => ["a"]]]),
      ),
    ).toBe("/items");
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

    // FileList is browser-only — Bun has no global for it, so stand one up to cover the array-like path.
    const files = [new File(["a"], "a.txt"), new File(["b"], "b.txt")];
    class FakeFileList {
      0 = files[0];
      1 = files[1];
      length = 2;
    }
    const globalWithFileList = globalThis as { FileList?: unknown };
    globalWithFileList.FileList = FakeFileList;
    const uploadArg = [arg("upload", "files", { refName: "Upload", arrDepth: 1 })];
    try {
      for (const value of [files, new FakeFileList()]) {
        const uploaded = HttpClient.makeBody([], uploadArg, new Map([["files", value]])) as FormData;
        expect(uploaded.getAll("files")).toHaveLength(2);
        expect(uploaded.getAll("files").every((file) => file instanceof File)).toBe(true);
      }
    } finally {
      delete globalWithFileList.FileList;
    }
  });

  test("quotes a multipart string bound for anything but a String or ID, so the server's JSON parse gives it back", async () => {
    const info = buildEndpoint
      .mutation(Boolean, { fileUpload: true })
      .body("file", [Upload])
      .body("payload", Any)
      .body("list", Any)
      .body("label", String)
      .body("ownerId", ID)
      .body("count", Int)
      .body("tags", [String]);
    const sent = new Map<string, unknown>([
      ["file", [new File(["x"], "x.txt")]],
      ["payload", "42"],
      ["list", "[1]"],
      ["label", "123"],
      ["ownerId", "64a0000000000000000000a1"],
      ["count", 3],
      ["tags", ["1", "x"]],
    ]);
    const form = HttpClient.makeBody(
      [
        arg("body", "payload", { refName: "Any" }),
        arg("body", "list", { refName: "Any" }),
        arg("body", "label"),
        arg("body", "ownerId", { refName: "ID" }),
        arg("body", "count", { refName: "Int" }),
        arg("body", "tags", { arrDepth: 1 }),
      ],
      [arg("body", "file", { refName: "Upload", arrDepth: 1 })],
      sent,
    ) as FormData;
    const request = {
      url: "http://localhost/api/upload",
      params: {},
      body: {},
      headers: new Headers({ "content-type": "multipart/form-data; boundary=x" }),
      formData: async () => form,
    } as unknown as Bun.BunRequest;

    const [files, ...values] = await new HttpExecutionContext(request).getArgs(info);

    expect((files as File[]).map((file) => file.name)).toEqual(["x.txt"]);
    expect(values).toEqual(["42", "[1]", "123", "64a0000000000000000000a1", 3, ["1", "x"]]);
  });

  test("retries a restart, an unreachable server and a 429, and a mutation under one minted Idempotency-Key", async () => {
    setMockFetch();
    const fast = { min: 1, jitter: 0 };
    rawResponses.push(
      new Response("<html>bad gateway</html>", { status: 502 }),
      new TypeError("fetch failed") as unknown as Response,
      Response.json({ ok: "query" }),
    );
    const client = new HttpClient("https://api.example");
    expect(await client.get<{ ok: string }>("/items", { retry: fast })).toEqual({ ok: "query" });
    expect(fetchCalls).toHaveLength(3);

    fetchCalls.length = 0;
    rawResponses.push(
      Response.json({ error: "base.error.gatewayTimeout", statusCode: 504 }, { status: 504 }),
      Response.json({ ok: "mutation" }),
    );
    expect(await client.post<{ ok: string }>("/ack", { id: "c1" }, { retry: fast })).toEqual({ ok: "mutation" });
    const keyOf = (call?: FetchCall) => new Headers(call?.init?.headers as HeadersInit).get("Idempotency-Key");
    const keys = fetchCalls.map(keyOf);
    expect(keys[0]).toBeString();
    expect(keys[1]).toBe(keys[0] ?? "");

    fetchCalls.length = 0;
    rawResponses.push(Response.json({ error: "base.error.notFound", statusCode: 404 }, { status: 404 }));
    await expect(client.get("/missing", { retry: fast })).rejects.toMatchObject({ statusCode: 404 });
    rawResponses.push(new Response("down", { status: 503 }));
    await expect(client.post("/ack", { id: "c2" })).rejects.toMatchObject({ statusCode: 503 });
    expect(fetchCalls).toHaveLength(2);
    expect(keyOf(fetchCalls[1])).toBeNull();
  });

  test("waits out a 429's Retry-After and stops after the attempts it was given", () => {
    const limited = Object.assign(new Error("limited"), { error: "base.error.tooManyRequests", data: { seconds: 2 } });
    expect(HttpClient.retryWait(limited, 1, { min: 10, jitter: 0 })).toBe(2_000);
    const restarting = Object.assign(new Error("restarting"), { error: "base.error.serverUnavailable" });
    expect(HttpClient.retryWait(restarting, 2, { min: 100, jitter: 0 })).toBe(200);
    expect(HttpClient.retryWait(restarting, 1, { min: undefined, jitter: 0 })).toBe(500);
    expect(HttpClient.retryWait(restarting, 3, { attempts: 3 })).toBeNull();
    expect(HttpClient.retryWait(new Error("caller aborted"), 1, {})).toBeNull();
  });

  test("spends one deadline across every try and wait, and gives up on a wait that would outlast it", async () => {
    const client = new HttpClient("http://127.0.0.1:1");
    const signals = setHangingFetch();
    const timedOut = await client.get("/slow", { timeout: 30, retry: { min: 1, jitter: 0 } }).catch((error) => error);
    expect((timedOut as RestoredError).statusCode).toBe(408);
    expect(signals).toHaveLength(1);

    setMockFetch();
    rawResponses.push(new Response("Too Many Requests", { status: 429, headers: { "retry-after": "60" } }));
    const limited = await client.get("/limited", { retry: { min: 1, jitter: 0 } }).catch((error) => error);
    expect(limited).toMatchObject({ statusCode: 429, data: { seconds: 60 } });
    expect(fetchCalls).toHaveLength(1);
  });

  test("retries a gateway's own JSON 503 and a Retry-After of 0 at once, but not an error the app keyed", async () => {
    setMockFetch();
    const fast = { min: 1, jitter: 0 };
    const client = new HttpClient("https://api.example", { ErrorCls: TestErr });
    rawResponses.push(
      Response.json({ message: "failure to get a peer from the ring-balancer" }, { status: 503 }),
      new Response("Too Many Requests", { status: 429, headers: { "retry-after": "0" } }),
      Response.json({ ok: true }),
    );
    expect(await client.get<{ ok: boolean }>("/items", { retry: fast })).toEqual({ ok: true });
    expect(fetchCalls).toHaveLength(3);

    rawResponses.push(Response.json({ message: "no peer" }, { status: 503 }));
    const unkeyed = (await client.get("/items").catch((error) => error)) as TestErr;
    expect(unkeyed.message).toBe("base.error.serverUnavailable");
    expect(unkeyed).toMatchObject({ statusCode: 503, data: { status: 503 }, details: '{"message":"no peer"}' });

    fetchCalls.length = 0;
    rawResponses.push(Response.json({ error: "thing.error.maintenance", statusCode: 503 }, { status: 503 }));
    const keyed = (await client.get("/items", { retry: fast }).catch((error) => error)) as TestErr;
    expect(keyed.message).toBe("thing.error.maintenance");
    expect(fetchCalls).toHaveLength(1);
  });

  test("mints an Idempotency-Key where crypto.randomUUID is missing, as on a dev server reached over plain http", async () => {
    setMockFetch();
    const insecure = crypto as unknown as { randomUUID?: unknown };
    Object.defineProperty(crypto, "randomUUID", { value: undefined, configurable: true, writable: true });
    try {
      await new HttpClient("http://192.168.0.10:8080").post("/ack", { id: "c1" }, { retry: { min: 1 } });
    } finally {
      delete insecure.randomUUID;
    }
    const key = new Headers(fetchCalls[0]?.init?.headers as HeadersInit).get("Idempotency-Key");
    expect(key ?? "").toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(typeof crypto.randomUUID).toBe("function");
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
    expect(fetchCalls[2]?.init?.headers).toEqual({ Accept: "application/json" });
    expect(fetchCalls[3]?.init).toMatchObject({ method: "DELETE" });
    for (const call of fetchCalls) expect(call.init?.headers).toMatchObject({ Accept: "application/json" });
  });

  test("merges constructor headers under per-request headers", async () => {
    setMockFetch();
    jsonResponses.push({ value: "ok" });
    const client = new HttpClient("https://api.example", {
      headers: { Authorization: "Bearer default", "X-Client": "http" },
    });

    await client.get("/items", { headers: { Authorization: "Bearer override" } });

    expect(fetchCalls[0]?.init?.headers).toMatchObject({
      Accept: "application/json",
      Authorization: "Bearer override",
      "X-Client": "http",
    });
  });

  test("uses the constructor timeout when the call does not name one", async () => {
    const client = new HttpClient("http://127.0.0.1:1", { timeout: 10 });
    setHangingFetch();
    const failure = await client.get("/slow").catch((error: unknown) => error);
    expect((failure as { statusCode?: number }).statusCode).toBe(408);
  });

  test("constructor timeout false leaves a json call unbounded", async () => {
    const client = new HttpClient("http://127.0.0.1:1", { timeout: false });
    const signals = setAnsweringFetch();
    await client.get("/items");
    expect(signals[0]).toBeUndefined();
  });

  test("leaves a constructor timeout off an upload unless the call names one", async () => {
    const client = new HttpClient("http://127.0.0.1:1", { timeout: 10 });
    const signals = setAnsweringFetch();
    const form = new FormData();
    form.set("files", new Blob(["x"]));
    await client.post("/upload", form);
    await client.post("/upload", form, { timeout: 10 });
    expect(signals[0]).toBeUndefined();
    expect(signals[1]).toBeInstanceOf(AbortSignal);
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
    const client = new HttpClient("https://api.example", { ErrorCls: TestErr });

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

  test("keeps a restored failure rethrowable when the client has no error constructor", async () => {
    setMockFetch();
    responseStatuses.push(400);
    jsonResponses.push({
      error: "fetchTest.error.applyTimeout",
      statusCode: 400,
      data: { name: "drone-1", timeout: 3000 },
    });
    const client = new HttpClient("https://api.example");

    const error = (await client.get("/apply").catch((error: unknown) => error)) as RestoredError;

    expect(isExceptionLike(error)).toBe(true);
    expect(error.toJSON?.()).toEqual({
      error: "fetchTest.error.applyTimeout",
      statusCode: 400,
      data: { name: "drone-1", timeout: 3000 },
    });
  });

  test("restores a transport failure as rethrowable too, with the status the transport reported", async () => {
    setMockFetch();
    rawResponses.push(new TypeError("Unable to connect. Is the computer able to access the url?"));
    const client = new HttpClient("https://api.example");

    const error = (await client.get("/items").catch((error: unknown) => error)) as RestoredError;

    expect(isExceptionLike(error)).toBe(true);
    expect(error.toJSON?.()).toMatchObject({ error: "base.error.serverUnreachable", statusCode: 503 });
  });

  test("restores a proxy html page as a transport error instead of a parse failure", async () => {
    setMockFetch();
    const page = "<html>\n<head><title>504 Gateway Time-out</title></head>\n<body></body>\n</html>\n";
    rawResponses.push(new Response(page, { status: 504, headers: { "content-type": "text/html" } }));
    const client = new HttpClient("https://api.example", { ErrorCls: TestErr });

    const error = (await client.get("/items").catch((error: unknown) => error)) as TestErr;

    expect(error).toBeInstanceOf(TestErr);
    expect(error.message).toBe("base.error.gatewayTimeout");
    expect(error).toMatchObject({ statusCode: 504, data: { status: 504 }, details: page });
  });

  test("restores a plain-text gateway 503 as a transport error", async () => {
    setMockFetch();
    rawResponses.push(new Response("No healthy federation child is ready", { status: 503 }));
    const client = new HttpClient("https://api.example", { ErrorCls: TestErr });

    const error = (await client.post("/items", { title: "A" }).catch((error: unknown) => error)) as TestErr;

    expect(error.message).toBe("base.error.serverUnavailable");
    expect(error).toMatchObject({ statusCode: 503, details: "No healthy federation child is ready" });
  });

  test("restores a proxy's own 429 with the wait its Retry-After names, else a minute", async () => {
    setMockFetch();
    rawResponses.push(new Response("Too Many Requests", { status: 429, headers: { "retry-after": "30" } }));
    rawResponses.push(new Response("Too Many Requests", { status: 429 }));
    rawResponses.push(new Response("Too Many Requests", { status: 429, headers: { "retry-after": "0" } }));
    const client = new HttpClient("https://api.example", { ErrorCls: TestErr });

    const named = (await client.get("/items").catch((error: unknown) => error)) as TestErr;
    const unnamed = (await client.get("/items").catch((error: unknown) => error)) as TestErr;
    const immediate = (await client.get("/items").catch((error: unknown) => error)) as TestErr;

    expect(named.message).toBe("base.error.tooManyRequests");
    expect(named).toMatchObject({ statusCode: 429, data: { status: 429, seconds: 30 } });
    expect(unnamed).toMatchObject({ statusCode: 429, data: { status: 429, seconds: 60 } });
    expect(immediate).toMatchObject({ statusCode: 429, data: { status: 429, seconds: 0 } });
  });

  test("caps the transport error detail so a page body never becomes the message", async () => {
    setMockFetch();
    rawResponses.push(new Response("x".repeat(5000), { status: 500, headers: { "content-type": "text/plain" } }));
    const client = new HttpClient("https://api.example", { ErrorCls: TestErr });

    const error = (await client.get("/items").catch((error: unknown) => error)) as TestErr;

    expect(error.message).toBe("base.error.unexpectedResponse");
    expect(String(error.details)).toHaveLength(200);
  });

  test("reads a json body a proxy stripped the content-type from", async () => {
    setMockFetch();
    rawResponses.push(new Response(JSON.stringify({ value: "ok" }), { status: 200 }));
    const client = new HttpClient("https://api.example", { ErrorCls: TestErr });

    expect(await client.get<{ value: string }>("/items")).toEqual({ value: "ok" });
  });

  test("restores a refused connection as an unreachable server", async () => {
    setMockFetch();
    rawResponses.push(new TypeError("Unable to connect. Is the computer able to access the url?"));
    const client = new HttpClient("https://api.example", { ErrorCls: TestErr });

    const error = (await client.get("/items").catch((error: unknown) => error)) as TestErr;

    expect(error).toBeInstanceOf(TestErr);
    expect(error.message).toBe("base.error.serverUnreachable");
    expect(error.statusCode).toBe(503);
  });

  test("leaves a caller-side abort untouched", async () => {
    setMockFetch();
    const abort = new Error("The operation was aborted.");
    abort.name = "AbortError";
    rawResponses.push(abort);
    const client = new HttpClient("https://api.example", { ErrorCls: TestErr });

    const error = (await client.get("/items").catch((error: unknown) => error)) as Error;

    expect(error).toBe(abort);
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

describe("FetchClient over a bridge", () => {
  test("sends queries and mutations through the bridge, and opens nothing for a room or a message", async () => {
    setMockFetch();
    setFakeWebSocket();
    const sent: { key: string; type: string; args: Record<string, unknown> }[] = [];
    FetchClient.setBridge({
      call: async ({ key, type, args }) => {
        sent.push({ key, type, args });
        return key === "getThing" ? "bridged" : { title: "Made", count: 1, nested: { label: "N" } };
      },
    });
    try {
      const client = new FetchClient("https://api.example", {}, { service: serviceSignal });
      expect(await client.handler.getThing("1234567890abcdef12345678", ["x"], null)).toBe("bridged");
      expect(await client.handler.createThing("Made", 1)).toBeInstanceOf(FetchTestFull);
      expect(sent.map(({ key, type }) => `${type}:${key}`)).toEqual(["query:getThing", "mutation:createThing"]);
      expect(fetchCalls).toEqual([]);
      const unsubscribe = client.handler.subscribeRoomThing("room-1", () => undefined) as () => void;
      client.handler.sendThing("hello");
      expect(client.ws.hasListeners("roomThing")).toBe(false);
      unsubscribe();
      expect(FakeWebSocket.instances).toEqual([]);
    } finally {
      FetchClient.setBridge(null);
    }
  });

  test("hands the bridge each call's budget in the HTTP order: the call's, the endpoint's, then the client's", async () => {
    const budgets: unknown[] = [];
    FetchClient.setBridge({
      call: async ({ timeout }) => {
        budgets.push(timeout);
        return "ok";
      },
    });
    try {
      const signal: SerializedSignal = {
        endpoint: {
          provisionThing: { type: "mutation", args: [], returns: { refName: "String" }, timeout: 90_000 },
          readThing: { type: "query", args: [], returns: { refName: "String" } },
        },
      };
      const client = new FetchClient("https://api.example", {}, { service: signal });
      await client.handler.provisionThing();
      await client.handler.provisionThing({ timeout: false });
      await client.handler.readThing();
      client.setTimeout(45_000);
      await client.handler.readThing();
      expect(budgets).toEqual([90_000, false, undefined, 45_000]);
    } finally {
      FetchClient.setBridge(null);
    }
  });

  test("leaves a clone aimed at another server off the bridge, which reaches only the server behind the view", async () => {
    setMockFetch();
    jsonResponses.push("direct");
    const bridged: string[] = [];
    FetchClient.setBridge({
      call: async ({ key }) => {
        bridged.push(key);
        return "bridged";
      },
    });
    try {
      type Getter = { getThing: (id: string, tags: string[], empty: null) => Promise<unknown> };
      const client = new FetchClient("https://api.example", {}, { service: serviceSignal });
      const cloud = client.clone({ origin: "https://cloud.example", connect: false }) as unknown as Getter;
      const sameServer = client.clone({ jwt: "same", connect: false }) as unknown as Getter;

      expect(await cloud.getThing("1234567890abcdef12345678", [], null)).toBe("direct");
      expect(await sameServer.getThing("1234567890abcdef12345678", [], null)).toBe("bridged");
      expect(bridged).toEqual(["getThing"]);
      expect(fetchCalls.map((call) => call.url)).toEqual(["https://cloud.example/custom/1234567890abcdef12345678"]);
    } finally {
      FetchClient.setBridge(null);
    }
  });

  test("refuses a file upload in a bridged view before it builds or sends anything", async () => {
    setMockFetch();
    const uploadSignal: SerializedSignal = {
      endpoint: {
        addFiles: {
          type: "mutation",
          fileUpload: true,
          args: [
            arg("body", "files", { refName: "Upload", arrDepth: 1 }),
            arg("body", "metas"),
            arg("body", "type"),
            arg("body", "parentId", { refName: "ID", nullable: true }),
          ],
          returns: { refName: "String" },
        },
      },
    };
    const client = new FetchClient("https://api.example", {}, { fetchTestItem: databaseSignal, file: uploadSignal });
    const upload = () => client.handler.addFetchTestItemFiles([new File(["x"], "x.txt")]) as Promise<unknown>;
    FetchClient.setBridge({ call: async () => "bridged" });
    try {
      await expect(upload()).rejects.toThrow("MCP App view");
      expect(fetchCalls).toEqual([]);
    } finally {
      FetchClient.setBridge(null);
    }
    await upload();
    expect(fetchCalls.map((call) => call.url)).toEqual(["https://api.example/addFiles"]);
  });

  test("restores a refusal the bridge carried as the app's own error", async () => {
    FetchClient.setBridge({
      call: async () => {
        throw restoreRemoteError({ error: "thing.error.locked", data: { id: "1" } }, 409);
      },
    });
    try {
      const client = new FetchClient("https://api.example", {}, { service: serviceSignal }, TestErr);
      const asked = client.handler.getThing("1234567890abcdef12345678", [], null) as Promise<string>;
      const error = (await asked.catch((caught: unknown) => caught)) as TestErr;
      expect(error).toBeInstanceOf(TestErr);
      expect(error.error).toBe("thing.error.locked");
      expect(error.statusCode).toBe(409);
      expect(error.data).toEqual({ id: "1" });
    } finally {
      FetchClient.setBridge(null);
    }
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

  test("sends a mutation with the verb it declares", async () => {
    setMockFetch();
    jsonResponses.push("patched");
    const restSignal: SerializedSignal = {
      endpoint: {
        patchThing: {
          type: "mutation",
          method: "PATCH",
          args: [arg("body", "title")],
          returns: { refName: "String" },
        },
      },
    };
    const client = new FetchClient("https://api.example", {}, { service: restSignal });

    expect(await client.handler.patchThing("Renamed")).toBe("patched");
    expect(fetchCalls[0]).toMatchObject({
      url: "https://api.example/patchThing",
      init: { method: "PATCH", body: JSON.stringify({ title: "Renamed" }) },
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
    expect(fetchCalls[2]?.init?.headers).toEqual({ Accept: "application/json" });
    expect(fetchCalls[3]).toMatchObject({
      url: "https://clone.example/custom/bbbbbbbbbbbbbbbbbbbbbbbb",
      init: { headers: { "Content-Type": "application/json", Authorization: "Bearer clone-jwt" } },
    });
  });

  test("reads the SSR credential from the app-scoped cookie, ignoring a neighbouring app's", async () => {
    if (!requestStorage) return;
    const storage = requestStorage;
    setMockFetch();
    jsonResponses.push("Scoped", "Legacy", "Neighbour");
    const client = new FetchClient("https://api.example", {}, { service: serviceSignal });
    setAkanPublicEnv();
    // Read back: `getEnv()` caches on first call, and the workspace runner sets an `AKAN_PUBLIC_ENV` this does not.
    const { appName, environment } = getEnv();
    const jwtOf = (tokenApp: string) =>
      `header.${Buffer.from(JSON.stringify({ appName: tokenApp, environment })).toString("base64url")}.signature`;
    const own = jwtOf(appName);
    const neighbour = jwtOf(`${appName}-neighbour`);
    const call = async (cookie: string) =>
      await storage.run(new Request("https://example.test", { headers: { cookie } }), async () => {
        setAkanPublicEnv();
        return await client.handler.getThing("abcdefabcdefabcdefabcdef", [], null);
      });

    await call(`jwt:${appName}=${own}; jwt:${appName}-neighbour=${neighbour}`);
    await call(`jwt=${own}`);
    await call(`jwt=${neighbour}`);

    expect(fetchCalls[0]?.init?.headers).toMatchObject({ Authorization: `Bearer ${own}` });
    // The pre-scoping key still works, but only for a token this app minted.
    expect(fetchCalls[1]?.init?.headers).toMatchObject({ Authorization: `Bearer ${own}` });
    expect(fetchCalls[2]?.init?.headers).not.toHaveProperty("Authorization");
  });

  test("sends requests to the FetchPolicy.origin host instead of the client origin", async () => {
    setMockFetch();
    jsonResponses.push("pong", { title: "Created", count: 2, nested: { label: "N" } });
    const client = new FetchClient("https://api.example", {}, { service: serviceSignal });

    // trailing slash on the override host must be normalized away
    const queried = await client.handler.getThing("1234567890abcdef12345678", [], null, {
      origin: "https://akan-debug.akanjs.com/",
    });
    const created = await client.handler.createThing("Created", 2, { origin: "https://akan-debug.akanjs.com" });

    expect(queried).toBe("pong");
    expect(created).toBeInstanceOf(FetchTestFull);
    expect(fetchCalls[0]?.url).toBe("https://akan-debug.akanjs.com/custom/1234567890abcdef12345678");
    expect(fetchCalls[1]?.url).toBe("https://akan-debug.akanjs.com/createThing");
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
        origin: "https://akan-debug.akanjs.com",
      });
      const overrideB = await client.handler.getThing("1234567890abcdef12345678", [], null, {
        origin: "https://akan-debug.akanjs.com",
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
      "https://akan-debug.akanjs.com/custom/1234567890abcdef12345678",
      "https://akan-debug.akanjs.com/custom/1234567890abcdef12345678",
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

  test("forwards the page request's x-real-ip on a same-origin call made while rendering, never to another origin", async () => {
    if (!requestStorage) return;
    setMockFetch();
    jsonResponses.push("same", "other");
    const client = new FetchClient("https://api.example", {}, { service: serviceSignal });
    const page = new Request("https://example.test", { headers: { "x-real-ip": "203.0.113.5" } });

    await requestStorage.run(page, async () => {
      setAkanPublicEnv();
      await client.handler.getThing("abcdefabcdefabcdefabcdef", [], null);
      await client.handler.getThing("abcdefabcdefabcdefabcdef", [], null, { origin: "https://edge.example" });
    });

    const forwarded = (idx: number) => new Headers(fetchCalls[idx]?.init?.headers as HeadersInit).get("x-real-ip");
    expect(forwarded(0)).toBe("203.0.113.5");
    expect(forwarded(1)).toBeNull();
  });

  test("hands the visitor's credential only to this server: another origin gets the token its caller gave or none", async () => {
    if (!requestStorage) return;
    setMockFetch();
    jsonResponses.push("same", "per-call", "machine", "bare", "same-clone");
    const client = new FetchClient("https://api.example", {}, { service: serviceSignal });
    const page = new Request("https://example.test", { headers: { authorization: "Bearer visitor" } });
    type Getter = { getThing: (id: string, tags: string[], empty: null) => Promise<unknown> };

    await requestStorage.run(page, async () => {
      setAkanPublicEnv();
      const id = "abcdefabcdefabcdefabcdef";
      await client.handler.getThing(id, [], null);
      await client.handler.getThing(id, [], null, { origin: "https://cloud.example" });
      const machine = client.clone({ origin: "https://cloud.example", jwt: "machine", connect: false });
      await (machine as unknown as Getter).getThing(id, [], null);
      await (client.clone({ origin: "https://cloud.example", connect: false }) as unknown as Getter).getThing(
        id,
        [],
        null,
      );
      await (client.clone({ connect: false }) as unknown as Getter).getThing("bcdefabcdefabcdefabcdefa", [], null);
    });

    const sent = (idx: number) => new Headers(fetchCalls[idx]?.init?.headers as HeadersInit).get("authorization");
    expect([sent(0), sent(1), sent(2), sent(3), sent(4)]).toEqual([
      "Bearer visitor",
      null,
      "Bearer machine",
      null,
      "Bearer visitor",
    ]);
  });

  test("in a signal test each clone names its own client address, unless given one", async () => {
    setMockFetch();
    jsonResponses.push("root", "a", "b", "named");
    const client = new FetchClient("https://api.example", {}, { service: serviceSignal });
    FetchClient.useTestClientIps();
    try {
      const [agentA, agentB] = [client.clone({ connect: false }), client.clone({ connect: false })] as unknown as {
        getThing: (id: string, tags: string[], empty: null) => Promise<unknown>;
      }[];
      const named = client.clone({ connect: false, clientIp: "203.0.113.9" }) as unknown as typeof agentA;
      await client.handler.getThing("1234567890abcdef12345678", [], null);
      await agentA?.getThing("1234567890abcdef12345678", [], null);
      await agentB?.getThing("1234567890abcdef12345678", [], null);
      await named.getThing("1234567890abcdef12345678", [], null);
    } finally {
      FetchClient.useTestClientIps(false);
    }

    const sentIp = (idx: number) => new Headers(fetchCalls[idx]?.init?.headers as HeadersInit).get("x-real-ip");
    expect([sentIp(0), sentIp(1), sentIp(2), sentIp(3)]).toEqual([null, "198.18.0.1", "198.18.0.2", "203.0.113.9"]);
  });

  test("a server clone toward another origin opens no socket unless asked, a same-origin one still does", () => {
    setFakeWebSocket();
    const client = new FetchClient("https://api.example", {}, { service: serviceSignal });

    const cloud = client.clone({ origin: "https://edge.example" });
    cloud.clone({ jwt: "per-request" });
    expect(FakeWebSocket.instances.map((ws) => ws.url)).toEqual([]);

    client.clone({ origin: "https://edge.example", connect: true });
    client.clone({ jwt: "same-origin" });
    expect(FakeWebSocket.instances).toHaveLength(2);
    expect(FakeWebSocket.instances[0]?.url.startsWith("wss://edge.example")).toBe(true);
  });

  test("a clone keeps its parent's socket options, retry and budget unless it names its own", async () => {
    setFakeWebSocket();
    setMockFetch();
    type Getter = { getThing: (id: string, tags: string[], empty: null) => Promise<unknown> };
    const client = new FetchClient("https://api.example", {}, { service: serviceSignal });
    const cloud = client.clone({
      origin: "https://cloud.example",
      connect: false,
      retry: { min: 1, jitter: 0 },
      ws: { headers: { "x-edge-version": "3" }, tls: { ca: "edge-ca" } },
    });
    cloud.setTimeout(12_345);

    const perRequest = cloud.clone({ jwt: "per-request", connect: true });
    expect(FakeWebSocket.instances[0]?.options).toEqual({
      headers: { "x-edge-version": "3", authorization: "Bearer per-request" },
      tls: { ca: "edge-ca" },
    });
    expect(perRequest.instance.http.timeout).toBe(12_345);
    rawResponses.push(new Response("down", { status: 503 }), Response.json("recovered"));
    expect(await (perRequest as unknown as Getter).getThing("1234567890abcdef12345678", [], null)).toBe("recovered");
    expect(fetchCalls).toHaveLength(2);

    fetchCalls.length = 0;
    const once = cloud.clone({ jwt: "once", connect: false, retry: false }) as unknown as Getter;
    rawResponses.push(new Response("down", { status: 503 }));
    await expect(once.getThing("1234567890abcdef12345678", [], null)).rejects.toMatchObject({ statusCode: 503 });
    expect(fetchCalls).toHaveLength(1);
    perRequest.disconnect();
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

  test("calls a globalPrefix: false endpoint at the origin's root, and every other endpoint under the API prefix", async () => {
    setMockFetch();
    jsonResponses.push("token", "revoked", "item");
    const client = new FetchClient(
      "https://api.example/api",
      {},
      {
        oauth: {
          endpoint: {
            oauthMetadata: {
              type: "query",
              path: "/.well-known/oauth",
              globalPrefix: false,
              args: [],
              returns: { refName: "String" },
            },
            exchangeToken: {
              type: "mutation",
              path: "/oauth/token",
              globalPrefix: false,
              args: [],
              returns: { refName: "String" },
            },
            getItem: { type: "query", path: "/itemDrop/itemDrop", args: [], returns: { refName: "String" } },
          },
        },
      },
    );

    await client.handler.oauthMetadata();
    await client.handler.exchangeToken();
    await client.handler.getItem();
    await client.handler.exchangeToken({ origin: "https://other.example/api/" });

    expect(fetchCalls.map((call) => call.url)).toEqual([
      "https://api.example/.well-known/oauth",
      "https://api.example/oauth/token",
      "https://api.example/api/itemDrop/itemDrop",
      "https://other.example/oauth/token",
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

  test("offers view and edit exactly when the get handler they read through exists", () => {
    const readOnly: SerializedSignal = {
      prefix: "readOnly",
      getGuards: ["Public"],
      slice: { "": { args: [] } },
      endpoint: {},
    };
    const writeOnly: SerializedSignal = {
      prefix: "writeOnly",
      cruGuards: ["Admin"],
      slice: { "": { args: [] } },
      endpoint: {},
    };
    const handler = new FetchClient("https://api.example", {}, { readOnly, writeOnly }).handler as Record<
      string,
      unknown
    >;

    expect(typeof handler.viewReadOnly).toBe("function");
    expect(handler.editReadOnly).toBeUndefined();
    expect(handler.viewWriteOnly).toBeUndefined();
    expect(handler.editWriteOnly).toBeUndefined();
    expect(typeof handler.mergeWriteOnly).toBe("function");
  });

  test("shares one browser client across app and lib builds so a lib subscribe lands on the connected socket", () => {
    setFakeWebSocket();
    Object.assign(globalThis, { window: {} });
    try {
      const appSignal: SerializedSignal = {
        prefix: "appThing",
        endpoint: { appQuery: { type: "query", args: [], returns: { refName: "String" } } },
      };
      const libSignal: SerializedSignal = {
        prefix: "libThing",
        endpoint: { libRoom: { type: "pubsub", args: [arg("room", "roomId")], returns: { refName: "String" } } },
      };
      const app = FetchClient.build<{ fetch: unknown }>({}, { appThing: appSignal }, { origin: "https://api.example" });
      const lib = FetchClient.build<{ fetch: unknown }>({}, { libThing: libSignal }, { origin: "https://api.example" });

      expect(lib.fetch).toBe(app.fetch);
      const proxy = app.fetch as FetchProxy;
      expect(Object.keys(proxy.instance.serializedSignal)).toEqual(["appThing", "libThing"]);

      proxy.instance.connect();
      const ws = FakeWebSocket.instances[0];
      ws.open();
      (lib.fetch as Record<string, (...args: unknown[]) => unknown>).subscribeLibRoom("r1", () => undefined);
      expect(JSON.parse(ws.sent.at(-1) ?? "{}")).toEqual({ key: "libRoom", data: ["r1"], subscribe: true });
    } finally {
      Reflect.deleteProperty(globalThis, "window");
    }
  });

  test("a client's own signals are what it was built from, whatever another client applied since", () => {
    const appSignal: SerializedSignal = {
      prefix: "appThing",
      endpoint: { appQuery: { type: "query", args: [], returns: { refName: "String" } } },
    };
    const input = (serializedSignal: Record<string, SerializedSignal>) =>
      ({ handler: {}, serializedSignal, _FetchType: undefined, _SliceMetaObj: {} }) as const;
    const lib = FetchClient.from(input({ service: serviceSignal }));
    FetchClient.from(lib, input({ appThing: appSignal }));

    expect(Object.keys(lib.serializedSignal)).toEqual(["service", "appThing"]);
    expect(Object.keys(lib.ownSerializedSignal)).toEqual(["service"]);
    expect(Object.keys(FetchClient.from(lib).ownSerializedSignal)).toEqual(["service"]);
    const twice = FetchClient.from(lib, lib).ownSerializedSignal.service ?? {};
    expect(Object.entries(twice).filter(([, value]) => value === undefined)).toEqual([]);
  });

  test("keeps one client per package on the server", () => {
    const serverSignal: SerializedSignal = {
      prefix: "serverThing",
      endpoint: { serverQuery: { type: "query", args: [], returns: { refName: "String" } } },
    };
    const app = FetchClient.build<{ fetch: unknown }>(
      {},
      { serverThing: serverSignal },
      { origin: "https://api.example" },
    );
    const lib = FetchClient.build<{ fetch: unknown }>(
      {},
      { serverThing: serverSignal },
      { origin: "https://api.example" },
    );

    expect(lib.fetch).not.toBe(app.fetch);
  });

  test("runs a method called on the proxy against the instance, so its private fields stay reachable", async () => {
    setMockFetch();
    jsonResponses.push("ok");
    const { fetch: built } = FetchClient.build<{ fetch: unknown }>(
      {},
      { service: serviceSignal },
      { origin: "https://api.example" },
    );
    const proxy = built as FetchProxy & {
      setJwt: (jwt: string | null) => void;
      getThing: (id: string, tags: string[], empty: null) => Promise<unknown>;
    };

    expect(() => proxy.setJwt("proxy-jwt")).not.toThrow();
    expect(proxy.instance.jwt).toBe("proxy-jwt");
    await proxy.getThing("1234567890abcdef12345678", [], null);
    expect(fetchCalls[0]).toMatchObject({ init: { headers: { Authorization: "Bearer proxy-jwt" } } });
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
    expect(init.fetchTestItemListByOwner).toBe(init.fetchTestItemListByOwner);
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
    expect(client.filterQueryMap.get("fetchTestItem")).toEqual({ byTitle: [arg("param", "title")] });
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

  test("parses the response in place for the caller that started it, and a copy for the next", async () => {
    setMockFetch();
    setAkanPublicEnv();
    if (!requestStorage) return;
    jsonResponses.push({ title: "Shared", count: 1, nested: { label: "N" } });
    const client = new FetchClient("https://api.example", {}, { fetchTestItem: databaseSignal });

    const [first, second] = await requestStorage.run(new Request("https://example.test/page"), async () => {
      const owner = (await client.handler.getFetchTestItemView("1234567890abcdef12345678")) as {
        fetchTestItemObj: object;
      };
      const later = (await client.handler.getFetchTestItemView("1234567890abcdef12345678")) as {
        fetchTestItemObj: object;
      };
      return [owner.fetchTestItemObj, later.fetchTestItemObj];
    });

    expect(fetchCalls).toHaveLength(1);
    expect(second).toEqual(first);
    expect(second).not.toBe(first);
  });

  test("hands out one promise per init field, and awaiting reuses the same instances", async () => {
    setMockFetch();
    jsonResponses.push([{ title: "Row", count: 1, nested: { label: "N" } }], { count: 1 });
    const client = new FetchClient("https://api.example", {}, { fetchTestItem: databaseSignal });
    const handle = client.handler.initFetchTestItemByOwner("abcdefabcdefabcdefabcdef") as unknown as PromiseLike<
      Record<string, unknown>
    > & {
      fetchTestItemInitByOwner: Promise<Record<string, unknown>>;
      fetchTestItemListByOwner: Promise<DataList<{ id: string }>>;
      fetchTestItemInsightByOwner: Promise<unknown>;
    };

    const list = await handle.fetchTestItemListByOwner;
    const serverInit = await handle.fetchTestItemInitByOwner;
    expect(list).toBeInstanceOf(DataList);
    expect(serverInit.lastPageOfFetchTestItem).toBe(1);

    const awaited = await handle;
    expect(awaited.fetchTestItemListByOwner).toBe(list);
    expect(awaited.fetchTestItemInitByOwner).toBe(serverInit);
    // Reading fields and then awaiting is one round of requests, not two.
    expect(fetchCalls).toHaveLength(2);
  });

  test("resolves the list without waiting for the aggregate", async () => {
    setMockFetch();
    const mockFetch = globalThis.fetch;
    let releaseInsight!: () => void;
    const insightHeld = new Promise<void>((resolve) => {
      releaseInsight = resolve;
    });
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).includes("Insight")) await insightHeld;
      return await mockFetch(url as string, init);
    }) as typeof fetch;
    jsonResponses.push([{ title: "Row", count: 1, nested: { label: "N" } }], { count: 1 });
    const client = new FetchClient("https://api.example", {}, { fetchTestItem: databaseSignal });
    const handle = client.handler.initFetchTestItemByOwner("abcdefabcdefabcdefabcdef") as unknown as {
      fetchTestItemInitByOwner: Promise<Record<string, unknown>>;
      fetchTestItemListByOwner: Promise<DataList<{ id: string }>>;
    };

    let initSettled = false;
    void handle.fetchTestItemInitByOwner.then(() => {
      initSettled = true;
    });
    expect(await handle.fetchTestItemListByOwner).toBeInstanceOf(DataList);
    await new Promise((resolve) => originalSetTimeout(resolve, 5));
    expect(initSettled).toBe(false);

    releaseInsight();
    expect((await handle.fetchTestItemInitByOwner).lastPageOfFetchTestItem).toBe(1);
  });

  test("skips the aggregate query when the caller opts out of the insight", async () => {
    setMockFetch();
    jsonResponses.push([{ title: "Row", count: 1, nested: { label: "N" } }]);
    const client = new FetchClient("https://api.example", {}, { fetchTestItem: databaseSignal });
    const handle = client.handler.initFetchTestItemByOwner("abcdefabcdefabcdefabcdef", {
      limit: 0,
      insight: false,
    }) as unknown as {
      fetchTestItemInitByOwner: Promise<Record<string, unknown>>;
      fetchTestItemInsightByOwner: Promise<unknown>;
    };

    const serverInit = await handle.fetchTestItemInitByOwner;
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0]?.url).toContain("fetchTestItemListByOwner");
    expect(serverInit.fetchTestItemObjInsight).toBeNull();
    expect(serverInit.lastPageOfFetchTestItem).toBe(1);
    expect(await handle.fetchTestItemInsightByOwner).toBeInstanceOf(FetchTestInsight);
  });

  test("hands out the view payload and the model as separate promises", async () => {
    setMockFetch();
    jsonResponses.push({ title: "View", count: 1, nested: { label: "N" } });
    const client = new FetchClient("https://api.example", {}, { fetchTestItem: databaseSignal });
    const handle = client.handler.viewFetchTestItem("1234567890abcdef12345678") as unknown as PromiseLike<
      Record<string, unknown>
    > & {
      fetchTestItem: Promise<unknown>;
      fetchTestItemView: Promise<Record<string, unknown>>;
    };

    const view = await handle.fetchTestItemView;
    expect(view.fetchTestItemObj).toMatchObject({ title: "View" });
    const awaited = await handle;
    expect(awaited.fetchTestItemView).toBe(view);
    expect(awaited.fetchTestItem).toBeInstanceOf(FetchTestFull);
    expect(fetchCalls).toHaveLength(1);
  });

  test("does not leave an unhandled rejection when nothing reads a field", async () => {
    setMockFetch();
    rawResponses.push(new Error("list down"), new Error("insight down"));
    const rejections: unknown[] = [];
    const collect = (reason: unknown) => rejections.push(reason);
    process.on("unhandledRejection", collect);
    try {
      const client = new FetchClient("https://api.example", {}, { fetchTestItem: databaseSignal });
      client.handler.initFetchTestItemByOwner("abcdefabcdefabcdefabcdef");
      await new Promise((resolve) => originalSetTimeout(resolve, 10));
      expect(rejections).toEqual([]);
    } finally {
      process.off("unhandledRejection", collect);
    }
  });

  test("reports a failed request to whoever awaits the handle", async () => {
    setMockFetch();
    rawResponses.push(new Error("list down"), new Error("insight down"));
    const client = new FetchClient("https://api.example", {}, { fetchTestItem: databaseSignal });
    const handle = client.handler.initFetchTestItemByOwner("abcdefabcdefabcdefabcdef") as unknown as PromiseLike<
      Record<string, unknown>
    >;

    await expect(Promise.resolve(handle)).rejects.toThrow();
  });
});

describe("WsClient", () => {
  test("a URL the WebSocket constructor refuses is logged, not thrown into the caller's effect", () => {
    const client = new WsClient("app://localhost:80/api/ws");
    const errors: string[] = [];
    client.logger.error = ((message: string) => errors.push(message)) as typeof client.logger.error;

    expect(() => client.connect()).not.toThrow();
    expect(errors).toEqual([expect.stringContaining("app://localhost:80/api/ws")]);
    expect(client.connected).toBe(false);
    expect(client.state).toBe("closed");
    client.destroy();
  });

  test("counts a socket its constructor refuses as a failed attempt, retried and then given up on", async () => {
    const states: string[] = [];
    const client = new WsClient("app://localhost:80/api/ws").configure({
      reconnect: { min: 1, jitter: 0, maxAttempts: 1 },
      onStateChange: (state) => states.push(state),
    });
    client.logger.error = (() => undefined) as typeof client.logger.error;
    client.connect();
    await waitUntil(() => client.state === "gaveUp");
    expect(states).toEqual(["connecting", "closed", "connecting", "closed", "gaveUp"]);

    // A hook that reconnects on close would otherwise call the throwing constructor again from inside its own catch.
    const hooked: WsClient = new WsClient("app://localhost:80/api/ws").configure({
      reconnect: false,
      onStateChange: (state) => {
        if (state === "closed") hooked.connect();
      },
    });
    hooked.logger.error = (() => undefined) as typeof hooked.logger.error;
    expect(() => hooked.connect()).not.toThrow();
    expect(hooked.state).toBe("gaveUp");
  });

  test("counts a socket dropped right after the upgrade as a failed attempt, and one that stayed up as a recovery", async () => {
    setFakeWebSocket();
    const client = new WsClient("ws://example/ws").configure({ reconnect: { min: 1, jitter: 0, maxAttempts: 1 } });
    client.connect();
    FakeWebSocket.instances[0].open();
    setSystemTime(new Date(Date.now() + WsClient.stableMs));
    FakeWebSocket.instances[0].close();
    await waitUntil(() => FakeWebSocket.instances.length > 1);

    FakeWebSocket.instances[1].open();
    FakeWebSocket.instances[1].close();
    await waitUntil(() => client.state === "gaveUp");
    expect(client.state).toBe("gaveUp");
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  test("keeps the socket a state hook opens on close, instead of orphaning it for a reconnect of its own", async () => {
    for (const reconnect of [false, { min: 1, jitter: 0 }] as const) {
      setFakeWebSocket();
      let reconnecting = true;
      const client: WsClient = new WsClient("ws://example/ws").configure({
        reconnect,
        onStateChange: (state) => {
          if (state === "closed" && reconnecting) client.connect();
        },
      });
      client.subscribe({ key: "roomKey", data: ["r1"], handleEvent: () => undefined });
      client.connect();
      FakeWebSocket.instances[0].open();
      FakeWebSocket.instances[0].close();
      await new Promise((resolve) => originalSetTimeout(resolve, 20));

      expect(FakeWebSocket.instances).toHaveLength(2);
      const second = FakeWebSocket.instances[1];
      second.open();
      expect(client.state).toBe("open");
      expect(JSON.parse(second.sent[0] ?? "{}")).toEqual({ key: "roomKey", data: ["r1"], subscribe: true });
      client.emit("send", ["hello"]);
      expect(JSON.parse(second.sent.at(-1) ?? "{}")).toEqual({ key: "send", data: ["hello"] });
      reconnecting = false;
      client.destroy();
    }
  });

  test("reconnects as soon as the tab is back online or in view, instead of sitting out the backoff", () => {
    setFakeWebSocket();
    const browser = globalThis as { window?: unknown; document?: unknown };
    const tab = new EventTarget();
    const page = Object.assign(new EventTarget(), { visibilityState: "visible" });
    browser.window = tab;
    browser.document = page;
    try {
      const client = new WsClient("ws://example/ws").configure({ reconnect: { min: 60_000, jitter: 0 } });
      client.connect();
      FakeWebSocket.instances[0].open();
      FakeWebSocket.instances[0].close();
      expect(FakeWebSocket.instances).toHaveLength(1);

      tab.dispatchEvent(new Event("online"));
      expect(FakeWebSocket.instances).toHaveLength(2);
      FakeWebSocket.instances[1].close();
      page.visibilityState = "hidden";
      page.dispatchEvent(new Event("visibilitychange"));
      expect(FakeWebSocket.instances).toHaveLength(2);
      page.visibilityState = "visible";
      page.dispatchEvent(new Event("visibilitychange"));
      expect(FakeWebSocket.instances).toHaveLength(3);

      client.destroy();
      tab.dispatchEvent(new Event("online"));
      expect(FakeWebSocket.instances).toHaveLength(3);
    } finally {
      delete browser.window;
      delete browser.document;
    }
  });

  test("warns when realtime APIs are used and nothing ever connects", async () => {
    setFakeWebSocket();
    await captureWarnings(async (warnings) => {
      const client = new WsClient("ws://example/ws");
      client.emit("send", ["hello"]);
      client.subscribe({ key: "roomKey", data: ["r1"], handleEvent: () => undefined });

      expect(warnings).toEqual([]);
      await new Promise((resolve) => originalSetTimeout(resolve, 5));
      expect(warnings).toEqual([
        expect.stringContaining('before emit "send"'),
        expect.stringContaining('before subscribe "roomKey"'),
      ]);
    });
  });

  test("queues a subscribe issued before connect and replays it on open without warning", async () => {
    setFakeWebSocket();
    await captureWarnings(async (warnings) => {
      const client = new WsClient("ws://example/ws");
      const events: unknown[] = [];
      client.subscribe({ key: "roomKey", data: ["r1"], handleEvent: (data) => events.push(data) });
      client.connect();
      const ws = FakeWebSocket.instances[0];
      ws.open();

      expect(JSON.parse(ws.sent.at(-1) ?? "{}")).toEqual({ key: "roomKey", data: ["r1"], subscribe: true });
      ws.receive({ type: "pub", roomId: "roomKey-r1", data: { title: "event" } });
      expect(events).toEqual([{ title: "event" }]);
      await new Promise((resolve) => originalSetTimeout(resolve, 5));
      expect(warnings).toEqual([]);
    });
  });

  test("queues an emit issued before connect and replays it on open without warning", async () => {
    setFakeWebSocket();
    await captureWarnings(async (warnings) => {
      const client = new WsClient("ws://example/ws");
      client.emit("send", ["hello"]);
      client.connect();
      const ws = FakeWebSocket.instances[0];
      ws.open();

      expect(JSON.parse(ws.sent.at(-1) ?? "{}")).toEqual({ key: "send", data: ["hello"] });
      client.emit("send", ["again"]);
      expect(JSON.parse(ws.sent.at(-1) ?? "{}")).toEqual({ key: "send", data: ["again"] });
      await new Promise((resolve) => originalSetTimeout(resolve, 5));
      expect(warnings).toEqual([]);
    });
  });

  test("re-keys a live room to the id the server names and matches its frames", () => {
    setFakeWebSocket();
    const client = new WsClient("ws://example/ws");
    const events: unknown[] = [];
    client.connect();
    const ws = FakeWebSocket.instances[0];
    ws.open();
    client.subscribe({ key: "taskLiveInOrg", data: ["o1"], handleEvent: (data) => events.push(data) });
    ws.receive({
      type: "sub",
      roomId: "taskLiveInOrg-o1::u1",
      requestRoomId: "taskLiveInOrg-o1",
      subscribe: true,
    });

    // The server's room carries internal args the client never learns; without the ack's pairing this frame drops.
    ws.receive({ type: "pub", roomId: "taskLiveInOrg-o1::u1", data: { op: "enter", id: "t1" } });
    expect(events).toEqual([{ op: "enter", id: "t1" }]);
    ws.receive({ type: "pub", roomId: "someoneElse-o1::u2", data: { op: "enter", id: "t2" } });
    expect(events).toHaveLength(1);
  });

  test("tells a resubscribed room it is behind once a server that numbers nothing acks, and not on the first connect", async () => {
    setFakeWebSocket();
    const client = new WsClient("ws://example/ws").configure({ reconnect: { min: 5, jitter: 0 } });
    let resyncs = 0;
    client.subscribe({
      key: "taskLiveInOrg",
      data: ["o1"],
      handleEvent: () => undefined,
      handleResync: () => {
        resyncs += 1;
      },
    });
    client.connect();
    FakeWebSocket.instances[0].open();
    expect(resyncs).toBe(0);

    FakeWebSocket.instances[0].close();
    await new Promise((resolve) => originalSetTimeout(resolve, 30));
    FakeWebSocket.instances[1].open();
    expect(resyncs).toBe(0);
    FakeWebSocket.instances[1].receive({
      type: "sub",
      roomId: "taskLiveInOrg-o1",
      requestRoomId: "taskLiveInOrg-o1",
      subscribe: true,
    });
    expect(resyncs).toBe(1);
    client.destroy();
  });

  test("gives up after maxAttempts in a row and says so, and every state change is reported", async () => {
    setFakeWebSocket();
    const states: string[] = [];
    const client = new WsClient("ws://example/ws").configure({
      reconnect: { min: 1, jitter: 0, maxAttempts: 2 },
      onStateChange: (state) => states.push(state),
    });
    client.connect();
    FakeWebSocket.instances[0].open();
    FakeWebSocket.instances[0].close();
    for (const idx of [1, 2]) {
      await new Promise((resolve) => originalSetTimeout(resolve, 20));
      FakeWebSocket.instances[idx].close();
    }
    await new Promise((resolve) => originalSetTimeout(resolve, 20));
    expect(FakeWebSocket.instances).toHaveLength(3);
    expect(client.state).toBe("gaveUp");
    expect(states).toEqual(["connecting", "open", "closed", "connecting", "closed", "connecting", "closed", "gaveUp"]);
  });

  test("asks a resubscribe for what it missed, and calls a room behind only when the server could not replay it", async () => {
    setFakeWebSocket();
    const client = new WsClient("ws://example/ws").configure({ reconnect: { min: 1, jitter: 0 } });
    const events: unknown[] = [];
    let resyncs = 0;
    client.subscribe({
      key: "commandOfPc",
      data: ["pc-7"],
      handleEvent: (data) => events.push(data),
      handleResync: () => {
        resyncs += 1;
      },
    });
    client.connect();
    const first = FakeWebSocket.instances[0];
    first.open();
    const roomId = "commandOfPc-pc-7";
    first.receive({ type: "sub", roomId, requestRoomId: roomId, subscribe: true, cursor: { epoch: "e1", seq: 4 } });
    first.receive({ type: "pub", roomId, data: { n: 5 }, seq: 5 });
    first.close();

    await new Promise((resolve) => originalSetTimeout(resolve, 20));
    const second = FakeWebSocket.instances[1];
    second.open();
    expect(JSON.parse(second.sent.at(-1) ?? "{}")).toEqual({
      key: "commandOfPc",
      data: ["pc-7"],
      subscribe: true,
      since: { epoch: "e1", seq: 5 },
    });
    second.receive({ type: "pub", roomId, data: { n: 6 }, seq: 6 });
    second.receive({ type: "pub", roomId, data: { n: 7 }, seq: 7 });
    second.receive({
      type: "sub",
      roomId,
      requestRoomId: roomId,
      subscribe: true,
      cursor: { epoch: "e1", seq: 7 },
      replayed: true,
    });
    expect(events).toEqual([{ n: 5 }, { n: 6 }, { n: 7 }]);
    expect(resyncs).toBe(0);

    second.close();
    await new Promise((resolve) => originalSetTimeout(resolve, 20));
    const third = FakeWebSocket.instances[2];
    third.open();
    third.receive({
      type: "sub",
      roomId,
      requestRoomId: roomId,
      subscribe: true,
      cursor: { epoch: "e2", seq: 0 },
      replayed: false,
    });
    expect(resyncs).toBe(1);
    client.destroy();
  });

  test("drops a frame it already took and calls the room behind at a hole in the numbering", () => {
    setFakeWebSocket();
    const client = new WsClient("ws://example/ws");
    const events: unknown[] = [];
    let resyncs = 0;
    client.subscribe({
      key: "commandOfPc",
      data: ["pc-7"],
      handleEvent: (data) => events.push(data),
      handleResync: () => {
        resyncs += 1;
      },
    });
    client.connect();
    const ws = FakeWebSocket.instances[0];
    ws.open();
    const roomId = "commandOfPc-pc-7";
    ws.receive({ type: "sub", roomId, requestRoomId: roomId, subscribe: true, cursor: { epoch: "e1", seq: 0 } });
    ws.receive({ type: "pub", roomId, data: { n: 1 }, seq: 1 });
    ws.receive({ type: "pub", roomId, data: { n: 1 }, seq: 1 });
    expect(resyncs).toBe(0);
    ws.receive({ type: "pub", roomId, data: { n: 3 }, seq: 3 });
    expect(events).toEqual([{ n: 1 }, { n: 3 }]);
    expect(resyncs).toBe(1);
    client.destroy();
  });

  test("names a room the server took back and an error frame's key to their hooks", () => {
    setFakeWebSocket();
    const revoked: string[] = [];
    const errors: [string, string | undefined][] = [];
    const client = new WsClient("ws://example/ws").configure({
      onRevoked: (roomId) => revoked.push(roomId),
      onError: (error, key) => errors.push([(error as Error).message, key]),
    });
    client.logger.warn = (() => undefined) as typeof client.logger.warn;
    client.subscribe({ key: "commandOfPc", data: ["pc-7"], handleEvent: () => undefined });
    client.connect();
    const ws = FakeWebSocket.instances[0];
    ws.open();
    ws.receive({ type: "auth", revokedRooms: ["commandOfPc-pc-7"] });
    ws.receive({ error: "Access denied by guard: Device", statusCode: 403, key: "pcConfigOfSelf" });
    expect(revoked).toEqual(["commandOfPc-pc-7"]);
    expect(errors).toEqual([[expect.stringContaining("Access denied"), "pcConfigOfSelf"]]);
    client.destroy();
  });

  test("a server-side client sends its headers and its token with the upgrade", () => {
    setFakeWebSocket();
    const client = new WsClient("wss://cloud.example/ws").configure({ headers: { "x-edge-version": "3" } });
    client.setJwt("machine-token");
    client.connect();
    expect(FakeWebSocket.instances[0]?.options?.headers).toEqual({
      "x-edge-version": "3",
      authorization: "Bearer machine-token",
    });
    client.destroy();
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
    const restored: RestoredError[] = [];
    const ErrorCls = {
      fromJSON: (payload: ErrorResponsePayload) => {
        const error = TestErr.fromJSON(payload);
        restored.push(error);
        return error;
      },
    };
    const client = new WsClient("ws://example/ws", ErrorCls);
    client.connect();
    const ws = FakeWebSocket.instances[0];
    ws.open();

    ws.receive({
      error: "chatRoom.error.notMember",
      statusCode: 403,
      data: { chatRoomId: "room-1" },
      timestamp: "2026-05-25T00:00:00.000Z",
    });

    expect(restored[0]).toBeInstanceOf(TestErr);
    expect(restored[0]).toMatchObject({
      error: "chatRoom.error.notMember",
      statusCode: 403,
      data: { chatRoomId: "room-1" },
      timestamp: "2026-05-25T00:00:00.000Z",
    });
  });

  test("reports a websocket failure it cannot restore by its own message", () => {
    setFakeWebSocket();
    const lines: string[] = [];
    const removeSink = Logger.addSink((entry) => void lines.push(entry.plainMessage), { minLevel: "warn" });
    try {
      const client = new WsClient("ws://example/ws");
      client.connect();
      FakeWebSocket.instances[0].open();

      FakeWebSocket.instances[0].receive({
        error: "chatRoom.error.notMember",
        statusCode: 403,
        data: { chatRoomId: "room-1" },
      });

      expect(lines.at(-1) ?? "").toContain("WebSocket message process failed chatRoom.error.notMember");

      FakeWebSocket.instances[0].receive("null");
      expect(lines.at(-1) ?? "").toContain("Unknown WebSocket frame null");
    } finally {
      removeSink();
    }
  });

  test("pings on an interval, so an idle proxy has traffic to see", async () => {
    setFakeWebSocket();
    globalThis.setInterval = ((handler: TimerHandler, _interval?: number, ...args: unknown[]) =>
      originalSetInterval(handler, 1, ...args)) as typeof setInterval;
    const client = new WsClient("ws://example/ws");
    client.connect();
    const ws = FakeWebSocket.instances[0];
    ws.open();

    await new Promise((resolve) => originalSetTimeout(resolve, 10));
    expect(ws.sent.map((frame) => (JSON.parse(frame) as { key: string }).key)).toContain("__ping");

    client.destroy();
    const pinged = ws.sent.length;
    await new Promise((resolve) => originalSetTimeout(resolve, 10));
    expect(ws.sent).toHaveLength(pinged);
  });

  test("reconnects a socket that has stopped answering, so its rooms are resubscribed", async () => {
    setFakeWebSocket();
    setSystemTime(new Date("2026-09-18T00:00:00Z"));
    globalThis.setInterval = ((handler: TimerHandler, _interval?: number, ...args: unknown[]) =>
      originalSetInterval(handler, 1, ...args)) as typeof setInterval;
    globalThis.setTimeout = ((handler: TimerHandler, _timeout?: number, ...args: unknown[]) =>
      originalSetTimeout(handler, 0, ...args)) as typeof setTimeout;
    const client = new WsClient("ws://example/ws");
    try {
      client.subscribe({ key: "roomKey", data: ["r1"], handleEvent: () => undefined });
      client.connect();
      const ws = FakeWebSocket.instances[0];
      ws.open();

      // A socket the network dropped without a FIN keeps accepting `send()`, so only the missing pong says so.
      setSystemTime(new Date("2026-09-18T00:10:00Z"));
      await waitUntil(() => FakeWebSocket.instances.length > 1);

      expect(ws.readyState).toBe(FakeWebSocket.CLOSED);
      const reconnected = FakeWebSocket.instances[1];
      expect(reconnected).toBeDefined();
      reconnected.open();
      expect(JSON.parse(reconnected.sent[0] ?? "{}")).toEqual({ key: "roomKey", data: ["r1"], subscribe: true });
    } finally {
      client.destroy();
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
  test("a live slice generates its own room subscriber, keyed and serialized like the list query", async () => {
    setFakeWebSocket();
    const client = new FetchClient("https://api.example", {}, { fetchTestItem: databaseSignal });
    client.connect();
    const ws = FakeWebSocket.instances[0];
    ws.open();

    // Slice handlers come from the slice metadata, so a live slice without this entry has no subscriber at all.
    const subscribe = client.handler.subscribeFetchTestItemLiveInRoot as (...args: unknown[]) => () => void;
    expect(typeof subscribe).toBe("function");
    expect(client.handler.subscribeFetchTestItemLiveByOwner).toBeUndefined();

    const events: unknown[] = [];
    let resyncs = 0;
    const dispose = subscribe("1234567890abcdef12345678", (event: unknown) => events.push(event), {
      crystalize: false,
      onResync: () => (resyncs += 1),
    });
    expect(JSON.parse(ws.sent.at(-1) ?? "{}")).toEqual({
      key: "fetchTestItemLiveInRoot",
      data: ["1234567890abcdef12345678"],
      subscribe: true,
    });

    // The envelope rides `Any`, so it must arrive exactly as published rather than crystalized into a model.
    ws.receive({
      type: "pub",
      roomId: "fetchTestItemLiveInRoot-1234567890abcdef12345678",
      data: { op: "enter", id: "abcdefabcdefabcdefabcdef", light: { title: "Live" } },
    });
    expect(events).toEqual([{ op: "enter", id: "abcdefabcdefabcdefabcdef", light: { title: "Live" } }]);

    dispose();
    expect(JSON.parse(ws.sent.at(-1) ?? "{}")).toEqual({
      key: "fetchTestItemLiveInRoot",
      data: ["1234567890abcdef12345678"],
      subscribe: false,
    });
    expect(resyncs).toBe(0);
  });

  test("the socket sits under the configured websocket prefix", () => {
    process.env.AKAN_WS_PREFIX = "/socket";
    try {
      const client = new FetchClient("https://api.example/backend", {}, { service: serviceSignal });
      expect(client.ws.url).toBe("wss://api.example/backend/socket");
    } finally {
      delete process.env.AKAN_WS_PREFIX;
    }
  });

  test("routes a realtime call with a FetchPolicy origin to a socket for that origin", async () => {
    setFakeWebSocket();
    const client = new FetchClient("https://api.example", {}, { service: serviceSignal });
    client.connect();
    const own = FakeWebSocket.instances[0];
    own.open();

    await client.handler.sendThing("hello", { origin: "http://localhost:8282" });
    const remote = FakeWebSocket.instances[1];
    expect(remote.url).toBe("ws://localhost:8282/ws");
    remote.open();
    expect(JSON.parse(remote.sent.at(-1) ?? "{}")).toEqual({ key: "sendThing", data: ["hello"] });
    expect(own.sent).toEqual([]);

    const listened: unknown[] = [];
    const cleanupMessage = client.handler.listenSendThing((data: unknown) => listened.push(data), {
      origin: "http://localhost:8282",
    }) as () => void;
    own.receive({ type: "msg", key: "sendThing", data: "own-message" });
    remote.receive({ type: "msg", key: "sendThing", data: "remote-message" });
    cleanupMessage();
    remote.receive({ type: "msg", key: "sendThing", data: "after-cleanup" });
    expect(listened).toEqual(["remote-message"]);

    const published: unknown[] = [];
    const cleanupPubsub = (await client.handler.subscribeRoomThing("room-1", (data: unknown) => published.push(data), {
      origin: "http://localhost:8282",
    })) as () => void;
    expect(JSON.parse(remote.sent.at(-1) ?? "{}")).toEqual({ key: "roomThing", data: ["room-1"], subscribe: true });
    remote.receive({ type: "pub", roomId: "roomThing-room-1", data: { title: "Published" } });
    expect((published[0] as InstanceType<typeof FetchTestLight>).title).toBe("Published");
    cleanupPubsub();
    expect(JSON.parse(remote.sent.at(-1) ?? "{}")).toEqual({ key: "roomThing", data: ["room-1"], subscribe: false });

    const instanceCount = FakeWebSocket.instances.length;
    await client.handler.sendThing("second", { origin: "http://localhost:8282/" });
    expect(FakeWebSocket.instances).toHaveLength(instanceCount);
    expect(JSON.parse(remote.sent.at(-1) ?? "{}")).toEqual({ key: "sendThing", data: ["second"] });

    await client.handler.sendThing("mine", { origin: "https://api.example" });
    expect(FakeWebSocket.instances).toHaveLength(instanceCount);
    expect(JSON.parse(own.sent.at(-1) ?? "{}")).toEqual({ key: "sendThing", data: ["mine"] });

    client.disconnect();
  });

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

  test("hands a binary frame to its room as bytes, and leaves the JSON rooms on the same socket alone", async () => {
    setFakeWebSocket();
    const client = new FetchClient("https://api.example", {}, { service: serviceSignal });
    client.connect();
    const ws = FakeWebSocket.instances[0];
    ws.open();
    const streamed: unknown[] = [];
    const published: unknown[] = [];

    const cleanupStream = (await client.handler.subscribeStreamThing("ch1", (data: unknown) =>
      streamed.push(data),
    )) as () => void;
    await client.handler.subscribeRoomThing("room-1", (data: unknown) => published.push(data));

    ws.receiveBinary(
      websocketBinaryFrameContract.encode({
        roomId: "streamThing-ch1",
        payload: new Uint8Array([2, 148, 1, 2, 63]),
      }),
    );
    ws.receive({ type: "pub", roomId: "roomThing-room-1", data: { title: "Published" } });

    expect(streamed[0]).toBeInstanceOf(Uint8Array);
    expect([...(streamed[0] as Uint8Array)]).toEqual([2, 148, 1, 2, 63]);
    expect((published[0] as InstanceType<typeof FetchTestLight>).title).toBe("Published");

    cleanupStream();
    ws.receiveBinary(websocketBinaryFrameContract.encode({ roomId: "streamThing-ch1", payload: new Uint8Array([9]) }));
    expect(streamed).toHaveLength(1);
  });

  test("ignores a binary frame for a room nothing subscribed to", async () => {
    setFakeWebSocket();
    const client = new FetchClient("https://api.example", {}, { service: serviceSignal });
    client.connect();
    const ws = FakeWebSocket.instances[0];
    ws.open();
    const streamed: unknown[] = [];
    await client.handler.subscribeStreamThing("ch1", (data: unknown) => streamed.push(data));

    ws.receiveBinary(websocketBinaryFrameContract.encode({ roomId: "streamThing-ch2", payload: new Uint8Array([1]) }));

    expect(streamed).toEqual([]);
  });
});

describe("FetchClient request budget", () => {
  const budgetSignal = (timeout?: number): SerializedSignal => ({
    endpoint: {
      readThing: { type: "query", args: [], returns: { refName: "String" }, ...(timeout ? { timeout } : {}) },
      provisionThing: {
        type: "mutation",
        args: [arg("body", "title")],
        returns: { refName: "String" },
        ...(timeout ? { timeout } : {}),
      },
    },
  });
  test("gives a call the budget its endpoint declared", async () => {
    setHangingFetch();
    const client = new FetchClient("https://api.example", {}, { service: budgetSignal(5) });

    const failure = (await Promise.resolve(client.handler.provisionThing("Modem")).catch(
      (error: unknown) => error,
    )) as Error & {
      statusCode?: number;
    };

    expect(failure.statusCode).toBe(408);
    expect(failure.message).toBe("base.error.gatewayTimeout");
  });

  test("lets the caller's own timeout override the endpoint's", async () => {
    setHangingFetch();
    const client = new FetchClient("https://api.example", {}, { service: budgetSignal(60_000) });

    const failure = (await Promise.resolve(client.handler.readThing({ timeout: 5 })).catch(
      (error: unknown) => error,
    )) as Error & {
      statusCode?: number;
    };

    expect(failure.statusCode).toBe(408);
  });

  test("leaves a call unbounded when the caller asks for no deadline", async () => {
    setMockFetch();
    jsonResponses.push("ok");
    const client = new FetchClient("https://api.example", {}, { service: budgetSignal(5) });

    expect(await client.handler.readThing({ timeout: false })).toBe("ok");
    expect(fetchCalls[0]?.init?.signal).toBeUndefined();
  });

  test("falls back to the client's own default when no endpoint declares one", async () => {
    setHangingFetch();
    const client = new FetchClient("https://api.example", {}, { service: budgetSignal() });
    client.setTimeout(5);

    const failure = (await Promise.resolve(client.handler.readThing()).catch((error: unknown) => error)) as Error & {
      statusCode?: number;
    };

    expect(failure.statusCode).toBe(408);
  });
});
