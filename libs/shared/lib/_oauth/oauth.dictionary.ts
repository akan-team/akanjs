import { serviceDictionary } from "akanjs/dictionary";

import type { OauthEndpoint } from "./oauth.signal";

export const dictionary = serviceDictionary(["en", "ko"])
  .endpoint<OauthEndpoint>((fn) => ({
    oauthAuthorizationServerMetadata: fn(["Authorization Server Metadata", "인가 서버 메타데이터"]).desc([
      "RFC 8414 document describing this authorization server",
      "이 인가 서버를 설명하는 RFC 8414 문서",
    ]),
    authorizeOAuth: fn(["Authorize", "인가 요청"]).desc([
      "Starts an authorization: validates the client and PKCE, then sends the browser to the consent page",
      "인가를 시작한다. 클라이언트와 PKCE 를 검증한 뒤 브라우저를 동의 페이지로 보낸다",
    ]),
    registerOAuthClient: fn(["Register Client", "클라이언트 등록"]).desc([
      "RFC 7591 dynamic registration of a public client",
      "RFC 7591 공개 클라이언트 동적 등록",
    ]),
    exchangeOAuthToken: fn(["Token", "토큰 발급"]).desc([
      "Exchanges an authorization code or a refresh token for tokens",
      "인가 코드나 리프레시 토큰을 토큰으로 교환한다",
    ]),
    revokeOAuthToken: fn(["Revoke Token", "토큰 폐기"]).desc([
      "RFC 7009: a client hands back a token and the grant it belongs to is closed",
      "RFC 7009: 클라이언트가 토큰을 반납하면 그 토큰이 속한 그랜트를 닫는다",
    ]),
    listOAuthConnections: fn(["Connected Apps", "연결된 앱"]).desc([
      "The applications currently holding a grant to act as the signed-in account",
      "지금 로그인한 계정으로 동작할 권한을 가진 애플리케이션 목록",
    ]),
    revokeOAuthConnection: fn(["Disconnect App", "앱 연결 끊기"])
      .desc([
        "Closes one application's grant; its tokens stop working at once",
        "애플리케이션 하나의 권한을 닫는다. 그 토큰은 즉시 동작을 멈춘다",
      ])
      .arg((t) => ({
        sessionId: t(["Session ID", "세션 ID"]).desc([
          "The grant to close, from the connected-apps list",
          "닫을 그랜트(연결된 앱 목록의 세션 ID)",
        ]),
      })),
    viewOAuthAuthorizationRequest: fn(["View Authorization Request", "인가 요청 조회"])
      .desc(["The pending request the consent page shows", "동의 페이지가 보여주는 대기 중인 요청"])
      .arg((t) => ({ requestId: t(["Request ID", "요청 ID"]).desc(["The pending request", "대기 중인 요청"]) })),
    approveOAuthConsent: fn(["Approve", "승인"])
      .desc(["Issues the code and returns to the client", "코드를 발급하고 클라이언트로 돌아간다"])
      .arg((t) => ({ requestId: t(["Request ID", "요청 ID"]).desc(["The pending request", "대기 중인 요청"]) })),
    denyOAuthConsent: fn(["Deny", "거부"])
      .desc(["Refuses the request and returns to the client", "요청을 거부하고 클라이언트로 돌아간다"])
      .arg((t) => ({ requestId: t(["Request ID", "요청 ID"]).desc(["The pending request", "대기 중인 요청"]) })),
  }))
  .error({
    requestNotFound: [
      "The authorization request is unknown, expired or already decided",
      "인가 요청이 없거나 만료되었거나 이미 처리되었다.",
    ],
    requestBoundToAnotherAccount: [
      "This authorization request was started by another account",
      "이 인가 요청은 다른 계정이 시작했다.",
    ],
    notSignedIn: ["Sign in to continue", "계속하려면 로그인해야 한다."],
    adminSubjectNotAllowed: [
      "Sign in with a user account to authorize an application; this server does not grant the admin console's access",
      "애플리케이션을 허용하려면 사용자 계정으로 로그인해야 한다. 이 서버는 관리자 콘솔의 권한을 위임하지 않는다.",
    ],
    disabled: ["OAuth is disabled on this server", "이 서버에서 OAuth 가 꺼져 있다."],
  })
  .translate({
    consentTitle: ["Authorize access", "접근 허용"],
    consentClient: ["Application", "애플리케이션"],
    consentRedirect: ["Returns to", "돌아갈 주소"],
    consentLoopbackWarning: [
      "This application runs on your own computer. Continue only if you started this request yourself.",
      "이 애플리케이션은 내 컴퓨터에서 실행됩니다. 직접 시작한 요청일 때만 계속하세요.",
    ],
    consentScope: [
      "It will be able to do everything your account can do until you sign it out.",
      "로그아웃시키기 전까지 내 계정이 할 수 있는 모든 일을 할 수 있습니다.",
    ],
    approve: ["Allow", "허용"],
    deny: ["Deny", "거부"],
    consentUnavailable: [
      "This request is no longer valid. Start again from your application.",
      "이 요청은 더 이상 유효하지 않습니다. 애플리케이션에서 다시 시작하세요.",
    ],
    connectedApps: ["Connected apps", "연결된 앱"],
    connectedAppsDescription: [
      "Applications that can act as your account until you disconnect them.",
      "연결을 끊기 전까지 내 계정으로 동작할 수 있는 애플리케이션입니다.",
    ],
    noConnectedApps: ["No application is connected.", "연결된 애플리케이션이 없습니다."],
    disconnect: ["Disconnect", "연결 끊기"],
    currentConnection: ["This connection", "현재 연결"],
    connectedAt: ["Connected {at}", "{at} 연결"],
  });
