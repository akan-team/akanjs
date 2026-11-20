import type { BaseEnv } from "akanjs/base";
import { Logger } from "akanjs/common";
import { DictionaryRegistry, type RootDictionary } from "akanjs/dictionary";
import { SignalContext } from "../../signal/signalContext";
import type { BuildChangesPayload, BuilderRpc, BuildFrameworkPayload, BuildGraphPayload } from "../artifact";
import type { DiLifecycle } from "../di/diLifecycle";
import { DevRoutes } from "../routing/devRoutes";
import type { HttpRoutes } from "../types";
import { ConstantSerializer } from "./constantSerializer";
import { DepsSerializer } from "./depsSerializer";
import { DevtoolsAccess } from "./devtoolsAccess";
import { SignalSerializer } from "./signalSerializer";
import type { StudioRoute } from "./studio/studioRoute";
import type { DepsData, DevtoolsApp, DevtoolsEnvelope, DevtoolsIndex, DictionaryData, SignalData } from "./types";

export interface DevtoolsRouterContext {
  di: DiLifecycle;
  env: BaseEnv;
  name: string;
  serverMode: "federation" | "batch" | "all";
  prefix: string;
  websocketPrefix: string;
  openapi: boolean;
  web?: boolean;
  getStatus: () => string;
  buildGraph?: () => Promise<BuildGraphPayload | null>;
  buildChanges?: (since: string | null) => Promise<BuildChangesPayload | null>;
  buildFramework?: () => Promise<BuildFrameworkPayload | null>;
}

/** Builtin routes, not signals: off `/api` and guards, and never in the `serializedSignal` payload sent to clients. */
export class DevtoolsRouter {
  static readonly basePath = "/_akan";
  static readonly logger = new Logger("DevtoolsRouter");

  static isEnabled(env: BaseEnv): boolean {
    return DevtoolsAccess.modeOf(env) !== "closed";
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
    const { env } = this.#context;
    const closedReason = DevtoolsAccess.closedReason(env);
    if (closedReason) DevtoolsRouter.logger.warn(closedReason);
    if (!DevtoolsRouter.isEnabled(env)) return {};
    return DevRoutes.mount(
      {
        [`${DevtoolsRouter.basePath}/studio`]: { GET: async (req: Request) => (await this.#studio()).page(req) },
        [`${DevtoolsRouter.basePath}/studio/graph`]: {
          GET: async (req: Request) => (await this.#studio()).graph(req),
        },
        [`${DevtoolsRouter.basePath}/devtools`]: { GET: () => DevtoolsRouter.#json(this.#index()) },
        [`${DevtoolsRouter.basePath}/constant`]: {
          GET: () => this.#respond("constant", () => ConstantSerializer.serialize()),
        },
        [`${DevtoolsRouter.basePath}/signal`]: { GET: () => this.#respond("signal", () => this.#signal()) },
        [`${DevtoolsRouter.basePath}/dictionary`]: {
          GET: (req: Request) => this.#respond("dictionary", () => DevtoolsRouter.#dictionary(req)),
        },
        [`${DevtoolsRouter.basePath}/deps`]: { GET: () => this.#respond("deps", () => this.#deps()) },
        ...(DevtoolsAccess.modeOf(env) === "secret"
          ? {
              [DevtoolsAccess.unlockPath]: {
                POST: (req: Request) => DevtoolsAccess.unlock(req, env, SignalContext.clientIpOf(req)),
              },
            }
          : {}),
      },
      env,
    );
  }

  #studioRoute: Promise<StudioRoute> | null = null;
  //? Imported on the first studio request: a server whose devtools are closed, or never opened, parses none of it.
  #studio(): Promise<StudioRoute> {
    this.#studioRoute ??= import("./studio/studioRoute").then(
      ({ StudioRoute }) =>
        new StudioRoute({
          basePath: `${DevtoolsRouter.basePath}/studio`,
          appName: this.#context.env.appName,
          web: this.#context.web ?? true,
          buildGraph: this.#context.buildGraph ?? null,
          buildChanges: this.#context.buildChanges ?? null,
          buildFramework: this.#context.buildFramework ?? null,
          runtime: () => ({
            app: this.#app(),
            deps: DevtoolsRouter.#attempt("studio runtime (deps)", () => this.#deps()),
            signal: DevtoolsRouter.#attempt("studio runtime (signal)", () => this.#signal()),
          }),
        }),
    );
    return this.#studioRoute;
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

  #respond<Kind extends string, Data>(kind: Kind, build: () => Data): Response {
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
