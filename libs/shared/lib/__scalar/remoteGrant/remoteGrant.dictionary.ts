import { scalarDictionary } from "akanjs/dictionary";

import type { RemoteGrant } from "./remoteGrant.constant";

export const dictionary = scalarDictionary(["en", "ko"])
  .of((t) =>
    t(["Remote Grant", "원격 서버 위임"]).desc([
      "The tokens one account's connection to another server holds",
      "한 계정의 원격 서버 연결이 가진 토큰",
    ]),
  )
  .model<RemoteGrant>((t) => ({
    subjectId: t(["Subject ID", "주체 ID"]).desc(["The user who connected", "연결한 사용자"]),
    url: t(["URL", "주소"]).desc(["The remote server's MCP endpoint", "원격 서버의 MCP 엔드포인트"]),
    tokenEndpoint: t(["Token Endpoint", "토큰 엔드포인트"]).desc([
      "Where the grant is refreshed",
      "위임을 갱신하는 주소",
    ]),
    revocationEndpoint: t(["Revocation Endpoint", "폐기 엔드포인트"]).desc([
      "Where the grant is handed back",
      "위임을 반납하는 주소",
    ]),
    resource: t(["Resource", "리소스"]).desc(["What the tokens are minted for", "토큰이 발급된 대상"]),
    clientId: t(["Client ID", "클라이언트 ID"]).desc([
      "This app's registration at the remote server",
      "원격 서버에 등록된 이 앱의 식별자",
    ]),
    clientSecret: t(["Client Secret", "클라이언트 시크릿"]).desc(["Sealed client secret", "봉인된 클라이언트 시크릿"]),
    access: t(["Access Token", "액세스 토큰"]).desc(["Sealed access token", "봉인된 액세스 토큰"]),
    refresh: t(["Refresh Token", "리프레시 토큰"]).desc(["Sealed refresh token", "봉인된 리프레시 토큰"]),
    accessExpiresAt: t(["Access Expires At", "액세스 만료 시각"]).desc([
      "When the access token stops working",
      "액세스 토큰이 만료되는 시각",
    ]),
    connectedAt: t(["Connected At", "연결 시각"]).desc(["When the account connected it", "계정이 연결한 시각"]),
  }));
