import { getEnv } from "akanjs/base";
import { legacyAuthTokenKey } from "./authCookie";
import { decodeJwtPayload } from "./jwtDecode";

// Scoped per app: cookies carry no port (RFC 6265), so every app on one host shares a jar.
export const authTokenKey = (): string => `${legacyAuthTokenKey}:${getEnv().appName}`;

export const isOwnAuthToken = (jwt: string): boolean => {
  const { appName, environment } = getEnv();
  try {
    const account = decodeJwtPayload<{ appName?: string; environment?: string }>(jwt);
    return account.appName === appName && account.environment === environment;
  } catch {
    return false;
  }
};

// A leftover global token is adopted only when it names this app: a neighbour's would fail every guard.
export const readAuthToken = (read: (key: string) => string | null | undefined): string | undefined => {
  const scoped = read(authTokenKey());
  if (scoped) return scoped;
  const legacy = read(legacyAuthTokenKey);
  return legacy && isOwnAuthToken(legacy) ? legacy : undefined;
};
