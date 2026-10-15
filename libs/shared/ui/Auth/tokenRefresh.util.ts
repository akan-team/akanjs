import { fetch } from "@libs/shared/client";
import { refreshSession } from "@libs/shared/webkit";
import type { AuthScope, TokenPayload } from "./tokenRefresh.type";

export const hasScope = (payload: TokenPayload, scope: AuthScope) => {
  return scope === "user" ? !!payload.self : !!payload.me;
};

export const refreshToken = (scope: AuthScope): Promise<void> =>
  refreshSession(scope, scope === "user" ? fetch.refreshJwt : fetch.refreshAdminJwt);

//? A refresh token the server rotated away, revoked or let expire never works again, so retrying only spams it.
const finalRefreshError =
  /(revoked|expired|invalid)RefreshToken|refreshTokenReuseDetected|noRefreshToken|userRestricted|userNotActiv/;

export const isFinalRefreshError = (error: unknown) => error instanceof Error && finalRefreshError.test(error.message);
