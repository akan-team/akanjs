import { scalarDictionary } from "akanjs/dictionary";

import type { RemoteAuthorization } from "./remoteAuthorization.constant";

export const dictionary = scalarDictionary(["en", "ko"])
  .of((t) =>
    t(["Remote Authorization", "원격 서버 인가 요청"]).desc([
      "A sign-in at another server this app started and has not finished",
      "이 앱이 시작했고 아직 끝나지 않은 원격 서버 로그인",
    ]),
  )
  .model<RemoteAuthorization>((t) => ({
    state: t(["State", "상태 값"]).desc(["What the callback must repeat", "콜백이 되돌려 줘야 하는 값"]),
    subjectId: t(["Subject ID", "주체 ID"]).desc(["The user who started it", "시작한 사용자"]),
    url: t(["URL", "주소"]).desc(["The remote server's MCP endpoint", "원격 서버의 MCP 엔드포인트"]),
    verifier: t(["Verifier", "검증 값"]).desc(["The PKCE verifier", "PKCE 검증 값"]),
    redirectUri: t(["Redirect URI", "리다이렉트 URI"]).desc(["Where the code comes back", "코드가 돌아오는 주소"]),
    issuer: t(["Issuer", "발급자"]).desc(["The authorization server", "인가 서버"]),
    tokenEndpoint: t(["Token Endpoint", "토큰 엔드포인트"]).desc([
      "Where the code is exchanged",
      "코드를 교환하는 주소",
    ]),
    revocationEndpoint: t(["Revocation Endpoint", "폐기 엔드포인트"]).desc([
      "Where the grant is handed back",
      "위임을 반납하는 주소",
    ]),
    resource: t(["Resource", "리소스"]).desc(["What the tokens are minted for", "토큰이 발급될 대상"]),
    clientId: t(["Client ID", "클라이언트 ID"]).desc([
      "This app's registration at the remote server",
      "원격 서버에 등록된 이 앱의 식별자",
    ]),
    clientSecret: t(["Client Secret", "클라이언트 시크릿"]).desc(["Sealed client secret", "봉인된 클라이언트 시크릿"]),
  }));
