import type { BaseEnv } from "akanjs/base";
import { Logger } from "akanjs/common";
import { DictionaryRegistry, type RootDictionary } from "akanjs/dictionary";
import type { DiLifecycle } from "../di/diLifecycle";
import type { HttpRoutes } from "../types";
import { ConstantSerializer } from "./constantSerializer";
import { DepsSerializer } from "./depsSerializer";
import { SignalSerializer } from "./signalSerializer";
import type { DevtoolsApp, DevtoolsEnvelope, DevtoolsIndex, DictionaryData } from "./types";

export interface DevtoolsRouterContext {
  di: DiLifecycle;
  env: BaseEnv;
  name: string;
  serverMode: "federation" | "batch" | "all";
  prefix: string;
  websocketPrefix: string;
  openapi: boolean;
  getStatus: () => string;
}

/**
 * Local-dev-only JSON endpoints that describe the running system for developer tools.
 *
 * These are registered as builtin routes rather than as signal endpoints so they stay off the `/api` prefix,
 * skip guards and the middleware chain, and — most importantly — never enter the `serializedSignal` payload
 * that ships to every client bundle in production.
 */
export class DevtoolsRouter {
  static readonly basePath = "/_akan";
  static readonly logger = new Logger("DevtoolsRouter");

  /**
   * `AKAN_DEVTOOLS` is an explicit override for debugging a deployed environment; otherwise the endpoints
   * exist only under `AKAN_PUBLIC_ENV=local`. Shape mirrors `AkanServer.#isOpenApiEnvEnabled`.
   */
  static isEnabled(env: BaseEnv): boolean {
    const override = process.env.AKAN_DEVTOOLS;
    if (override === "false" || override === "0") return false;
    if (override === "true" || override === "1") return true;
    return env.environment === "local";
  }

  readonly #context: DevtoolsRouterContext;

  constructor(context: DevtoolsRouterContext) {
    this.#context = context;
  }

  createRoutes(): HttpRoutes {
    if (!DevtoolsRouter.isEnabled(this.#context.env)) return {};
    return {
      [`${DevtoolsRouter.basePath}/devtools`]: { GET: () => DevtoolsRouter.#json(this.#index()) },
      [`${DevtoolsRouter.basePath}/constant`]: {
        GET: () => this.#respond("constant", () => ConstantSerializer.serialize()),
      },
      [`${DevtoolsRouter.basePath}/signal`]: {
        GET: () =>
          this.#respond("signal", () =>
            SignalSerializer.serialize({
              di: this.#context.di,
              serverMode: this.#context.serverMode,
              prefix: this.#context.prefix,
              websocketPrefix: this.#context.websocketPrefix,
            }),
          ),
      },
      [`${DevtoolsRouter.basePath}/dictionary`]: {
        GET: (req: Request) => this.#respond("dictionary", () => DevtoolsRouter.#dictionary(req)),
      },
      [`${DevtoolsRouter.basePath}/deps`]: {
        GET: () =>
          this.#respond("deps", () =>
            new DepsSerializer({
              di: this.#context.di,
              env: this.#context.env,
              name: this.#context.name,
              status: this.#context.getStatus(),
              serverMode: this.#context.serverMode,
              prefix: this.#context.prefix,
              websocketPrefix: this.#context.websocketPrefix,
              openapi: this.#context.openapi,
            }).build(),
          ),
      },
    };
  }

  #index(): DevtoolsIndex {
    return {
      version: 1,
      endpoints: (["constant", "signal", "dictionary", "deps"] as const).map((kind) => ({
        kind,
        path: `${DevtoolsRouter.basePath}/${kind}`,
      })),
    };
  }

  /** Re-checks the gate per request (defense in depth) and keeps a serializer bug from crashing the dev server. */
  #respond<Kind extends string, Data>(kind: Kind, build: () => Data): Response {
    if (!DevtoolsRouter.isEnabled(this.#context.env)) return DevtoolsRouter.#json({ error: "Not found" }, 404);
    try {
      return DevtoolsRouter.#json(this.#envelope(kind, build()));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      DevtoolsRouter.logger.warn(`Failed to serialize /_akan/${kind}: ${message}`);
      return DevtoolsRouter.#json({ kind, error: message }, 500);
    }
  }

  #envelope<Kind extends string, Data>(kind: Kind, data: Data): DevtoolsEnvelope<Kind, Data> {
    return { kind, version: 1, generatedAt: new Date().toISOString(), app: this.#app(), data };
  }

  #app(): DevtoolsApp {
    const { env, serverMode } = this.#context;
    return {
      name: env.appName,
      repoName: env.repoName,
      serveDomain: env.serveDomain,
      environment: env.environment,
      operationMode: env.operationMode,
      serverMode,
      pid: process.pid,
      replicaIdx: Number(process.env.AKAN_REPLICA_IDX ?? 0),
    };
  }

  /** `?lang=en` narrows the tree to one language — full dictionaries get large fast. */
  static #dictionary(req: Request): DictionaryData {
    const lang = new URL(req.url).searchParams.get("lang");
    const root = DictionaryRegistry.getRoot();
    const dictionary: RootDictionary = lang ? (root[lang] ? { [lang]: root[lang] } : {}) : root;
    return {
      languages: DictionaryRegistry.getLanguages(),
      modules: DictionaryRegistry.getModules(),
      dictionary,
      keys: DictionaryRegistry.getKeys(dictionary),
    };
  }

  static #json(body: unknown, status = 200): Response {
    return Response.json(body, {
      status,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
