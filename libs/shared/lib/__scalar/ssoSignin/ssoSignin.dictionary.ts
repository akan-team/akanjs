import { scalarDictionary } from "akanjs/dictionary";

import type { SsoSignin } from "./ssoSignin.constant";

export const dictionary = scalarDictionary(["en", "ko"])
  .of((t) =>
    t(["SSO Sign-in", "SSO 로그인"]).desc([
      "What a native app's SSO code exchange signs in as",
      "네이티브 앱의 SSO 코드 교환 결과",
    ]),
  )
  .model<SsoSignin>((t) => ({
    jwt: t(["JWT", "JWT"]).desc(["Access token of the signed-in user", "로그인한 사용자의 액세스 토큰"]),
    refreshToken: t(["Refresh Token", "리프레시 토큰"]).desc(["Refresh token of the session", "세션의 리프레시 토큰"]),
    prepareUserId: t(["Prepare User ID", "가입 대기 사용자 ID"]).desc([
      "The user still to sign up, when the account is new",
      "새 계정일 때 가입을 마쳐야 하는 사용자",
    ]),
    signupToken: t(["Signup Token", "가입 진행 토큰"]).desc([
      "Proof of the sign-up the prepare user continues",
      "가입 대기 사용자의 가입 증명",
    ]),
  }));
