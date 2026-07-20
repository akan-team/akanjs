import { SSOApple, SSOFacebook, SSOGithub, SSOGoogle, SSOKakao, SSONaver } from "./sso";

export const SSO = {
  Github: SSOGithub,
  Google: SSOGoogle,
  Facebook: SSOFacebook,
  Apple: SSOApple,
  Naver: SSONaver,
  Kakao: SSOKakao,
} as const;
