import { describe, expect, test } from "bun:test";
import { createSoloAppRoutes, type SoloAppStatus } from "./soloAppRoutes";

const running: SoloAppStatus = {
  role: "all",
  running: true,
  status: "running",
  port: 8282,
  metrics: { rssBytes: 1_024, role: "all" },
};

const routesOf = (status: SoloAppStatus) =>
  createSoloAppRoutes(() => status) as unknown as {
    [path: string]: { GET: () => Response };
  };

describe("solo app routes", () => {
  test("reports this process as the one child, in the gateway's own shape", async () => {
    const body = (await routesOf(running)["/_akan/app/health"].GET().json()) as {
      status: string;
      solo: boolean;
      children: { idx: number; role: string; ready: boolean; status: string; pid: number }[];
    };
    expect(body).toMatchObject({ status: "running", solo: true });
    // A probe reads `children[].ready && role !== "batch"`; keeping the shape is what lets it stay unchanged.
    expect(body.children).toEqual([
      { idx: 0, role: "all", status: "healthy", ready: true, pid: process.pid, upstream: expect.anything() },
    ]);
  });

  test("is not ready until the server is running", async () => {
    const starting = { ...running, running: false, status: "starting", port: null };
    const body = (await routesOf(starting)["/_akan/app/health"].GET().json()) as {
      children: { ready: boolean; status: string }[];
    };
    expect(body.children[0]).toMatchObject({ ready: false, status: "starting" });
  });

  test("carries the replica's metrics under the same children key the gateway uses", async () => {
    const body = (await routesOf(running)["/_akan/app/metrics"].GET().json()) as {
      gateway: null;
      proxyHop: null;
      children: { metrics: { rssBytes: number } }[];
    };
    expect(body.children[0]?.metrics.rssBytes).toBe(1_024);
    // No gateway means no proxy hop to report; the keys stay so a reader does not have to branch on mode.
    expect(body.gateway).toBeNull();
    expect(body.proxyHop).toBeNull();
  });

  test("answers the bench ping the gateway serves without touching a replica", async () => {
    expect(await routesOf(running)["/_akan/bench/ping"].GET().text()).toBe("ok");
  });

  test("reads the status at request time, not at mount time", async () => {
    let status: SoloAppStatus = { ...running, running: false, status: "starting", port: null };
    const routes = createSoloAppRoutes(() => status) as unknown as { [p: string]: { GET: () => Response } };
    status = running;
    const body = (await routes["/_akan/app/health"].GET().json()) as { children: { ready: boolean }[] };
    expect(body.children[0]?.ready).toBe(true);
  });
});
