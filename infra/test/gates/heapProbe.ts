import { heapStats } from "bun:jsc";
import { AccountMiddleware } from "@libs/shared/srvkit";
import { Int } from "akanjs/base";
import { ConstantRegistry, via } from "akanjs/constant";
import { getDefaultInjectRegistry, getDefaultLiveRegistry, ServiceModel, serve } from "akanjs/service";
import { endpoint, Logging, type MiddlewareCls, Public, Timeout } from "akanjs/signal";
import { MachineAccount } from "../../../pkgs/akanjs/server/machine";
import { SignalResolver } from "../../../pkgs/akanjs/server/resolver/signal.resolver";

/**
 * What a signal call leaves behind once it has answered: the route handler is called in batches, the heap is
 * collected between them, and the growth from one batch to the next is divided by the calls it took. A call that
 * answered keeps nothing, so a steady state reads near zero bytes a call. Prints JSON.
 */
const benchEnv = {
  AKAN_PUBLIC_REPO_NAME: "akanjs",
  AKAN_PUBLIC_SERVE_DOMAIN: "akanjs.com",
  AKAN_PUBLIC_APP_NAME: "minimal",
  AKAN_PUBLIC_ENV: "local",
  AKAN_PUBLIC_OPERATION_MODE: "local",
  AKAN_PUBLIC_LOG_LEVEL: "warn",
} as const;
for (const [key, value] of Object.entries(benchEnv)) process.env[key] ??= value;

const HeapProbeItem = via((f) => ({ title: f(String), count: f(Int), tags: f([String]) }));
ConstantRegistry.buildScalar("heapProbeItem", HeapProbeItem, { HeapProbeItem });

class HeapProbeService extends serve("heapProbe" as const, () => ({})) {}
const heapProbe = ServiceModel.from(HeapProbeService);
const item = Object.assign(new HeapProbeItem(), { title: "Alpha", count: 3, tags: ["a", "b"] });
const items = Array.from({ length: 20 }, () => item);

class HeapProbeEndpoint extends endpoint(heapProbe, ({ query }) => ({
  ping: query(String, { guards: [Public] }).exec(() => "ok"),
  itemList: query([HeapProbeItem], { guards: [Public] })
    .search("limit", Int)
    .exec(() => items),
})) {}

type RouteTable = Record<string, { GET?: (req: Bun.BunRequest) => Promise<Response | undefined> }>;

class HeapProbe {
  static readonly #batch = 20_000;
  readonly #routes: RouteTable;

  constructor() {
    const middleware = new Map<string, MiddlewareCls>([
      [Logging.refName, Logging],
      [Timeout.refName, Timeout],
      [AccountMiddleware.refName, AccountMiddleware as unknown as MiddlewareCls],
      [MachineAccount.refName, MachineAccount as unknown as MiddlewareCls],
    ]);
    this.#routes = SignalResolver.resolveEndpoint(HeapProbeEndpoint, new HeapProbeEndpoint(), {
      registry: getDefaultInjectRegistry(),
      env: {},
      live: getDefaultLiveRegistry(),
      middleware,
    }).routes as RouteTable;
  }

  static #request(url: string) {
    return Object.assign(new Request(url), { params: {}, cookies: new Bun.CookieMap() }) as Bun.BunRequest;
  }

  static #settledHeap() {
    Bun.gc(true);
    Bun.gc(true);
    return heapStats().heapSize;
  }

  async #batchOf(path: string, url: string) {
    const handler = this.#routes[path]?.GET;
    if (!handler) throw new Error(`No GET route at ${path}`);
    const req = HeapProbe.#request(url);
    for (let idx = 0; idx < HeapProbe.#batch; idx += 1) {
      const res = await handler(req);
      await res?.arrayBuffer();
    }
  }

  async run() {
    const cases = [
      { path: "/ping", url: "http://localhost/api/ping" },
      { path: "/itemList", url: "http://localhost/api/itemList?limit=20" },
    ];
    for (const { path, url } of cases) await this.#batchOf(path, url);
    const warm = HeapProbe.#settledHeap();
    for (const { path, url } of cases) await this.#batchOf(path, url);
    const after = HeapProbe.#settledHeap();
    const calls = HeapProbe.#batch * cases.length;
    console.info(
      JSON.stringify({
        calls,
        retainedBytesPerCall: Math.max(0, (after - warm) / calls),
        heapBytes: after,
      }),
    );
  }
}

await new HeapProbe().run();
process.exit(0);
