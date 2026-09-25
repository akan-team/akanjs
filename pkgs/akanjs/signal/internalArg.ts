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

/** Injects websocket state and subscription hooks into message/pubsub handlers. */
export class Ws implements InternalArg {
  onDisconnect?: () => void;
  onUnsubscribe?: () => void;
  getArg(context: SignalContext) {
    const webSocketContext = context.getWebSocketContext();
    const ws = webSocketContext.ws;
    return {
      ws,
      subscribe: webSocketContext.eventType === "subscribe",
      on: webSocketContext.on,
      off: webSocketContext.off,
    };
  }
}
