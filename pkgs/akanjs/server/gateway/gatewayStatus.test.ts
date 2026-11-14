import { describe, expect, test } from "bun:test";
import path from "node:path";
import type { Logger } from "akanjs/common";
import type { AkanIpcMessage, AkanRscWorkerStatus } from "akanjs/service";
import { RestartSchedule } from "../../common/restartSchedule";
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
  const rooms = { removeChildRooms: () => undefined } as unknown as GatewayRooms;
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
});
