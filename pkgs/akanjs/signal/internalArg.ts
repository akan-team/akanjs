import type { Cls, PromiseOrObject } from "akanjs/base";
import type { SignalContext } from "./signalContext";

export interface InternalArg<ArgType = unknown> {
  getArg: (context: SignalContext) => PromiseOrObject<ArgType | null>;
}
export type InternalArgCls<ArgType = unknown> = Cls<InternalArg<ArgType>>;

export class Req implements InternalArg {
  getArg(context: SignalContext): Bun.BunRequest {
    const httpContext = context.getHttpContext();
    return httpContext.req;
  }
}
export class Res implements InternalArg {
  getArg(context: SignalContext) {
    const httpContext = context.getHttpContext();
    return httpContext.res;
  }
}

/** Whatever the account middleware resolved for this call, or `null` for an anonymous one. */
export class CallerAccount implements InternalArg<unknown> {
  getArg(context: SignalContext): unknown {
    return context.get("account") ?? null;
  }
}

/** A device or service a machine token names: `version` is what a guard compares to revoke it. */
export interface MachineIdentity {
  kind: string;
  id: string;
  version: number;
}

/** The machine a verified machine token proved for this call; required unless declared `{ nullable: true }`. */
export class Machine implements InternalArg<MachineIdentity | null> {
  getArg(context: SignalContext): MachineIdentity | null {
    return context.get<{ machine?: MachineIdentity }>("account")?.machine ?? null;
  }
}

/** The caller's IP as the nearest proxy recorded it (see `SignalContext.getClientIp`), `null` when unknown. */
export class Ip implements InternalArg<string | null> {
  getArg(context: SignalContext): string | null {
    return context.getClientIp();
  }
}

/**
 * `socketId` is the one minted at the handshake — never mint your own, it would not match the room bookkeeping.
 * `on`/`off` register cleanup for unsubscribe or socket close.
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
