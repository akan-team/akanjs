import { getEnv } from "akanjs/base";
import { decodeJwtPayload, Logger } from "akanjs/common";
import type { Account } from "akanjs/fetch";
import { cookies as serverCookies, headers as serverHeaders } from "akanjs/fetch";
import { loadCapacitorCore } from "./capacitor";
import { storage } from "./storage";
import { fetch } from "./useClient";

interface CookieOptions {
  path?: string;
  sameSite?: "strict" | "lax" | "none";
  secure?: boolean;
}

function parseCookieHeader(cookieHeader: string): Map<string, { name: string; value: string }> {
  const entries = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .filter(Boolean)
    .map((c) => {
      const eqIdx = c.indexOf("=");
      if (eqIdx === -1) return null;
      const name = c.slice(0, eqIdx).trim();
      const raw = c.slice(eqIdx + 1).trim();
      const value = typeof raw === "string" && raw.startsWith("j:") ? (JSON.parse(raw.slice(2)) as string) : raw;
      return [name, { name, value }] as const;
    })
    .filter((e): e is NonNullable<typeof e> => e !== null);
  return new Map(entries);
}

export const cookies = (): Map<string, { name: string; value: string }> => {
  if (getEnv().side === "server") return serverCookies();
  return parseCookieHeader(document.cookie);
};

export const setCookie = (
  key: string,
  value: string,
  options: CookieOptions = { path: "/", sameSite: "none", secure: true },
) => {
  const env = getEnv();
  if (env.side === "server") return;
  const encoded = `${key}=${value}`;
  const path = options.path ? `; path=${options.path}` : "";
  const sameSite = options.sameSite ? `; SameSite=${options.sameSite}` : "";
  const secure = options.secure ? "; Secure" : "";
  // biome-ignore lint/suspicious/noDocumentCookie: Akan auth helpers intentionally manage browser cookies.
  document.cookie = `${encoded}${path}${sameSite}${secure}`;
  if (env.renderMode !== "csr") return;
  void loadCapacitorCore()
    .then(({ CapacitorCookies }) => CapacitorCookies.setCookie({ key, value, path: options.path }))
    .catch(() => undefined);
};

export const getCookie = (key: string): string | undefined => {
  if (getEnv().side === "server") return cookies().get(key)?.value;
  //capacitor 문서에서 document.cookie로 가져오라고 되어었음.
  else
    return document.cookie
      .split(";")
      .find((c) => c.trim().startsWith(`${key}=`))
      ?.split("=")[1];
};

export const removeCookie = (key: string, options: { path: string } = { path: "/" }) => {
  if (getEnv().side === "server") return cookies().delete(key);
  else {
    // biome-ignore lint/suspicious/noDocumentCookie: Akan auth helpers intentionally manage browser cookies.
    document.cookie = `${key}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
    // void CapacitorCookies.deleteCookie({ key });
  }
};
export const headers = (): Map<string, string> => {
  if (getEnv().side !== "server") return new Map();
  return serverHeaders();
};

export const getHeader = (key: string): string | undefined => {
  return headers().get(key);
};
/** Decodes the current JWT into account data when it belongs to this app/environment. */
export const getAccount = <AddData = unknown>(): Account<AddData> => {
  const jwt = getCookie("jwt") ?? getHeader("jwt");
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
/** Sets the active auth token on fetch, cookie storage, and client storage. */
export const setAuth = ({ jwt }: SetAuthOption) => {
  fetch.setJwt(jwt);
  setCookie("jwt", jwt);
  void storage.setItem("jwt", jwt);
};

interface InitAuthOption {
  jwt?: string;
}
export const initAuth = ({ jwt }: InitAuthOption = {}) => {
  const token = jwt ?? cookies().get("jwt")?.value;
  if (token) setAuth({ jwt: token });
  Logger.verbose(`JWT set from cookie: ${token}`);
};

export const resetAuth = () => {
  fetch.setJwt(null);
  removeCookie("jwt");
  void storage.removeItem("jwt");
};
