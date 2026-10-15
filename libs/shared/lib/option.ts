import { resolveJwtSecret } from "@libs/util/srvkit";
import { getEnv } from "akanjs/base";
import { AkanOption } from "akanjs/server";
import {
  AccountMiddleware,
  type CallerAccount,
  type OAuthOptions,
  resolveOAuthOptions,
  SsoProvider,
  verifyAkanAccessToken,
} from "../srvkit";
import type * as cnst from "./cnst";
import type { LibOptions } from "./srv";
import { Verify } from "./user/user.constant";

export interface AccountInfo {
  accountId: string;
  password: string;
}

export interface SignupOptions {
  // A prepare user opens only while holding one of these verifies. Unset means any verify that proves an identity
  // (every one but `password`); `[]` admits every sign-up.
  activateVerifies?: cnst.Verify["value"][];
  // Shorthand for every verify that proves an email address: `email` plus the email-based SSOs. github is not one,
  // because its accountId is the GitHub user id, not an address.
  requireVerifiedEmail?: boolean;
}

export interface SignupPolicy {
  activateVerifies: cnst.Verify["value"][];
}

export interface NativeSsoOptions {
  // Deep link schemes a native app may take an SSO code back on; unset admits the app's own name only.
  callbackSchemes?: string[];
}

export interface NativeSsoPolicy {
  callbackSchemes: string[];
}

const emailVerifies = ["email", "google", "kakao", "naver", "apple", "facebook"] as const;
//? A password proves nothing about who signs up, so on its own it would let anyone claim someone else's address.
const identityVerifies = Verify.values.filter((verify) => verify !== "password");

export type ModulesOptions = LibOptions & {
  rootAdminInfo?: AccountInfo;
  oauth?: OAuthOptions;
  signup?: SignupOptions;
  nativeSso?: NativeSsoOptions;
};

export const option = new AkanOption<ModulesOptions>()
  .use((options) => {
    SsoProvider.configure(options.security?.sso ?? {});
    return {
      rootAdminInfo: options.rootAdminInfo ?? { accountId: "admin@mydomain.com", password: "admin1234" },
      oauthOption: resolveOAuthOptions(options),
      signupPolicy: {
        activateVerifies:
          options.signup?.activateVerifies ??
          (options.signup?.requireVerifiedEmail ? [...emailVerifies] : [...identityVerifies]),
      } satisfies SignupPolicy,
      nativeSsoPolicy: {
        callbackSchemes: options.nativeSso?.callbackSchemes ?? [getEnv().appName],
      } satisfies NativeSsoPolicy,
    };
  })
  //? The framework keys `by: "account"` on the token's own id, so every session of one person would count apart.
  .setRateLimit({
    accountKey: (account) => {
      const caller = account as CallerAccount | null;
      return caller?.self?.id ?? caller?.me?.id ?? null;
    },
  })
  // The MCP resource server trusts exactly the tokens this lib's authorization server mints: same signing secret,
  // same app and environment, `aud` naming the MCP endpoint. Naming the issuer is also what makes `/mcp` demand a
  // credential, which is the only thing that makes an MCP client start the OAuth flow at all.
  .setMcp((options) => {
    const oauth = resolveOAuthOptions(options);
    if (!oauth.enabled) return {};
    const { appName, environment } = getEnv();
    const jwtSecret = resolveJwtSecret(appName, environment, options.security?.jwtSecret);
    return {
      auth: {
        authorizationServers: [oauth.issuer],
        resource: oauth.resource,
        verify: (token) => verifyAkanAccessToken(token, jwtSecret),
      },
    };
  })
  .applyMiddleware(AccountMiddleware);
