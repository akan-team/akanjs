import { AccountMiddleware } from "@libs/shared/srvkit";
import { Int } from "akanjs/base";
import { ConstantRegistry, via } from "akanjs/constant";
import { getDefaultInjectRegistry, getDefaultLiveRegistry, ServiceModel, serve } from "akanjs/service";
import { endpoint, Logging, type MiddlewareCls, Public, Timeout } from "akanjs/signal";
import { MachineAccount } from "../../../pkgs/akanjs/server/machine";
import { SignalResolver } from "../../../pkgs/akanjs/server/resolver/signal.resolver";

/**
 * In-process cost of one signal call, with no socket and no load generator: the route handler `SignalResolver`
 * mounts, called back to back, against a handler that only answers `Response.json`. The global middlewares are the
 * ones a `libs/shared` app runs (Logging, Timeout, AccountMiddleware, MachineAccount), in DiLifecycle's order.
 *
 * Usage, from the repo root (its tsconfig carries the decorator setting libs/util needs; `--no-env-file` keeps out the
 * root `.env`, whose log level would log every call):
 *   bun --no-env-file benchmarks/api-benchmark/micro/signalPipeline.ts
 *   bun --no-env-file benchmarks/api-benchmark/micro/signalPipeline.ts --case ping --iterations 1000000
 *   AKAN_LOG_CONTEXT=0 bun --no-env-file benchmarks/api-benchmark/micro/signalPipeline.ts
 *   bun --no-env-file --cpu-prof-md --cpu-prof-dir=benchmarks/api-benchmark/results/profiles \
 *     benchmarks/api-benchmark/micro/signalPipeline.ts --case ping --iterations 1000000
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

const BenchItem = via((f) => ({
  title: f(String),
  category: f(String),
  count: f(Int),
  tags: f([String]),
  ownerId: f(String),
  score: f(Int),
}));
ConstantRegistry.buildScalar("microBenchItem", BenchItem, { BenchItem });

class MicroBenchService extends serve("microBench" as const, () => ({})) {}
const microBench = ServiceModel.from(MicroBenchService);

const item = Object.assign(new BenchItem(), {
  title: "Alpha",
  category: "news",
  count: 3,
  tags: ["a", "b"],
  ownerId: "owner-1",
  score: 42,
});
const items = Array.from({ length: 20 }, () => item);

class MicroBenchEndpoint extends endpoint(microBench, ({ query }) => ({
  ping: query(String, { guards: [Public] }).exec(() => "ok"),
  echo: query(String, { guards: [Public] })
    .param("value", String)
    .exec((value) => value),
  search: query(String, { guards: [Public] })
    .search("limit", Int)
    .search("text", String)
    .exec((limit, text) => `${text}:${limit}`),
  scalar: query(BenchItem, { guards: [Public] }).exec(() => item),
  scalarList: query([BenchItem], { guards: [Public] }).exec(() => items),
})) {}

type RouteTable = Record<string, { GET?: (req: Bun.BunRequest) => Promise<Response | undefined> }>;

interface Case {
  name: string;
  path: string;
  url: string;
  params?: Record<string, string>;
}

const cases: Case[] = [
  { name: "ping", path: "/ping", url: "http://localhost/api/ping" },
  {
    name: "echo",
    path: "/echo/:value",
    url: "http://localhost/api/echo/hello",
    params: { value: "hello" },
  },
  { name: "search", path: "/search", url: "http://localhost/api/search?limit=20&text=abc" },
  { name: "scalar", path: "/scalar", url: "http://localhost/api/scalar" },
  { name: "scalarList", path: "/scalarList", url: "http://localhost/api/scalarList" },
];

class SignalPipelineBench {
  readonly #iterations: number;
  readonly #only: string | undefined;
  readonly #routes: RouteTable;

  constructor(argv: string[]) {
    const get = (flag: string) => {
      const idx = argv.indexOf(flag);
      return idx >= 0 ? argv[idx + 1] : undefined;
    };
    this.#iterations = Number(get("--iterations") ?? "200000");
    this.#only = get("--case");
    const middleware = new Map<string, MiddlewareCls>([
      [Logging.refName, Logging],
      [Timeout.refName, Timeout],
      [AccountMiddleware.refName, AccountMiddleware as unknown as MiddlewareCls],
      [MachineAccount.refName, MachineAccount as unknown as MiddlewareCls],
    ]);
    const resolved = SignalResolver.resolveEndpoint(MicroBenchEndpoint, new MicroBenchEndpoint(), {
      registry: getDefaultInjectRegistry(),
      env: {},
      live: getDefaultLiveRegistry(),
      middleware,
    });
    this.#routes = resolved.routes as RouteTable;
  }

  static #request(target: Case): Bun.BunRequest {
    const req = new Request(target.url) as Bun.BunRequest;
    return Object.assign(req, { params: target.params ?? {}, cookies: new Bun.CookieMap() });
  }

  async #measure(label: string, handler: (req: Bun.BunRequest) => Promise<Response | undefined>, target: Case) {
    const req = SignalPipelineBench.#request(target);
    const sample = await handler(req);
    if (sample?.status !== 200) throw new Error(`${label} answered ${sample?.status}: ${await sample?.text()}`);
    const warmup = Math.min(50_000, Math.floor(this.#iterations / 4));
    for (let i = 0; i < warmup; i += 1) await handler(req);
    Bun.gc(true);
    const start = Bun.nanoseconds();
    for (let i = 0; i < this.#iterations; i += 1) await handler(req);
    const nsPerOp = (Bun.nanoseconds() - start) / this.#iterations;
    return { label, nsPerOp };
  }

  async run() {
    const baseline = async () => Response.json("ok");
    const rows: { label: string; nsPerOp: number }[] = [];
    rows.push(await this.#measure("baseline Response.json", baseline, cases[0] as Case));
    for (const target of cases) {
      if (this.#only && target.name !== this.#only) continue;
      const handler = this.#routes[target.path]?.GET;
      if (!handler) throw new Error(`No GET route at ${target.path}: ${Object.keys(this.#routes).join(", ")}`);
      rows.push(await this.#measure(target.name, handler, target));
    }
    const base = rows[0]?.nsPerOp ?? 0;
    console.info(
      `signal pipeline, ${this.#iterations} calls each, AKAN_LOG_CONTEXT=${process.env.AKAN_LOG_CONTEXT ?? "(on)"}`,
    );
    for (const { label, nsPerOp } of rows)
      console.info(
        `  ${label.padEnd(24)} ${(nsPerOp / 1000).toFixed(2).padStart(7)} µs/op   +${((nsPerOp - base) / 1000).toFixed(2)} µs`,
      );
  }
}

await new SignalPipelineBench(process.argv.slice(2)).run();
