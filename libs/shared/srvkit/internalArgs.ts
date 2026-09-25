import type { Me as BaseMe, Self as BaseSelf } from "@libs/shared/common";
import type { InternalArg, SignalContext } from "akanjs/signal";
import type { SerAccount } from "./account";

export class Account implements InternalArg {
  getArg(context: SignalContext) {
    if (context.transport === "http") return context.getHttpContext<{ account?: SerAccount }>().req.account ?? null;
    else if (context.transport === "websocket")
      return context.getWebSocketContext<{ account?: SerAccount }>().ws.data.account ?? null;
  }
}

export class Self implements InternalArg {
  getArg(context: SignalContext) {
    if (context.transport === "http")
      return context.getHttpContext<{ account?: SerAccount<{ self?: BaseSelf }> }>().req.account?.self ?? null;
    else if (context.transport === "websocket")
      return context.getWebSocketContext<{ account?: SerAccount<{ self?: BaseSelf }> }>().ws.data.account?.self ?? null;
  }
}

export class Me implements InternalArg {
  getArg(context: SignalContext) {
    if (context.transport === "http")
      return context.getHttpContext<{ account?: SerAccount<{ me?: BaseMe }> }>().req.account?.me ?? null;
    else if (context.transport === "websocket")
      return context.getWebSocketContext<{ account?: SerAccount<{ me?: BaseMe }> }>().ws.data.account?.me ?? null;
  }
}
