import { resolveJwt, resolveJwtSecret } from "@libs/util/srvkit";
import { getEnv } from "akanjs/base";
import { readAuthToken } from "akanjs/common";
import type { Account } from "akanjs/fetch";
import type { Middleware, SignalContext } from "akanjs/signal";
import type { ModulesOptions } from "../lib/option";
import type { AuthTokenMeta } from "./account";
import type { AccessAccount, ReqType } from "./accountMiddleware.helper";
import { isAgentToken } from "./agentCall";
import { RevokedSessions } from "./revokedSessions";

type ScopedAccount = AccessAccount & AuthTokenMeta & { self?: unknown; me?: unknown };

export class AccountMiddleware implements Middleware {
  static readonly refName = "AccountMiddleware";

  // Each identity in a token answers to its own session, so signing out of the console drops only `me`. A token
  // minted before the per-scope ids carries one `sid` for whatever it holds.
  static async withoutRevoked(account: ScopedAccount): Promise<Account | null> {
    if (isAgentToken(account) || (!account.selfSid && !account.meSid))
      return (await RevokedSessions.has(account.sid)) ? null : account;
    const [selfRevoked, meRevoked] = await Promise.all([
      RevokedSessions.has(account.selfSid),
      RevokedSessions.has(account.meSid),
    ]);
    const { self, me, ...rest } = account;
    return {
      ...rest,
      ...(self && !selfRevoked ? { self } : {}),
      ...(me && !meRevoked ? { me } : {}),
    } as Account;
  }

  async use(env: ModulesOptions) {
    const { appName, environment } = getEnv();
    const jwtSecret = resolveJwtSecret(appName, environment, env.security?.jwtSecret);
    return async (context: SignalContext, next: () => Promise<unknown>) => {
      const req = (
        context.transport === "http" ? context.getHttpContext().req : context.getWebSocketContext().ws.data
      ) as Partial<ReqType>;
      const cookieJwt = readAuthToken((key) => req.cookies?.get(key));
      const account = await resolveJwt<ScopedAccount>(
        jwtSecret,
        req.headers?.get("authorization") ?? (cookieJwt ? `Bearer ${cookieJwt}` : undefined),
        { appName, environment } as unknown as ScopedAccount,
      );
      const live = account.tokenType === "access" ? await AccountMiddleware.withoutRevoked(account) : null;
      Object.assign(req, {
        account: live ?? ({ appName, environment } as Account),
        userAgent: req.headers?.get("user-agent") ?? undefined,
      });
      return await next();
    };
  }
}
