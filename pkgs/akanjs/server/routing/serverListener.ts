import { AkanError } from "akanjs/base";
import type { Logger } from "akanjs/common";
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
type BuildRoutes = (upgradeAppWs: ApiRouteInputs["upgradeAppWs"], allowlist: HostAllowlist | null) => NonNullHttpRoutes;

export class ServerListener {
  readonly #owner: ListenerOwner;
  readonly #logger: Logger;
  readonly #di: DiLifecycle;
  readonly #solo: boolean;
  readonly #binaryPubsub = new BinaryPubsub();
  #server: AppServer | null = null;
  #wsServer: AppServer | null = null;
  #localPublish: LocalPublish | null = null;

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

  listen(prepared: AkanAppPrepared, webRouter: WebRouter | null) {
    const port = process.env.AKAN_CHILD_SOCKET
      ? undefined
      : Number(process.env.AKAN_CHILD_WS_PORT || process.env.PORT || 8282);
    const unix = process.env.AKAN_CHILD_SOCKET || undefined;
    this.#logger.verbose(`${this.#owner.name} is serving on ${unix ? `unix://${unix}` : `port ${port}`}`);
    const { routes, routeOptions, wsRoutes, builtinRoutes, renderEnvRoutes, hmrHub, webProxyRunner } = prepared;
    const limits = new ServerLimits();
    const websocketHandlers = {
      ...ApiRouter.buildWebsocketHandlers({
        wsRoutes,
        registry: this.#di.registry,
        live: this.#di.live,
        hmrHub,
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
    //? Behind the gateway the Host a child sees is the gateway's hop, so only a server bound to TCP checks it.
    const hostAllowlist = unix ? null : HostAllowlist.fromEnv();
    const hostname = ServerLimits.listenHostname();
    //? Off on the gateway's socket: it bounds each client, and a pooled keep-alive this side closed would answer 502.
    const idleTimeout = unix ? 0 : limits.idleTimeout;
    const buildRoutes: BuildRoutes = (upgradeAppWs, allowlist) =>
      ApiRouter.buildRoutes({
        prefix: this.#owner.prefix,
        websocketPrefix: this.#owner.websocketPrefix,
        routes,
        builtinRoutes,
        routeOptions,
        renderEnvRoutes,
        upgradeAppWs,
        webProxyRunner,
        hostAllowlist: allowlist,
        bodyLimits: limits,
        countChunkedBodies: !unix,
        idleTimeout,
      });
    const serve = () =>
      Bun.serve({
        idleTimeout,
        maxRequestBodySize: limits.uploadBodyBytes,
        ...(unix ? { unix } : { port, hostname }),
        routes: buildRoutes((req, data) => this.#server?.upgrade(req, { data }) ?? false, hostAllowlist),
        websocket: websocketHandlers,
      } as Parameters<typeof Bun.serve>[0]);
    this.#server = unix ? ServerLimits.serveOwnerOnly(unix, serve) : serve();
    if (unix && process.env.AKAN_CHILD_WS_PORT) this.#serveWsFallback(buildRoutes, websocketHandlers);

    const server = this.#server;
    const wsServer = this.#wsServer;
    //? `requestIP` answers `null` for a unix socket and for a request this server never received alike; only the
    //? first is a local hop, and on TCP a request with no socket behind it must not read as one.
    SignalContext.setHttpPeerResolver((req) => server?.requestIP(req as Bun.BunRequest) ?? (unix ? null : undefined));
    hmrHub?.setPublisher((topic, payload) => {
      server?.publish(topic, payload);
      wsServer?.publish(topic, payload);
    });
    this.#bindLocalPublish(server, wsServer);
    return { unix, port };
  }

  close() {
    this.#server?.stop(true);
    this.#wsServer?.stop(true);
    this.#server = null;
    this.#wsServer = null;
    SignalContext.setHttpPeerResolver(null);
  }

  #serveWsFallback(buildRoutes: BuildRoutes, websocketHandlers: Bun.WebSocketHandler<AppWsData | HmrWsData>) {
    const preferredWsPort = Number(process.env.AKAN_CHILD_WS_PORT);
    //? Only the gateway dials this port, at the loopback address the ready message names below. A page on a name
    //? rebound to 127.0.0.1 reaches it too, with its own name as Host, which the gateway's hop never carries.
    const wsServeOptions = (port: number) => ({
      idleTimeout: 0,
      port,
      hostname: "127.0.0.1",
      routes: buildRoutes(
        (req, data) => this.#wsServer?.upgrade(req, { data }) ?? false,
        new HostAllowlist([AKAN_CHILD_HOST]),
      ),
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
  }
}
