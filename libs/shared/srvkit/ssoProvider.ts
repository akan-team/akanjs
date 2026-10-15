import type { option as utilOption } from "@libs/util/server";
import { getApiPrefix } from "akanjs/base";
import { createRemoteJWKSet, importPKCS8, type JWTVerifyGetKey, jwtVerify, SignJWT } from "jose";

import { Err } from "../lib/dict";

type SsoType = utilOption.SSOType;
type OAuthSsoType = Exclude<SsoType, "apple">;
type SsoCredential = utilOption.SSOCredential | utilOption.AppleCredential;

export interface SsoIdentity {
  accountId: string;
  nickname: string;
  legacyAccountId?: string; // the id the account was stored under before, rewritten to `accountId` on sign-in
}

interface OAuthSpec {
  authorize: string;
  token: string;
  scope: string[];
  scopeSeparator: " " | ",";
  identify: (accessToken: string) => Promise<SsoIdentity>;
}

interface KakaoProfile {
  kakao_account?: {
    email?: string;
    is_email_verified?: boolean;
    is_email_valid?: boolean;
    profile?: { nickname?: string };
  };
}
interface NaverProfile {
  response?: { email?: string; name?: string };
}
interface GithubProfile {
  id?: number;
  login?: string;
  name?: string | null;
}
interface GoogleProfile {
  email?: string;
  verified_email?: boolean;
  name?: string;
}
interface FacebookProfile {
  email?: string;
  first_name?: string;
  last_name?: string;
}

export class SsoProvider {
  static readonly #timeoutMs = 20_000;
  static readonly #credentials = new Map<SsoType, SsoCredential>();
  static #appleKeys: JWTVerifyGetKey | null = null;

  static readonly #specs: { [type in OAuthSsoType]: OAuthSpec } = {
    kakao: {
      authorize: "https://kauth.kakao.com/oauth/authorize",
      token: "https://kauth.kakao.com/oauth/token",
      scope: ["account_email", "profile_nickname"],
      scopeSeparator: ",",
      identify: async (accessToken) => {
        const { kakao_account: account } = await SsoProvider.#api<KakaoProfile>(
          "kakao",
          "https://kapi.kakao.com/v2/user/me",
          {
            headers: { Authorization: `Bearer ${accessToken}` },
          },
        );
        const isVerified = account?.is_email_verified === true && account.is_email_valid !== false;
        return SsoProvider.#emailIdentity("kakao", account?.email, isVerified, account?.profile?.nickname);
      },
    },
    naver: {
      authorize: "https://nid.naver.com/oauth2.0/authorize",
      token: "https://nid.naver.com/oauth2.0/token",
      scope: [],
      scopeSeparator: ",",
      identify: async (accessToken) => {
        const { response } = await SsoProvider.#api<NaverProfile>("naver", "https://openapi.naver.com/v1/nid/me", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        //? Naver hands out only the address of the Naver account itself, which it has confirmed.
        return SsoProvider.#emailIdentity("naver", response?.email, true, response?.name);
      },
    },
    github: {
      authorize: "https://github.com/login/oauth/authorize",
      token: "https://github.com/login/oauth/access_token",
      scope: ["user"],
      scopeSeparator: " ",
      identify: async (accessToken) => {
        const profile = await SsoProvider.#api<GithubProfile>("github", "https://api.github.com/user", {
          headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
        });
        if (!profile.id || !profile.login) throw new Err("user.error.ssoProviderFailed", { type: "github" });
        //? A login can be renamed and then registered by someone else; only the numeric id stays with one person.
        return {
          accountId: `github:${profile.id}`,
          nickname: profile.name || profile.login,
          legacyAccountId: profile.login,
        };
      },
    },
    google: {
      authorize: "https://accounts.google.com/o/oauth2/v2/auth",
      token: "https://oauth2.googleapis.com/token",
      scope: ["email", "profile"],
      scopeSeparator: " ",
      identify: async (accessToken) => {
        const profile = await SsoProvider.#api<GoogleProfile>(
          "google",
          "https://www.googleapis.com/oauth2/v2/userinfo",
          {
            headers: { Authorization: `Bearer ${accessToken}` },
          },
        );
        return SsoProvider.#emailIdentity("google", profile.email, profile.verified_email === true, profile.name);
      },
    },
    facebook: {
      authorize: "https://www.facebook.com/v18.0/dialog/oauth",
      token: "https://graph.facebook.com/v18.0/oauth/access_token",
      scope: ["email"],
      scopeSeparator: " ",
      identify: async (accessToken) => {
        const profile = await SsoProvider.#api<FacebookProfile>(
          "facebook",
          "https://graph.facebook.com/me?fields=id,first_name,last_name,email",
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        const nickname = [profile.first_name, profile.last_name].filter(Boolean).join(" ");
        //? Facebook returns `email` only for an address the person has confirmed.
        return SsoProvider.#emailIdentity("facebook", profile.email, true, nickname);
      },
    },
  };

  static configure(ssoOptions: utilOption.SSOOptions) {
    SsoProvider.#credentials.clear();
    for (const [type, credential] of Object.entries(ssoOptions) as [SsoType, SsoCredential | undefined][])
      if (credential) SsoProvider.#credentials.set(type, credential);
  }

  static assertConfigured(type: SsoType) {
    if (!SsoProvider.#credentials.has(type)) throw new Err("shared.error.ssoNotConfigured", { type });
  }

  static callbackUrl(type: SsoType, origin: string) {
    return `${origin}${getApiPrefix()}/user/${type}/callback`;
  }

  static authorizeUrl(type: SsoType, origin: string, state: string) {
    const params = new URLSearchParams({
      client_id: SsoProvider.#credentialOf(type).clientID,
      redirect_uri: SsoProvider.callbackUrl(type, origin),
      response_type: "code",
      state,
    });
    //? Asking Apple for name or email forces `form_post`, a cross-site POST; without them it answers on the query.
    if (type === "apple") return `https://appleid.apple.com/auth/authorize?${params.toString()}&response_mode=query`;
    const spec = SsoProvider.#specs[type];
    if (spec.scope.length) params.set("scope", spec.scope.join(spec.scopeSeparator));
    return `${spec.authorize}?${params.toString()}`;
  }

  static async identify(type: SsoType, code: string, origin: string): Promise<SsoIdentity> {
    if (type === "apple") return await SsoProvider.#identifyApple(code, origin);
    const spec = SsoProvider.#specs[type];
    return await spec.identify(await SsoProvider.#exchange(type, spec.token, code, origin));
  }

  //* Apple signs the id_token with a key from its published set; the subject counts only once that signature, the
  //* issuer and our client id all check out.
  static async verifyAppleIdToken(
    idToken: string,
    clientId: string,
    keys: JWTVerifyGetKey = SsoProvider.#appleKeySet(),
  ) {
    try {
      const { payload } = await jwtVerify(idToken, keys, {
        issuer: "https://appleid.apple.com",
        audience: clientId,
        algorithms: ["RS256"],
      });
      if (typeof payload.sub === "string" && payload.sub) return payload.sub;
    } catch {
      //? Any verification failure ends in the same refusal below.
    }
    throw new Err("user.error.ssoProviderFailed", { type: "apple" });
  }

  static #credentialOf(type: SsoType) {
    const credential = SsoProvider.#credentials.get(type);
    if (!credential) throw new Err("shared.error.ssoNotConfigured", { type });
    return credential;
  }

  static #emailIdentity(type: SsoType, email: string | undefined, isVerified: boolean, nickname?: string | null) {
    if (!email) throw new Err("user.error.ssoProviderFailed", { type });
    if (!isVerified) throw new Err("user.error.ssoEmailNotVerified", { type });
    return { accountId: email, nickname: nickname ?? "" };
  }

  static async #exchange(type: SsoType, tokenUrl: string, code: string, origin: string) {
    const credential = SsoProvider.#credentialOf(type);
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: credential.clientID,
      redirect_uri: SsoProvider.callbackUrl(type, origin),
      code,
      ...(credential.clientSecret ? { client_secret: credential.clientSecret } : {}),
    });
    const data = await SsoProvider.#api<{ access_token?: string }>(type, tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body,
    });
    if (!data.access_token) throw new Err("shared.error.failedToGetAccessToken", { type });
    return data.access_token;
  }

  static async #identifyApple(code: string, origin: string): Promise<SsoIdentity> {
    const credential = SsoProvider.#credentialOf("apple") as utilOption.AppleCredential;
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: credential.clientID,
      client_secret: await SsoProvider.#appleClientSecret(credential),
      redirect_uri: SsoProvider.callbackUrl("apple", origin),
      code,
    });
    const tokens = await SsoProvider.#api<{ id_token?: string }>("apple", "https://appleid.apple.com/auth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!tokens.id_token) throw new Err("shared.error.noAppleIdToken");
    const subject = await SsoProvider.verifyAppleIdToken(tokens.id_token, credential.clientID);
    return { accountId: `apple:${subject}`, nickname: "" };
  }

  // Apple's client secret is a short-lived ES256 JWT signed with the team's private key, not a static value.
  static async #appleClientSecret(credential: utilOption.AppleCredential) {
    const key = await importPKCS8(await Bun.file(credential.keyFilePath).text(), "ES256");
    return await new SignJWT({})
      .setProtectedHeader({ alg: "ES256", kid: credential.keyID })
      .setIssuer(credential.teamID)
      .setAudience("https://appleid.apple.com")
      .setSubject(credential.clientID)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(key);
  }

  static #appleKeySet() {
    SsoProvider.#appleKeys ??= createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));
    return SsoProvider.#appleKeys;
  }

  static async #api<T>(type: SsoType, url: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(SsoProvider.#timeoutMs) });
    if (!response.ok) throw new Err("user.error.ssoProviderFailed", { type });
    return (await response.json()) as T;
  }
}
