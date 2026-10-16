import {
  Logger,
  type TunnelControlFromAgent,
  type TunnelReadyFrame,
  tunnelCloseCode,
  tunnelWireContract,
} from "akanjs/common";
import { TunnelDataSocket } from "./TunnelDataSocket";

export interface TunnelAgentOptions {
  /** The gateway, as `wss://tunnel.akanjs.com` — scheme included, no path, no trailing slash. */
  gatewayUrl: string;
  token: string;
  hostnames: string[];
  /** The local app, as `http://localhost:8282`. */
  origin: string;
  /** Where a `tcp` stream dials. Local by construction: an agent is a door into one machine, not a router. */
  tcpHost?: string;
  name?: string;
  /** Attempts on a link that has never gone ready before the agent gives up (default 10). */
  retryLimit?: number;
  onReady?: (ready: TunnelReadyFrame) => void;
  /** The control socket dropped and a reconnect is scheduled; the share is down until `onReady` comes again. */
  onLost?: (reason: string) => void;
  /** The gateway refused this agent for good. Nothing is retried after one of these. */
  onFatal?: (error: Error) => void;
}

/** A refusal the gateway will repeat: retrying a revoked token forever is worse than saying so once. */
const fatalCloseCodes = new Set<number>([
  tunnelCloseCode.unauthorized,
  tunnelCloseCode.unsupportedVersion,
  tunnelCloseCode.hostnameNotGranted,
  tunnelCloseCode.superseded,
]);

const backoffMs = [1_000, 2_000, 4_000, 8_000, 15_000];

// An HTTP-status refusal at the upgrade (or a proxy's) arrives as a bare 1006, indistinguishable from a dropped
// link — so a link that never went ready is retried only this many times; one that did is exempt.
const coldAttemptLimit = 10;

// `setInterval` runs a NaN, negative or over-2^31 delay every 1 ms, so a gateway interval outside this is ignored.
const heartbeatRangeMs = { min: 1_000, max: 300_000 } as const;

/** Dials out to the gateway, so its machine needs no public address, no inbound port and no NAT traversal. */
export class TunnelAgent {
  readonly #options: TunnelAgentOptions;
  readonly logger = new Logger("TunnelAgent");
  readonly #sockets = new Set<TunnelDataSocket>();
  #ws: WebSocket | null = null;
  #ready: TunnelReadyFrame | null = null;
  #heartbeat: ReturnType<typeof setInterval> | null = null;
  #retry: ReturnType<typeof setTimeout> | null = null;
  #attempts = 0;
  #lastInboundAt = 0;
  #everReady = false;
  #stopped = false;

  constructor(options: TunnelAgentOptions) {
    this.#options = options;
  }

  get ready() {
    return this.#ready;
  }

  /** Resolves with the gateway's own view of the share — the hostnames and URLs it will actually serve. */
  start(): Promise<TunnelReadyFrame> {
    return new Promise<TunnelReadyFrame>((resolve, reject) => {
      const onReady = (ready: TunnelReadyFrame) => {
        this.#options.onReady?.(ready);
        resolve(ready);
      };
      const onFatal = (error: Error) => {
        this.#options.onFatal?.(error);
        reject(error);
      };
      this.#connect(onReady, onFatal);
    });
  }

  async stop(reason = "client stopped") {
    if (this.#stopped) return;
    this.#stopped = true;
    this.#stopHeartbeat();
    if (this.#retry) clearTimeout(this.#retry);
    this.#retry = null;
    this.#say({ type: "bye", reason });
    for (const socket of this.#sockets) socket.close();
    this.#sockets.clear();
    this.#ws?.close();
    this.#ws = null;
    this.#ready = null;
  }

  #connect(onReady: (ready: TunnelReadyFrame) => void, onFatal: (error: Error) => void) {
    if (this.#stopped) return;
    const { gatewayUrl, token, hostnames, name } = this.#options;
    const ws = new WebSocket(`${gatewayUrl}${tunnelWireContract.controlPath}`, {
      headers: { authorization: `${tunnelWireContract.authScheme} ${token}` },
    } as unknown as string[]);
    this.#ws = ws;
    ws.onopen = () => {
      this.#lastInboundAt = Date.now();
      this.#say({
        type: "hello",
        version: tunnelWireContract.version,
        hostnames,
        agent: { name: name ?? "akan", version: Bun.version, platform: process.platform },
      });
    };
    ws.onmessage = (event) => {
      this.#lastInboundAt = Date.now();
      this.#receive(event.data, onReady);
    };
    ws.onerror = () => this.logger.verbose(`Tunnel control socket error`);
    ws.onclose = (event) => this.#dropped(event.code, event.reason, onReady, onFatal);
  }

  #receive(data: unknown, onReady: (ready: TunnelReadyFrame) => void) {
    if (typeof data !== "string") return;
    const frame = tunnelWireContract.parseFrame(data);
    if (!frame) return;
    switch (frame.type) {
      case "ready":
        this.#ready = frame;
        this.#everReady = true;
        // Reset here rather than on `open`: a socket that opens and drops with no `ready` has not worked yet.
        this.#attempts = 0;
        this.#startHeartbeat(TunnelAgent.#heartbeatOf(frame.heartbeatMs));
        this.#grow();
        this.logger.info(`Tunnel ready: ${frame.urls.join(", ")}`);
        onReady(frame);
        return;
      case "demand":
        if (this.#ready) this.#ready = { ...this.#ready, idle: frame.idle };
        this.#grow();
        return;
      case "ping":
        this.#say({ type: "pong", at: frame.at });
        return;
      case "pong":
        return;
      case "bye":
        this.logger.info(`Tunnel closed by the gateway${frame.reason ? `: ${frame.reason}` : ""}`);
        void this.stop(frame.reason ?? "gateway closed");
        return;
      default:
        this.logger.warn(`Tunnel control socket received an unexpected frame: ${frame.type}`);
    }
  }

  #dropped(code: number, reason: string, onReady: (ready: TunnelReadyFrame) => void, onFatal: (error: Error) => void) {
    this.#stopHeartbeat();
    this.#ws = null;
    this.#ready = null;
    // The data sockets belonged to a session the gateway has now forgotten; none of them can carry a stream.
    for (const socket of this.#sockets) socket.close();
    this.#sockets.clear();
    if (this.#stopped) return;
    if (fatalCloseCodes.has(code)) {
      this.#stopped = true;
      onFatal(new Error(`Tunnel refused by the gateway (${code}${reason ? `: ${reason}` : ""})`));
      return;
    }
    const limit = this.#options.retryLimit ?? coldAttemptLimit;
    if (!this.#everReady && this.#attempts >= limit) {
      this.#stopped = true;
      onFatal(
        new Error(
          `Tunnel never connected after ${limit} attempts (last close ${code}${reason ? `: ${reason}` : ""}). ` +
            `Check the token and the gateway url.`,
        ),
      );
      return;
    }
    const wait = backoffMs[Math.min(this.#attempts, backoffMs.length - 1)] ?? 15_000;
    this.#attempts += 1;
    this.#options.onLost?.(reason || `closed with ${code}`);
    this.logger.warn(`Tunnel disconnected (${code}), reconnecting in ${wait}ms`);
    this.#retry = setTimeout(() => {
      this.#retry = null;
      this.#connect(onReady, onFatal);
    }, wait);
  }

  #startHeartbeat(intervalMs: number) {
    this.#stopHeartbeat();
    this.#lastInboundAt = Date.now();
    this.#heartbeat = setInterval(() => {
      const ws = this.#ws;
      if (ws?.readyState !== WebSocket.OPEN) return;
      // A socket the network dropped without a FIN keeps accepting `send()`, so silence is the only tell.
      if (Date.now() - this.#lastInboundAt > intervalMs * 3) {
        this.logger.warn(`Tunnel control socket is silent, reconnecting`);
        ws.close();
        return;
      }
      this.#say({ type: "ping", at: Date.now() });
    }, intervalMs);
    this.#heartbeat.unref?.();
  }

  #stopHeartbeat() {
    if (this.#heartbeat) clearInterval(this.#heartbeat);
    this.#heartbeat = null;
  }

  static #heartbeatOf(requestedMs: number) {
    return requestedMs >= heartbeatRangeMs.min && requestedMs <= heartbeatRangeMs.max
      ? requestedMs
      : tunnelWireContract.defaultHeartbeatMs;
  }

  #say(frame: TunnelControlFromAgent) {
    if (this.#ws?.readyState !== WebSocket.OPEN) return;
    this.#ws.send(JSON.stringify(frame));
  }

  #grow() {
    const ready = this.#ready;
    if (!ready || this.#stopped) return;
    const idle = [...this.#sockets].filter((socket) => !socket.busy).length;
    const room = Math.min(ready.idle - idle, ready.maxSockets - this.#sockets.size);
    for (let opened = 0; opened < room; opened += 1) this.#open(ready.sessionId);
  }

  #open(sessionId: string) {
    const { gatewayUrl, token, origin, tcpHost = "127.0.0.1" } = this.#options;
    const socket = new TunnelDataSocket({
      gatewayUrl,
      token,
      sessionId,
      origin,
      tcpHost,
      logger: this.logger,
      onIdle: () => this.#grow(),
      onBusy: () => this.#grow(),
      onGone: (gone) => {
        this.#sockets.delete(gone);
        this.#grow();
      },
    });
    this.#sockets.add(socket);
    socket.open();
  }
}
