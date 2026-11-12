import { getEnv } from "akanjs/base";
import type { Logger } from "akanjs/common";
import { DictionaryLookup, DictionaryRegistry } from "akanjs/dictionary";
import { createOpenApiDocument } from "../../signal/openapi";
import { FetchSerializer } from "../../signal/serializer";
import type { AkanServer } from "../akanServer";
import { DevtoolsRouter } from "../devtools";
import type { DiLifecycle } from "../di/diLifecycle";
import type { ServerLogging } from "../logging/serverLogging";
import { McpRouter } from "../mcp";
import { AppInfo } from "../ops/appInfo";
import { OpsRoute } from "../ops/opsRoute";
import { SqliteFiles } from "../ops/sqliteFiles";
import type { ServerMetrics } from "../serverMetrics";
import type { HttpRoutes } from "../types";
import type { WebRouter } from "../webRouter";
import type { ServerListener } from "./serverListener";
import { createSoloAppRoutes } from "./soloAppRoutes";

type BuiltinRoutesOwner = Pick<
  AkanServer,
  | "name"
  | "logger"
  | "env"
  | "status"
  | "serverMode"
  | "prefix"
  | "websocketPrefix"
  | "openapi"
  | "mcp"
  | "mcpReadOnly"
  | "mcpAuth"
  | "mcpOption"
>;

interface BuiltinRoutesProps {
  owner: BuiltinRoutesOwner;
  di: DiLifecycle;
  solo: boolean;
  listener: ServerListener;
  metrics: ServerMetrics;
  logging: ServerLogging;
}

export class BuiltinRoutes {
  readonly #owner: BuiltinRoutesOwner;
  readonly #logger: Logger;
  readonly #di: DiLifecycle;
  readonly #solo: boolean;
  readonly #listener: ServerListener;
  readonly #metrics: ServerMetrics;
  readonly #logging: ServerLogging;
  #openApiDocument: ReturnType<typeof createOpenApiDocument> | null = null;
  #mcpRouter: McpRouter | null = null;
  #ops: OpsRoute | null | undefined;

  constructor({ owner, di, solo, listener, metrics, logging }: BuiltinRoutesProps) {
    this.#owner = owner;
    this.#logger = owner.logger;
    this.#di = di;
    this.#solo = solo;
    this.#listener = listener;
    this.#metrics = metrics;
    this.#logging = logging;
  }

  get mcpRouter(): McpRouter | null {
    return this.#mcpRouter;
  }

  timed(webRouter: WebRouter | null, initTimings: Map<string, number>): HttpRoutes {
    const start = performance.now();
    const builtinRoutes = this.#create(webRouter);
    initTimings.set("builtinRoutes", performance.now() - start);
    return builtinRoutes;
  }

  #create(webRouter: WebRouter | null): HttpRoutes {
    const { appName } = getEnv();
    const openapiRoutes: HttpRoutes = this.#owner.openapi
      ? {
          "/openapi.json": { GET: () => Response.json(this.#getOpenApiDocument(appName)) },
        }
      : {};
    // Mounted at the root, not under the prefix: its URL is the OAuth resource URI clients authenticate against.
    const mcpRouter =
      this.#owner.mcp && this.#owner.serverMode !== "batch"
        ? new McpRouter({
            registry: this.#di.registry,
            env: this.#owner.env,
            live: this.#di.live,
            middleware: new Map(this.#di.modules.middleware),
            instructions: `Domain tools for the ${appName} app.`,
            ...this.#owner.mcpOption,
            readOnly: this.#owner.mcpReadOnly,
            auth: this.#owner.mcpAuth,
            pagePrompts: webRouter?.pagePrompts(),
            apps: this.#owner.mcpOption.apps !== false,
            appShell: this.#owner.mcpOption.apps === false ? undefined : webRouter?.mcpAppShell(),
          })
        : null;
    this.#mcpRouter = mcpRouter;
    const mcpRoutes: HttpRoutes = mcpRouter?.createRoutes() ?? {};
    const soloRoutes: HttpRoutes = this.#solo
      ? createSoloAppRoutes(
          () => ({
            role: this.#owner.serverMode,
            running: this.#owner.status === "running",
            status: this.#owner.status,
            port: this.#listener.port ?? null,
            rscWorker: webRouter?.rscWorkerStatus ?? null,
            metrics: this.#metrics.last,
          }),
          this.#logging.stream,
          this.#opsRoute(),
        )
      : {};
    // Built at boot, not on the first agent request, so what MCP published or refused is in this process's boot log.
    mcpRouter?.report();
    this.#reportLocaleCoverage();
    // Registered only when the gate passes, so outside `local` the paths 404 via the SSR catch-all, not "forbidden".
    const devtoolsRoutes = new DevtoolsRouter({
      di: this.#di,
      env: getEnv(),
      name: this.#owner.name,
      serverMode: this.#owner.serverMode,
      prefix: this.#owner.prefix,
      websocketPrefix: this.#owner.websocketPrefix,
      openapi: this.#owner.openapi,
      getStatus: () => this.#owner.status,
      ...DevtoolsRouter.buildsFrom(webRouter),
    }).createRoutes();
    return { ...openapiRoutes, ...mcpRoutes, ...devtoolsRoutes, ...soloRoutes };
  }

  // A lib's dictionaries fix their own locales, so an app's extra locale silently falls back to the default one.
  #reportLocaleCoverage() {
    for (const { locale, missing, total } of DictionaryRegistry.getLocaleGaps()) {
      const listed = missing.slice(0, 10).join(", ");
      const rest = missing.length > 10 ? `, and ${missing.length - 10} more` : "";
      this.#logger.warn(
        `Locale "${locale}" is configured but ${missing.length}/${total} dictionaries do not declare it, so their keys fall back to the default locale: ${listed}${rest}`,
      );
    }
  }

  #opsRoute() {
    if (this.#ops !== undefined) return this.#ops;
    this.#ops = OpsRoute.fromEnv({
      detail: () => AppInfo.detail({ serverMode: this.#owner.serverMode, solo: true, replicaIdx: 0 }),
      sources: () => this.#sqliteSources(),
    });
    return this.#ops;
  }

  //* The adaptors' own resolved paths, so a file an app placed through `env.server.ts` is the one copied.
  #sqliteSources() {
    const fromEnv = SqliteFiles.fromEnv();
    const filePathOf = (refName: string) => {
      try {
        return (this.#di.getAdaptor(refName) as { config?: { filePath?: unknown } }).config?.filePath;
      } catch {
        return undefined;
      }
    };
    const main = filePathOf("sqliteDatabase");
    const solid = filePathOf("solidQueue") ?? filePathOf("solidCache");
    return {
      main: typeof main === "string" ? main : fromEnv.main,
      solid: fromEnv.solid && typeof solid === "string" ? solid : fromEnv.solid,
    };
  }

  #getOpenApiDocument(appName: string) {
    this.#openApiDocument ??= createOpenApiDocument(FetchSerializer.serializeRegistry(this.#di.live).signal, {
      title: `${appName} API`,
      version: "0.0.0",
      servers: this.#getOpenApiServers(),
      resolveDescription: BuiltinRoutes.#createDescriptionResolver(),
    });
    return this.#openApiDocument;
  }

  static #createDescriptionResolver() {
    const lookup = new DictionaryLookup();
    return (key: string) => lookup.text(key);
  }

  #getOpenApiServers() {
    const serverHttpUri = (this.#owner.env as { serverHttpUri?: string }).serverHttpUri;
    if (!serverHttpUri) return undefined;
    const withoutPrefix = serverHttpUri.replace(/\/$/, "");
    const prefix = this.#owner.prefix;
    return [{ url: withoutPrefix.endsWith(prefix) ? withoutPrefix.slice(0, -prefix.length) : withoutPrefix }];
  }
}
