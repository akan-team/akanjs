import { getEnv } from "akanjs/base";
import type { Middleware, SignalContext } from "akanjs/signal";
import { MachineToken } from "./machineToken";

interface AccountHolder {
  headers?: Headers;
  account?: Record<string, unknown>;
}

//* Registered after every lib middleware, so it reads the account they resolved and has the last word on `machine`:
//* only a verified machine token sets it, and whatever else put one there is taken off, a session's claims included.
export class MachineAccount implements Middleware {
  static readonly refName = "MachineAccount";

  use() {
    return async (context: SignalContext, next: () => Promise<unknown>) => {
      const holder = (
        context.transport === "http" ? context.getHttpContext().req : context.getWebSocketContext().ws.data
      ) as AccountHolder;
      const machine = MachineToken.fromAuthorization(holder.headers?.get("authorization"));
      const { machine: _unverified, ...account } = holder.account ?? {};
      if (machine) {
        const { appName, environment } = getEnv();
        holder.account = { ...(holder.account ? account : { appName, environment }), machine };
      } else if (holder.account && "machine" in holder.account) holder.account = account;
      return await next();
    };
  }
}
