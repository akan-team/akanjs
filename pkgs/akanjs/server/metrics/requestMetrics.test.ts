import { describe, expect, spyOn, test } from "bun:test";
import { AkanError } from "akanjs/base";
import { Logger } from "akanjs/common";
import { type AkanMetricFamily, getDefaultInjectRegistry, getDefaultLiveRegistry } from "akanjs/service";
import { endpoint } from "../../signal/endpoint";
import { Public } from "../../signal/guards";
import { StatusAccess } from "../ops/statusAccess";
import { makeEnv, serverResolverTestServiceModel } from "../resolver/resolver.contract.fixture";
import { SignalResolver } from "../resolver/signal.resolver";
import { createSoloAppRoutes } from "../routing/soloAppRoutes";
import { metricRegistry } from "./metricRegistry";

class MeteredEndpoint extends endpoint(serverResolverTestServiceModel, (builder) => ({
  meteredAnswer: builder.query(String, { guards: [Public] }).exec(() => "answer"),
  meteredRefusal: builder.query(String, { guards: [Public] }).exec(() => {
    throw new AkanError("meteredRefusal", "Refused for the test.", { statusCode: 503 });
  }),
  meteredEcho: builder
    .message(String, { guards: [Public] })
    .msg("text", String)
    .exec((text) => {
      if (text === "missing") throw new AkanError("meteredMissing", "Missing for the test.", { statusCode: 404 });
      return `echo:${text}`;
    }),
})) {}

const resolved = () =>
  SignalResolver.resolveEndpoint(MeteredEndpoint, new MeteredEndpoint(), {
    registry: getDefaultInjectRegistry(),
    env: makeEnv(),
    live: getDefaultLiveRegistry(),
    middleware: new Map(),
  });

const token = "metrics-status-token";

const call = async (routes: Record<string, unknown>, key: string) => {
  const path = Object.keys(routes).find((route) => route.endsWith(`/${key}`)) ?? "";
  const route = routes[path] as { GET: (req: Bun.BunRequest) => Promise<Response> };
  const req = { url: `http://localhost${path}`, params: {}, headers: new Headers(), json: async () => ({}) };
  return await route.GET(req as unknown as Bun.BunRequest);
};

const scrape = async () => {
  const routes = createSoloAppRoutes(
    () => ({
      role: "all",
      running: true,
      status: "running",
      port: 8282,
      rscWorker: null,
      metrics: { role: "all" },
      families: () => metricRegistry.snapshot({ role: "all" }),
    }),
    null,
    null,
    new StatusAccess({ tokens: [token] }),
  ) as unknown as { [path: string]: { GET: (req: Request) => Response } };
  const req = new Request("http://app.example/", { headers: { authorization: `Bearer ${token}` } });
  return ((await routes["/_akan/app/metrics"].GET(req).json()) as { metricFamilies: AkanMetricFamily[] })
    .metricFamilies;
};

const callsOf = (families: AkanMetricFamily[], endpointLabel: string): Record<string, string | number>[] => {
  const family = families.find(({ name }) => name === "akan_endpoint_requests_total");
  if (family?.type !== "counter") return [];
  return family.samples
    .filter(({ labels }) => labels.endpoint === endpointLabel)
    .map(({ labels, value }) => ({ ...labels, value }));
};

describe("endpoint request metrics", () => {
  test("a solo server's scrape counts each endpoint's calls by status class, and times them", async () => {
    const { routes = {} } = resolved();
    for (let idx = 0; idx < 3; idx++) expect((await call(routes, "meteredAnswer")).status).toBe(200);
    const logged = spyOn(Logger, "emit").mockImplementation(() => undefined);
    try {
      expect((await call(routes, "meteredRefusal")).status).toBe(503);
    } finally {
      logged.mockRestore();
    }
    const families = await scrape();

    expect(callsOf(families, "query:meteredAnswer")).toEqual([
      { role: "all", endpoint: "query:meteredAnswer", status_class: "2xx", value: 3 },
    ]);
    expect(callsOf(families, "query:meteredRefusal")).toEqual([
      { role: "all", endpoint: "query:meteredRefusal", status_class: "5xx", value: 1 },
    ]);
    const latency = families.find(({ name }) => name === "akan_endpoint_request_duration_seconds");
    const timed = latency?.type === "histogram" ? latency.samples : [];
    const answered = timed.find(({ labels }) => labels.endpoint === "query:meteredAnswer");
    expect(answered?.count).toBe(3);
    expect(answered?.counts.reduce((total, count) => total + count, 0)).toBe(3);
  });

  test("counts a websocket message its route answers by the status its failure answers with, and passes the failure on", async () => {
    const { wsRoutes = {} } = resolved();
    const ws = { data: {}, subscribe: () => undefined, unsubscribe: () => undefined } as unknown as Bun.ServerWebSocket;
    const before = callsOf(metricRegistry.snapshot(), "message:meteredEcho");
    expect(await wsRoutes.meteredEcho(ws, ["hi"], "message")).toEqual({
      type: "msg",
      key: "meteredEcho",
      data: "echo:hi",
    });
    const logged = spyOn(Logger, "emit").mockImplementation(() => undefined);
    try {
      await expect(wsRoutes.meteredEcho(ws, ["missing"], "message")).rejects.toMatchObject({ code: "meteredMissing" });
    } finally {
      logged.mockRestore();
    }

    expect(before).toEqual([]);
    expect(callsOf(metricRegistry.snapshot(), "message:meteredEcho")).toEqual([
      { endpoint: "message:meteredEcho", status_class: "2xx", value: 1 },
      { endpoint: "message:meteredEcho", status_class: "4xx", value: 1 },
    ]);
  });
});
