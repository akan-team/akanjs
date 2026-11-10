import { pkcePair } from "@libs/shared/common";
import { getApiPrefix, getEnv, getServerOrigin } from "akanjs/base";
import { desktopPlatform, router, setCookie } from "akanjs/client";

export interface SsoRedirects {
  signinRedirect: string;
  signupRedirect: string;
  errorRedirect: string;
  replace?: boolean;
}
export interface NativeSsoCallback {
  code: string | null;
  verifier: string;
}

export class SsoHandshake {
  readonly nonce = crypto.randomUUID();
  readonly #ssoType: string;
  constructor(ssoType: string) {
    this.#ssoType = ssoType;
  }
  //* A native page (app://localhost) keeps no session cookie: the provider runs in the system browser instead.
  async runNative(): Promise<NativeSsoCallback | null> {
    //? Loaded here: a static import puts @akanjs/native/core on every web page whose store merges this lib.
    const { AkanNativeError, authSession } = await import("akanjs/client/native");
    const callbackScheme = getEnv().appName;
    const { verifier, challenge } = await pkcePair();
    const start = new URL(`${getServerOrigin()}${getApiPrefix()}/user/${this.#ssoType}`);
    start.search = new URLSearchParams({
      callbackScheme,
      codeChallenge: challenge,
      state: this.nonce,
      lang: document.documentElement.lang,
      ...(desktopPlatform() ? { returnPage: "1" } : {}),
    }).toString();
    const callback = await authSession
      .start({ url: start.href, callbackScheme })
      .then(({ url }) => new URL(url).searchParams)
      .catch((error: unknown) => {
        if (error instanceof AkanNativeError && error.code === "CANCELLED") return null;
        throw error;
      });
    return callback ? { code: callback.get("code"), verifier } : null;
  }
  redirectWeb({ signinRedirect, signupRedirect, errorRedirect, replace }: SsoRedirects) {
    setCookie("ssoFor", "user");
    setCookie("signinRedirect", encodeURIComponent(router.getPrefixedPath(signinRedirect)));
    setCookie("signupRedirect", encodeURIComponent(router.getPrefixedPath(signupRedirect)));
    setCookie("errorRedirect", encodeURIComponent(router.getPrefixedPath(errorRedirect)));
    const url = `${getApiPrefix()}/user/${this.#ssoType}`;
    if (replace) location.replace(url);
    else location.assign(url);
  }
}
