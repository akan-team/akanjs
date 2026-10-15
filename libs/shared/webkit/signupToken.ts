import { getCookie, removeCookie, setCookie } from "akanjs/client";

//? A cookie rather than store state: a web SSO sign-up arrives through a full-page redirect, and the server hands
//? the token over as this cookie. A native shell keeps cookies in its own jar, which these helpers read the same way.
const signupTokenKey = "signupToken";

export const loadSignupToken = () => getCookie(signupTokenKey) ?? "";

export const saveSignupToken = (signupToken: string) => {
  setCookie(signupTokenKey, signupToken);
};

export const clearSignupToken = () => {
  removeCookie(signupTokenKey);
};
