import { fetch } from "@libs/shared/client";
import { setAuth } from "akanjs/client";
import type { AuthScope, TokenPayload } from "./tokenRefresh.type";

export const hasScope = (payload: TokenPayload, scope: AuthScope) => {
  return scope === "user" ? !!payload.self : !!payload.me;
};

export const refreshToken = async (scope: AuthScope) => {
  const accessToken = scope === "user" ? await fetch.refreshJwt(null) : await fetch.refreshAdminJwt(null);
  setAuth({ jwt: accessToken.jwt });
};
