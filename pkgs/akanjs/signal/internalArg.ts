import type { Cls, PromiseOrObject } from "akanjs/base";
import type { SignalContext } from "./signalContext";

export interface InternalArg<ArgType = unknown> {
  getArg: (context: SignalContext) => PromiseOrObject<ArgType | null>;
}
export type InternalArgCls<ArgType = unknown> = Cls<InternalArg<ArgType>>;

/** Injects the current Bun request into an endpoint/internal handler. */
export class Req implements InternalArg {
  getArg(context: SignalContext): Bun.BunRequest {
    const httpContext = context.getHttpContext();
    return httpContext.req;
  }
}
/** Injects the current mutable response context into an endpoint/internal handler. */
export class Res implements InternalArg {
  getArg(context: SignalContext) {
    const httpContext = context.getHttpContext();
    return httpContext.res;
  }
}

/**
 * Injects the caller's IP, as the nearest proxy recorded it rather than as the socket peer reports it.
 * Behind the federation gateway every peer is the gateway, so an endpoint that reads `remoteAddress` sees
 * `127.0.0.1` for every caller — this reads the forwarded headers first and falls back to the peer only
 * when nothing proxied the call. IPv4 comes back unwrapped from `::ffff:`, so it can address a `udp4`
 * socket. `null` when no proxy recorded one and the transport has no peer.
 */
export class Ip implements InternalArg<string | null> {
  getArg(context: SignalContext): string | null {
    return context.getClientIp();
  }
}

/**
 * Injects websocket state, this connection's id, and subscription hooks into message/pubsub handlers.
 * `socketId` is the one `AppWsData` minted at the handshake, so a handler never reads `ws.data` to
 * tell two callers apart — and never mints an id of its own, which would not match the room bookkeeping.
 * `on`/`off` register cleanup that runs when the room is unsubscribed or the socket closes.
 */
export class Ws implements InternalArg {
  getArg(context: SignalContext) {
    const webSocketContext = context.getWebSocketContext<{ socketId: string }>();
    const ws = webSocketContext.ws;
    return {
      ws,
      socketId: ws.data.socketId,
      subscribe: webSocketContext.eventType === "subscribe",
      on: webSocketContext.on,
      off: webSocketContext.off,
    };
  }
}
