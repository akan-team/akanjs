import type { SignalContext } from "../../signal/signalContext";

//? Last of the global chain: the app's account middleware has already read the credential-less request as anonymous.
export class AgentToolsAccount {
  static readonly refName = "agentToolsAccount";
  // Keyed by the request object, which only `AgentTools` builds: nothing an HTTP caller sends can name an entry.
  static readonly #vouched = new WeakMap<Request, { account: unknown }>();

  static vouch(req: Request, account: unknown) {
    AgentToolsAccount.#vouched.set(req, { account });
  }

  use() {
    return async (context: SignalContext, next: () => Promise<unknown>) => {
      const req = context.getHttpContext().req as Request & { account?: unknown };
      const entry = AgentToolsAccount.#vouched.get(req);
      if (entry) req.account = entry.account;
      return await next();
    };
  }
}
