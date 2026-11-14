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
    remoteScreen: fn(["Remote Screen", "원격 화면"])
      .desc([
        "The script-less HTML a connected server drew for one of its static apps, or an empty string when it sent none",
        "연결된 서버가 정적 앱 하나를 그려 보낸 스크립트 없는 HTML. 보내지 않았으면 빈 문자열",
      ])
      .arg((t) => ({
        url: t(["URL", "주소"]).desc(["The connected server", "연결된 서버"]),
        tool: t(["Tool", "툴"]).desc(["The app's tool name on that server", "그 서버에서의 앱 툴 이름"]),
        args: t(["Arguments", "인자"]).desc([
          "The arguments the app was called with, as JSON",
          "앱을 호출한 인자(JSON)",
        ]),
      })),
    remoteView: fn(["Remote View", "원격 뷰"])
      .desc([
        "A connected server's app view document, framed under a policy that lets it load only from that server, or an empty string when the server lists no such view",
        "연결된 서버의 앱 뷰 문서. 그 서버에서만 불러오도록 정책을 씌워 돌려주고, 그런 뷰가 없으면 빈 문자열",
      ])
      .arg((t) => ({
        url: t(["URL", "주소"]).desc(["The connected server", "연결된 서버"]),
        uri: t(["View URI", "뷰 URI"]).desc(["The view's `ui://` address", "뷰의 `ui://` 주소"]),
      })),
    callRemoteView: fn(["Call From Remote View", "원격 뷰의 호출"])
      .desc([
        "Relays a call a framed view makes to its own server and answers that server's result as JSON",
        "프레임 안의 뷰가 자기 서버에 하는 호출을 중계하고 그 서버의 결과를 JSON 으로 돌려준다",
      ])
      .arg((t) => ({
        url: t(["URL", "주소"]).desc(["The connected server", "연결된 서버"]),
        tool: t(["Tool", "툴"]).desc(["A tool that server lists", "그 서버가 내놓은 툴"]),
        args: t(["Arguments", "인자"]).desc(["The call's arguments, as JSON", "호출 인자(JSON)"]),
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
    viewCallRefused: [
      "The server lists no such tool to this account, or the connection is gone",
      "그 서버가 이 계정에 그런 툴을 내놓지 않거나 연결이 끊겼다.",
    ],
    badArguments: ["The arguments are not a JSON object", "인자가 JSON 객체가 아니다."],
  })
  .translate({
    connect: ["Connect", "연결"],
    connecting: ["Connecting…", "연결하는 중…"],
    waiting: ["Finish signing in in the window that opened", "열린 창에서 로그인을 마쳐 주세요"],
    connected: ["Connected. You can close this window.", "연결되었습니다. 이 창을 닫아도 됩니다."],
    failed: ["The connection was not made", "연결하지 못했습니다"],
    denied: ["The sign-in was declined", "로그인이 거절되었습니다"],
    open: ["Open", "열기"],
    screenUnavailable: ["Open it on its own server to see it", "해당 서버에서 열어 확인하세요"],
    popupBlocked: ["Allow pop-ups for this site to sign in", "로그인하려면 이 사이트의 팝업을 허용해 주세요"],
  });
