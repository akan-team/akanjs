import type { option as utilOption } from "@libs/util/server";
import type { Guard, SignalContext } from "akanjs/signal";
import { decodeJwt, importPKCS8, SignJWT } from "jose";

export interface SSOCredential {
  clientID: string;
  clientSecret?: string;
}
export type AppleCredential = SSOCredential & {
  teamID: string;
  keyID: string;
  keyFilePath: string;
};
export type SSOOptions = {
  [key in utilOption.SSOType]?: SSOCredential | AppleCredential;
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

// ─── SSO Configuration Registry ────────────────────────────────────────

interface SSOProviderConfig {
  credential: SSOCredential | AppleCredential;
  callbackURL: string;
  scope?: string[];
  profileFields?: string[];
}

const ssoRegistry = new Map<utilOption.SSOType, SSOProviderConfig>();

export const getSsoConfig = (type: utilOption.SSOType): SSOProviderConfig | undefined => ssoRegistry.get(type);

export const initSsoProviders = (host: string, ssoOptions: SSOOptions) => {
  if (ssoOptions.kakao) {
    ssoRegistry.set("kakao", {
      credential: ssoOptions.kakao,
      callbackURL: `/user/kakao/callback`,
      scope: ["account_email", "profile_nickname"],
    });
  }
  if (ssoOptions.naver) {
    ssoRegistry.set("naver", { credential: ssoOptions.naver, callbackURL: `/api/user/naver/callback` });
  }
  if (ssoOptions.github) {
    ssoRegistry.set("github", {
      credential: ssoOptions.github,
      callbackURL: `/api/user/github/callback`,
      scope: ["user"],
    });
  }
  if (ssoOptions.google) {
    ssoRegistry.set("google", {
      credential: ssoOptions.google,
      callbackURL: `/api/user/google/callback`,
      scope: ["email", "profile"],
    });
  }
  if (ssoOptions.facebook) {
    ssoRegistry.set("facebook", {
      credential: ssoOptions.facebook,
      callbackURL: `/api/user/facebook/callback`,
      scope: ["email"],
      profileFields: ["emails", "name"],
    });
  }
  if (ssoOptions.apple) {
    ssoRegistry.set("apple", {
      credential: ssoOptions.apple,
      callbackURL: `/api/user/apple/callback`,
      scope: ["name", "email"],
    });
  }
};

// ─── OAuth Helpers ─────────────────────────────────────────────────────

const oauthEndpoints = {
  kakao: {
    authorize: "https://kauth.kakao.com/oauth/authorize",
    token: "https://kauth.kakao.com/oauth/token",
    profile: "https://kapi.kakao.com/v2/user/me",
  },
  naver: {
    authorize: "https://nid.naver.com/oauth2.0/authorize",
    token: "https://nid.naver.com/oauth2.0/token",
    profile: "https://openapi.naver.com/v1/nid/me",
  },
  github: {
    authorize: "https://github.com/login/oauth/authorize",
    token: "https://github.com/login/oauth/access_token",
    profile: "https://api.github.com/user",
  },
  google: {
    authorize: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    profile: "https://www.googleapis.com/oauth2/v2/userinfo",
  },
  facebook: {
    authorize: "https://www.facebook.com/v18.0/dialog/oauth",
    token: "https://graph.facebook.com/v18.0/oauth/access_token",
    profile: "https://graph.facebook.com/me",
  },
} as const;

export const getOAuthRedirectUrl = (
  origin: string,
  type: Exclude<utilOption.SSOType, "apple">,
  state?: string,
): string => {
  const config = ssoRegistry.get(type);
  if (!config) throw new Error(`${type} SSO not configured`);
  const endpoints = oauthEndpoints[type];
  const params = new URLSearchParams({
    client_id: config.credential.clientID,
    redirect_uri: `${origin}${config.callbackURL}`,
    response_type: "code",
    ...(config.scope ? { scope: config.scope.join(type === "kakao" || type === "naver" ? "," : " ") } : {}),
    ...(state ? { state } : {}),
  });
  return `${endpoints.authorize}?${params.toString()}`;
};

export interface AccessTokenResponse {
  jwt: string;
  refreshToken?: string;
  expiresAt?: unknown;
}

export type OAuthType = Exclude<utilOption.SSOType, "apple">;

export const makeSsoRedirectResponse = (redirect: string, cookie?: Record<string, string>) => {
  const headers = new Headers({
    Location: redirect,
    "X-Redirect-Method": "replace",
  });

  if (cookie) {
    for (const [key, value] of Object.entries(cookie)) {
      const httpOnly = key === "userRefreshToken" || key === "adminRefreshToken" ? "; HttpOnly" : "";
      headers.append("Set-Cookie", `${key}=${encodeURIComponent(value)}; Path=/; SameSite=Lax${httpOnly}`);
    }
  }

  return new Response(null, { status: 302, headers });
};

export const makeAccessTokenResponse = (accessToken: AccessTokenResponse) => {
  return new Response(JSON.stringify(accessToken), {
    headers: {
      "Content-Type": "application/json",
      ...(accessToken.refreshToken
        ? {
            "Set-Cookie": `userRefreshToken=${encodeURIComponent(accessToken.refreshToken)}; Path=/; SameSite=Lax; HttpOnly`,
          }
        : {}),
    },
  });
};

export const makeSignoutResponse = (accessToken: AccessTokenResponse) => {
  return new Response(JSON.stringify(accessToken), {
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": "userRefreshToken=; Path=/; SameSite=Lax; HttpOnly; Max-Age=0",
    },
  });
};

export const makeAdminAccessTokenResponse = (accessToken: AccessTokenResponse) => {
  return new Response(JSON.stringify(accessToken), {
    headers: {
      "Content-Type": "application/json",
      ...(accessToken.refreshToken
        ? {
            "Set-Cookie": `adminRefreshToken=${encodeURIComponent(accessToken.refreshToken)}; Path=/; SameSite=Lax; HttpOnly`,
          }
        : {}),
    },
  });
};

export const makeAdminSignoutResponse = (accessToken: AccessTokenResponse) => {
  return new Response(JSON.stringify(accessToken), {
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": "adminRefreshToken=; Path=/; SameSite=Lax; HttpOnly; Max-Age=0",
    },
  });
};

export const getSsoCode = (request: Bun.BunRequest) => {
  const code = new URL(request.url).searchParams.get("code");
  if (!code) throw new Error("Invalid SSO callback: missing code");
  return code;
};

export const getSsoOrigin = (request: Bun.BunRequest) => {
  const origin = request.cookies.get("ssoOrigin");
  if (!origin) throw new Error("Invalid SSO callback: missing origin");
  return origin;
};

export const makeOAuthRedirectResponse = (type: OAuthType, req: Bun.BunRequest) => {
  const state = new URL(req.url).searchParams.get("state") ?? undefined;
  return Response.redirect(getOAuthRedirectUrl(getSsoOrigin(req), type, state), 302);
};

const exchangeCodeForToken = async (
  type: Exclude<utilOption.SSOType, "apple">,
  code: string,
  origin: string,
): Promise<string> => {
  const config = ssoRegistry.get(type);
  if (!config) throw new Error(`${type} SSO not configured`);
  const endpoints = oauthEndpoints[type];
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: config.credential.clientID,
    ...(config.credential.clientSecret ? { client_secret: config.credential.clientSecret } : {}),
    redirect_uri: `${origin}${config.callbackURL}`,
    code,
  });
  const res = await fetch(endpoints.token, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      ...(type === "github" ? { Accept: "application/json" } : {}),
    },
    body: body.toString(),
  });
  const data = (await res.json()) as { access_token: string };
  if (!data.access_token) throw new Error(`Failed to get access token from ${type}`);
  return data.access_token;
};

// ─── Profile Extractors ───────────────────────────────────────────────

export const extractKakaoProfile = async (code: string, origin: string): Promise<KakaoResponse> => {
  const accessToken = await exchangeCodeForToken("kakao", code, origin);
  const res = await fetch(oauthEndpoints.kakao.profile, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const profile = (await res.json()) as {
    id: string;
    kakao_account: { profile: { nickname: string }; email: string };
  };
  return {
    name: profile.kakao_account.profile.nickname,
    email: profile.kakao_account.email,
  };
};

export const extractNaverProfile = async (code: string, origin: string): Promise<NaverResponse> => {
  const accessToken = await exchangeCodeForToken("naver", code, origin);
  const res = await fetch(oauthEndpoints.naver.profile, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = (await res.json()) as { response: { name: string; email: string } };
  return {
    name: data.response.name,
    email: data.response.email,
  };
};

export const extractGithubProfile = async (code: string, origin: string): Promise<GithubResponse> => {
  const accessToken = await exchangeCodeForToken("github", code, origin);
  const res = await fetch(oauthEndpoints.github.profile, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  const profile = (await res.json()) as {
    id: number;
    name: string;
    login: string;
    html_url: string;
    avatar_url: string;
  };
  return {
    id: String(profile.id),
    displayName: profile.name ?? profile.login,
    username: profile.login,
    profileUrl: profile.html_url,
    photos: [{ value: profile.avatar_url }],
  };
};

export const extractGoogleProfile = async (code: string, origin: string): Promise<GoogleResponse> => {
  const accessToken = await exchangeCodeForToken("google", code, origin);
  const res = await fetch(oauthEndpoints.google.profile, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const profile = (await res.json()) as {
    id: string;
    name: string;
    given_name: string;
    family_name: string;
    email: string;
    verified_email: boolean;
    picture: string;
  };
  return {
    id: profile.id,
    displayName: profile.name,
    name: { familyName: profile.family_name, givenName: profile.given_name },
    emails: [{ value: profile.email, verified: profile.verified_email }],
    photos: [{ value: profile.picture }],
  };
};

export const extractFacebookProfile = async (code: string, origin: string): Promise<FacebookResponse> => {
  const accessToken = await exchangeCodeForToken("facebook", code, origin);
  const res = await fetch(
    `${oauthEndpoints.facebook.profile}?fields=id,first_name,last_name,email&access_token=${accessToken}`,
  );
  const profile = (await res.json()) as {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
  };
  return {
    id: profile.id,
    name: { familyName: profile.last_name, givenName: profile.first_name },
    emails: [{ value: profile.email, verified: true }],
  };
};

// ─── Guard Classes ────────────────────────────────────────────────────

const assertSsoConfigured = (type: utilOption.SSOType) => {
  if (!ssoRegistry.has(type)) throw new Error(`${type} SSO not configured`);
};

export class SSOKakao implements Guard {
  static name = "SSOKakao";
  canPass(context: SignalContext): boolean {
    assertSsoConfigured("kakao");
    return true;
  }
}

export class SSONaver implements Guard {
  static name = "SSONaver";
  canPass(context: SignalContext): boolean {
    assertSsoConfigured("naver");
    return true;
  }
}

export class SSOGithub implements Guard {
  static name = "SSOGithub";
  canPass(context: SignalContext): boolean {
    assertSsoConfigured("github");
    return true;
  }
}

export class SSOGoogle implements Guard {
  static name = "SSOGoogle";
  canPass(context: SignalContext): boolean {
    assertSsoConfigured("google");
    return true;
  }
}

export class SSOFacebook implements Guard {
  static name = "SSOFacebook";
  canPass(context: SignalContext): boolean {
    assertSsoConfigured("facebook");
    return true;
  }
}

export class SSOApple implements Guard {
  static name = "SSOApple";
  canPass(context: SignalContext): boolean {
    assertSsoConfigured("apple");
    return true;
  }
}

export const SSO = {
  Github: SSOGithub,
  Google: SSOGoogle,
  Facebook: SSOFacebook,
  Apple: SSOApple,
  Naver: SSONaver,
  Kakao: SSOKakao,
} as const;

// ─── Apple Verification ───────────────────────────────────────────────

const generateAppleClientSecret = async (sso: AppleCredential): Promise<string> => {
  const privateKey = await Bun.file(sso.keyFilePath).text();
  const key = await importPKCS8(privateKey, "ES256");
  return await new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: sso.keyID })
    .setIssuer(sso.teamID)
    .setAudience("https://appleid.apple.com")
    .setSubject(sso.clientID)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(key);
};

export const verifyAppleUser = async (payload: { code: string }, origin: string, sso: AppleCredential) => {
  const clientSecret = await generateAppleClientSecret(sso);
  const body = new URLSearchParams({
    client_id: sso.clientID,
    client_secret: clientSecret,
    code: payload.code,
    grant_type: "authorization_code",
    redirect_uri: `${origin}/user/apple/callback`,
  });
  const res = await fetch("https://appleid.apple.com/auth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const tokens = (await res.json()) as { id_token?: string; access_token?: string; refresh_token?: string };
  if (!tokens.id_token) {
    throw new Error("No id_token found in Apple's response");
  }
  const data = decodeJwt(tokens.id_token);
  return { tokens, data };
};
