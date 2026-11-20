import { describe, expect, test } from "bun:test";
import path from "node:path";
import type { Logger } from "akanjs/common";
import type { AkanIpcMessage, AkanMetricFamily, AkanRscWorkerStatus } from "akanjs/service";
import { RestartSchedule } from "../../common/restartSchedule";
import { MetricRegistry } from "../metrics/metricRegistry";
import { ChildSupervisor } from "./childSupervisor";
import type { DevHostChannel } from "./devHostChannel";
import { type ChildState, GatewayChildren } from "./gatewayChildren";
import { GatewayConfig } from "./gatewayConfig";
import type { GatewayLogging } from "./gatewayLogging";
import type { GatewayRooms } from "./gatewayRooms";
import { GatewayStatus } from "./gatewayStatus";
import { GatewayWebSocketRelay, type GatewayWsData } from "./gatewayWebSocketRelay";

const logger = { warn: () => undefined, error: () => undefined, verbose: () => undefined } as unknown as Logger;

const gatewayOf = (replicas: number) => {
  const config = new GatewayConfig(path.join("/tmp", "server.ts"), { replica: replicas, runtimeDir: "/tmp", port: 0 });
  const children = new GatewayChildren(logger);
  for (let idx = 0; idx < replicas; idx++)
    children.set(idx, {
      idx,
      role: "all",
      proc: { killed: false, send: () => undefined } as unknown as ChildState["proc"],
      ready: false,
      status: "starting",
      metrics: {},
      restart: new RestartSchedule(config.childRestartPolicy),
      restartCount: 0,
      restartPending: false,
    });
  const rooms = {
    removeChildRooms: () => undefined,
    roomCountOf: () => 0,
    roomCount: 0,
    socketCount: 0,
  } as unknown as GatewayRooms;
  const supervisor = new ChildSupervisor({
    config,
    children,
    rooms,
    logging: { hub: null } as unknown as GatewayLogging,
    host: {} as DevHostChannel,
    logger,
    onMessage: () => undefined,
  });
  const status = new GatewayStatus(config, children, rooms, logger);
  const ready = (idx: number, rscWorker?: AkanRscWorkerStatus) =>
    supervisor.markReady(idx, {
      type: "ready",
      pid: 1000 + idx,
      replicaIdx: idx,
      role: "all",
      upstream: { type: "unix", socketPath: `/tmp/replica-${idx}.sock` },
      wsUpstream: { type: "tcp", host: "127.0.0.1", port: 9 },
      ...(rscWorker === undefined ? {} : { rscWorker }),
    });
  const pong = (idx: number, rscWorker?: AkanRscWorkerStatus) =>
    supervisor.markHealthy(idx, {
      type: "health.pong",
      nonce: "n",
      sentAt: 0,
      ...(rscWorker === undefined ? {} : { rscWorker }),
    } satisfies AkanIpcMessage);
  return { config, children, supervisor, status, ready, pong };
};

describe("GatewayStatus readiness", () => {
  test("stays unready while a booted replica's RSC worker starts, and turns unready while it restarts", () => {
    const { status, ready, pong } = gatewayOf(1);

    ready(0, "starting");
    expect(status.readyStatus()).toMatchObject({ ready: false, children: [{ ready: true, rscWorker: "starting" }] });
    pong(0, "ready");
    expect(status.readyStatus()).toMatchObject({ ready: true, children: [{ ready: true, rscWorker: "ready" }] });
    pong(0, "restarting");
    expect(status.readyStatus().ready).toBe(false);
    pong(0, "stopped");
    expect(status.readyStatus().ready).toBe(false);
    pong(0, "ready");
    expect(status.readyStatus().ready).toBe(true);
  });

  test("is ready on a replica that renders no pages, and on one of an earlier release that reports no worker", () => {
    const { status, ready, pong } = gatewayOf(1);

    ready(0, null);
    expect(status.readyStatus().ready).toBe(true);
    pong(0);
    expect(status.readyStatus()).toMatchObject({ ready: true, children: [{ rscWorker: undefined }] });
    ready(0);
    expect(status.readyStatus().ready).toBe(true);
  });

  test("stays ready while one replica's worker restarts, sends every request to the one that renders", () => {
    const { children, status, ready, pong } = gatewayOf(2);
    ready(0, "ready");
    ready(1, "ready");
    pong(1, "restarting");

    expect(status.readyStatus().ready).toBe(true);
    expect([0, 1, 2, 3].map(() => children.pickRenderingChild()?.idx)).toEqual([0, 0, 0, 0]);

    pong(0, "restarting");
    expect(status.readyStatus().ready).toBe(false);
    expect(new Set([0, 1, 2, 3].map(() => children.pickRenderingChild()?.idx))).toEqual(new Set([0, 1]));

    pong(1, "ready");
    expect(status.readyStatus().ready).toBe(true);
    expect([0, 1].map(() => children.pickRenderingChild()?.idx)).toEqual([1, 1]);
  });

  test("spreads websocket upgrades over every replica while one replica's worker restarts", () => {
    const { config, children, ready, pong } = gatewayOf(2);
    ready(0, "ready");
    ready(1, "ready");
    pong(1, "restarting");
    const relay = new GatewayWebSocketRelay(config, children);
    const upstreams: WebSocket[] = [];
    const server = {
      requestIP: () => null,
      upgrade: (_req: Request, { data }: { data: GatewayWsData }) => {
        upstreams.push(data.upstream);
        return true;
      },
    } as unknown as Bun.Server<GatewayWsData>;

    try {
      for (let n = 0; n < 4; n++)
        relay.upgrade(new Request("http://localhost/ws", { headers: { upgrade: "websocket" } }), server);
      expect([children.get(0)?.metrics.activeWebSockets, children.get(1)?.metrics.activeWebSockets]).toEqual([2, 2]);
    } finally {
      for (const upstream of upstreams) upstream.close();
    }
  });

  test("tells the dev host its backend is ready only once a replica that listened early has its web surface", () => {
    const { children, supervisor, status, ready } = gatewayOf(1);
    const send = process.send;
    const sent: unknown[] = [];
    process.send = (message: unknown) => sent.push(message) > 0;
    const pending = {
      type: "ready",
      pid: 1000,
      replicaIdx: 0,
      role: "all",
      upstream: { type: "unix", socketPath: "/tmp/replica-0.sock" },
      rscWorker: "starting",
      webPending: true,
    } satisfies AkanIpcMessage;

    try {
      children.get(0)?.restart.next();
      supervisor.markReady(0, pending);
      expect(sent).toEqual([]);
      expect(children.get(0)?.restart.attempts).toBe(1);
      expect(status.readyStatus()).toMatchObject({ ready: false, children: [{ ready: true, rscWorker: "starting" }] });

      ready(0, "ready");
      expect(sent).toEqual([{ type: "backend-ready", pid: process.pid }]);
      expect(children.get(0)?.restart.attempts).toBe(0);
      expect(status.readyStatus().ready).toBe(true);
    } finally {
      process.send = send;
    }
  });
});

describe("GatewayStatus metric families", () => {
  const replicaReport = (pid: number, startedAt: number, calls: { ok: number; failed: number; seconds: number[] }) => {
    const registry = new MetricRegistry();
    const requests = registry.counter("akan_endpoint_requests_total", "Calls.", ["endpoint", "status_class"]);
    const duration = registry.histogram("akan_endpoint_request_duration_seconds", "Call time.", ["endpoint"]);
    requests.inc({ endpoint: "query:getTitle", status_class: "2xx" }, calls.ok);
    requests.inc({ endpoint: "query:getTitle", status_class: "5xx" }, calls.failed);
    for (const seconds of calls.seconds) duration.observe(seconds, { endpoint: "query:getTitle" });
    registry.gauge("akan_rsc_renders_pending", "Renders waiting.").set(calls.ok);
    return { pid, startedAt, metricFamilies: registry.snapshot({ role: "all" }) };
  };
  const sampleOf = (families: AkanMetricFamily[], name: string, labels: Record<string, string> = {}) =>
    families
      .find((family) => family.name === name)
      ?.samples.find((sample) => Object.entries(labels).every(([label, value]) => sample.labels[label] === value));

  test("adds two replicas' counters and buckets, never averaging them", () => {
    const { children, status } = gatewayOf(2);
    children.updateMetrics(0, replicaReport(1000, 1, { ok: 3, failed: 1, seconds: [0.002, 0.2] }));
    children.updateMetrics(1, replicaReport(1001, 1, { ok: 5, failed: 0, seconds: [0.002, 4] }));
    const families = status.metricsStatus().metricFamilies;

    expect(sampleOf(families, "akan_endpoint_requests_total", { status_class: "2xx" })).toMatchObject({ value: 8 });
    expect(sampleOf(families, "akan_endpoint_requests_total", { status_class: "5xx" })).toMatchObject({ value: 1 });
    expect(sampleOf(families, "akan_endpoint_request_duration_seconds")).toMatchObject({
      labels: { role: "all", endpoint: "query:getTitle" },
      counts: [0, 2, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0],
      count: 4,
    });
    expect(sampleOf(families, "akan_rsc_renders_pending")).toMatchObject({ value: 8 });
    expect(status.metricsStatus().children[1]?.metrics.metricFamilies).toEqual(
      replicaReport(1001, 1, { ok: 5, failed: 0, seconds: [0.002, 4] }).metricFamilies,
    );
  });

  test("keeps a restarted replica's earlier counts in the sum, so it never drops, and none of its old gauges", () => {
    const { children, status } = gatewayOf(2);
    children.updateMetrics(0, replicaReport(1000, 1, { ok: 3, failed: 1, seconds: [0.002] }));
    children.updateMetrics(1, replicaReport(1001, 1, { ok: 5, failed: 0, seconds: [0.002] }));
    children.updateMetrics(0, replicaReport(1000, 1, { ok: 4, failed: 1, seconds: [0.002, 0.002] }));
    children.updateMetrics(0, replicaReport(2000, 9, { ok: 1, failed: 0, seconds: [0.002] }));
    const families = status.metricsStatus().metricFamilies;

    expect(sampleOf(families, "akan_endpoint_requests_total", { status_class: "2xx" })).toMatchObject({ value: 10 });
    expect(sampleOf(families, "akan_endpoint_requests_total", { status_class: "5xx" })).toMatchObject({ value: 1 });
    expect(sampleOf(families, "akan_endpoint_request_duration_seconds")).toMatchObject({ count: 4 });
    expect(sampleOf(families, "akan_rsc_renders_pending")).toMatchObject({ value: 6 });
  });
});

describe("GatewayStatus statement report", () => {
  test("merges every replica's statements into one report and keeps them out of the metrics body", () => {
    const { children, status } = gatewayOf(2);
    const statement = (count: number, endpoint: string) => ({
      fingerprint: "0a1b2c3d4e5f",
      text: `SELECT * FROM "memo" WHERE "ownerId" = ?`,
      model: "memo",
      op: "find",
      count,
      totalMs: count * 10,
      waitMs: 0,
      rows: count,
      sinceMs: 60_000,
      buckets: [0, 0, 0, 0, 0, 0, count, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      sentBy: [{ endpoint, count, totalMs: count * 10 }],
    });
    children.updateMetrics(0, { pid: 1000, statements: [statement(2, "query:memoList")] });
    children.updateMetrics(1, { pid: 1001, statements: [statement(3, "query:memoList")] });

    expect(status.statementsStatus().byTotalTime).toMatchObject([
      { fingerprint: "0a1b2c3d4e5f", count: 5, totalMs: 50, sentBy: [{ endpoint: "query:memoList", count: 5 }] },
    ]);
    expect(status.metricsStatus().children.map((child) => "statements" in child.metrics)).toEqual([false, false]);
  });
});
