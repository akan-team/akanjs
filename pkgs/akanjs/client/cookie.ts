import { getEnv } from "akanjs/base";
import {
  authTokenKey,
  bearerTokenOf,
  type CookieEntry,
  CookieJar,
  CookieSweep,
  decodeJwtPayload,
  isOwnAuthToken,
  Logger,
  legacyAuthTokenKey,
  readSessionToken,
  retiredAuthTokenKeys,
  SessionCookies,
} from "akanjs/common";
import type { Account } from "akanjs/fetch";
import { cookieJar as serverCookieJar, headers as serverHeaders } from "akanjs/fetch";
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
const storedCookiesKey = "akan:cookies";
const pageLocation = () => (globalThis as { location?: Location }).location;
const pageKeepsCookies = () => pageLocation()?.protocol !== "app:";
const readStoredCookies = (): Record<string, string> => {
  try {
    return JSON.parse(localStorage.getItem(storedCookiesKey) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
};
const writeStoredCookies = (stored: Record<string, string>) => {
  localStorage.setItem(storedCookiesKey, JSON.stringify(stored));
};

/** Every cookie this page or request holds, a name sent more than once included. */
export const cookieJar = (): CookieJar => {
  if (getEnv().side === "server") return serverCookieJar();
  if (!pageKeepsCookies())
    return CookieJar.parse(
      Object.entries(readStoredCookies())
        .map(([name, value]) => `${name}=${value}`)
        .join("; "),
    );
  return CookieJar.parse(document.cookie);
};

/** Names held exactly once; a duplicated name is left out. */
export const cookies = (): Map<string, CookieEntry> => cookieJar().toMap();

export const setCookie = (
  key: string,
  value: string,
  { path = "/", sameSite = "lax", secure = true }: CookieOptions = {},
) => {
  if (getEnv().side === "server") return;
  if (!pageKeepsCookies()) {
    writeStoredCookies({ ...readStoredCookies(), [key]: value });
    return;
  }
  const pathAttr = path ? `; path=${path}` : "";
  const secureAttr = secure ? "; Secure" : "";
  // biome-ignore lint/suspicious/noDocumentCookie: Akan auth helpers intentionally manage browser cookies.
  document.cookie = `${key}=${value}${pathAttr}; SameSite=${sameSite}${secureAttr}`;
};

/** `undefined` for a name held more than once, as for one never set. */
export const getCookie = (key: string): string | undefined => cookieJar().read(key).value;

export const removeCookie = (key: string, options: { path: string } = { path: "/" }) => {
  // Nothing to do on the server: the response is what carries a Set-Cookie, and this helper has no hold on it.
  if (getEnv().side === "server") return;
  if (!pageKeepsCookies()) {
    const { [key]: _removed, ...rest } = readStoredCookies();
    writeStoredCookies(rest);
    return;
  }
  //? A browser drops a `__Host-` / `__Secure-` write without Secure, the deletion included.
  const secureAttr = /^__(Host|Secure)-/.test(key) ? " Secure;" : "";
  // biome-ignore lint/suspicious/noDocumentCookie: Akan auth helpers intentionally manage browser cookies.
  document.cookie = `${key}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=${options.path};${secureAttr}`;
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
 * session cookie; then the app-scoped cookie, unless it is held more than once. */
export const getAuthToken = (): string | undefined =>
  (isCsrClient() ? sentAuthToken() : undefined) ?? readSessionToken(cookieJar()).token;

/** The auth token this app holds in client storage — the OS credential store in a native app, localStorage elsewhere. */
export const getStoredAuthToken = async (): Promise<string | undefined> =>
  (await secretStorage.getItem(storedAuthTokenKey())) ?? undefined;

//? Storage is no cookie jar, so it keeps the app-scoped name: `__Host-` means nothing there.
const storedAuthTokenKey = () => `${legacyAuthTokenKey}:${getEnv().appName}`;

/** The current JWT's account when minted for this app and environment. Reads only the two credentials the server
 * honours — the app-scoped auth cookie (a CSR client's bearer token) and `Authorization: Bearer` — so the two never
 * disagree on who is signed in. */
export const getAccount = <AddData = unknown>(): Account<AddData> => {
  const defaultAccount = { appName: getEnv().appName, environment: getEnv().environment } as Account<AddData>;
  //? An MCP view holds no token: the host relays its calls, and the server handed the view the caller's claims.
  const embedded = globalThis.__AKAN_EMBED__;
  if (embedded)
    return embedded.account ? ({ ...defaultAccount, ...embedded.account } as Account<AddData>) : defaultAccount;
  const jwt = getAuthToken() ?? bearerTokenOf(getHeader("authorization"));
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
const announceAuth = () => {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("akan:auth"));
};
/** Sets the active auth token on fetch, the cookie jar (except on a CSR client), and client storage. */
export const setAuth = ({ jwt }: SetAuthOption) => {
  fetch.setJwt(jwt);
  // A CSR client authenticates with the bearer header alone; a cookie copy would only leave the token in a jar.
  if (!isCsrClient()) setCookie(authTokenKey(), jwt);
  void secretStorage.setItem(storedAuthTokenKey(), jwt);
  // Jars written before the key was scoped or prefixed still hold it under an older name.
  for (const key of retiredAuthTokenKeys()) removeCookie(key);
  void secretStorage.removeItem(legacyAuthTokenKey);
  announceAuth();
};

interface InitAuthOption {
  jwt?: string;
}

const sweepDocumentCookies = (names: string[]) => {
  const { hostname = "", pathname = "/" } = pageLocation() ?? {};
  // biome-ignore lint/suspicious/noDocumentCookie: only a Set-Cookie naming the parent Domain deletes its copy.
  for (const entry of CookieSweep.setCookies({ names, host: hostname, path: pathname })) document.cookie = entry;
};

// `null` when copies of the session cookie outlive the sweep: a host-only copy cannot be told from a planted one.
const readCookieSession = (): string | null | undefined => {
  const first = readSessionToken(cookieJar());
  if (!first.duplicate) return first.token;
  SessionCookies.report([first.duplicate], pageLocation()?.host ?? "");
  sweepDocumentCookies([first.duplicate.name]);
  const second = readSessionToken(cookieJar());
  return second.duplicate ? null : second.token;
};

const expireRetiredCookies = () => {
  const jar = cookieJar();
  for (const key of retiredAuthTokenKeys()) if (jar.has(key)) removeCookie(key);
};

export const initAuth = ({ jwt }: InitAuthOption = {}) => {
  expireRetiredCookies();
  const sent = jwt ?? (isCsrClient() ? sentAuthToken() : undefined);
  const token = sent ?? readCookieSession();
  if (token === null) {
    fetch.setJwt(null);
    return;
  }
  if (token && !isOwnAuthToken(token)) {
    // A neighbouring app's token decodes fine and fails every guard: adopting it would trade our credential for a 401.
    Logger.warn("JWT ignored: it was minted for another app or environment");
    if (!jwt) resetAuth();
    return;
  }
  if (token && sent) setAuth({ jwt: token });
  else if (token) {
    //? Not written back: rewriting a parent-domain copy as host-only would keep it after its writer clears it.
    fetch.setJwt(token);
    announceAuth();
  }
  // Whether, never which: a record at this level reaches the rotating log file and every live subscriber.
  Logger.verbose(`JWT ${token ? "restored" : "not found"}`);
};

export const resetAuth = () => {
  fetch.setJwt(null);
  removeCookie(authTokenKey());
  for (const key of retiredAuthTokenKeys()) removeCookie(key);
  void secretStorage.removeItem(storedAuthTokenKey());
  void secretStorage.removeItem(legacyAuthTokenKey);
  announceAuth();
};
