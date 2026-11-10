import { TrustedProxy } from "akanjs/common";
import { CrossSiteGuard } from "../../signal/CrossSiteGuard";
import { makeAkanChildProxyHeaders } from "../akanAppHeaders";
import { WsUpgrade } from "../routing/wsUpgrade";
import type { GatewayChildren } from "./gatewayChildren";
import type { GatewayConfig } from "./gatewayConfig";

export interface GatewayWsData {
  childIdx: number;
  upstream: WebSocket;
  clientIp: string | null;
  pending: (string | ArrayBuffer)[];
  pendingBytes: number;
}

// Bun's `WebSocket.close()` throws on receive-only codes (1004-1006), so every unsendable code is relayed as 1001.
const relayableCloseCode = (code: number): number => {
  if (code >= 3000 && code <= 4999) return code;
  if (code >= 1000 && code <= 1014 && code !== 1004 && code !== 1005 && code !== 1006) return code;
  return 1001;
};

export class GatewayWebSocketRelay {
  //? A frame sent before the replica's socket opens waits here; past this the client is flooding a connecting hop.
  static readonly #wsPendingLimitBytes = 1024 * 1024;
  static readonly #wsUpstreamOpenTimeoutMs = 10_000;

  readonly #config: GatewayConfig;
  readonly #children: GatewayChildren;
  readonly #wsCaps = {
    total: GatewayWebSocketRelay.#positiveIntEnv("AKAN_MAX_WEBSOCKETS"),
    perIp: GatewayWebSocketRelay.#positiveIntEnv("AKAN_MAX_WEBSOCKETS_PER_IP"),
  };
  #wsOpen = 0;
  readonly #wsOpenByIp = new Map<string, number>();

  constructor(config: GatewayConfig, children: GatewayChildren) {
    this.#config = config;
    this.#children = children;
  }

  upgrade(req: Request, server: Bun.Server<GatewayWsData>): Response | undefined {
    const child = this.#children.pickFederationChild();
    // Prefer the ws port the child actually bound (it may have fallen back); the computed one covers older children.
    const upstream = child?.upstream
      ? (child.wsUpstream ?? this.#config.childUpstreamOf(child.idx, child.role).ws)
      : null;
    if (!child || !upstream) return new Response("No websocket upstream is ready", { status: 503 });
    const url = new URL(req.url);
    //? Once upgraded here, a replica's refusal can only close the socket: the browser has to see the 403 from this hop.
    try {
      CrossSiteGuard.assertOrigin(req, url, url.pathname === "/_akan/hmr" ? "hmr" : "websocket");
    } catch {
      return new Response("Forbidden", { status: 403 });
    }
    if (!WsUpgrade.isRequested(req)) return WsUpgrade.required();
    const peer = server.requestIP(req) ?? undefined;
    const clientIp = TrustedProxy.clientAddress(req.headers, peer?.address);
    const refused = this.#refuseWebSocket(clientIp);
    if (refused) return refused;
    const upstreamWs = new WebSocket(`ws://${upstream.host}:${upstream.port}${url.pathname}${url.search}`, {
      headers: makeAkanChildProxyHeaders(req, child.idx, peer),
    } as unknown as string[]);
    // No socket id on this hop: the child mints the one its room bookkeeping and endpoints see.
    const upgraded = server.upgrade(req, {
      data: { childIdx: child.idx, upstream: upstreamWs, clientIp, pending: [], pendingBytes: 0 },
    });
    if (!upgraded) {
      upstreamWs.close();
      return new Response("WebSocket upgrade failed", { status: 500 });
    }
    child.metrics.activeWebSockets = (child.metrics.activeWebSockets ?? 0) + 1;
    this.#wsOpen += 1;
    if (clientIp) this.#wsOpenByIp.set(clientIp, (this.#wsOpenByIp.get(clientIp) ?? 0) + 1);
    return undefined;
  }

  #refuseWebSocket(clientIp: string | null): Response | null {
    const headers = { "cache-control": "no-store" };
    if (this.#wsCaps.total && this.#wsOpen >= this.#wsCaps.total)
      return new Response("Too many open websockets", { status: 503, headers });
    if (this.#wsCaps.perIp && clientIp && (this.#wsOpenByIp.get(clientIp) ?? 0) >= this.#wsCaps.perIp)
      return new Response("Too many open websockets from this address", { status: 429, headers });
    return null;
  }

  static #positiveIntEnv(name: string): number | null {
    const value = Number(process.env[name]);
    return Number.isInteger(value) && value > 0 ? value : null;
  }

  open(ws: Bun.ServerWebSocket<GatewayWsData>) {
    const upstream = ws.data.upstream;
    const openTimer =
      upstream.readyState === WebSocket.CONNECTING
        ? setTimeout(() => {
            if (upstream.readyState === WebSocket.OPEN) return;
            upstream.close();
            ws.close(1013, "upstream websocket did not open");
          }, GatewayWebSocketRelay.#wsUpstreamOpenTimeoutMs)
        : null;
    upstream.addEventListener("open", () => {
      if (openTimer) clearTimeout(openTimer);
      for (const message of ws.data.pending.splice(0)) upstream.send(message);
      ws.data.pendingBytes = 0;
    });
    upstream.addEventListener("message", (event) => {
      const result = ws.send(event.data as string | ArrayBuffer);
      if (result === 0) upstream.close();
    });
    upstream.addEventListener("close", (event) => {
      if (openTimer) clearTimeout(openTimer);
      ws.close(relayableCloseCode(event.code), event.reason);
    });
    upstream.addEventListener("error", () => ws.close(1011, "upstream websocket error"));
  }

  message(ws: Bun.ServerWebSocket<GatewayWsData>, message: string | ArrayBuffer | Uint8Array) {
    const upstream = ws.data.upstream;
    const payload =
      typeof message === "string"
        ? message
        : message instanceof ArrayBuffer
          ? message
          : new Uint8Array(message).slice().buffer;
    if (upstream.readyState === WebSocket.OPEN) {
      upstream.send(payload);
      return;
    }
    const size = typeof payload === "string" ? Buffer.byteLength(payload) : payload.byteLength;
    if (ws.data.pendingBytes + size > GatewayWebSocketRelay.#wsPendingLimitBytes) {
      ws.data.pending.length = 0;
      ws.close(1009, "too much data before the upstream opened");
      return;
    }
    ws.data.pending.push(payload as string | ArrayBuffer);
    ws.data.pendingBytes += size;
  }

  close(ws: Bun.ServerWebSocket<GatewayWsData>, code: number, reason: string) {
    ws.data.upstream.close(relayableCloseCode(code), reason);
    const child = this.#children.get(ws.data.childIdx);
    if (child) child.metrics.activeWebSockets = Math.max(0, (child.metrics.activeWebSockets ?? 1) - 1);
    this.#wsOpen = Math.max(0, this.#wsOpen - 1);
    const { clientIp } = ws.data;
    const remaining = clientIp ? (this.#wsOpenByIp.get(clientIp) ?? 1) - 1 : 0;
    if (clientIp && remaining > 0) this.#wsOpenByIp.set(clientIp, remaining);
    else if (clientIp) this.#wsOpenByIp.delete(clientIp);
  }
}
