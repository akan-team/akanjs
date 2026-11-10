import type { BaseEnv } from "akanjs/base";
import { Logger } from "akanjs/common";
import { DictionaryRegistry, type RootDictionary } from "akanjs/dictionary";
import { isLocalDevRuntime } from "../../signal/trace";
import type { BuildChangesPayload, BuilderRpc, BuildFrameworkPayload, BuildGraphPayload } from "../artifact";
import type { DiLifecycle } from "../di/diLifecycle";
import type { HttpRoutes } from "../types";
import { ConstantSerializer } from "./constantSerializer";
import { DepsSerializer } from "./depsSerializer";
import { SignalSerializer } from "./signalSerializer";
import { StudioRoute } from "./studio/studioRoute";
import type { DepsData, DevtoolsApp, DevtoolsEnvelope, DevtoolsIndex, DictionaryData, SignalData } from "./types";

export interface DevtoolsRouterContext {
  di: DiLifecycle;
  env: BaseEnv;
  name: string;
  serverMode: "federation" | "batch" | "all";
  prefix: string;
  websocketPrefix: string;
  openapi: boolean;
  web: boolean;
  getStatus: () => string;
  buildGraph?: () => Promise<BuildGraphPayload | null>;
  buildChanges?: (since: string | null) => Promise<BuildChangesPayload | null>;
  buildFramework?: () => Promise<BuildFrameworkPayload | null>;
}

/** Builtin routes, not signals: off `/api` and guards, and never in the `serializedSignal` payload sent to clients. */
export class DevtoolsRouter {
  static readonly basePath = "/_akan";
  static readonly logger = new Logger("DevtoolsRouter");

  /** A local dev runtime only, unless `AKAN_DEVTOOLS` ("true"/"1", "false"/"0") overrides it, e.g. to debug a deployed env. */
  static isEnabled(env: BaseEnv): boolean {
    const override = process.env.AKAN_DEVTOOLS;
    if (override === "false" || override === "0") return false;
    if (override === "true" || override === "1") return true;
    return isLocalDevRuntime(env);
  }

  static buildsFrom(
    webRouter: { readonly builderRpc: BuilderRpc | null } | null,
  ): Pick<DevtoolsRouterContext, "web" | "buildGraph" | "buildChanges" | "buildFramework"> {
    if (!webRouter) return { web: false };
    return {
      web: true,
      buildGraph: async () => (await webRouter.builderRpc?.buildGraph()) ?? null,
      buildChanges: async (since) => (await webRouter.builderRpc?.buildChanges(since)) ?? null,
      buildFramework: async () => (await webRouter.builderRpc?.buildFramework()) ?? null,
    };
  }

  readonly #context: DevtoolsRouterContext;

  constructor(context: DevtoolsRouterContext) {
    this.#context = context;
  }

  createRoutes(): HttpRoutes {
    if (!DevtoolsRouter.isEnabled(this.#context.env)) return {};
    const studio = new StudioRoute({
      basePath: `${DevtoolsRouter.basePath}/studio`,
      appName: this.#context.env.appName,
      web: this.#context.web,
      buildGraph: this.#context.buildGraph ?? null,
      buildChanges: this.#context.buildChanges ?? null,
      buildFramework: this.#context.buildFramework ?? null,
      runtime: () => ({
        app: this.#app(),
        deps: DevtoolsRouter.#attempt("studio runtime (deps)", () => this.#deps()),
        signal: DevtoolsRouter.#attempt("studio runtime (signal)", () => this.#signal()),
      }),
    });
    return {
      [`${DevtoolsRouter.basePath}/studio`]: { GET: (req: Request) => this.#gated(() => studio.page(req)) },
      [`${DevtoolsRouter.basePath}/studio/graph`]: { GET: (req: Request) => this.#gated(() => studio.graph(req)) },
      [`${DevtoolsRouter.basePath}/devtools`]: { GET: () => DevtoolsRouter.#json(this.#index()) },
      [`${DevtoolsRouter.basePath}/constant`]: {
        GET: () => this.#respond("constant", () => ConstantSerializer.serialize()),
      },
      [`${DevtoolsRouter.basePath}/signal`]: { GET: () => this.#respond("signal", () => this.#signal()) },
      [`${DevtoolsRouter.basePath}/dictionary`]: {
        GET: (req: Request) => this.#respond("dictionary", () => DevtoolsRouter.#dictionary(req)),
      },
      [`${DevtoolsRouter.basePath}/deps`]: { GET: () => this.#respond("deps", () => this.#deps()) },
    };
  }

  #signal(): SignalData {
    const { di, serverMode, prefix, websocketPrefix } = this.#context;
    return SignalSerializer.serialize({ di, serverMode, prefix, websocketPrefix });
  }

  #deps(): DepsData {
    const { di, env, name, getStatus, serverMode, prefix, websocketPrefix, openapi } = this.#context;
    return new DepsSerializer({
      di,
      env,
      name,
      status: getStatus(),
      serverMode,
      prefix,
      websocketPrefix,
      openapi,
    }).build();
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
      return DevtoolsRouter.#json({ kind, error: DevtoolsRouter.#failure(`/_akan/${kind}`, error) }, 500);
    }
  }

  static #attempt<Data>(label: string, build: () => Data): Data | { error: string } {
    try {
      return build();
    } catch (error) {
      return { error: DevtoolsRouter.#failure(label, error) };
    }
  }

  static #failure(label: string, error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    DevtoolsRouter.logger.warn(`Failed to serialize ${label}: ${message}`);
    return message;
  }

  async #gated(respond: () => Promise<Response>): Promise<Response> {
    if (!DevtoolsRouter.isEnabled(this.#context.env)) return DevtoolsRouter.#json({ error: "Not found" }, 404);
    return await respond();
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
