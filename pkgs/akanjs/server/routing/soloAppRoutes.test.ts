import { afterEach, describe, expect, test } from "bun:test";
import { TrustedProxy } from "../../common/TrustedProxy";
import { SignalContext } from "../../signal/signalContext";
import { StatusAccess } from "../ops/statusAccess";
import type { HttpRoutes } from "../types";
import { ServerLimits } from "./serverLimits";
import { createSoloAppRoutes, type SoloAppStatus } from "./soloAppRoutes";

const running: SoloAppStatus = {
  role: "all",
  running: true,
  status: "running",
  port: 8282,
  rscWorker: "ready",
  metrics: { rssBytes: 1_024, role: "all" },
};

const token = "solo-status-token";
const signedIn = () => new Request("http://app.example/", { headers: { authorization: `Bearer ${token}` } });
const anonymous = () => new Request("http://app.example/");

const routesOf = (status: SoloAppStatus | (() => SoloAppStatus), access = new StatusAccess({ tokens: [token] })) =>
  createSoloAppRoutes(typeof status === "function" ? status : () => status, null, null, access) as unknown as {
    [path: string]: { GET: (req?: Request) => Response };
  };

//? Served the way `AkanServer` serves a solo app: through every `ApiRouter` wrapper, which hands a handler the request
//? alone, with the listening server answering the peer through `SignalContext`.
const serveSolo = async (builtinRoutes: HttpRoutes) => {
  process.env.AKAN_PUBLIC_APP_NAME ??= "test";
  process.env.AKAN_PUBLIC_REPO_NAME ??= "akanjs";
  process.env.AKAN_PUBLIC_SERVE_DOMAIN ??= "example.com";
  const { ApiRouter } = await import("./apiRouter");
  const routes = ApiRouter.buildRoutes({
    prefix: "/api",
    websocketPrefix: "/ws",
    routes: {} as HttpRoutes,
    builtinRoutes,
    renderEnvRoutes: {},
    upgradeAppWs: () => false,
    bodyLimits: new ServerLimits({}),
  });
  const server = Bun.serve({ port: 0, hostname: "127.0.0.1", routes } as Parameters<typeof Bun.serve>[0]);
  servers.push(server);
  SignalContext.setHttpPeerResolver((req) => server.requestIP(req) ?? undefined);
  return (pathname: string, headers: Record<string, string>) =>
    fetch(`http://127.0.0.1:${server.port}${pathname}`, { headers });
};

const servers: { stop(force?: boolean): unknown }[] = [];
afterEach(() => {
  for (const server of servers.splice(0)) server.stop(true);
  SignalContext.setHttpPeerResolver(null);
  TrustedProxy.reset();
});

describe("solo app routes", () => {
  test("reports this process as the one child, in the gateway's own shape", async () => {
    const body = (await routesOf(running)["/_akan/app/health"].GET(signedIn()).json()) as {
      status: string;
      solo: boolean;
      children: { idx: number; role: string; ready: boolean; status: string; pid: number }[];
    };
    expect(body).toMatchObject({ status: "running", solo: true });
    // A probe reads `children[].ready && role !== "batch"`; keeping the shape is what lets it stay unchanged.
    expect(body.children as unknown).toEqual([
      { idx: 0, role: "all", status: "healthy", ready: true, pid: process.pid, upstream: expect.anything() },
    ]);
  });

  test("is not ready until the server is running", async () => {
    const starting = { ...running, running: false, status: "starting", port: null };
    const body = (await routesOf(starting)["/_akan/app/health"].GET(signedIn()).json()) as {
      children: { ready: boolean; status: string }[];
    };
    expect(body.children[0]).toMatchObject({ ready: false, status: "starting" });
  });

  test("carries the replica's metrics under the same children key the gateway uses", async () => {
    const body = (await routesOf(running)["/_akan/app/metrics"].GET(signedIn()).json()) as {
      gateway: null;
      proxyHop: null;
      children: { metrics: { rssBytes: number } }[];
    };
    expect(body.children[0]?.metrics.rssBytes).toBe(1_024);
    // No gateway means no proxy hop to report; the keys stay so a reader does not have to branch on mode.
    expect(body.gateway).toBeNull();
    expect(body.proxyHop).toBeNull();
  });

  test("renders the metrics as OpenMetrics text to a scraper that asks for it, behind the same token", async () => {
    const families = () => [
      { name: "akan_test_calls_total", help: "Calls.", type: "counter" as const, samples: [{ labels: {}, value: 4 }] },
    ];
    const routes = routesOf({ ...running, rscWorker: "restarting", families });
    const scrape = (headers: Record<string, string>) =>
      routes["/_akan/app/metrics"].GET(new Request("http://app.example/", { headers }));
    const openMetrics = "application/openmetrics-text;version=1.0.0,text/plain;version=0.0.4;q=0.5,*/*;q=0.1";

    const text = scrape({ accept: openMetrics, authorization: `Bearer ${token}` });
    expect(text.headers.get("content-type")).toBe("application/openmetrics-text; version=1.0.0; charset=utf-8");
    const body = await text.text();
    expect(body).toMatch(/^akan_build_info\{akanjs_version="[^"]+",app="[^"]+"\} 1$/m);
    expect(body).toMatch(/^process_start_time_seconds \d+(\.\d+)?$/m);
    for (const line of ["akan_test_calls_total 4", "akan_rsc_workers 1", "akan_rsc_workers_ready 0"])
      expect(body.split("\n")).toContain(line);
    expect(body.endsWith("\n# EOF\n")).toBe(true);
    expect(scrape({ accept: openMetrics }).status).toBe(401);
    const json = scrape({ accept: "application/json, text/plain, */*", authorization: `Bearer ${token}` });
    expect(json.headers.get("content-type")).toContain("application/json");
    expect(
      ((await json.json()) as { metricFamilies: { name: string }[] }).metricFamilies.map(({ name }) => name),
    ).toEqual([
      "akan_build_info",
      "process_start_time_seconds",
      "akan_test_calls_total",
      "akan_rsc_workers",
      "akan_rsc_workers_ready",
    ]);
  });

  test("tells a caller without the token the status alone, and refuses it the metrics", async () => {
    const starting = { ...running, running: false, status: "starting", port: null };
    for (const routes of [routesOf(starting), routesOf(starting, new StatusAccess({ tokens: [] }))]) {
      const health = routes["/_akan/app/health"].GET(anonymous());
      expect(health.status).toBe(200);
      expect(await health.json()).toEqual({ status: "starting" });
      const metrics = routes["/_akan/app/metrics"].GET(anonymous());
      expect(metrics.status).toBe(401);
      expect(metrics.headers.get("www-authenticate")).toBe("Bearer");
    }
  });

  test("is ready only while the server runs and its RSC worker renders, and health stays 200 meanwhile", async () => {
    let status: SoloAppStatus = { ...running, running: false, status: "starting", port: null, rscWorker: "starting" };
    const routes = routesOf(() => status);
    const ready = () => routes["/_akan/app/ready"].GET(signedIn());
    expect(ready().status).toBe(503);
    status = { ...running, rscWorker: "starting" };
    expect(ready().status).toBe(503);
    expect(routes["/_akan/app/health"].GET(signedIn()).status).toBe(200);
    status = running;
    const serving = ready();
    expect(serving.status).toBe(200);
    expect(await serving.json()).toEqual({
      status: "ready",
      ready: true,
      pid: process.pid,
      solo: true,
      children: [{ idx: 0, role: "all", status: "running", ready: true, rscWorker: "ready" }],
    });
    status = { ...running, rscWorker: "restarting" };
    expect(ready().status).toBe(503);
    status = { ...running, rscWorker: null };
    expect(ready().status).toBe(200);
  });

  test("tells a caller without the token whether it is ready, and nothing else", async () => {
    const restarting = { ...running, rscWorker: "restarting" as const };
    for (const routes of [routesOf(restarting), routesOf(restarting, new StatusAccess({ tokens: [] }))]) {
      const ready = routes["/_akan/app/ready"].GET(anonymous());
      expect(ready.status).toBe(503);
      expect(ready.headers.get("cache-control")).toBe("no-store");
      expect(await ready.json()).toEqual({ status: "unavailable" });
    }
    expect(await routesOf(running)["/_akan/app/ready"].GET(anonymous()).json()).toEqual({ status: "ready" });
  });

  test("reports the costliest statements and who sent them behind the metrics token", async () => {
    const statement = {
      fingerprint: "0a1b2c3d4e5f",
      text: `SELECT count(*) as count FROM "memo" WHERE "ownerId" = ?`,
      model: "memo",
      op: "count",
      count: 4,
      totalMs: 1_000,
      waitMs: 2,
      rows: 4,
      buckets: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0],
      sentBy: [{ endpoint: "query:memoListByOwner", count: 4, totalMs: 1_000 }],
    };
    const routes = routesOf({ ...running, statements: () => [statement] });

    expect(routes["/_akan/app/statements"].GET(anonymous()).status).toBe(401);
    const report = routes["/_akan/app/statements"].GET(signedIn());
    expect(report.headers.get("cache-control")).toBe("no-store");
    const body = (await report.json()) as { byTotalTime: unknown[]; byP95: unknown[] };
    const row = {
      fingerprint: "0a1b2c3d4e5f",
      text: statement.text,
      model: "memo",
      op: "count",
      count: 4,
      totalMs: 1_000,
      meanMs: 250,
      p95Ms: 242.5,
      waitMs: 2,
      rows: 4,
      sentBy: statement.sentBy,
    };
    expect(body).toEqual({ byTotalTime: [row], byP95: [row] });
  });

  test("answers the bench ping the gateway serves without touching a replica or asking for the token", async () => {
    expect(await routesOf(running)["/_akan/bench/ping"].GET().text()).toBe("ok");
  });

  test("reads the status at request time, not at mount time", async () => {
    let status: SoloAppStatus = { ...running, running: false, status: "starting", port: null };
    const routes = routesOf(() => status);
    status = running;
    const body = (await routes["/_akan/app/health"].GET(signedIn()).json()) as { children: { ready: boolean }[] };
    expect(body.children[0]?.ready).toBe(true);
  });

  test("refuses an address that keeps presenting a wrong token even the right one, and no other address", async () => {
    const access = new StatusAccess({ tokens: [token], failuresPerMinute: 2 });
    const get = await serveSolo(createSoloAppRoutes(() => running, null, null, access));
    const from = (address: string, presented: string) => ({
      "x-forwarded-for": address,
      authorization: `Bearer ${presented}`,
    });
    for (let attempt = 0; attempt < 2; attempt++)
      expect((await get("/_akan/app/metrics", from("198.51.100.4", "not-the-token"))).status).toBe(401);
    expect((await get("/_akan/app/metrics", from("198.51.100.4", token))).status).toBe(401);
    expect(await (await get("/_akan/app/health", from("198.51.100.4", token))).json()).toEqual({ status: "running" });
    expect((await get("/_akan/app/metrics", from("198.51.100.5", token))).status).toBe(200);
  });
});
