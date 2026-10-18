import { describe, expect, test } from "bun:test";
import { Binary, type Dayjs, dayjs, INTERNAL_META, Int } from "akanjs/base";
import { ConstantRegistry, via } from "akanjs/constant";
import { Err } from "akanjs/dictionary";
import { NoDocumentError } from "akanjs/document";
import {
  adapt,
  CacheAdaptorRole,
  getDefaultInjectRegistry,
  getDefaultLiveRegistry,
  type LiveRegistry,
} from "akanjs/service";
import { buildEndpoint, type EndpointInfo } from "./endpointInfo";
import { Public } from "./guards";
import type { Internal } from "./internal";
import { buildInternal } from "./internalInfo";
import { type MiddlewareCls, middleware } from "./middleware";
import { SignalContext } from "./signalContext";
import type { TraceOrigin } from "./trace";

Object.assign(process.env, {
  AKAN_PUBLIC_APP_NAME: "idempotencyTest",
  AKAN_PUBLIC_REPO_NAME: "akanjs",
  AKAN_PUBLIC_SERVE_DOMAIN: "example.com",
  AKAN_PUBLIC_ENV: "debug",
});

const IdempotencyTestTally = via((f) => ({
  label: f(String),
  counts: f(Map, { of: Int }),
}));
ConstantRegistry.buildScalar("idempotencyTestTally", IdempotencyTestTally, { IdempotencyTestTally });

// A document's toJSON spells its Maps as plain objects, as SqlDocumentStore's does.
class IdempotencyTestTallyDocument extends IdempotencyTestTally {
  toJSON() {
    return { label: this.label, counts: Object.fromEntries(this.counts) };
  }
}

const IdempotencyTestAccountInput = via((f) => ({
  name: f(String),
  joinedAt: f(Date),
}));
const IdempotencyTestAccountObject = via(IdempotencyTestAccountInput, (f) => ({
  passwordHash: f.hidden(String),
  apiToken: f.secret(String),
}));
const IdempotencyTestAccountLight = via(IdempotencyTestAccountObject, ["name"] as const, () => ({}));
class IdempotencyTestAccount extends via(IdempotencyTestAccountObject, IdempotencyTestAccountLight, (resolve) => ({
  memberSince: resolve(String),
})) {
  greeting() {
    return `Hello ${this.name}`;
  }
}
const IdempotencyTestAccountInsight = via(IdempotencyTestAccount, () => ({}));
ConstantRegistry.buildModel(
  "idempotencyTestAccount",
  IdempotencyTestAccountInput,
  IdempotencyTestAccountObject,
  IdempotencyTestAccount,
  IdempotencyTestAccountLight,
  IdempotencyTestAccountInsight,
  {
    IdempotencyTestAccountInput,
    IdempotencyTestAccountObject,
    IdempotencyTestAccount,
    IdempotencyTestAccountLight,
    IdempotencyTestAccountInsight,
  },
);

// A resolveField reaching for its parent's methods and Dayjs fields, which only a model instance has.
class IdempotencyTestAccountInternal {
  static [INTERNAL_META] = {
    memberSince: buildInternal.resolveField(String).exec((parent) => {
      const account = parent as IdempotencyTestAccount;
      if (account.name === "gone")
        throw new Err.NotFound("base.error.relationNotFound", {
          model: "idempotencyTestAccount",
          field: "memberSince",
        });
      if (account.name === "vanished") throw new NoDocumentError("No Document (idempotencyTestAccount): referrer");
      return `${account.greeting()}, member since ${account.joinedAt.format("YYYY-MM-DD")}`;
    }),
  };
}

const accountLive = getDefaultLiveRegistry();
accountLive.internal.set("idempotencyTestAccountInternal", new IdempotencyTestAccountInternal() as unknown as Internal);

const accountOf = (name: string) =>
  new IdempotencyTestAccount().set({
    id: "507f1f77bcf86cd799439011",
    name,
    joinedAt: dayjs("2026-01-02T03:04:05.000Z"),
    passwordHash: "hash-that-must-stay-home",
    apiToken: "token-that-must-stay-home",
  }) as never;

class ExpiringCache {
  readonly #entries = new Map<string, { value: string; expiresAt: number | null }>();
  readonly failing: boolean;
  constructor({ failing = false }: { failing?: boolean } = {}) {
    this.failing = failing;
  }
  get size() {
    return this.#entries.size;
  }
  get values() {
    return [...this.#entries.values()].map(({ value }) => value);
  }
  #live(topic: string, key: string) {
    const entry = this.#entries.get(`${topic}:${key}`);
    if (entry?.expiresAt != null && entry.expiresAt <= Date.now()) {
      this.#entries.delete(`${topic}:${key}`);
      return undefined;
    }
    return entry;
  }
  #assertUp() {
    if (this.failing) throw new Error("cache is down");
  }
  async get(topic: string, key: string) {
    this.#assertUp();
    return this.#live(topic, key)?.value;
  }
  async set(topic: string, key: string, value: string, option?: { expireAt?: Dayjs }) {
    this.#assertUp();
    this.#entries.set(`${topic}:${key}`, { value, expiresAt: option?.expireAt?.valueOf() ?? null });
  }
  async delete(topic: string, key: string) {
    this.#entries.delete(`${topic}:${key}`);
  }
  async setIfAbsent(topic: string, key: string, value: string, option?: { expireAt?: Dayjs }) {
    this.#assertUp();
    if (this.#live(topic, key)) return false;
    await this.set(topic, key, value, option);
    return true;
  }
  async acquireLease(topic: string, key: string, owner: string, ttlMs: number) {
    this.#assertUp();
    const holder = this.#live(topic, key);
    if (holder && holder.value !== owner) return false;
    this.#entries.set(`${topic}:${key}`, { value: owner, expiresAt: Date.now() + ttlMs });
    return true;
  }
  async renewLease(topic: string, key: string, owner: string, ttlMs: number) {
    this.#assertUp();
    const holder = this.#live(topic, key);
    if (holder?.value !== owner) return false;
    holder.expiresAt = Date.now() + ttlMs;
    return true;
  }
  async releaseLease(topic: string, key: string, owner: string) {
    this.#assertUp();
    if (this.#live(topic, key)?.value === owner) this.#entries.delete(`${topic}:${key}`);
  }
}

const adaptor = new (adapt("endpointIdempotencyTestAdaptor"))();

const makeRequest = (headers: Record<string, string>, body: Record<string, unknown>, cookies: Record<string, string>) =>
  ({
    url: "http://localhost/api/idempotent",
    params: {},
    body: {},
    headers: new Headers({ "content-type": "application/json", ...headers }),
    cookies: { get: (name: string) => cookies[name] ?? null },
    json: async () => body,
  }) as unknown as Bun.BunRequest;

const callWith = async (
  endpointInfo: EndpointInfo,
  cache: ExpiringCache,
  {
    headers = {},
    body = {},
    cookies = {},
    middlewareMap = new Map(),
    live = getDefaultLiveRegistry(),
    origin,
  }: {
    headers?: Record<string, string>;
    body?: Record<string, unknown>;
    cookies?: Record<string, string>;
    middlewareMap?: Map<string, MiddlewareCls>;
    live?: LiveRegistry;
    origin?: TraceOrigin;
  } = {},
) => {
  const registry = getDefaultInjectRegistry();
  registry.adaptor.set(CacheAdaptorRole as never, cache as never);
  return (await SignalContext.try(adaptor, endpointInfo, "idempotent", async () => {
    const context = new SignalContext("idempotent", makeRequest(headers, body, cookies), {
      endpointInfo,
      adaptor,
      registry,
      env: {} as never,
      live,
      middleware: middlewareMap,
      origin,
    });
    await context.init();
    return (await context.exec()) as Response;
  })) as Response;
};

const device = { authorization: "Bearer device-a", "idempotency-key": "ack-1" };

describe("EndpointIdempotency", () => {
  test("replays a Map field, a document's Map and Binary bytes as the first run answered them", async () => {
    let runs = 0;
    const tally = buildEndpoint.mutation(IdempotencyTestTally, { guards: [Public] }).exec(() => {
      runs++;
      return new IdempotencyTestTally().set({ label: `tally-${runs}`, counts: new Map([["a", runs]]) });
    });
    const document = buildEndpoint.mutation(IdempotencyTestTally, { guards: [Public] }).exec(() => {
      runs++;
      return new IdempotencyTestTallyDocument().set({ label: `doc-${runs}`, counts: new Map([["b", runs]]) });
    });
    const bytes = buildEndpoint.mutation(Binary, { guards: [Public] }).exec(() => {
      runs++;
      return new Uint8Array([1, 2, runs]);
    });
    const answers = async (endpointInfo: EndpointInfo, key: string) => {
      const cache = new ExpiringCache();
      const headers = { ...device, "idempotency-key": key };
      const first = await callWith(endpointInfo, cache, { headers });
      const repeat = await callWith(endpointInfo, cache, { headers });
      return [first.status, await first.json(), repeat.status, await repeat.json()];
    };

    expect(await answers(tally, "tally")).toEqual([
      200,
      { label: "tally-1", counts: { a: 1 } },
      200,
      { label: "tally-1", counts: { a: 1 } },
    ]);
    expect(await answers(document, "document")).toEqual([
      200,
      { label: "doc-2", counts: { b: 2 } },
      200,
      { label: "doc-2", counts: { b: 2 } },
    ]);
    const bytesOf = Binary.serializeValue(new Uint8Array([1, 2, 3]));
    expect(await answers(bytes, "bytes")).toEqual([200, bytesOf, 200, bytesOf]);
    expect(runs).toBe(3);
  });

  test("keeps no Response, so a repeat runs the handler again and answers its own headers", async () => {
    let runs = 0;
    const info = buildEndpoint.mutation(String, { guards: [Public] }).exec(() => {
      runs++;
      return new Response(JSON.stringify(`session-${runs}`), {
        headers: { "set-cookie": `jwt=session-${runs}` },
      }) as never;
    });
    const cache = new ExpiringCache();

    const first = await callWith(info, cache, { headers: device });
    const repeat = await callWith(info, cache, { headers: device });
    expect(first.headers.get("set-cookie")).toBe("jwt=session-1");
    expect(repeat.headers.get("set-cookie")).toBe("jwt=session-2");
    expect(runs).toBe(2);
    expect(cache.size).toBe(0);
  });

  test("runs the mutation without idempotency while the cache fails, instead of failing the call", async () => {
    let runs = 0;
    const info = buildEndpoint.mutation(String, { guards: [Public] }).exec(() => `run-${++runs}`);
    const cache = new ExpiringCache({ failing: true });

    const first = await callWith(info, cache, { headers: device });
    const second = await callWith(info, cache, { headers: device });
    expect([first.status, second.status]).toEqual([200, 200]);
    expect([await first.json(), await second.json()]).toEqual(["run-1", "run-2"]);
  });

  test("refuses a repeat for as long as the first run holds the key, past its declared timeout", async () => {
    let runs = 0;
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const info = buildEndpoint.mutation(String, { guards: [Public], timeout: 1 }).exec(async () => {
      runs++;
      await held;
      return "done";
    });
    const cache = new ExpiringCache();

    const first = callWith(info, cache, { headers: device });
    await Bun.sleep(20);
    const repeat = await callWith(info, cache, { headers: device });
    expect(repeat.status).toBe(409);
    expect(await repeat.json()).toMatchObject({ error: "base.error.idempotencyInFlight" });
    release();
    expect(await (await first).json()).toBe("done");
    expect(await (await callWith(info, cache, { headers: device })).json()).toBe("done");
    expect(runs).toBe(1);
  });

  test("never deduplicates anonymous callers, so one's key cannot replay another's answer", async () => {
    let runs = 0;
    const info = buildEndpoint.mutation(String, { guards: [Public] }).exec(() => `session-${++runs}`);
    const cache = new ExpiringCache();
    const headers = { "idempotency-key": "signin:01012345678" };

    expect(await (await callWith(info, cache, { headers })).json()).toBe("session-1");
    expect(await (await callWith(info, cache, { headers })).json()).toBe("session-2");
    expect(cache.size).toBe(0);
  });

  test("keys a signed-in caller on its account: a re-issued token keeps the key, another account does not share it", async () => {
    let runs = 0;
    const info = buildEndpoint.mutation(String, { guards: [Public] }).exec(() => `run-${++runs}`);
    const accounts: Record<string, object> = {
      "Bearer token-1": { self: { id: "user-1" }, sid: "session-1" },
      "Bearer token-2": { self: { id: "user-1" }, sid: "session-2" },
      "Bearer token-3": { self: { id: "user-2" }, sid: "session-3" },
    };
    class AccountFromToken extends middleware("idempotencyTestAccount") {
      override async use() {
        return async (context: SignalContext, next: () => Promise<unknown>) => {
          const { req } = context.getHttpContext();
          Object.assign(req, { account: accounts[req.headers.get("authorization") ?? ""] });
          return await next();
        };
      }
    }
    const middlewareMap = new Map<string, MiddlewareCls>([["idempotencyTestAccount", AccountFromToken]]);
    const cache = new ExpiringCache();
    const callAs = async (authorization: string) =>
      await (
        await callWith(info, cache, { headers: { authorization, "idempotency-key": "pay-7" }, middlewareMap })
      ).json();

    expect(await callAs("Bearer token-1")).toBe("run-1");
    expect(await callAs("Bearer token-2")).toBe("run-1");
    expect(await callAs("Bearer token-3")).toBe("run-2");
  });

  test("keys a caller no account names on its credential, sent as a bearer header or as the auth cookie", async () => {
    let runs = 0;
    const info = buildEndpoint.mutation(String, { guards: [Public] }).exec(() => `run-${++runs}`);
    const cache = new ExpiringCache();
    const headers = { "idempotency-key": "ack-9" };

    expect(await (await callWith(info, cache, { headers: { ...headers, authorization: "Bearer tok-x" } })).json()).toBe(
      "run-1",
    );
    expect(await (await callWith(info, cache, { headers, cookies: { "jwt:idempotencyTest": "tok-x" } })).json()).toBe(
      "run-1",
    );
    expect(await (await callWith(info, cache, { headers, cookies: { "jwt:idempotencyTest": "tok-y" } })).json()).toBe(
      "run-2",
    );
  });

  test("reads a credential off the header as the account layer does, so a header it reads no token from is no caller", async () => {
    let runs = 0;
    const info = buildEndpoint.mutation(String, { guards: [Public] }).exec(() => `run-${++runs}`);
    const cache = new ExpiringCache();
    const callWithHeader = async (authorization: string, cookies: Record<string, string> = {}) =>
      await (await callWith(info, cache, { headers: { authorization, "idempotency-key": "ack-3" }, cookies })).json();

    expect(await callWithHeader("bearer   tok-z")).toBe("run-1");
    expect(await callWithHeader("Bearer tok-z")).toBe("run-1");
    expect(await callWithHeader("tok-z")).toBe("run-2");
    expect(await callWithHeader("tok-z")).toBe("run-3");
    expect(await callWithHeader("Bearer tok-z extra", { "jwt:idempotencyTest": "tok-z" })).toBe("run-4");
  });

  test("runs a repeat that carries other arguments under the same key, and replays one with the same", async () => {
    let runs = 0;
    const info = buildEndpoint
      .mutation(String, { guards: [Public] })
      .body("amount", Int)
      .exec((amount) => `run-${++runs}:${amount}`);
    const cache = new ExpiringCache();
    const pay = async (amount: number) =>
      await (await callWith(info, cache, { headers: device, body: { amount } })).json();

    expect(await pay(100)).toBe("run-1:100");
    expect(await pay(900)).toBe("run-2:900");
    expect(await pay(100)).toBe("run-1:100");
  });

  test("keeps the answer as it went out: no hidden or secret value in the cache, and the repeat is the same bytes", async () => {
    let runs = 0;
    const info = buildEndpoint.mutation(IdempotencyTestAccount, { guards: [Public] }).exec(() => {
      runs++;
      return accountOf(`account-${runs}`);
    });
    const cache = new ExpiringCache();

    const first = await callWith(info, cache, { headers: device, live: accountLive });
    const repeat = await callWith(info, cache, { headers: device, live: accountLive });
    const [firstText, repeatText] = [await first.text(), await repeat.text()];
    expect([first.status, repeat.status]).toEqual([200, 200]);
    expect(repeatText).toBe(firstText);
    expect(repeat.headers.get("content-type")).toBe(first.headers.get("content-type"));
    expect(JSON.parse(firstText)).toMatchObject({
      name: "account-1",
      passwordHash: null,
      apiToken: null,
      memberSince: "Hello account-1, member since 2026-01-02",
    });
    expect(runs).toBe(1);
    expect(cache.values).toHaveLength(1);
    expect(cache.values.join()).not.toContain("hash-that-must-stay-home");
    expect(cache.values.join()).not.toContain("token-that-must-stay-home");
  });

  test("answers a repeat without re-resolving, so a resolveField reading its parent's methods and dates holds", async () => {
    const info = buildEndpoint
      .mutation(IdempotencyTestAccount, { guards: [Public] })
      .exec(() => accountOf("account-1"));
    const cache = new ExpiringCache();

    await callWith(info, cache, { headers: device, live: accountLive });
    const repeat = await callWith(info, cache, { headers: device, live: accountLive });
    expect(repeat.status).toBe(200);
    expect(await repeat.json()).toMatchObject({ memberSince: "Hello account-1, member since 2026-01-02" });
  });

  test("answers a repeat with the failure the first run answered after its handler ran, without running it again", async () => {
    let runs = 0;
    const info = buildEndpoint.mutation(IdempotencyTestAccount, { guards: [Public] }).exec(() => {
      runs++;
      return accountOf("gone");
    });
    const cache = new ExpiringCache();

    const first = await callWith(info, cache, { headers: device, live: accountLive });
    const repeat = await callWith(info, cache, { headers: device, live: accountLive });
    const failure = { error: "base.error.relationNotFound", data: { model: "idempotencyTestAccount" } };
    expect([first.status, repeat.status]).toEqual([404, 404]);
    expect(await first.json()).toMatchObject(failure);
    expect(await repeat.json()).toMatchObject(failure);
    expect(runs).toBe(1);
  });

  test("replays a missing document the first run answered after its handler ran as the same 404", async () => {
    let runs = 0;
    const info = buildEndpoint.mutation(IdempotencyTestAccount, { guards: [Public] }).exec(() => {
      runs++;
      return accountOf("vanished");
    });
    const cache = new ExpiringCache();

    const first = await callWith(info, cache, { headers: device, live: accountLive });
    const repeat = await callWith(info, cache, { headers: device, live: accountLive });
    expect([first.status, repeat.status]).toEqual([404, 404]);
    expect(await first.json()).toMatchObject({ error: "base.error.documentNotFound", statusCode: 404 });
    expect(await repeat.json()).toMatchObject({ error: "base.error.documentNotFound", statusCode: 404 });
    expect(runs).toBe(1);
    expect(Err.is(new NoDocumentError("No Document (item): x"), "base.error.documentNotFound")).toBe(true);
  });

  test("never deduplicates a call through MCP, whose headers belong to the JSON-RPC request", async () => {
    let runs = 0;
    const info = buildEndpoint.mutation(String, { guards: [Public] }).exec(() => `run-${++runs}`);
    const cache = new ExpiringCache();

    await callWith(info, cache, { headers: device, origin: "mcp" });
    await callWith(info, cache, { headers: device, origin: "mcp" });
    expect(runs).toBe(2);
    expect(cache.size).toBe(0);
  });
});
