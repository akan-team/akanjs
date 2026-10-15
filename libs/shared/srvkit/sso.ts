import type { option as utilOption } from "@libs/util/server";
import type { Guard, GuardScope } from "akanjs/signal";
import { SsoProvider } from "./ssoProvider";

// Without it, a sign-in starts against a provider this app holds no credentials for and fails at the provider.
const ssoGuardOf = (type: utilOption.SSOType, name: string) =>
  class implements Guard {
    static name = name;
    static scope: GuardScope = "account";
    canPass(): boolean {
      SsoProvider.assertConfigured(type);
      return true;
    }
  };

export const SSOKakao = ssoGuardOf("kakao", "SSOKakao");
export const SSONaver = ssoGuardOf("naver", "SSONaver");
export const SSOGithub = ssoGuardOf("github", "SSOGithub");
export const SSOGoogle = ssoGuardOf("google", "SSOGoogle");
export const SSOFacebook = ssoGuardOf("facebook", "SSOFacebook");
export const SSOApple = ssoGuardOf("apple", "SSOApple");
