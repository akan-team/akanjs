import type { SignalContext } from "../../signal/signalContext";

//? Last of the global chain: the app's account middleware has already read the credential-less request as anonymous.
export class AgentToolsAccount {
  static readonly refName = "agentToolsAccount";
  // Keyed by the request object, which only `AgentTools` builds: nothing an HTTP caller sends can name an entry.
  static readonly #vouched = new WeakMap<Request, { account: unknown }>();

  static vouch(req: Request, account: unknown) {
    AgentToolsAccount.#vouched.set(req, { account: AgentToolsAccount.#withoutMachine(account) });
  }

  // Security: this runs after `MachineAccount`, so a `machine` left on the account would reach `.with(Machine)` unverified.
  static #withoutMachine(account: unknown) {
    if (typeof account !== "object" || account === null || !("machine" in account)) return account;
    const { machine: _unverified, ...claims } = account;
    return claims;
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
