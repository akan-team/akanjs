import { generateJwtSecret, resolveJwt } from "@libs/util/srvkit";
import type { BaseEnv } from "akanjs/base";
import type { Account } from "akanjs/fetch";
import type { Middleware, SignalContext } from "akanjs/signal";
import type { AccessAccount, ReqType } from "./accountMiddleware.helper";

interface WsAuthState {
  account?: Account;
  resolvedAuthorization?: string;
}

export class AccountMiddleware implements Middleware {
  static readonly refName = "AccountMiddleware";

  async use(env: BaseEnv) {
    const jwtSecret = generateJwtSecret(env.appName, env.environment);
    return async (context: SignalContext, next: () => Promise<unknown>) => {
      const req = (
        context.transport === "http" ? context.getHttpContext().req : context.getWebSocketContext().ws.data
      ) as Partial<ReqType>;
      const authorization =
        req.headers?.get("authorization") ?? (req.cookies?.has("jwt") ? `Bearer ${req.cookies.get("jwt")}` : undefined);
      // A socket verifies its token once per credential instead of once per frame.
      const wsState = context.transport === "websocket" ? (req as WsAuthState) : null;
      if (wsState?.account && wsState.resolvedAuthorization === (authorization ?? "")) return await next();
      const account = await resolveJwt<AccessAccount>(jwtSecret, authorization, {
        appName: env.appName,
        environment: env.environment,
      } as unknown as AccessAccount);
      Object.assign(req, {
        account:
          account.tokenType === "access"
            ? account
            : ({ appName: env.appName, environment: env.environment } as Account),
        userAgent: req["user-agent"],
      });
      if (wsState) wsState.resolvedAuthorization = authorization ?? "";
      return await next();
    };
  }
}
