import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Logger, logSeverity } from "akanjs/common";
import type { Adaptor } from "akanjs/service";
import { RestartSchedule } from "../common/restartSchedule";
import type { EndpointInfo } from "../signal/endpointInfo";
import { SignalFailure } from "../signal/SignalFailure";
import { SignalContext } from "../signal/signalContext";
import type { ChildSupervisor } from "./gateway/childSupervisor";
import { type ChildState, GatewayChildren } from "./gateway/gatewayChildren";
import { GatewayConfig } from "./gateway/gatewayConfig";
import { GatewayHttpProxy } from "./gateway/gatewayHttpProxy";
import type { GatewayStatus } from "./gateway/gatewayStatus";
import type { GatewayWsData } from "./gateway/gatewayWebSocketRelay";
import { OtlpConfigReader } from "./otlp/otlpConfig";
import { OtlpExporter } from "./otlp/otlpExporter";
import { ApiRouter } from "./routing/apiRouter";
import { ServerLimits } from "./routing/serverLimits";
import { RscWorker } from "./rscWorkerHost";
import type { BaseBuildArtifact, HttpRoutes } from "./types";

interface Attr {
  key: string;
  value: { stringValue?: string; intValue?: string; boolValue?: boolean; doubleValue?: number };
}
interface Span {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: number;
  attributes?: Attr[];
  status?: { code: number };
  events?: { name: string; attributes: Attr[] }[];
  resource: Record<string, unknown>;
}
interface LogLine {
  traceId?: string;
  spanId?: string;
  body: { stringValue: string };
  attributes: Attr[];
  resource: Record<string, unknown>;
}

const stranger = { requestIP: () => ({ address: "203.0.113.9", port: 50_000, family: "IPv4" }) };
const flat = (attributes: Attr[] = []) =>
  Object.fromEntries(
    attributes.map(({ key, value }) => [
      key,
      value.stringValue ?? value.boolValue ?? value.doubleValue ?? Number(value.intValue),
    ]),
  );

const received = { spans: [] as Span[], logs: [] as LogLine[], authorization: [] as (string | null)[] };
const serveCollector = (port = 0) =>
  Bun.serve({
    hostname: "127.0.0.1",
    port,
    fetch: async (req) => {
      received.authorization.push(req.headers.get("authorization"));
      const body = await req.json();
      for (const { resource, scopeSpans = [] } of body.resourceSpans ?? [])
        for (const scope of scopeSpans)
          for (const span of scope.spans) received.spans.push({ ...span, resource: flat(resource.attributes) });
      for (const { resource, scopeLogs = [] } of body.resourceLogs ?? [])
        for (const scope of scopeLogs)
          for (const line of scope.logRecords) received.logs.push({ ...line, resource: flat(resource.attributes) });
      return Response.json({});
    },
  });

let collector: Bun.Server<unknown>;
let collectorPort = 0;
let root = "";
let rsc: RscWorker;
let replica: Bun.Server<unknown>;
let gateway: GatewayHttpProxy;
let host: OtlpExporter;
const savedEnv: Record<string, string | undefined> = {};

const segmentOutlet = "pkgs/akanjs/server/rscSegmentOutlet.tsx";
const endpoint = { logger: new Logger("Replica") } as unknown as Adaptor;
const endpointInfo = {
  type: "query",
  signalOption: {},
  getPath: (key: string) => `/api/${key}`,
} as unknown as EndpointInfo;

beforeAll(async () => {
  collector = serveCollector();
  collectorPort = collector.port ?? 0;
  const endpointUrl = `http://127.0.0.1:${collectorPort}`;
  const workerEnv: Record<string, string> = {
    NODE_ENV: "production",
    AKAN_RSC_WORKER_PATH: path.join(import.meta.dir, "rscWorker.tsx"),
    AKAN_PUBLIC_APP_NAME: "otlpexport",
    AKAN_PUBLIC_REPO_NAME: "akanjs",
    AKAN_PUBLIC_SERVE_DOMAIN: "localhost",
    OTEL_EXPORTER_OTLP_ENDPOINT: endpointUrl,
    OTEL_LOGS_EXPORTER: "otlp",
    OTEL_EXPORTER_OTLP_HEADERS: "authorization=Bearer%20never-logged",
    // Long enough that the worker's spans reach the collector only through its flush on SIGTERM.
    OTEL_BSP_SCHEDULE_DELAY: "60000",
    OTEL_BLRP_SCHEDULE_DELAY: "60000",
  };
  for (const key of Object.keys(workerEnv)) savedEnv[key] = process.env[key];
  Object.assign(process.env, workerEnv);
  SignalFailure.reset();

  const config = new OtlpConfigReader(
    {
      OTEL_EXPORTER_OTLP_ENDPOINT: endpointUrl,
      OTEL_SERVICE_NAME: "otlpexport",
      OTEL_EXPORTER_OTLP_TIMEOUT: "300",
      OTEL_BSP_SCHEDULE_DELAY: "30",
      OTEL_BLRP_SCHEDULE_DELAY: "30",
      OTEL_BSP_MAX_QUEUE_SIZE: "16",
      OTEL_BSP_MAX_EXPORT_BATCH_SIZE: "8",
    },
    () => undefined,
  ).read("federation");
  if (!config) throw new TypeError("the test's OTLP settings were refused");
  host = new OtlpExporter(config);

  root = await mkdtemp(path.join(tmpdir(), "akan-otlp-export-"));
  rsc = new RscWorker({
    pagesBundlePath: path.join(import.meta.dir, "requestIdPropagation.fixture.tsx"),
    pagesBundleBuildId: 1,
    rscRuntimeClientManifest: {
      [`${segmentOutlet}#AkanSegmentOutlet`]: { id: segmentOutlet, chunks: [], name: "AkanSegmentOutlet" },
    },
  } as unknown as BaseBuildArtifact);
  await rsc.ready;
  rsc.setLogLevel(logSeverity.warn);

  const routes = ApiRouter.buildRoutes({
    prefix: "/api",
    websocketPrefix: "/ws",
    routes: {
      "/boom": () =>
        SignalContext.try(endpoint, endpointInfo, "boom", async () => {
          throw new TypeError("driver broke for alice@example.com");
        }),
    } as unknown as HttpRoutes,
    renderEnvRoutes: {
      "/*": async (req: Request) => {
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
  const gatewayConfig = new GatewayConfig(path.join(root, "server.ts"), { replica: 1, runtimeDir: root, port: 0 });
  const children = new GatewayChildren(gatewayLogger);
  children.set(0, {
    idx: 0,
    role: "all",
    proc: { killed: false } as unknown as ChildState["proc"],
    ready: true,
    status: "ready",
    upstream: { type: "unix", socketPath },
    metrics: {},
    restart: new RestartSchedule(gatewayConfig.childRestartPolicy),
    restartCount: 0,
    restartPending: false,
  });
  gateway = new GatewayHttpProxy({
    config: gatewayConfig,
    children,
    supervisor: { crashLoopDetail: () => null } as unknown as ChildSupervisor,
    status: { recordProxyHop: () => gatewayLogger.warn("gateway relayed a request") } as unknown as GatewayStatus,
    limits: new ServerLimits(),
    logger: gatewayLogger,
  });
});

afterAll(async () => {
  await host.stop(200);
  SignalContext.setHttpPeerResolver(null);
  replica.stop(true);
  rsc.kill();
  collector.stop(true);
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  SignalFailure.reset();
  await rm(root, { recursive: true, force: true });
});

let asked = 0;
const ask = async (pathname: string) => {
  asked += 1;
  const response = await gateway.proxyHttp(
    new Request(`http://localhost${pathname}?view=${asked}&email=alice@example.com`),
    stranger as unknown as Bun.Server<GatewayWsData>,
  );
  return { status: response.status, id: response.headers.get("x-request-id") ?? "", body: await response.text() };
};

const until = async <T>(read: () => T | undefined, ms = 3_000): Promise<T | undefined> => {
  const deadline = Date.now() + ms;
  for (;;) {
    const value = read();
    if (value !== undefined || Date.now() > deadline) return value;
    await Bun.sleep(10);
  }
};

const spansOf = (traceId: string) => received.spans.filter((span) => span.traceId === traceId);

describe("OTLP export from the gateway, the replica and the RSC worker", () => {
  test("a crashed API call fails its spans with the error's type and code, and exports no query string or message", async () => {
    const failed = await ask("/api/boom");
    const spans = await until(() => (spansOf(failed.id).length >= 3 ? spansOf(failed.id) : undefined));
    const [gatewaySpan, replicaSpan, signalSpan] = ["GET", "GET /api/boom", "query:boom"].map((name) =>
      spans?.find((span) => span.name === name),
    );

    expect(failed.status).toBe(500);
    expect(gatewaySpan).toMatchObject({ kind: 2, status: { code: 2 } });
    expect(gatewaySpan?.parentSpanId).toBeUndefined();
    expect(replicaSpan).toMatchObject({ kind: 2, parentSpanId: gatewaySpan?.spanId, status: { code: 2 } });
    expect(flat(replicaSpan?.attributes)).toMatchObject({
      "http.route": "/api/boom",
      "http.response.status_code": 500,
    });
    expect(signalSpan).toMatchObject({ kind: 1, parentSpanId: replicaSpan?.spanId, status: { code: 2 } });
    expect(signalSpan?.events?.map((event) => flat(event.attributes))).toEqual([
      { "exception.type": "TypeError", "exception.message": "internalError" },
    ]);
    expect(JSON.stringify(received.spans)).not.toContain("alice");
  });

  test("with the collector stopped, requests are answered as before and what cannot be sent is dropped and counted", async () => {
    collector.stop(true);
    const answers = [];
    for (let i = 0; i < 6; i++) answers.push((await ask(i % 2 ? "/en/hello" : "/api/boom")).status);
    await until(() => (host.spans?.stats.dropped ? true : undefined));

    expect(answers).toEqual([500, 200, 500, 200, 500, 200]);
    expect(host.spans?.stats.dropped).toBeGreaterThan(0);
    expect(host.spans?.stats.queued).toBeLessThanOrEqual(16);
    collector = serveCollector(collectorPort);
  });

  test("a page view is one trace: the gateway's span, the replica's under it, the worker's render under that, and its log line", async () => {
    const page = await ask("/en/hello");
    const hostSpans = await until(() => (spansOf(page.id).length >= 2 ? spansOf(page.id) : undefined));
    expect(hostSpans?.map((span) => span.name).sort()).toEqual(["GET", "GET /*"]);

    rsc.kill();
    const render = await until(() => spansOf(page.id).find((span) => span.name === "page:/:lang/hello"));
    const gatewaySpan = spansOf(page.id).find((span) => span.name === "GET");
    const replicaSpan = spansOf(page.id).find((span) => span.name === "GET /*");
    const line = await until(() =>
      received.logs.find((log) => log.body.stringValue === "hello page rendering" && log.traceId === page.id),
    );

    expect(page.status).toBe(200);
    expect(gatewaySpan?.parentSpanId).toBeUndefined();
    expect(replicaSpan?.parentSpanId).toBe(gatewaySpan?.spanId);
    expect(render?.parentSpanId).toBe(replicaSpan?.spanId);
    expect(render?.resource).toMatchObject({ "akan.process.role": "rsc-worker", "service.name": "otlpexport" });
    expect(render?.resource["process.pid"]).not.toBe(process.pid);
    expect(line).toMatchObject({ traceId: page.id, spanId: render?.spanId });
    expect(flat(line?.attributes)).toMatchObject({ "akan.endpoint": "page:/:lang/hello" });
    expect(received.authorization).toContain("Bearer never-logged");
    expect(JSON.stringify(received.logs)).not.toContain("never-logged");
    expect(new Set(received.logs.map((log) => log.resource["akan.process.role"]))).toEqual(new Set(["rsc-worker"]));
  });
});
