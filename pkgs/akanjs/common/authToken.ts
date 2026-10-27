import { getEnv } from "akanjs/base";
import { legacyAuthTokenKey } from "./authCookie";
import type { CookieJar } from "./cookieJar";
import { decodeJwtPayload } from "./jwtDecode";

export interface SessionRead {
  token?: string;
  duplicate?: { name: string; count: number };
}

const scopedAuthTokenKey = () => `${legacyAuthTokenKey}:${getEnv().appName}`;

//? Scoped per app: cookies carry no port (RFC 6265), so every app on one host shares a jar. Outside local the name
//? takes `__Host-`, which a browser accepts only from this host over HTTPS at `Path=/`, so neither a sibling subdomain
//? nor a parent domain can plant a copy beside it; a plain-http local server cannot keep the Secure it needs.
export const authTokenKey = (): string =>
  getEnv().operationMode === "local" ? scopedAuthTokenKey() : `__Host-${scopedAuthTokenKey()}`;

/** The names the session cookie went by before `authTokenKey()`; never read, and `initAuth`, sign-in and sign-out
 * expire them. */
export const retiredAuthTokenKeys = (): string[] =>
  [legacyAuthTokenKey, scopedAuthTokenKey()].filter((key) => key !== authTokenKey());

export const isOwnAuthToken = (jwt: string): boolean => {
  const { appName, environment } = getEnv();
  try {
    const account = decodeJwtPayload<{ appName?: string; environment?: string }>(jwt);
    return account.appName === appName && account.environment === environment;
  } catch {
    return false;
  }
};

//? Two copies of the session cookie are no answer: a copy planted under a parent domain can sit beside ours, and
//? nothing in the request says which one this app wrote.
export const readSessionToken = (jar: CookieJar): SessionRead => {
  const name = authTokenKey();
  const { value, count } = jar.read(name);
  if (count > 1) return { duplicate: { name, count } };
  return value ? { token: value } : {};
};

/** @deprecated Reads the first value a lookup returns, so it cannot see a duplicated cookie; use `readSessionToken`. */
export const readAuthToken = (read: (key: string) => string | null | undefined): string | undefined =>
  read(authTokenKey()) || undefined;
