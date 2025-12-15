import { serviceDictionary } from "@akanjs/dictionary";

import type { SecurityEndpoint } from "./security.signal";

export const dictionary = serviceDictionary(["en", "ko"]).endpoint<SecurityEndpoint>((fn) => ({
  ping: fn(["Ping", "Ping"]).desc(["Ping test endpoint", "Ping 테스트 엔드포인트"]),
  pingBody: fn(["Ping Body", "바디 Ping"])
    .desc(["Ping test with body data", "바디 데이터를 사용한 Ping 테스트"])
    .arg((t) => ({
      data: t(["Body data", "바디 데이터"]).desc(["Body data to test", "테스트할 바디 데이터"]),
    })),
  pingParam: fn(["Ping Param", "파라미터 Ping"])
    .desc(["Ping test with parameter", "파라미터를 사용한 Ping 테스트"])
    .arg((t) => ({
      id: t(["ID", "아이디"]).desc(["ID parameter", "아이디 파라미터"]),
    })),
  pingQuery: fn(["Ping Query", "쿼리 Ping"])
    .desc(["Ping test with query", "쿼리를 사용한 Ping 테스트"])
    .arg((t) => ({
      id: t(["ID", "아이디"]).desc(["ID query", "아이디 쿼리"]),
    })),
  pingEvery: fn(["Ping Every", "모두 Ping"]).desc(["Ping test for everyone", "모든 사용자를 위한 Ping 테스트"]),
  pingUser: fn(["Ping User", "유저 Ping"]).desc(["Ping test for users", "유저를 위한 Ping 테스트"]),
  pingAdmin: fn(["Ping Admin", "관리자 Ping"]).desc(["Ping test for admins", "관리자를 위한 Ping 테스트"]),
  encrypt: fn(["Encrypt", "암호화"])
    .desc(["Encrypt data", "데이터 암호화"])
    .arg((t) => ({
      data: t(["Data", "데이터"]).desc(["Data to encrypt", "암호화할 데이터"]),
    })),
  cleanup: fn(["Cleanup", "정리"]).desc(["Cleanup operation", "정리 작업"]),
  wsPing: fn(["Socket.io Ping", "Socket.io Ping"])
    .desc(["Socket.io Ping test", "Socket.io Ping 테스트"])
    .arg((t) => ({
      data: t(["Data", "데이터"]).desc(["Data to send", "전송할 데이터"]),
    })),
  pubsubPing: fn(["Pubsub Ping", "Pubsub Ping"]).desc(["Pubsub Ping test", "Pubsub Ping 테스트"]),
}));
