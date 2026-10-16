import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ID, Int } from "akanjs/base";
import { ConstantRegistry, via } from "akanjs/constant";
import { by, type DatabaseCls, DatabaseRegistry, from, into } from "akanjs/document";
import { ServiceModel, serve } from "akanjs/service";
import { endpoint, type Guard, type GuardScope, internal, Public, serverSignal, slice } from "akanjs/signal";
import { AkanLib, AkanOption } from "../../../pkgs/akanjs/server";
import { DiLifecycle } from "../../../pkgs/akanjs/server/di/diLifecycle";
import { McpRouter } from "../../../pkgs/akanjs/server/mcp/McpRouter";
import { SignalRegistry } from "../../../pkgs/akanjs/signal/signalRegistry";

/**
 * Boots one lib holding `--modules` database modules, each with the generated CRUD, a named slice and two custom
 * endpoints, and prints how long declaring, wiring and cataloguing them took as JSON. Run in a process of its own per
 * size: every registry here is module-global, so a second size in the same process would count the first one's models.
 */
const benchEnv = {
  AKAN_PUBLIC_REPO_NAME: "akanjs",
  AKAN_PUBLIC_SERVE_DOMAIN: "akanjs.com",
  AKAN_PUBLIC_APP_NAME: "scalingProbe",
  AKAN_PUBLIC_ENV: "local",
  AKAN_PUBLIC_OPERATION_MODE: "local",
  AKAN_PUBLIC_LOG_LEVEL: "error",
  SERVER_MODE: "all",
} as const;
for (const [key, value] of Object.entries(benchEnv)) process.env[key] ??= value;

class ProbeSignedIn implements Guard {
  static name = "ProbeSignedIn";
  static scope: GuardScope = "account";
  canPass() {
    return true;
  }
}

class ScalingProbe {
  readonly #modules: number;
  constructor(argv: string[]) {
    const idx = argv.indexOf("--modules");
    this.#modules = Number(idx >= 0 ? argv[idx + 1] : "50");
  }

  static #module(idx: number) {
    const refName = `scaleItem${idx}`;
    const Input = via((f) => ({ title: f(String), count: f(Int, { default: 0 }), ownerId: f(ID) }));
    const Obj = via(Input, () => ({}));
    const Light = via(Obj, ["title"] as const, () => ({}));
    const Full = via(Obj, Light, () => ({}));
    const Insight = via(Full, (f) => ({ total: f(Int, { default: 0, accumulate: {} }) }));
    const constant = ConstantRegistry.buildModel(refName, Input, Obj, Full, Light, Insight, {});
    class Filter extends from(Full, (filter) => ({
      query: {
        byOwner: filter()
          .arg("ownerId", ID)
          .query((ownerId) => ({ ownerId })),
      },
      sort: {},
    })) {}
    class Doc extends by(Full) {}
    class Model extends into(Doc, Filter, constant, () => ({})) {}
    class InsightDoc extends by(Insight) {}
    const database = DatabaseRegistry.buildModel(
      refName,
      Input as unknown as DatabaseCls<InstanceType<typeof Input>>,
      Doc,
      Model,
      Obj,
      InsightDoc,
      Filter,
    );
    class Service extends serve(database, () => ({})) {}
    const service = ServiceModel.fromModel(Service, constant, database);
    class Slice extends slice(service, { guards: { root: Public, get: Public, cru: ProbeSignedIn } }, (init) => ({
      byOwner: init({ guards: [Public] })
        .param("ownerId", ID)
        .exec(function (ownerId) {
          return (this as unknown as Record<string, { queryByOwner: (id: string) => never }>)[
            `${refName}Service`
          ].queryByOwner(ownerId);
        }),
    })) {}
    class Endpoint extends endpoint(service, ({ query, mutation }) => ({
      [`ping${idx}`]: query(String, { guards: [Public] }).exec(() => "ok"),
      [`rename${idx}`]: mutation(String, { guards: [ProbeSignedIn] })
        .param("id", ID)
        .body("title", String)
        .exec((id, title) => `${id}:${title}`),
    })) {}
    class Internal extends internal(service, () => ({})) {}
    class Server extends serverSignal(Endpoint, Internal) {}
    return {
      constant,
      database,
      service,
      signal: SignalRegistry.registerDatabase(refName, Internal, Endpoint, Slice, Server),
    };
  }

  async run() {
    const tmp = await mkdtemp(join(tmpdir(), "akan-scaling-"));
    const env = {
      workspaceRoot: tmp,
      database: {
        sqlite: { filePath: join(tmp, "akan.db"), journalMode: "WAL", busyTimeoutMs: 1000, foreignKeys: true },
      },
      solid: {
        filePath: join(tmp, "solid.db"),
        journalMode: "WAL",
        busyTimeoutMs: 1000,
        cleanupIntervalMs: 60_000,
        queuePollIntervalMs: 60_000,
        queueLeaseMs: 30_000,
      },
    };
    let di: DiLifecycle | null = null;
    try {
      const startedAt = performance.now();
      const databases = Array.from({ length: this.#modules }, (_, idx) => ScalingProbe.#module(idx));
      const declaredAt = performance.now();
      const lib = new AkanLib("scalingProbe", { databases, services: [], scalars: [], option: new AkanOption() });
      di = new DiLifecycle({ env } as never, lib);
      await di.initializeAll();
      const wiredAt = performance.now();
      new McpRouter({
        registry: di.registry,
        live: di.live,
        middleware: new Map(di.modules.middleware),
        env,
      } as never).report();
      const cataloguedAt = performance.now();
      console.info(
        JSON.stringify({
          modules: this.#modules,
          declareMs: declaredAt - startedAt,
          wireMs: wiredAt - declaredAt,
          catalogueMs: cataloguedAt - wiredAt,
          totalMs: cataloguedAt - startedAt,
        }),
      );
    } finally {
      await di?.destroyAll();
      await rm(tmp, { recursive: true, force: true });
    }
  }
}

await new ScalingProbe(process.argv.slice(2)).run();
process.exit(0);
