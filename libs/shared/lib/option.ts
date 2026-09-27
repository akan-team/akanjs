import { generateHost, resolveJwtSecret } from "@libs/util/srvkit";
import { getEnv } from "akanjs/base";
import { AkanOption } from "akanjs/server";
import {
  AccountMiddleware,
  initSsoProviders,
  type OAuthOptions,
  resolveOAuthOptions,
  verifyAkanAccessToken,
} from "../srvkit";
import type * as cnst from "./cnst";
import type { LibOptions } from "./srv";

export interface AccountInfo {
  accountId: string;
  password: string;
}

export interface SignupOptions {
  // A prepare user opens only while holding one of these verifies; unset or empty admits every sign-up.
  activateVerifies?: cnst.Verify["value"][];
  // Shorthand for every verify that proves an email address: `email` plus the email-based SSOs. github is not one,
  // because its accountId is the GitHub login.
  requireVerifiedEmail?: boolean;
}

export interface SignupPolicy {
  activateVerifies: cnst.Verify["value"][];
}

const emailVerifies = ["email", "google", "kakao", "naver", "apple", "facebook"] as const;

export type ModulesOptions = LibOptions & {
  rootAdminInfo?: AccountInfo;
  oauth?: OAuthOptions;
  signup?: SignupOptions;
};

export const option = new AkanOption<ModulesOptions>()
  .use((options) => {
    initSsoProviders(generateHost(options), options.security?.sso ?? {});
    return {
      rootAdminInfo: options.rootAdminInfo ?? { accountId: "admin@mydomain.com", password: "admin1234" },
      oauthOption: resolveOAuthOptions(options),
      signupPolicy: {
        activateVerifies:
          options.signup?.activateVerifies ?? (options.signup?.requireVerifiedEmail ? [...emailVerifies] : []),
      } satisfies SignupPolicy,
    };
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
