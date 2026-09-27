import { getEnv } from "akanjs/base";
import {
  authTokenKey,
  decodeJwtPayload,
  isOwnAuthToken,
  Logger,
  legacyAuthTokenKey,
  readAuthToken,
} from "akanjs/common";
import type { Account } from "akanjs/fetch";
import { parseCookieHeader, cookies as serverCookies, headers as serverHeaders } from "akanjs/fetch";
import { secretStorage } from "./storage";
import { fetch } from "./useClient";

interface CookieOptions {
  path?: string;
  sameSite?: "strict" | "lax" | "none";
  secure?: boolean;
}

const isCsrClient = () => {
  const env = getEnv();
  return env.side === "client" && env.renderMode === "csr";
};

// WKWebView keeps no cookies for the native shell's custom-scheme page (`app://localhost`), so it keeps a jar in storage.
const cookieJarKey = "akan:cookies";
const pageKeepsCookies = () => (globalThis as { location?: Location }).location?.protocol !== "app:";
const readCookieJar = (): Record<string, string> => {
  try {
    return JSON.parse(localStorage.getItem(cookieJarKey) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
};
const writeCookieJar = (jar: Record<string, string>) => {
  localStorage.setItem(cookieJarKey, JSON.stringify(jar));
};

export const cookies = (): Map<string, { name: string; value: string }> => {
  if (getEnv().side === "server") return serverCookies();
  if (!pageKeepsCookies())
    return new Map(Object.entries(readCookieJar()).map(([name, value]) => [name, { name, value }]));
  return parseCookieHeader(document.cookie);
};

export const setCookie = (
  key: string,
  value: string,
  options: CookieOptions = { path: "/", sameSite: "none", secure: true },
) => {
  if (getEnv().side === "server") return;
  if (!pageKeepsCookies()) {
    writeCookieJar({ ...readCookieJar(), [key]: value });
    return;
  }
  const encoded = `${key}=${value}`;
  const path = options.path ? `; path=${options.path}` : "";
  const sameSite = options.sameSite ? `; SameSite=${options.sameSite}` : "";
  const secure = options.secure ? "; Secure" : "";
  // biome-ignore lint/suspicious/noDocumentCookie: Akan auth helpers intentionally manage browser cookies.
  document.cookie = `${encoded}${path}${sameSite}${secure}`;
};

/** Reads through `cookies()` on both sides: a hand-rolled `split("=")` cuts base64 padding and skips the `j:` form. */
export const getCookie = (key: string): string | undefined => cookies().get(key)?.value;

export const removeCookie = (key: string, options: { path: string } = { path: "/" }) => {
  // Nothing to do on the server: the response is what carries a Set-Cookie, and this helper has no hold on it.
  if (getEnv().side === "server") return;
  if (!pageKeepsCookies()) {
    const { [key]: _removed, ...rest } = readCookieJar();
    writeCookieJar(rest);
    return;
  }
  // biome-ignore lint/suspicious/noDocumentCookie: Akan auth helpers intentionally manage browser cookies.
  document.cookie = `${key}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=${options.path};`;
};
export const headers = (): Map<string, string> => {
  if (getEnv().side !== "server") return new Map();
  return serverHeaders();
};

export const getHeader = (key: string): string | undefined => {
  return headers().get(key);
};

export { authTokenKey };

const sentAuthToken = (): string | undefined => {
  try {
    return (fetch.instance as { jwt?: string | null } | undefined)?.jwt ?? undefined;
  } catch {
    // No client runtime is registered yet, so nothing has been sent.
    return undefined;
  }
};

/** The auth token this app holds: on a CSR client the one `fetch` sends first, since a native shell's page keeps no
 * session cookie; then the cookie jar, under the app-scoped key or a legacy global one. */
export const getAuthToken = (): string | undefined =>
  (isCsrClient() ? sentAuthToken() : undefined) ?? readAuthToken(getCookie);

/** The auth token this app holds in client storage — the OS credential store in a native app, localStorage elsewhere. */
export const getStoredAuthToken = async (): Promise<string | undefined> => {
  const scoped = await secretStorage.getItem(authTokenKey());
  if (scoped) return scoped;
  const legacy = await secretStorage.getItem(legacyAuthTokenKey);
  return legacy && isOwnAuthToken(legacy) ? legacy : undefined;
};

/** The current JWT's account when minted for this app and environment. Reads only the two credentials the server
 * honours — the app-scoped auth cookie (a CSR client's bearer token) and `Authorization: Bearer` — so the two never
 * disagree on who is signed in. */
export const getAccount = <AddData = unknown>(): Account<AddData> => {
  const jwt = getAuthToken() ?? getHeader("authorization")?.replace(/^Bearer\s+/i, "");
  const defaultAccount = { appName: getEnv().appName, environment: getEnv().environment } as Account<AddData>;
  if (!jwt) return defaultAccount;
  const account = decodeJwtPayload<Account<AddData>>(jwt);
  if (account.appName !== getEnv().appName || account.environment !== getEnv().environment) return defaultAccount;
  return account;
};
export interface GetOption {
  unauthorize: string;
}
interface SetAuthOption {
  jwt: string;
}
/** Sets the active auth token on fetch, the cookie jar (except on a CSR client), and client storage. */
export const setAuth = ({ jwt }: SetAuthOption) => {
  fetch.setJwt(jwt);
  // A CSR client authenticates with the bearer header alone; a cookie copy would only leave the token in a jar.
  if (!isCsrClient()) setCookie(authTokenKey(), jwt);
  void secretStorage.setItem(authTokenKey(), jwt);
  // The global key is shared by every app on this host; ours would keep feeding the migration fallback a stale token.
  removeCookie(legacyAuthTokenKey);
  void secretStorage.removeItem(legacyAuthTokenKey);
};

interface InitAuthOption {
  jwt?: string;
}
export const initAuth = ({ jwt }: InitAuthOption = {}) => {
  const stored = getAuthToken();
  const token = jwt ?? stored;
  if (token && !isOwnAuthToken(token)) {
    // A neighbouring app's token decodes fine and fails every guard: adopting it would trade our credential for a 401.
    Logger.warn("JWT ignored: it was minted for another app or environment");
    if (token === stored) resetAuth();
    return;
  }
  if (token) setAuth({ jwt: token });
  // Whether, never which: a record at this level reaches the rotating log file and every live subscriber.
  Logger.verbose(`JWT ${token ? "restored from cookie" : "not found in cookie"}`);
};

export const resetAuth = () => {
  fetch.setJwt(null);
  removeCookie(authTokenKey());
  removeCookie(legacyAuthTokenKey);
  void secretStorage.removeItem(authTokenKey());
  void secretStorage.removeItem(legacyAuthTokenKey);
};
