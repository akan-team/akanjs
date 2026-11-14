import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Logger, type LogRecord, logSeverity, TrustedProxy } from "akanjs/common";
import type { Adaptor } from "akanjs/service";
import { RestartSchedule } from "../common/restartSchedule";
import type { EndpointInfo } from "../signal/endpointInfo";
import { SignalFailure } from "../signal/SignalFailure";
import { SignalContext } from "../signal/signalContext";
import { setTraceEnabled } from "../signal/trace";
import type { ChildSupervisor } from "./gateway/childSupervisor";
import { type ChildState, GatewayChildren } from "./gateway/gatewayChildren";
import { GatewayConfig } from "./gateway/gatewayConfig";
import { GatewayHttpProxy } from "./gateway/gatewayHttpProxy";
import type { GatewayStatus } from "./gateway/gatewayStatus";
import type { GatewayWsData } from "./gateway/gatewayWebSocketRelay";
import { ApiRouter } from "./routing/apiRouter";
import { ServerLimits } from "./routing/serverLimits";
import { RscWorker } from "./rscWorkerHost";
import type { BaseBuildArtifact, HttpRoutes } from "./types";

const hex32 = /^[0-9a-f]{32}$/;
const forged = "0af7651916cd43dd8448eb211c80319c";
const stranger = { requestIP: () => ({ address: "203.0.113.9", port: 50_000, family: "IPv4" }) };
const ingress = { requestIP: () => ({ address: "10.0.0.5", port: 443, family: "IPv4" }) };

const workerEnv: Record<string, string> = {
  NODE_ENV: "production",
  AKAN_RSC_WORKER_PATH: path.join(import.meta.dir, "rscWorker.tsx"),
  AKAN_PUBLIC_APP_NAME: "requestid",
  AKAN_PUBLIC_REPO_NAME: "akanjs",
  AKAN_PUBLIC_SERVE_DOMAIN: "localhost",
};
const savedEnv = Object.fromEntries(Object.keys(workerEnv).map((key) => [key, process.env[key]]));
const hostLogs: LogRecord[] = [];
const workerLogs: LogRecord[] = [];
let root = "";
let rsc: RscWorker;
let replica: Bun.Server<unknown>;
let gateway: GatewayHttpProxy;
let removeSink: () => void = () => undefined;

const segmentOutlet = "pkgs/akanjs/server/rscSegmentOutlet.tsx";
const endpoint = { logger: new Logger("Replica") } as unknown as Adaptor;
const endpointInfo = {
  type: "query",
  signalOption: {},
  getPath: (key: string) => `/api/${key}`,
} as unknown as EndpointInfo;

beforeAll(async () => {
  Object.assign(process.env, workerEnv);
  SignalFailure.reset();
  root = await mkdtemp(path.join(tmpdir(), "akan-request-id-"));
  rsc = new RscWorker({
    pagesBundlePath: path.join(import.meta.dir, "requestIdPropagation.fixture.tsx"),
    pagesBundleBuildId: 1,
    rscRuntimeClientManifest: {
      [`${segmentOutlet}#AkanSegmentOutlet`]: { id: segmentOutlet, chunks: [], name: "AkanSegmentOutlet" },
    },
  } as unknown as BaseBuildArtifact);
  rsc.onLogRecords = (records) => workerLogs.push(...records);
  await rsc.ready;
  rsc.setLogLevel(logSeverity.warn);

  const routes = ApiRouter.buildRoutes({
    prefix: "/api",
    websocketPrefix: "/ws",
    routes: {
      "/boom": () =>
        SignalContext.try(endpoint, endpointInfo, "boom", async () => {
          throw new TypeError("driver broke");
        }),
    } as unknown as HttpRoutes,
    renderEnvRoutes: {
      "/*": async (req: Request) => {
        new Logger("Replica").warn("replica answering a page");
        const result = await rsc.renderWithMeta(req, {});
        return result.type === "stream" ? new Response(result.stream) : new Response(null, { status: 404 });
      },
    } as unknown as HttpRoutes,
    upgradeAppWs: () => false,
  });
  const socketPath = path.join(root, "replica.sock");
  replica = Bun.serve({ unix: socketPath, routes } as Parameters<typeof Bun.serve>[0]);
  SignalContext.setHttpPeerResolver((req) => replica.requestIP(req as Bun.BunRequest));

  const gatewayLogger = new Logger("Gateway");
  const config = new GatewayConfig(path.join(root, "server.ts"), { replica: 1, runtimeDir: root, port: 0 });
  const children = new GatewayChildren(gatewayLogger);
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
  gateway = new GatewayHttpProxy({
    config,
    children,
    supervisor: { crashLoopDetail: () => null } as unknown as ChildSupervisor,
    status: { recordProxyHop: () => gatewayLogger.warn("gateway relayed a request") } as unknown as GatewayStatus,
    limits: new ServerLimits(),
    logger: gatewayLogger,
  });
  setTraceEnabled(true);
  removeSink = Logger.addSink((entry) => void hostLogs.push(entry.record));
});

afterAll(async () => {
  removeSink();
  setTraceEnabled(false);
  SignalContext.setHttpPeerResolver(null);
  TrustedProxy.reset();
  replica.stop(true);
  rsc.kill();
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  SignalFailure.reset();
  await rm(root, { recursive: true, force: true });
});

let asked = 0;
const ask = async (pathname: string, headers: Record<string, string> = {}, from: unknown = stranger) => {
  hostLogs.length = 0;
  workerLogs.length = 0;
  asked += 1;
  const response = await gateway.proxyHttp(
    new Request(`http://localhost${pathname}?view=${asked}`, { headers }),
    from as Bun.Server<GatewayWsData>,
  );
  return { response, id: response.headers.get("x-request-id") ?? "", body: await response.text() };
};

const workerLine = async (message: string) => {
  for (let attempt = 0; attempt < 150; attempt++) {
    const record = workerLogs.find((entry) => entry.message.includes(message));
    if (record) return record;
    await Bun.sleep(20);
  }
  return undefined;
};

const hostLine = (name: string) => hostLogs.find((record) => record.name === name);

describe("one request id from the gateway to the replica to the RSC worker", () => {
  test("a page view carries one id on the response and on the log lines of all three", async () => {
    const page = await ask("/en/hello");
    const rendering = await workerLine("hello page rendering");

    expect(page.response.status).toBe(200);
    expect(page.body).toContain("hello");
    expect(page.id).toMatch(hex32);
    expect(hostLine("Gateway")).toMatchObject({ message: "gateway relayed a request", traceId: page.id });
    expect(hostLine("Replica")).toMatchObject({ message: "replica answering a page", traceId: page.id });
    expect(rendering).toMatchObject({ role: "rsc-worker", traceId: page.id, endpoint: "page:/:lang/hello" });
    expect(rendering?.pid).not.toBe(process.pid);
  });

  test("the id an untrusted client sends is adopted by none of them, as x-request-id or as traceparent", async () => {
    const sent: Record<string, string>[] = [
      { "x-request-id": forged },
      { traceparent: `00-${forged}-b7ad6b7169203331-01` },
    ];
    for (const headers of sent) {
      const page = await ask("/en/hello", headers);
      const rendering = await workerLine("hello page rendering");

      expect(page.id).toMatch(hex32);
      expect(page.id).not.toBe(forged);
      expect([hostLine("Gateway")?.traceId, hostLine("Replica")?.traceId, rendering?.traceId]).toEqual([
        page.id,
        page.id,
        page.id,
      ]);
    }
  });

  test("a trusted proxy's id is the one all three write", async () => {
    const page = await ask("/en/hello", { traceparent: `00-${forged}-b7ad6b7169203331-01` }, ingress);
    const rendering = await workerLine("hello page rendering");

    expect(page.id).toBe(forged);
    expect([hostLine("Gateway")?.traceId, hostLine("Replica")?.traceId, rendering?.traceId]).toEqual([
      forged,
      forged,
      forged,
    ]);
  });

  test("a failed call's body names the id its response and its log line carry", async () => {
    const failed = await ask("/api/boom", { "x-request-id": forged });
    const body = JSON.parse(failed.body) as { traceId?: string; error?: string; statusCode?: number };

    expect(failed.response.status).toBe(500);
    expect(body).toMatchObject({ error: "Internal Server Error", statusCode: 500, traceId: failed.id });
    expect(failed.id).toMatch(hex32);
    expect(failed.id).not.toBe(forged);
    expect(hostLogs.find((record) => record.level === "error")).toMatchObject({ traceId: failed.id });
    expect(hostLine("Gateway")?.traceId).toBe(failed.id);
  });
});
