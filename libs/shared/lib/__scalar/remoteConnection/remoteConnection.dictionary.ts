import { scalarDictionary } from "akanjs/dictionary";

import type { RemoteConnection } from "./remoteConnection.constant";

export const dictionary = scalarDictionary(["en", "ko"])
  .of((t) =>
    t(["Remote Connection", "원격 서버 연결"]).desc([
      "Another server the account let this app's agent call on its behalf",
      "계정이 이 앱의 에이전트에게 대신 호출하도록 허락한 다른 서버",
    ]),
  )
  .model<RemoteConnection>((t) => ({
    url: t(["URL", "주소"]).desc(["The remote server's MCP endpoint", "원격 서버의 MCP 엔드포인트"]),
    host: t(["Host", "호스트"]).desc(["The remote server's host name", "원격 서버의 호스트 이름"]),
    connectedAt: t(["Connected At", "연결 시각"]).desc(["When the account connected it", "계정이 연결한 시각"]),
  }));
