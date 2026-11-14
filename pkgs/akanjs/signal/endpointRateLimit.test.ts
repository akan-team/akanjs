import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { adapt, getDefaultInjectRegistry, getDefaultLiveRegistry } from "akanjs/service";
import { buildEndpoint, type EndpointInfo } from "./endpointInfo";
import { EndpointRateLimit } from "./endpointRateLimit";
import { Public } from "./guards";
import { SignalContext } from "./signalContext";

let bodyReads = 0;
const requestOf = ({ body, account }: { body?: Record<string, unknown>; account?: unknown } = {}) =>
  ({
    url: "http://localhost/api/limited",
    params: {},
    body: body ? {} : undefined,
    headers: new Headers(body ? { "content-type": "application/json" } : {}),
    json: async () => {
      bodyReads += 1;
      return body ?? {};
    },
    account,
  }) as unknown as Bun.BunRequest;

const adaptor = new (adapt("endpointRateLimitTestAdaptor"))();
const contextOf = (key: string, endpointInfo: EndpointInfo, reqOrWsReq: Bun.BunRequest) =>
  new SignalContext(key, reqOrWsReq, {
    endpointInfo,
    adaptor,
    registry: getDefaultInjectRegistry(),
    env: {} as never,
    live: getDefaultLiveRegistry(),
    middleware: new Map(),
  });
const call = async (key: string, endpointInfo: EndpointInfo, request: Bun.BunRequest = requestOf()) =>
  (await SignalContext.try(adaptor, endpointInfo, key, async () => {
    const context = await contextOf(key, endpointInfo, request).init();
    return (await context.exec()) as Response;
  })) as Response;

let peer = "198.51.100.1";

beforeEach(() => {
  EndpointRateLimit.reset();
  bodyReads = 0;
  peer = "198.51.100.1";
  SignalContext.setHttpPeerResolver(() => ({ address: peer, port: 40_000 }));
});
afterEach(() => {
  EndpointRateLimit.reset();
  SignalContext.setHttpPeerResolver(null);
});

describe("EndpointRateLimit", () => {
  test("refuses past an ip budget with 429 and Retry-After, before the body is read", async () => {
    const endpointInfo = buildEndpoint
      .mutation(Boolean, { guards: [Public], rateLimit: { calls: 2, windowMs: 60_000 } })
      .body("text", String)
      .exec(() => true);
    const request = () => requestOf({ body: { text: "hi" } });

    expect((await call("limited", endpointInfo, request())).status).toBe(200);
    expect((await call("limited", endpointInfo, request())).status).toBe(200);
    const refused = await call("limited", endpointInfo, request());

    expect(refused.status).toBe(429);
    expect(Number(refused.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(await refused.json()).toMatchObject({
      error: "base.error.tooManyRequests",
      statusCode: 429,
      data: { seconds: expect.any(Number) },
    });
    expect(bodyReads).toBe(2);
  });

  test("keeps a budget per address and per endpoint", async () => {
    const limitedInfo = buildEndpoint.query(String, { guards: [Public], rateLimit: { calls: 1 } }).exec(() => "ok");
    const otherInfo = buildEndpoint.query(String, { guards: [Public], rateLimit: { calls: 1 } }).exec(() => "ok");

    expect((await call("limited", limitedInfo)).status).toBe(200);
    expect((await call("limited", limitedInfo)).status).toBe(429);
    expect((await call("other", otherInfo)).status).toBe(200);
    peer = "198.51.100.2";
    expect((await call("limited", limitedInfo)).status).toBe(200);
  });

  test("an account budget counts the account, and an anonymous caller by address", async () => {
    const endpointInfo = buildEndpoint
      .query(String, { guards: [Public], rateLimit: { calls: 1, by: "account" } })
      .exec(() => "ok");

    expect((await call("mine", endpointInfo, requestOf({ account: { sid: "s1" } }))).status).toBe(200);
    expect((await call("mine", endpointInfo, requestOf({ account: { sid: "s1" } }))).status).toBe(429);
    expect((await call("mine", endpointInfo, requestOf({ account: { sid: "s2" } }))).status).toBe(200);
    expect((await call("mine", endpointInfo, requestOf())).status).toBe(200);
    expect((await call("mine", endpointInfo, requestOf())).status).toBe(429);
  });

  test("accountKey decides who an account budget counts", async () => {
    EndpointRateLimit.configure({
      accountKey: (account) => (account as { self?: { id?: string } } | null)?.self?.id ?? null,
    });
    const endpointInfo = buildEndpoint
      .query(String, { guards: [Public], rateLimit: { calls: 1, by: "account" } })
      .exec(() => "ok");
    const session = (sid: string) => requestOf({ account: { sid, self: { id: "user-1" } } });

    expect((await call("mine", endpointInfo, session("s1"))).status).toBe(200);
    expect((await call("mine", endpointInfo, session("s2"))).status).toBe(429);
  });

  test("the app budget covers undeclared endpoints, and an endpoint override or `false` wins", async () => {
    EndpointRateLimit.configure({ budget: { calls: 1 }, endpoints: { raised: { calls: 2 }, exempt: false } });
    const undeclared = buildEndpoint.query(String, { guards: [Public] }).exec(() => "ok");
    const optedOut = buildEndpoint.query(String, { guards: [Public], rateLimit: false }).exec(() => "ok");

    expect((await call("undeclared", undeclared)).status).toBe(200);
    expect((await call("undeclared", undeclared)).status).toBe(429);
    for (const _ of [1, 2, 3]) expect((await call("optedOut", optedOut)).status).toBe(200);
    expect((await call("raised", undeclared)).status).toBe(200);
    expect((await call("raised", undeclared)).status).toBe(200);
    expect((await call("raised", undeclared)).status).toBe(429);
    for (const _ of [1, 2, 3]) expect((await call("exempt", undeclared)).status).toBe(200);
  });

  test("the env turns budgets off, keeps them off in a local environment unless on, and names a default", () => {
    const declared = buildEndpoint.query(String, { guards: [Public], rateLimit: { calls: 1 } }).exec(() => "ok");
    const undeclared = buildEndpoint.query(String, { guards: [Public] }).exec(() => "ok");

    EndpointRateLimit.applyEnv(undefined, "local");
    expect(EndpointRateLimit.budgetOf("declared", declared)).toBeNull();

    EndpointRateLimit.reset();
    EndpointRateLimit.applyEnv("on", "local");
    expect(EndpointRateLimit.budgetOf("declared", declared)).toMatchObject({ calls: 1, by: "ip" });

    EndpointRateLimit.reset();
    EndpointRateLimit.configure({ enabled: true });
    EndpointRateLimit.applyEnv("off", "main");
    expect(EndpointRateLimit.budgetOf("declared", declared)).toBeNull();

    EndpointRateLimit.reset();
    EndpointRateLimit.applyEnv("30/10", "main");
    expect(EndpointRateLimit.budgetOf("undeclared", undeclared)).toEqual({ calls: 30, windowMs: 10_000, by: "ip" });

    EndpointRateLimit.reset();
    EndpointRateLimit.configure({ budget: { calls: 5 } });
    EndpointRateLimit.applyEnv("30/10", "main");
    expect(EndpointRateLimit.budgetOf("undeclared", undeclared)).toEqual({ calls: 5, windowMs: 60_000, by: "ip" });
  });

  test("never refuses leaving a room", async () => {
    const endpointInfo = buildEndpoint
      .pubsub(String, { guards: [Public], rateLimit: { calls: 1 } })
      .room("roomId", String)
      .exec(() => undefined);
    const leave = () =>
      contextOf("room", endpointInfo, { ws: { data: {} }, data: ["room-1"], eventType: "unsubscribe" } as never).init();

    await leave();
    await leave();
    await leave();
  });

  describe("subscribe frames", () => {
    const roomInfo = buildEndpoint
      .pubsub(String, { guards: [Public] })
      .room("roomId", String)
      .exec(() => undefined);
    const socketOf = (account?: unknown, address = "198.51.100.7") => ({ data: { account }, remoteAddress: address });
    const subscribe = async (ws: ReturnType<typeof socketOf>, room = "room-1") => {
      const context = await contextOf("room", roomInfo, { ws, data: [room], eventType: "subscribe" } as never).init();
      await context.exec();
    };

    test("let a page's burst and a reconnect resubscribing 256 rooms through, and refuse a socket past 1,000 a minute", async () => {
      const account = { sid: "s1" };
      const page = socketOf(account);
      for (let room = 0; room < 256; room++) await subscribe(page, `room-${room}`);
      const reconnected = socketOf(account);
      for (let room = 0; room < 256; room++) await subscribe(reconnected, `room-${room}`);
      for (let frame = 256; frame < 1_000; frame++) await subscribe(reconnected);

      await expect(subscribe(reconnected)).rejects.toMatchObject({
        statusCode: 429,
        message: "base.error.tooManyRequests",
        data: { seconds: expect.any(Number) },
      });
      await subscribe(page);
      await subscribe(socketOf(account));
    });

    test("count a caller across its sockets by account, else by address", async () => {
      EndpointRateLimit.configure({ subscribe: { perCaller: { calls: 3 } } });
      const signedIn = { sid: "s1" };
      await subscribe(socketOf(signedIn));
      await subscribe(socketOf(signedIn));
      await subscribe(socketOf(signedIn, "203.0.113.9"));
      await expect(subscribe(socketOf(signedIn))).rejects.toMatchObject({ statusCode: 429 });
      await subscribe(socketOf({ sid: "s2" }));

      await subscribe(socketOf());
      await subscribe(socketOf());
      await subscribe(socketOf());
      await expect(subscribe(socketOf())).rejects.toMatchObject({ statusCode: 429 });
      await subscribe(socketOf(undefined, "203.0.113.9"));
    });

    test("default to 1,000 per socket and 10,000 per caller a minute, which the settings and the env change", () => {
      expect(EndpointRateLimit.subscribeBudgetOf("perConnection")).toEqual({ calls: 1_000, windowMs: 60_000 });
      expect(EndpointRateLimit.subscribeBudgetOf("perCaller")).toEqual({ calls: 10_000, windowMs: 60_000 });

      EndpointRateLimit.configure({ subscribe: { perConnection: { calls: 5_000, windowMs: 10_000 } } });
      EndpointRateLimit.configure({ subscribe: { perCaller: false } });
      expect(EndpointRateLimit.subscribeBudgetOf("perConnection")).toEqual({ calls: 5_000, windowMs: 10_000 });
      expect(EndpointRateLimit.subscribeBudgetOf("perCaller")).toBeNull();

      EndpointRateLimit.reset();
      EndpointRateLimit.configure({ subscribe: false });
      expect(EndpointRateLimit.subscribeBudgetOf("perConnection")).toBeNull();

      EndpointRateLimit.reset();
      EndpointRateLimit.applyEnv("off", "main");
      expect(EndpointRateLimit.subscribeBudgetOf("perCaller")).toBeNull();
    });
  });

  test("callers without an address share one budget", async () => {
    SignalContext.setHttpPeerResolver(null);
    const endpointInfo = buildEndpoint.query(String, { guards: [Public], rateLimit: { calls: 1 } }).exec(() => "ok");

    expect((await call("unknown", endpointInfo)).status).toBe(200);
    expect((await call("unknown", endpointInfo)).status).toBe(429);
  });
});
