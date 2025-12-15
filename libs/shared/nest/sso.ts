import type { Type } from "@akanjs/base";
import { Injectable } from "@nestjs/common";
import { AuthGuard, PassportStrategy } from "@nestjs/passport";
import { option as utilOption } from "@util/server";
import * as appleSignin from "apple-signin";
import * as jwt from "jsonwebtoken";
import { Profile as AppleProfile, Strategy as AppleStrategy } from "passport-apple";
import { Profile as FacebookProfile, Strategy as FacebookStrategy } from "passport-facebook";
import { Profile as GitProfile, Strategy as GithubStrategy } from "passport-github";
import { Profile as GoogleProfile, Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as KakaoStrategy } from "passport-kakao";
import { Strategy as NaverStrategy } from "passport-naver";

export interface SSOCredential {
  clientID: string;
  clientSecret?: string; //apple의 경우 keypath
}
export type AppleCredential = SSOCredential & {
  teamID: string;
  keyID: string;
  keyFilePath: string;
};
export type SSOOptions = {
  [key in utilOption.SSOType]?: SSOCredential | AppleCredential;
};

export const getSsoProviders = (host: string, ssoOptions: SSOOptions) => {
  const origin = host === "localhost" ? "http://localhost:8080/backend" : `https://${host}/backend`;
  const providers: Type[] = [];
  if (ssoOptions.kakao) {
    interface KakaoProfile {
      id: string;
      displayName: string;
      _json: { kakao_account: { email: string } };
    }
    @Injectable()
    class KakaoOauthStrategy extends PassportStrategy(KakaoStrategy, "kakao") {
      constructor() {
        super({
          ...ssoOptions.kakao,
          callbackURL: `${origin}/user/kakao/callback`,
          scope: ["account_email", "profile_nickname"],
        });
      }
      validate(jwt: string, refreshToken: string, profile: KakaoProfile) {
        return {
          name: profile.displayName,
          email: profile._json.kakao_account.email,
          password: profile.id,
        };
      }
    }
    providers.push(KakaoOauthStrategy);
  }
  if (ssoOptions.naver) {
    interface NaverProfile {
      displayName: string;
      _json: { email: string };
      id: string;
    }
    @Injectable()
    class NaverOauthStrategy extends PassportStrategy(NaverStrategy, "naver") {
      constructor() {
        super({ ...ssoOptions.naver, callbackURL: `${origin}/user/naver/callback` });
      }
      validate(jwt: string, refreshToken: string, profile: NaverProfile) {
        return {
          name: profile.displayName,
          email: profile._json.email,
          password: profile.id,
        };
      }
    }
    providers.push(NaverOauthStrategy);
  }
  if (ssoOptions.github) {
    @Injectable()
    class GithubOauthStrategy extends PassportStrategy(GithubStrategy, "github") {
      constructor() {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        super({ ...ssoOptions.github, callbackURL: `${origin}/user/github/callback`, scope: ["user"] });
      }
      validate(accessToken: string, _refreshToken: string, profile: GitProfile) {
        return profile as object;
      }
    }
    providers.push(GithubOauthStrategy);
  }
  if (ssoOptions.google) {
    @Injectable()
    class GoogleOauthStrategy extends PassportStrategy(GoogleStrategy, "google") {
      constructor() {
        super({ ...ssoOptions.google, callbackURL: `${origin}/user/google/callback`, scope: ["email", "profile"] });
      }
      validate(_accessToken: string, _refreshToken: string, profile: GoogleProfile) {
        return profile;
      }
    }
    providers.push(GoogleOauthStrategy);
  }
  if (ssoOptions.facebook) {
    @Injectable()
    class FacebookOauthStrategy extends PassportStrategy(FacebookStrategy, "facebook") {
      constructor() {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        super({
          ...ssoOptions.facebook,
          callbackURL: `${origin}/user/facebook/callback`,
          scope: ["email"],
          profileFields: ["emails", "name"],
        });
      }
      validate(_accessToken: string, _refreshToken: string, profile: FacebookProfile) {
        return profile as object;
      }
    }
    providers.push(FacebookOauthStrategy);
  }
  if (ssoOptions.apple) {
    @Injectable()
    class AppleOauthStrategy extends PassportStrategy(AppleStrategy, "apple") {
      constructor() {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        super({
          ...ssoOptions.apple,
          callbackURL: `${origin}/user/apple/callback`,
          passReqToCallback: true,
          scope: ["name", "email"],
        });
      }
      validate(
        req,
        accessToken: string,
        refreshToken: string,
        idToken: string,
        profile: AppleProfile,
        cb: (...args) => any
      ) {
        cb(null, idToken);
      }
    }
    providers.push(AppleOauthStrategy);
  }
  return providers;
};

export interface KakaoResponse {
  name?: string;
  email: string;
}
export interface NaverResponse {
  name?: string;
  email: string;
}
export interface GithubResponse {
  id: string;
  displayName: string;
  username: string;
  profileUrl: string;
  photos: { value: string }[];
}
export interface GoogleResponse {
  id: string;
  displayName: string;
  name: { familyName: string; givenName: string };
  emails: { value: string; verified: boolean }[];
  photos: { value: string }[];
}
export interface FacebookResponse {
  id: string;
  name: { familyName: string; givenName: string };
  emails: { value: string; verified: boolean }[];
}
export interface SsoCookie {
  prepareUserId?: string;
  ssoFor: "user" | "admin";
  signinRedirect: string;
  signupRedirect: string;
  adminRedirect?: string;
  errorRedirect?: string;
}

export const verifyAppleUser = async (payload: { code: string }, origin: string, sso: AppleCredential) => {
  const signinAgent = appleSignin as {
    getClientSecret: (...args: any) => string;
    getAuthorizationToken: (...args: any) => Promise<{ id_token?: string }>;
  };
  const clientSecret = signinAgent.getClientSecret({
    clientID: sso.clientID,
    teamId: sso.teamID,
    keyIdentifier: sso.keyID,
    privateKeyPath: sso.keyFilePath,
  });
  const tokens = await signinAgent.getAuthorizationToken(payload.code, {
    clientID: sso.clientID,
    clientSecret: clientSecret,
    redirectUri: `${origin}/user/apple/callback`,
  });
  if (!tokens.id_token) {
    throw new Error("No id_token found in Apple's response");
  }
  const data = jwt.decode(tokens.id_token);
  return { tokens, data };
};

export const SSO = {
  Github: AuthGuard("github"),
  Google: AuthGuard("google"),
  Facebook: AuthGuard("facebook"),
  Apple: AuthGuard("apple"),
  Naver: AuthGuard("naver"),
  Kakao: AuthGuard("kakao"),
};
