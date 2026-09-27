import { fetch } from "@libs/shared/client";
import { loadRefreshToken, saveRefreshToken } from "@libs/shared/webkit";
import { setAuth } from "akanjs/client";
import type { AuthScope, TokenPayload } from "./tokenRefresh.type";

export const hasScope = (payload: TokenPayload, scope: AuthScope) => {
  return scope === "user" ? !!payload.self : !!payload.me;
};

// The server rotates a refresh token on use and reads a second use as theft, ending every session: one at a time.
const refreshing = new Map<AuthScope, Promise<void>>();

export const refreshToken = (scope: AuthScope): Promise<void> => {
  const pending = refreshing.get(scope);
  if (pending) return pending;
  const next = (async () => {
    const kept = await loadRefreshToken(scope);
    const accessToken = scope === "user" ? await fetch.refreshJwt(kept) : await fetch.refreshAdminJwt(kept);
    setAuth({ jwt: accessToken.jwt });
    await saveRefreshToken(scope, accessToken.refreshToken);
  })().finally(() => refreshing.delete(scope));
  refreshing.set(scope, next);
  return next;
};
