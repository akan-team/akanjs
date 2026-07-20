import { generateJwtSecret, resolveJwt } from "@libs/util/srvkit";
import type { BaseEnv } from "akanjs/base";
import type { Account } from "akanjs/fetch";
import type { Middleware, SignalContext } from "akanjs/signal";
import type { AccessAccount, ReqType } from "./accountMiddleware.helper";

export class AccountMiddleware implements Middleware {
  static readonly refName = "AccountMiddleware";

  async use(env: BaseEnv) {
    const jwtSecret = generateJwtSecret(env.appName, env.environment);
    return async (context: SignalContext, next: () => Promise<unknown>) => {
      const req = (
        context.transport === "http" ? context.getHttpContext().req : context.getWebSocketContext().ws.data
      ) as Partial<ReqType>;
      const account = await resolveJwt<AccessAccount>(
        jwtSecret,
        req.headers?.get("authorization") ?? (req.cookies?.has("jwt") ? `Bearer ${req.cookies.get("jwt")}` : undefined),
        { appName: env.appName, environment: env.environment } as unknown as AccessAccount,
      );
      Object.assign(req, {
        account:
          account.tokenType === "access"
            ? account
            : ({ appName: env.appName, environment: env.environment } as Account),
        userAgent: req["user-agent"],
      });
      return await next();
    };
  }
}
