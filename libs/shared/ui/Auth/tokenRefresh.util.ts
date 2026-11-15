import type { AuthScope, TokenPayload } from "./tokenRefresh.type";

export const hasScope = (payload: TokenPayload, scope: AuthScope) => {
  return scope === "user" ? !!payload.self : !!payload.me;
};

//? A refresh token the server rotated away, revoked or let expire never works again, so retrying only spams it.
const finalRefreshError =
  /(revoked|expired|invalid)RefreshToken|refreshTokenReuseDetected|noRefreshToken|userRestricted|userNotActiv/;

export const isFinalRefreshError = (error: unknown) => error instanceof Error && finalRefreshError.test(error.message);

const firstRetryDelayMs = 3 * 1000;
const retryDelayMs = 30 * 1000;
const maxRetryDelayMs = 10 * 60 * 1000;

//? Past `browserRefreshGraceMs` (10 s) the retry of a refresh whose answer was lost reads as reuse, ending every session.
export const retryDelayOf = (failures: number) =>
  failures <= 1 ? firstRetryDelayMs : Math.min(retryDelayMs * 2 ** (failures - 2), maxRetryDelayMs);
