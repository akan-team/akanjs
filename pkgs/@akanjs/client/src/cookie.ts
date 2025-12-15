/* eslint-disable @typescript-eslint/no-require-imports */
import { baseClientEnv, baseEnv } from "@akanjs/base";
import { Logger } from "@akanjs/common";
import { client } from "@akanjs/signal";
import { type Account, defaultAccount } from "@akanjs/signal";
import { CapacitorCookies } from "@capacitor/core";
import Cookies from "js-cookie";
import { jwtDecode } from "jwt-decode";
import React from "react";

import { storage } from "./storage";

export const cookies: () => Map<string, { name: string; value: string }> =
  baseClientEnv.side === "server"
    ? () => {
        const nextHeaders = require("next/headers") as {
          cookies: () => Promise<Map<string, { name: string; value: any }>>;
        };
        const cookies = nextHeaders.cookies();
        return React.use(cookies);
      }
    : () => {
        const cookie = Cookies.get();
        return new Map(
          Object.entries(cookie).map(([key, value]) => [
            key,
            {
              name: key,
              value:
                typeof value === "string" && value.startsWith("j:") ? (JSON.parse(value.slice(2)) as string) : value,
            },
          ])
        );
      };

export const setCookie = (
  key: string,
  value: string,
  options: Cookies.CookieAttributes = { path: "/", sameSite: "none", secure: true }
) => {
  if (baseClientEnv.side === "server") return;
  else void CapacitorCookies.setCookie({ key, value });
};

export const getCookie = (key: string): string | undefined => {
  if (baseClientEnv.side === "server") return cookies().get(key)?.value;
  //capacitor 문서에서 document.cookie로 가져오라고 되어었음.
  else
    return document.cookie
      .split(";")
      .find((c) => c.trim().startsWith(`${key}=`))
      ?.split("=")[1];
};

export const removeCookie = (key: string, options: { path: string } = { path: "/" }) => {
  if (baseClientEnv.side === "server") return cookies().delete(key);
  else {
    document.cookie = `${key}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
    // void CapacitorCookies.deleteCookie({ key });
  }
};
export const headers: () => Map<string, string> =
  baseClientEnv.side === "server"
    ? () => React.use((require("next/headers") as { headers: () => Promise<Map<string, string>> }).headers())
    : () => new Map();

export const getHeader = (key: string): string | undefined => {
  return headers().get(key);
};
export const getAccount = <AddData = unknown>(): Account<AddData> => {
  const jwt = getCookie("jwt") ?? getHeader("jwt");
  if (!jwt) return defaultAccount as Account<AddData>;
  const account: Account<AddData> = jwtDecode<Account<AddData>>(jwt);
  if (account.appName !== baseEnv.appName || account.environment !== baseEnv.environment)
    return defaultAccount as Account<AddData>;
  return account;
};
export interface GetOption {
  unauthorize: string;
}
interface SetAuthOption {
  jwt: string;
}
export const setAuth = ({ jwt }: SetAuthOption) => {
  client.setJwt(jwt);
  setCookie("jwt", jwt);
  void storage.setItem("jwt", jwt);
};

interface InitAuthOption {
  jwt?: string;
}
export const initAuth = ({ jwt }: InitAuthOption = {}) => {
  const token = jwt ?? cookies().get("jwt")?.value;
  if (token) setAuth({ jwt: token });
  client.init();
  Logger.verbose(`JWT set from cookie: ${token}`);
};

export const resetAuth = () => {
  client.reset();
  removeCookie("jwt");
  void storage.removeItem("jwt");
};
