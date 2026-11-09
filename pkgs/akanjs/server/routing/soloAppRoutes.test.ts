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
