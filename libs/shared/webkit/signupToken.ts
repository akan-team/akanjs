import { hostOnlyCookieKey } from "@libs/shared/common";
import { getEnv } from "akanjs/base";
import { getCookie, removeCookie, setCookie } from "akanjs/client";

//? A cookie rather than store state: a web SSO sign-up arrives through a full-page redirect, and the server hands
//? the token over as this cookie. On an SSR page the server sets it HttpOnly with the answer that issued it, so only a
//? CSR client, whose API answers set no cookie for the page, keeps it here and hands it back as an argument.
const signupTokenKey = () => hostOnlyCookieKey("signupToken");

const isCsrClient = () => {
  const env = getEnv();
  return env.side === "client" && env.renderMode === "csr";
};

export const loadSignupToken = () => getCookie(signupTokenKey()) ?? "";

export const saveSignupToken = (signupToken: string) => {
  if (!isCsrClient()) return;
  setCookie(signupTokenKey(), signupToken);
};

export const clearSignupToken = () => {
  removeCookie(signupTokenKey());
};
