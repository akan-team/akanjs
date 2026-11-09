import { describe, expect, test } from "bun:test";
import type { DepsData, SignalData, SignalNode } from "../types";
import { StudioLayout } from "./studioLayout";
import { StudioRuntimeGraph } from "./studioRuntimeGraph";

const deps: DepsData = {
  app: { name: "demo", status: "running", serverMode: "all", prefix: "/api", websocketPrefix: "/ws", openapi: false },
  nodes: [
    { id: "service:memo", kind: "service", refName: "memo", serviceType: "database", enabled: true, stage: 1 },
    { id: "service:user", kind: "service", refName: "user", serviceType: "plain", enabled: true, stage: 0 },
    { id: "adaptor:cacheAdaptorRole", kind: "adaptor", refName: "cacheAdaptorRole" },
    { id: "adaptor:solidCache", kind: "adaptor", refName: "solidCache", stage: 0, role: "cacheAdaptorRole" },
    { id: "adaptor:memoModel", kind: "adaptor", refName: "memoModel", stage: 1 },
    { id: "internal:memoInternal", kind: "internal", refName: "memoInternal" },
    { id: "endpoint:memoEndpoint", kind: "endpoint", refName: "memoEndpoint" },
    { id: "env:env", kind: "env", refName: "env" },
  ],
  edges: [
    { from: "service:memo", to: "adaptor:memoModel", kind: "database", prop: "memoModel" },
    { from: "service:memo", to: "adaptor:memoModel", kind: "database", prop: "__databaseModel" },
    { from: "service:memo", to: "service:user", kind: "service", prop: "userService" },
    { from: "service:memo", to: "env:env", kind: "env", prop: "config" },
    {
      from: "adaptor:memoModel",
      to: "adaptor:cacheAdaptorRole",
      kind: "plug",
      prop: "__cache",
      resolvedTo: "solidCache",
    },
    { from: "internal:memoInternal", to: "service:memo", kind: "service", prop: "memoService" },
    { from: "endpoint:memoEndpoint", to: "service:memo", kind: "service", prop: "memoService" },
  ],
  roles: [{ role: "cacheAdaptorRole", impl: "solidCache" }],
  stages: { adaptor: [["solidCache"], ["memoModel"]], service: [["user"], ["memo"]] },
  env: { public: {}, keys: [] },
  disabledModules: [],
};

const signalOf = (refName: string, internal: SignalNode["internal"]): SignalNode => ({
  refName,
  kind: "database",
  classNames: { internal: `${refName}Internal`, endpoint: `${refName}Endpoint` },
  guards: {},
  internal,
  slice: {},
  endpoint: {},
  generated: { crud: {}, slice: {} },
});

const signal: SignalData = {
  prefix: "/api",
  websocketPrefix: "/ws",
  signals: {
    memo: signalOf("memo", {
      sweep: {
        key: "sweep",
        type: "cron",
        enabled: true,
        schedule: { cron: "0 * * * *" },
        args: [],
        internalArgs: [],
        scheduledHere: true,
      },
      poll: {
        key: "poll",
        type: "interval",
        enabled: true,
        serverMode: "batch",
        schedule: { everyMs: 300_000 },
        args: [],
        internalArgs: [],
        scheduledHere: false,
        skipReason: 'serverMode is "federation" but the internal declares "batch"',
      },
    }),
    user: signalOf("user", {}),
  },
  routes: [],
  guards: [],
  middlewares: [],
};

describe("StudioRuntimeGraph", () => {
  test("lays jobs, services and adaptors out by boot stage, latest stage first", () => {
    const graph = new StudioRuntimeGraph(deps, signal);
    expect(graph.columns.map(({ label, nodes }) => [label, nodes.map((node) => node.id)])).toEqual([
      ["Jobs", ["internal:memoInternal"]],
      ["Services · stage 2", ["service:memo"]],
      ["Services · stage 1", ["service:user"]],
      ["Adaptors · stage 2", ["adaptor:memoModel"]],
      ["Adaptors · stage 1", ["adaptor:solidCache"]],
    ]);
    expect(graph.modules).toEqual(["memo", "user"]);
  });

  test("draws one arrow per injection kind, folds a role into its adaptor and leaves env out", () => {
    const graph = new StudioRuntimeGraph(deps, signal);
    expect(graph.edges.map(({ from, to, kind, label, count }) => ({ from, to, kind, label, count }))).toEqual([
      {
        from: "service:memo",
        to: "adaptor:memoModel",
        kind: "database",
        label: "memoModel, __databaseModel",
        count: 2,
      },
      { from: "service:memo", to: "service:user", kind: "service", label: "userService", count: 1 },
      { from: "adaptor:memoModel", to: "adaptor:solidCache", kind: "plug", label: "__cache", count: 1 },
      { from: "internal:memoInternal", to: "service:memo", kind: "service", label: "memoService", count: 1 },
    ]);
    const cache = graph.columns.flatMap(({ nodes }) => nodes).find((node) => node.id === "adaptor:solidCache");
    expect(cache && graph.rowsOf(cache)).toEqual([{ text: "cacheAdaptorRole", hint: "", at: null }]);
  });

  test("lists each job with its schedule, and says why one does not run on this server", () => {
    const graph = new StudioRuntimeGraph(deps, signal);
    const [internal] = graph.columns[0].nodes;
    expect(internal.module).toBe("memo");
    expect(graph.rowsOf(internal)).toEqual([
      { text: "cron sweep", hint: "0 * * * *", at: null },
      {
        text: "interval poll",
        hint: "every 5 min",
        at: null,
        skipped: 'serverMode is "federation" but the internal declares "batch"',
      },
    ]);
  });

  test("leaves resolveField internals out, and gives a class with nothing else no box", () => {
    const resolveField = {
      key: "ownerName",
      type: "resolveField" as const,
      enabled: true,
      args: [],
      internalArgs: [],
      scheduledHere: false,
      skipReason: "resolveField internals resolve a field on demand and are never scheduled",
    };
    const graph = new StudioRuntimeGraph(deps, {
      ...signal,
      signals: {
        memo: signalOf("memo", { ...signal.signals.memo.internal, ownerName: resolveField }),
        user: signalOf("user", { ownerName: resolveField }),
      },
    });
    expect(graph.columns[0].nodes.map((node) => node.id)).toEqual(["internal:memoInternal"]);
    expect(graph.rowsOf(graph.columns[0].nodes[0]).map((row) => row.text)).toEqual(["cron sweep", "interval poll"]);
  });

  test("draws the DI graph without jobs when the signal serializer failed", () => {
    const graph = StudioRuntimeGraph.of({
      app: {
        name: "demo",
        repoName: "akan",
        serveDomain: "example.com",
        environment: "local",
        operationMode: "local",
        serverMode: "all",
        pid: 1,
        replicaIdx: 0,
      },
      deps,
      signal: { error: "boom" },
    });
    expect(graph?.columns[0].nodes).toEqual([]);
    expect(graph?.edges.some((edge) => edge.from === "internal:memoInternal")).toBe(false);
  });

  test("scopes the scene to a module and keeps every arrow pointing right", () => {
    const scene = StudioLayout.runtime(new StudioRuntimeGraph(deps, signal), "user");
    expect(scene.boxes.map((box) => box.node.id)).toEqual(["service:memo", "service:user"]);
    const full = StudioLayout.runtime(new StudioRuntimeGraph(deps, signal), null);
    const xOf = new Map(full.boxes.map((box) => [box.node.id, box.x]));
    for (const { edge } of full.links) expect(xOf.get(edge.from) ?? 0).toBeLessThan(xOf.get(edge.to) ?? 0);
    expect(full.columns.map(({ label }) => label)).toEqual([
      "Jobs",
      "Services · stage 2",
      "Services · stage 1",
      "Adaptors · stage 2",
      "Adaptors · stage 1",
    ]);
  });
});
