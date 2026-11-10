import { msg } from "@libs/shared/client";
import { safeRedirectPath, withRedirectQuery } from "@libs/shared/common";
import { SsoHandshake, type SsoRedirects, saveRefreshToken, saveSignupToken } from "@libs/shared/webkit";
import { isNativeShell, router, setAuth } from "akanjs/client";
import { store } from "akanjs/store";

import type * as cnst from "../cnst";
import type { RootStore } from "../st";
import { fetch } from "../useClient";

export class SignStore extends store("sign" as const, () => ({
  ssoAttempt: null as { ssoType: cnst.SsoType["value"]; nonce: string } | null,
})) {
  async ssoSigninUser(ssoType: cnst.SsoType["value"], redirects: SsoRedirects) {
    const handshake = new SsoHandshake(ssoType);
    if (!isNativeShell()) {
      handshake.redirectWeb(redirects);
      return;
    }
    const { signinRedirect, signupRedirect, replace } = redirects;
    const navigate = (path: string) =>
      replace ? router.replace(safeRedirectPath(path)) : router.push(safeRedirectPath(path));
    this.set({ ssoAttempt: { ssoType, nonce: handshake.nonce } });
    const isCurrent = () => this.get().ssoAttempt?.nonce === handshake.nonce;
    const callback = await handshake.runNative().catch((error: unknown) => {
      if (isCurrent()) this.set({ ssoAttempt: null });
      throw error;
    });
    //? A retry replaced this attempt, or the person cancelled the wait: the late answer is dropped.
    if (!isCurrent()) return;
    this.set({ ssoAttempt: null });
    if (!callback) return;
    if (!callback.code) {
      msg.error("user.ssoSigninFailed");
      return;
    }
    const { jwt, refreshToken, prepareUserId, signupToken } = await fetch.exchangeSsoCode(
      callback.code,
      callback.verifier,
    );
    if (prepareUserId) {
      if (signupToken) saveSignupToken(signupToken);
      navigate(withRedirectQuery(signupRedirect, { userId: prepareUserId }));
      return;
    }
    if (!jwt) return;
    setAuth({ jwt });
    await saveRefreshToken("user", refreshToken);
    await (this as unknown as RootStore).getSelf({ jwt });
    navigate(signinRedirect);
  }
}
