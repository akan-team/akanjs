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

type ScopedAccount = AccessAccount & AuthTokenMeta & { self?: unknown; me?: unknown; exp?: number };

interface VerifiedToken {
  authorization: string | undefined;
  account: ScopedAccount;
}

export class AccountMiddleware implements Middleware {
  static readonly refName = "AccountMiddleware";
  //? A socket re-presents the same token on every frame, and its signature verifies the same way until it expires;
  //? the revocation check below is not cached, so a revoked session still loses the next frame.
  static readonly #verifiedBySocket = new WeakMap<object, VerifiedToken>();

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
      const authorization = req.headers?.get("authorization") ?? (cookieJwt ? `Bearer ${cookieJwt}` : undefined);
      const resolve = () =>
        resolveJwt<ScopedAccount>(jwtSecret, authorization, { appName, environment } as unknown as ScopedAccount);
      const account =
        context.transport === "websocket"
          ? await AccountMiddleware.#verifiedOnSocket(req, authorization, resolve)
          : await resolve();
      const live = account.tokenType === "access" ? await AccountMiddleware.withoutRevoked(account) : null;
      Object.assign(req, {
        account: live ?? ({ appName, environment } as Account),
        userAgent: req.headers?.get("user-agent") ?? undefined,
      });
      return await next();
    };
  }

  // A copy per frame, so nothing a frame's handlers write onto the account reaches the next one.
  static async #verifiedOnSocket(
    socket: object,
    authorization: string | undefined,
    resolve: () => Promise<ScopedAccount>,
  ): Promise<ScopedAccount> {
    const verified = AccountMiddleware.#verifiedBySocket.get(socket);
    const reusable =
      !!verified &&
      verified.authorization === authorization &&
      (verified.account.exp === undefined || verified.account.exp * 1000 > Date.now());
    if (verified && reusable) return { ...verified.account };
    const account = await resolve();
    AccountMiddleware.#verifiedBySocket.set(socket, { authorization, account });
    return { ...account };
  }
}
