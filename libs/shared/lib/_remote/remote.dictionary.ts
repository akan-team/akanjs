import { serviceDictionary } from "akanjs/dictionary";

import type { RemoteEndpoint } from "../sig";

export const dictionary = serviceDictionary(["en", "ko"])
  .endpoint<RemoteEndpoint>((fn) => ({
    connectRemote: fn(["Connect Server", "서버 연결"])
      .desc([
        "Starts connecting another server: answers the address to sign in at, or an empty string when the server asked for no sign-in and is connected already",
        "다른 서버 연결을 시작한다. 로그인할 주소를 돌려주고, 그 서버가 로그인을 요구하지 않아 이미 연결되었으면 빈 문자열을 돌려준다",
      ])
      .arg((t) => ({
        url: t(["URL", "주소"]).desc(["The server's address, or its MCP endpoint", "서버의 주소 또는 MCP 엔드포인트"]),
      })),
    completeRemoteConnection: fn(["Complete Connection", "연결 완료"])
      .desc([
        "Trades the code the other server sent back for the connection's tokens",
        "다른 서버가 돌려보낸 코드를 연결의 토큰으로 바꾼다",
      ])
      .arg((t) => ({
        state: t(["State", "상태 값"]).desc(["The value the callback repeated", "콜백이 되돌려 준 값"]),
        code: t(["Code", "코드"]).desc(["The authorization code", "인가 코드"]),
        iss: t(["Issuer", "발급자"]).desc(["The authorization server that answered", "응답한 인가 서버"]),
      })),
    disconnectRemote: fn(["Disconnect Server", "서버 연결 끊기"])
      .desc([
        "Hands the connection's tokens back to the other server and forgets them",
        "연결의 토큰을 다른 서버에 반납하고 지운다",
      ])
      .arg((t) => ({
        url: t(["URL", "주소"]).desc(["The connected server", "연결된 서버"]),
      })),
    listRemoteConnections: fn(["Connected Servers", "연결된 서버"]).desc([
      "The servers the signed-in account connected",
      "지금 로그인한 계정이 연결한 서버 목록",
    ]),
  }))
  .error({
    disabled: ["This app connects no other server", "이 앱은 다른 서버를 연결하지 않는다."],
    notSignedIn: [
      "Sign in with a user account to connect a server",
      "서버를 연결하려면 사용자 계정으로 로그인해야 한다.",
    ],
    urlRejected: ["That address cannot be connected: {reason}", "그 주소는 연결할 수 없다: {reason}"],
    unreachable: ["The server did not answer: {reason}", "서버가 응답하지 않았다: {reason}"],
    signInRefused: ["The server refused the sign-in: {reason}", "서버가 로그인을 거부했다: {reason}"],
    authorizationNotFound: [
      "This sign-in is unknown, expired or already finished",
      "이 로그인 요청은 없거나 만료되었거나 이미 끝났다.",
    ],
    authorizationBoundToAnotherAccount: [
      "This sign-in was started by another account",
      "이 로그인 요청은 다른 계정이 시작했다.",
    ],
    issuerMismatch: [
      "The answer came from a different authorization server than the one asked",
      "요청한 곳과 다른 인가 서버가 응답했다.",
    ],
    authorizationRefused: ["The server sent back no code", "서버가 코드를 돌려보내지 않았다."],
  })
  .translate({
    connect: ["Connect", "연결"],
    connecting: ["Connecting…", "연결하는 중…"],
    waiting: ["Finish signing in in the window that opened", "열린 창에서 로그인을 마쳐 주세요"],
    connected: ["Connected. You can close this window.", "연결되었습니다. 이 창을 닫아도 됩니다."],
    failed: ["The connection was not made", "연결하지 못했습니다"],
    denied: ["The sign-in was declined", "로그인이 거절되었습니다"],
    popupBlocked: ["Allow pop-ups for this site to sign in", "로그인하려면 이 사이트의 팝업을 허용해 주세요"],
  });
