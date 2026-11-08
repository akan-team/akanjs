import { scalarDictionary } from "akanjs/dictionary";

import type { SsoHandoff } from "./ssoHandoff.constant";

export const dictionary = scalarDictionary(["en", "ko"])
  .of((t) =>
    t(["SSO Handoff", "SSO 핸드오프"]).desc([
      "A native app's SSO sign-in between the system browser and the app",
      "시스템 브라우저와 네이티브 앱 사이에 걸쳐 있는 SSO 로그인",
    ]),
  )
  .model<SsoHandoff>((t) => ({
    ssoType: t(["SSO Type", "SSO 유형"]).desc(["The provider signing in", "로그인하는 SSO 제공자"]),
    callbackScheme: t(["Callback Scheme", "콜백 스킴"]).desc([
      "Deep link scheme the one-time code returns on",
      "일회용 코드를 돌려보낼 딥링크 스킴",
    ]),
    codeChallenge: t(["Code Challenge", "코드 챌린지"]).desc([
      "PKCE challenge the exchange must answer",
      "교환 때 맞춰야 하는 PKCE 챌린지",
    ]),
    nonce: t(["Nonce", "논스"]).desc(["The app's state, echoed on the deep link", "딥링크에 되돌려주는 앱의 state"]),
    origin: t(["Origin", "오리진"]).desc([
      "Server origin the browser opened, reused as redirect URI",
      "브라우저가 연 서버 오리진(redirect URI로 재사용)",
    ]),
    lang: t(["Language", "언어"]).desc([
      "Language of the page the browser ends on",
      "브라우저에 마지막으로 보이는 페이지의 언어",
    ]),
    returnPage: t(["Return Page", "복귀 안내 페이지"]).desc([
      "Whether the browser shows a back-to-the-app page instead of a bare redirect",
      "브라우저가 리다이렉트 대신 앱 복귀 안내 페이지를 보여줄지 여부",
    ]),
    accountId: t(["Account ID", "계정 아이디"]).desc([
      "The account the provider vouched for",
      "SSO 제공자가 확인해 준 계정",
    ]),
    nickname: t(["Nickname", "닉네임"]).desc(["Display name from the provider", "SSO 제공자의 표시 이름"]),
    expiresAt: t(["Expires At", "만료 시각"]).desc([
      "When the handoff stops being usable",
      "핸드오프를 더 쓸 수 없게 되는 시각",
    ]),
  }));
