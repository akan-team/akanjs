import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Logger, type LogRecord, TrustedProxy } from "akanjs/common";
import { RestartSchedule } from "../../common/restartSchedule";
import { AKAN_CHILD_HOST } from "../akanAppHeaders";
import { ServerLimits } from "../routing/serverLimits";
import type { ChildSupervisor } from "./childSupervisor";
import { type ChildState, GatewayChildren } from "./gatewayChildren";
import { GatewayConfig } from "./gatewayConfig";
import { GatewayHttpProxy } from "./gatewayHttpProxy";
import type { GatewayStatus } from "./gatewayStatus";
import type { GatewayWsData } from "./gatewayWebSocketRelay";

const roots: string[] = [];
const upstreams: { stop: (closeActive?: boolean) => void }[] = [];

afterEach(async () => {
  for (const upstream of upstreams.splice(0)) upstream.stop(true);
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const server = { requestIP: () => null } as unknown as Bun.Server<GatewayWsData>;

const proxyToReplica = async (
  listen: (socketPath: string) => { stop: (closeActive?: boolean) => void },
  realLogger?: Logger,
) => {
  const root = await mkdtemp(path.join(tmpdir(), "akan-proxy-"));
  roots.push(root);
  const socketPath = path.join(root, "replica.sock");
  upstreams.push(listen(socketPath));
  const warnings: string[] = [];
  const restarts: string[] = [];
  const logger =
    realLogger ?? ({ warn: (message: string) => warnings.push(message), error: () => undefined } as unknown as Logger);
  const config = new GatewayConfig(path.join(root, "server.ts"), { replica: 1, runtimeDir: root, port: 0 });
  const children = new GatewayChildren(logger);
  children.set(0, {
    idx: 0,
    role: "all",
    proc: { killed: false } as unknown as ChildState["proc"],
    ready: true,
    status: "ready",
    upstream: { type: "unix", socketPath },
    metrics: {},
    restart: new RestartSchedule(config.childRestartPolicy),
    restartCount: 0,
    restartPending: false,
  });
  const supervisor = {
    scheduleRestart: (_child: unknown, _proc: unknown, reason: string) => restarts.push(reason),
    crashLoopDetail: () => null,
  } as unknown as ChildSupervisor;
  const status = { recordProxyHop: () => undefined } as unknown as GatewayStatus;
  const proxy = new GatewayHttpProxy({ config, children, supervisor, status, limits: new ServerLimits(), logger });
  return { proxy, warnings, restarts };
};

describe("GatewayHttpProxy", () => {
  test("answers a replica that closes the connection mid-request with a 502, and restarts nothing", async () => {
    const { proxy, warnings, restarts } = await proxyToReplica((socketPath) =>
      Bun.listen({ unix: socketPath, socket: { data: (socket) => void socket.end() } }),
    );

    const page = await proxy.proxyHttp(
      new Request("http://localhost/orders", { headers: { accept: "text/html" } }),
      server,
    );
    const api = await proxy.proxyHttp(new Request("http://localhost/api/orders"), server);

    expect(page.status).toBe(502);
    expect(await page.text()).toContain("Backend dropped the connection");
    expect(api.status).toBe(502);
    expect(await api.text()).toBe("The replica closed the connection before it finished answering.");
    expect(restarts).toEqual([]);
    expect(warnings).toEqual([
      "Child 0/all closed the connection mid-request (GET /orders)",
      "Child 0/all closed the connection mid-request (GET /api/orders)",
    ]);
  });

  test("turns a redirect to the replica's own host into a path, and passes any other Location as it came", async () => {
    const locations: Record<string, string> = {
      "/internal": `http://${AKAN_CHILD_HOST}/signin?next=%2Forders#form`,
      "/external": "https://accounts.example.com/authorize?client=app",
      "/relative": "/signin?next=%2Forders",
    };
    const { proxy } = await proxyToReplica((socketPath) =>
      Bun.serve({
        unix: socketPath,
        fetch: (req) =>
          new Response(null, { status: 302, headers: { location: locations[new URL(req.url).pathname] ?? "/" } }),
      }),
    );
    const locationOf = async (pathname: string) =>
      (await proxy.proxyHttp(new Request(`http://localhost${pathname}`), server)).headers.get("location");

    expect(await locationOf("/internal")).toBe("/signin?next=%2Forders#form");
    expect(await locationOf("/external")).toBe("https://accounts.example.com/authorize?client=app");
    expect(await locationOf("/relative")).toBe("/signin?next=%2Forders");
  });

  test("answers with the id it handed the replica, and never one an untrusted caller chose", async () => {
    const inbound = "0af7651916cd43dd8448eb211c80319c";
    const handed: (string | null)[][] = [];
    const { proxy } = await proxyToReplica((socketPath) =>
      Bun.serve({
        unix: socketPath,
        fetch: (req) => {
          handed.push(["x-request-id", "traceparent", "x-akan-trace-link"].map((name) => req.headers.get(name)));
          return new URL(req.url).pathname === "/silent"
            ? new Response("replica")
            : new Response("replica", { headers: { "x-request-id": req.headers.get("x-request-id") ?? "" } });
        },
      }),
    );
    const from = (address: string) => ({ requestIP: () => ({ address, port: 40_000, family: "IPv4" }) });
    const ask = async (path: string, headers: Record<string, string>, address: string) =>
      (
        await proxy.proxyHttp(
          new Request(`http://localhost${path}`, { headers }),
          from(address) as unknown as Bun.Server<GatewayWsData>,
        )
      ).headers.get("x-request-id");

    const traceparent = `00-${inbound}-b7ad6b7169203331-01`;
    const forged = await ask("/api/orders", { "x-request-id": inbound }, "198.51.100.7");
    const viaIngress = await ask("/api/orders", { traceparent }, "10.0.0.5");
    const viaLoopback = await ask("/api/orders", { traceparent }, "127.0.0.1");
    const silent = await ask("/silent", {}, "198.51.100.7");
    process.env.AKAN_TRACE_ADOPT = "trusted-proxies";
    TrustedProxy.configure("10.0.0.5");
    let relayed: string | null;
    try {
      relayed = await ask("/api/orders", { traceparent }, "10.0.0.5");
    } finally {
      delete process.env.AKAN_TRACE_ADOPT;
      TrustedProxy.reset();
    }

    const minted = [forged, viaIngress, viaLoopback, silent];
    for (const id of minted) {
      expect(id).toMatch(/^[0-9a-f]{32}$/);
      expect(id).not.toBe(inbound);
    }
    expect(new Set(minted).size).toBe(4);
    expect(relayed).toBe(inbound);
    expect(handed.map(([requestId]) => requestId)).toEqual([...minted, relayed]);
    expect(handed.map(([, sent]) => sent?.split("-")[1])).toEqual([...minted, relayed] as string[]);
    expect(handed.map(([, , link]) => link)).toEqual([inbound, inbound, inbound, null, null]);
  });

  test("names the request's id on an answer of its own, and on the log line of the hop that failed", async () => {
    const records: LogRecord[] = [];
    const removeSink = Logger.addSink((entry) => void records.push(entry.record));
    let answer: Response;
    try {
      const { proxy } = await proxyToReplica(
        (socketPath) => Bun.listen({ unix: socketPath, socket: { data: (socket) => void socket.end() } }),
        new Logger("GatewayProxyTest"),
      );
      answer = await proxy.proxyHttp(new Request("http://localhost/api/orders"), server);
    } finally {
      removeSink();
    }

    const id = answer.headers.get("x-request-id");
    expect(answer.status).toBe(502);
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(records.filter((record) => record.name === "GatewayProxyTest").map((record) => record.traceId)).toEqual([
      id,
    ]);
  });
});
