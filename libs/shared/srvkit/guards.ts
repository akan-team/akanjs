import type { Guard, SignalContext } from "akanjs/signal";
import type { SerAccount } from "./account";
import { allow } from "./guards.helper";

export class Every implements Guard {
  static name = "Every";
  canPass(context: SignalContext): boolean {
    const account =
      context.transport === "http"
        ? (context.getHttpContext<{ account?: SerAccount }>().req.account ?? null)
        : (context.getWebSocketContext<{ account?: SerAccount }>().ws.data.account ?? null);
    return allow(context, account, ["user", "admin", "superAdmin"]);
  }
}

export class Owner implements Guard {
  static name = "Owner";
  canPass(context: SignalContext): boolean {
    const account =
      context.transport === "http"
        ? (context.getHttpContext<{ account?: SerAccount }>().req.account ?? null)
        : (context.getWebSocketContext<{ account?: SerAccount }>().ws.data.account ?? null);
    return allow(context, account, ["user", "admin", "superAdmin"]);
  }
}

export class Admin implements Guard {
  static name = "Admin";
  canPass(context: SignalContext): boolean {
    const account =
      context.transport === "http"
        ? (context.getHttpContext<{ account?: SerAccount }>().req.account ?? null)
        : (context.getWebSocketContext<{ account?: SerAccount }>().ws.data.account ?? null);
    return allow(context, account, ["admin", "superAdmin"]);
  }
}

export class SuperAdmin implements Guard {
  static name = "SuperAdmin";
  canPass(context: SignalContext): boolean {
    const account =
      context.transport === "http"
        ? (context.getHttpContext<{ account?: SerAccount }>().req.account ?? null)
        : (context.getWebSocketContext<{ account?: SerAccount }>().ws.data.account ?? null);
    return allow(context, account, ["superAdmin"]);
  }
}

export class User implements Guard {
  static name = "User";
  canPass(context: SignalContext): boolean {
    const account =
      context.transport === "http"
        ? (context.getHttpContext<{ account?: SerAccount }>().req.account ?? null)
        : (context.getWebSocketContext<{ account?: SerAccount }>().ws.data.account ?? null);
    return allow(context, account, ["user"]);
  }
}

export class SelfOrAdmin implements Guard {
  static name = "User";
  private argName: string;
  constructor(argName?: string) {
    this.argName = argName ?? "userId";
  }
  canPass(context: SignalContext): boolean {
    const account =
      context.transport === "http"
        ? (context.getHttpContext<{ account?: SerAccount<{ self?: { id: string }; me?: { id: string } }> }>().req
            .account ?? null)
        : (context.getWebSocketContext<{ account?: SerAccount<{ self?: { id: string }; me?: { id: string } }> }>().ws
            .data.account ?? null);
    const userId = context.getArg(this.argName);
    return !!userId && !!account && (account.self?.id === userId || !!account.me);
  }
}
