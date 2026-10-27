import { describe, expect, test } from "bun:test";
import { StatusAccess } from "../ops/statusAccess";
import { createSoloAppRoutes, type SoloAppStatus } from "./soloAppRoutes";

const running: SoloAppStatus = {
  role: "all",
  running: true,
  status: "running",
  port: 8282,
  metrics: { rssBytes: 1_024, role: "all" },
};

const token = "solo-status-token";
const signedIn = () => new Request("http://app.example/", { headers: { authorization: `Bearer ${token}` } });
const anonymous = () => new Request("http://app.example/");

const routesOf = (status: SoloAppStatus | (() => SoloAppStatus), access = new StatusAccess({ tokens: [token] })) =>
  createSoloAppRoutes(typeof status === "function" ? status : () => status, null, null, access) as unknown as {
    [path: string]: { GET: (req?: Request) => Response };
  };

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
});
