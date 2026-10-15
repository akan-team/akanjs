import { getEnv } from "akanjs/base";
import { getAuthToken, secretStorage, setAuth } from "akanjs/client";
import { decodeJwtPayload } from "akanjs/common";

type RefreshScope = "user" | "admin";
type RefreshCall = (refreshToken: string | null) => Promise<{ jwt: string; refreshToken?: string | null }>;

export const refreshBeforeMs = 2 * 60 * 1000;

// A CSR client is cross-origin to the API, so the HttpOnly refresh cookie is neither kept nor sent: it holds the token
// the sign-in answer carries and hands it back in the refresh body instead.
const isCsrClient = () => {
  const env = getEnv();
  return env.side === "client" && env.renderMode === "csr";
};

const refreshTokenKey = (scope: RefreshScope) => `${scope}RefreshToken:${getEnv().appName}`;

export const saveRefreshToken = async (scope: RefreshScope, refreshToken?: string | null) => {
  if (!isCsrClient()) return;
  if (refreshToken) await secretStorage.setItem(refreshTokenKey(scope), refreshToken);
  else await secretStorage.removeItem(refreshTokenKey(scope));
};

export const loadRefreshToken = async (scope: RefreshScope): Promise<string | null> => {
  if (!isCsrClient()) return null;
  return (await secretStorage.getItem(refreshTokenKey(scope))) ?? null;
};

const isFresh = (scope: RefreshScope) => {
  const jwt = getAuthToken();
  if (!jwt) return false;
  try {
    const payload = decodeJwtPayload<{ exp?: number; self?: unknown; me?: unknown }>(jwt);
    const hasScope = scope === "user" ? !!payload.self : !!payload.me;
    return hasScope && !!payload.exp && payload.exp * 1000 - Date.now() > refreshBeforeMs;
  } catch {
    return false;
  }
};

const pending = new Map<RefreshScope, Promise<void>>();

// The server rotates a refresh token on use and reads a second use as theft, ending every session. So one refresh runs
// at a time per scope, across tabs as well (Web Locks), and a tab that waited checks whether another already refreshed.
export const refreshSession = (scope: RefreshScope, refresh: RefreshCall, { force = false } = {}): Promise<void> => {
  const running = pending.get(scope);
  if (running) return running;
  const run = async () => {
    if (!force && isFresh(scope)) return;
    const accessToken = await refresh(await loadRefreshToken(scope));
    setAuth({ jwt: accessToken.jwt });
    await saveRefreshToken(scope, accessToken.refreshToken);
  };
  const locks = typeof navigator === "undefined" ? undefined : navigator.locks;
  const next = (locks ? locks.request(`akan:refresh:${getEnv().appName}:${scope}`, run) : run()).finally(() =>
    pending.delete(scope),
  );
  pending.set(scope, next);
  return next;
};
