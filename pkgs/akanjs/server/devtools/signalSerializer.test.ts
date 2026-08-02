import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { DevtoolsFixture, fixtureRefName } from "./devtools.fixture";
import { SignalSerializer } from "./signalSerializer";
import type { SignalData } from "./types";

let fixture: DevtoolsFixture;
let data: SignalData;

beforeAll(async () => {
  fixture = await DevtoolsFixture.boot("all");
  data = SignalSerializer.serialize({
    di: fixture.lifecycle,
    serverMode: fixture.serverMode,
    prefix: "/api",
    websocketPrefix: "/ws",
  });
});

afterAll(async () => {
  await fixture.destroy();
});

describe("SignalSerializer", () => {
  test("describes the database signal with its class names and guards", () => {
    const signal = data.signals[fixtureRefName];
    expect(signal.kind).toBe("database");
    expect(signal.cnstRefName).toBe(fixtureRefName);
    expect(signal.classNames).toMatchObject({
      internal: `${fixtureRefName}Internal`,
      endpoint: `${fixtureRefName}Endpoint`,
      slice: `${fixtureRefName}Slice`,
    });
    expect(signal.guards.get).toEqual(["Public"]);
    expect(signal.guards.cru).toEqual(["Public"]);
  });

  test("keeps declared endpoints separate from framework-generated ones", () => {
    const signal = data.signals[fixtureRefName];
    expect(Object.keys(signal.endpoint).sort()).toEqual(["echoMessage", "getTitle", "roomFeed", "updateTitle"]);
    expect(Object.keys(signal.generated.crud)).toContain(`create${"ServerResolverTestItem"}`);
    expect(Object.keys(signal.generated.crud)).toContain(fixtureRefName);
    // The root slice registers under the empty key, so it contributes the unsuffixed list/insight pair.
    expect(Object.keys(signal.generated.slice).sort()).toEqual([
      `${fixtureRefName}Insight`,
      `${fixtureRefName}InsightInCategory`,
      `${fixtureRefName}List`,
      `${fixtureRefName}ListInCategory`,
    ]);
  });

  test("recovers prefix and globalPrefix, which the client payload never carries", () => {
    const getTitle = data.signals[fixtureRefName].endpoint.getTitle;
    expect(getTitle.prefix).toBe(false);
    expect(getTitle.globalPrefix).toBe(false);
  });

  test("resolves route paths the way the real route table does", () => {
    const rowOf = (key: string) => data.routes.find((route) => route.key === key);
    // `prefix: false` + `globalPrefix: false` strips both the model prefix and `/api`.
    expect(rowOf("getTitle")).toMatchObject({
      source: "declared",
      method: "GET",
      transport: "http",
      path: "/getTitle/:id",
      guards: ["Public"],
    });
    expect(rowOf("updateTitle")).toMatchObject({
      method: "POST",
      path: `/api/${fixtureRefName}/updateTitle/:id`,
    });
    expect(rowOf(`${fixtureRefName}ListInCategory`)).toMatchObject({
      source: "slice",
      method: "GET",
      path: `/api/${fixtureRefName}/${fixtureRefName}ListInCategory`,
    });
    expect(rowOf(`create${"ServerResolverTestItem"}`)).toMatchObject({ source: "crud", method: "POST" });
  });

  test("routes websocket endpoints to the websocket path with no HTTP method", () => {
    expect(data.routes.find((route) => route.key === "roomFeed")).toMatchObject({
      type: "pubsub",
      transport: "ws",
      method: null,
      path: "/api/ws",
    });
    expect(data.routes.find((route) => route.key === "echoMessage")).toMatchObject({
      type: "message",
      transport: "ws",
    });
  });

  test("surfaces internals, which SerializedSignal omits entirely", () => {
    const internal = data.signals[fixtureRefName].internal;
    expect(Object.keys(internal).sort()).toEqual(["boot", "cleanup", "processItem"]);
    expect(internal.boot).toMatchObject({ type: "init", enabled: true, scheduledHere: true });
    expect(internal.processItem).toMatchObject({ type: "process", scheduledHere: true });
    expect(internal.processItem.args).toEqual([{ type: "msg", refName: "ID", name: "itemId" }]);
    expect(internal.processItem.returns).toMatchObject({ refName: "Boolean" });
  });

  test("collects the slice definitions and the distinct guard names", () => {
    expect(Object.keys(data.signals[fixtureRefName].slice).sort()).toEqual(["", "inCategory"]);
    expect(data.guards).toContain("Public");
  });

  test("round-trips through JSON", () => {
    expect(() => JSON.stringify(data)).not.toThrow();
    expect(JSON.parse(JSON.stringify(data))).toEqual(data);
  });
});

describe("SignalSerializer schedule placement", () => {
  test("explains why an internal is not scheduled on this server", async () => {
    const batch = await DevtoolsFixture.boot("federation");
    try {
      const federation = SignalSerializer.serialize({
        di: batch.lifecycle,
        serverMode: "federation",
        prefix: "/api",
        websocketPrefix: "/ws",
      });
      // The fixture's `process` internal defaults to `serverMode: "all"`, so it stays scheduled everywhere.
      expect(federation.signals[fixtureRefName].internal.processItem.scheduledHere).toBe(true);
    } finally {
      await batch.destroy();
    }
  });
});
