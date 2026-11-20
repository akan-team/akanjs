import { AkanError } from "akanjs/base";
import type { Logger } from "akanjs/common";
import type { WebsocketAdaptor } from "akanjs/service";
import { SignalContext } from "../../signal/signalContext";
import { AKAN_CHILD_HOST } from "../akanAppHeaders";
import type { AkanServer } from "../akanServer";
import { BinaryPubsub } from "../binaryPubsub";
import type { DiLifecycle } from "../di/diLifecycle";
import type { HmrWsData, HmrWsHub } from "../hmr/wsHub";
import { isPortInUseError } from "../lifecycle/portInUse";
import type { WebProxyRunner } from "../proxy";
import { SignalResolver } from "../resolver";
import type { HttpRoutes, LocalPublish, SignalRoutes, WebsocketRoutes } from "../types";
import type { WebRouter } from "../webRouter";
import { type ApiRouteInputs, ApiRouter, type NonNullHttpRoutes } from "./apiRouter";
import type { AppWsData } from "./appWsData";
import { HostAllowlist } from "./hostAllowlist";
import { localRoomsOf } from "./localRooms";
import { RoomReplay } from "./roomReplay";
import { ServerLimits } from "./serverLimits";
import type { WebSurfaceHold } from "./webSurfaceHold";

export interface AkanAppPrepared {
  routes: SignalRoutes["routes"];
  routeOptions: SignalRoutes["routeOptions"];
  wsRoutes: WebsocketRoutes;
  builtinRoutes: HttpRoutes;
  renderEnvRoutes: HttpRoutes;
  hmrHub: HmrWsHub | null;
  webProxyRunner: WebProxyRunner | null;
}

type ListenerOwner = Pick<AkanServer, "name" | "logger" | "prefix" | "websocketPrefix">;
type AppServer = Bun.Server<AppWsData | HmrWsData>;

interface ListenSite {
  unix: string | undefined;
  limits: ServerLimits;
  hostAllowlist: HostAllowlist | null;
  idleTimeout: number;
  hold: WebSurfaceHold | null;
}

export class ServerListener {
  readonly #owner: ListenerOwner;
  readonly #logger: Logger;
  readonly #di: DiLifecycle;
  readonly #solo: boolean;
  readonly #binaryPubsub = new BinaryPubsub();
  #server: AppServer | null = null;
  #wsServer: AppServer | null = null;
  #localPublish: LocalPublish | null = null;
  #roomReplay: RoomReplay | null = null;
  #websocket: WebsocketAdaptor | null = null;
  #site: ListenSite | null = null;
  #attached: { main: NonNullHttpRoutes; ws: NonNullHttpRoutes | null } | null = null;

  constructor(owner: ListenerOwner, di: DiLifecycle, solo: boolean) {
    this.#owner = owner;
    this.#logger = owner.logger;
    this.#di = di;
    this.#solo = solo;
  }

  get port() {
    return this.#server?.port;
  }

  get wsPort() {
    return this.#wsServer?.port;
  }

  get coalescedCount() {
    return this.#binaryPubsub.coalescedCount;
  }

  get replayBytes() {
    return this.#roomReplay?.bytes ?? 0;
  }

  get liveRoomCount() {
    return this.#di.live.syncHub.roomCount;
  }

  get pubsubBufferedCount() {
    return this.#websocket?.bufferedCount;
  }

  //? Bun throws when `upgrade()` runs on a server that did not receive the request, and behind the gateway an HMR
  //? socket arrives at the TCP ws server, the one of the two that knows its peer.
  upgradeHmrWs(req: Request, data: HmrWsData) {
    return (
      (this.#wsServer?.requestIP(req as Bun.BunRequest) ? this.#wsServer : this.#server)?.upgrade(req, { data }) ??
      false
    );
  }

  publishLocal(roomId: string, data: Parameters<LocalPublish>[1]) {
    this.#localPublish?.(roomId, data);
  }

  listen(prepared: AkanAppPrepared, webRouter: WebRouter | null, hold: WebSurfaceHold | null = null) {
    const port = process.env.AKAN_CHILD_SOCKET
      ? undefined
      : Number(process.env.AKAN_CHILD_WS_PORT || process.env.PORT || 8282);
    const unix = process.env.AKAN_CHILD_SOCKET || undefined;
    this.#logger.verbose(`${this.#owner.name} is serving on ${unix ? `unix://${unix}` : `port ${port}`}`);
    const limits = new ServerLimits();
    const site: ListenSite = {
      unix,
      limits,
      //? Behind the gateway the Host a child sees is the gateway's hop, so only a server bound to TCP checks it.
      hostAllowlist: unix ? null : HostAllowlist.fromEnv(),
      //? Off on the gateway's socket: it bounds each client, and a pooled keep-alive this side closed would answer 502.
      idleTimeout: unix ? 0 : limits.idleTimeout,
      hold,
    };
    this.#site = site;
    const websocket = this.#websocketHandlers(prepared, webRouter, limits);
    const hostname = ServerLimits.listenHostname();
    const serve = () =>
      Bun.serve({
        idleTimeout: site.idleTimeout,
        maxRequestBodySize: limits.uploadBodyBytes,
        ...(unix ? { unix } : { port, hostname }),
        routes: this.#routeTable(site, prepared, "main"),
        websocket,
      } as Parameters<typeof Bun.serve>[0]);
    this.#server = unix ? ServerLimits.serveOwnerOnly(unix, serve) : serve();
    if (unix && process.env.AKAN_CHILD_WS_PORT) this.#serveWsFallback(site, prepared, websocket);

    const server = this.#server;
    const wsServer = this.#wsServer;
    //? `requestIP` answers `null` for a unix socket and for a request this server never received alike; only the
    //? first is a local hop, and on TCP a request with no socket behind it must not read as one.
    SignalContext.setHttpPeerResolver((req) => server?.requestIP(req as Bun.BunRequest) ?? (unix ? null : undefined));
    this.#publishHmr(prepared.hmrHub);
    this.#bindLocalPublish(server, wsServer);
    return { unix, port };
  }

  //? Before the hold opens: a held HMR upgrade must meet the websocket handlers that know its data.
  attachWeb(prepared: AkanAppPrepared, webRouter: WebRouter | null) {
    const held = this.#site;
    if (!held) return;
    const site: ListenSite = { ...held, hold: null };
    this.#site = site;
    const websocket = this.#websocketHandlers(prepared, webRouter, site.limits);
    const main = this.#routeTable(site, prepared, "main");
    const ws = this.#wsServer ? this.#routeTable(site, prepared, "ws") : null;
    this.#attached = { main, ws };
    this.#server?.reload({ routes: main, websocket } as Parameters<AppServer["reload"]>[0]);
    if (ws) this.#wsServer?.reload({ routes: ws, websocket } as Parameters<AppServer["reload"]>[0]);
    this.#publishHmr(prepared.hmrHub);
  }

  close() {
    this.#server?.stop(true);
    this.#wsServer?.stop(true);
    this.#server = null;
    this.#wsServer = null;
    this.#site = null;
    this.#attached = null;
    SignalContext.setHttpPeerResolver(null);
  }

  #websocketHandlers(prepared: AkanAppPrepared, webRouter: WebRouter | null, limits: ServerLimits) {
    return {
      ...ApiRouter.buildWebsocketHandlers({
        wsRoutes: prepared.wsRoutes,
        registry: this.#di.registry,
        live: this.#di.live,
        hmrHub: prepared.hmrHub,
        hmrState: webRouter
          ? {
              state: webRouter.renderState,
              refresh: () => webRouter.refreshHmrState(),
              errors: () => webRouter.hmrBuildErrors(),
            }
          : null,
        logger: this.#logger,
        onDrain: () => this.#binaryPubsub.flush(),
      }),
      idleTimeout: limits.wsIdleTimeout,
      data: {},
    } as Bun.WebSocketHandler<AppWsData | HmrWsData>;
  }

  #routeTable(site: ListenSite, prepared: AkanAppPrepared, kind: "main" | "ws"): NonNullHttpRoutes {
    //? Only the gateway dials the ws port, at the loopback address the ready message names. A page on a name
    //? rebound to 127.0.0.1 reaches it too, with its own name as Host, which the gateway's hop never carries.
    const allowlist = kind === "main" ? site.hostAllowlist : new HostAllowlist([AKAN_CHILD_HOST]);
    const upgradeAppWs: ApiRouteInputs["upgradeAppWs"] = (req, data) =>
      (kind === "main" ? this.#server : this.#wsServer)?.upgrade(req, { data }) ?? false;
    const { hold } = site;
    const routes = ApiRouter.buildRoutes({
      prefix: this.#owner.prefix,
      websocketPrefix: this.#owner.websocketPrefix,
      routes: prepared.routes,
      builtinRoutes: prepared.builtinRoutes,
      routeOptions: prepared.routeOptions,
      renderEnvRoutes: prepared.renderEnvRoutes,
      upgradeAppWs,
      webProxyRunner: prepared.webProxyRunner,
      hostAllowlist: hold ? null : allowlist,
      bodyLimits: site.limits,
      countChunkedBodies: !site.unix,
      idleTimeout: site.idleTimeout,
    });
    if (!hold) return routes;
    const held = hold.route(() => this.#attached?.[kind] ?? null);
    return hold.guard({ ...routes, "/*": held } as NonNullHttpRoutes, allowlist, held);
  }

  #serveWsFallback(
    site: ListenSite,
    prepared: AkanAppPrepared,
    websocketHandlers: Bun.WebSocketHandler<AppWsData | HmrWsData>,
  ) {
    const preferredWsPort = Number(process.env.AKAN_CHILD_WS_PORT);
    const wsServeOptions = (port: number) => ({
      idleTimeout: 0,
      port,
      hostname: "127.0.0.1",
      routes: this.#routeTable(site, prepared, "ws"),
      websocket: websocketHandlers,
    });
    try {
      this.#wsServer = Bun.serve(wsServeOptions(preferredWsPort));
    } catch (error) {
      if (!isPortInUseError(error)) throw error;
      // A stale replica may hold the preferred port; the gateway routes to the port the ready message reports.
      this.#logger.warn(`ws port ${preferredWsPort} is in use; falling back to an ephemeral port`);
      this.#wsServer = Bun.serve(wsServeOptions(0));
    }
    this.#logger.verbose(`${this.#owner.name} websocket fallback is serving on port ${this.#wsServer.port}`);
  }

  #publishHmr(hmrHub: HmrWsHub | null) {
    const server = this.#server;
    const wsServer = this.#wsServer;
    hmrHub?.setPublisher((topic, payload) => {
      server?.publish(topic, payload);
      wsServer?.publish(topic, payload);
    });
  }

  #bindLocalPublish(server: AppServer | null, wsServer: AppServer | null) {
    const websocket = this.#di.getWebsocketAdaptor();
    if (!websocket) throw new AkanError("invalidConfig", "WebSocket Redis adaptor is not registered");
    this.#binaryPubsub.setServers(server, wsServer);
    const subscribed = (roomId: string) =>
      (server?.subscriberCount(roomId) ?? 0) + (wsServer?.subscriberCount(roomId) ?? 0) > 0;
    const roomReplay = new RoomReplay({ vouches: RoomReplay.vouchesFor(websocket, this.#solo), subscribed });
    const rooms = localRoomsOf({
      servers: [server, wsServer],
      replay: roomReplay,
      binary: this.#binaryPubsub,
      subscribed,
      coalesces: (roomId) => SignalResolver.coalescesRoom(roomId),
    });
    SignalResolver.setLocalPublish(rooms.publish, websocket, this.#di.live, roomReplay, rooms.resync);
    this.#localPublish = rooms.publish;
    this.#roomReplay = roomReplay;
    this.#websocket = websocket;
  }
}
