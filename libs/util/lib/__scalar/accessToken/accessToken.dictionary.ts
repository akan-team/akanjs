import { scalarDictionary } from "@akanjs/dictionary";

import type { AccessToken } from "./accessToken.constant";

export const dictionary = scalarDictionary(["en", "ko"])
  .of((t) => t(["Access Token", "액세스 토큰"]).desc(["Access token for authentication", "인증을 위한 액세스 토큰"]))
  .model<AccessToken>((t) => ({
    jwt: t(["JWT", "JWT"]).desc(["JSON Web Token", "JSON 웹 토큰"]),
  }));
