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
  // A prepare user opens only while holding one of these verifies; `[]` admits every sign-up, and
  // `[...Verify.provesIdentity]` any verify but `password`. Unset follows `requireVerifiedEmail`.
  activateVerifies?: cnst.Verify["value"][];
  // Unset or true asks a draft that names an accountId for a verify that proves an email address: `email` plus the
  // email-based SSOs. github is not one, because its accountId is the GitHub user id, not an address. A draft naming
  // none (a wallet or phone sign-up) claims no address and takes `Verify.provesIdentity`; `false` takes that for all.
  requireVerifiedEmail?: boolean;
}

export interface SignupPolicy {
  activateVerifies: cnst.Verify["value"][];
  idlessActivateVerifies: cnst.Verify["value"][];
}

export interface NativeSsoOptions {
  // Deep link schemes a native app may take an SSO code back on; unset admits the app's own name only.
  callbackSchemes?: string[];
}

export interface NativeSsoPolicy {
  callbackSchemes: string[];
}

export type ModulesOptions = LibOptions & {
  rootAdminInfo?: AccountInfo;
  // Boot only creates a missing root admin; set this to also put its configured password and superAdmin roles back.
  resetRootAdmin?: boolean;
  oauth?: OAuthOptions;
  // The app's `setMcp({ excludeEndpoints })`, which the server keeps private; an OAuth client's token is refused there.
  offShelfEndpoints?: string[];
  signup?: SignupOptions;
  nativeSso?: NativeSsoOptions;
};

export const option = new AkanOption<ModulesOptions>()
  .use((options) => {
    SsoProvider.configure(options.security?.sso ?? {});
    return {
      rootAdminInfo: options.rootAdminInfo,
      resetRootAdmin: options.resetRootAdmin ?? false,
      oauthOption: resolveOAuthOptions(options),
      signupPolicy: {
        activateVerifies:
          options.signup?.activateVerifies ??
          (options.signup?.requireVerifiedEmail === false ? [...Verify.provesIdentity] : [...Verify.provesEmail]),
        idlessActivateVerifies: options.signup?.activateVerifies ?? [...Verify.provesIdentity],
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
  //? `verify` is set even with OAuth off: the framework budgets a verified bearer per token, an unverified one per IP.
  .setMcp((options) => {
    const oauth = resolveOAuthOptions(options);
    const { appName, environment } = getEnv();
    const jwtSecret = resolveJwtSecret(appName, environment, options.security?.jwtSecret);
    const verify = (token: string) => verifyAkanAccessToken(token, jwtSecret);
    if (!oauth.enabled) return { auth: { verify } };
    return { auth: { authorizationServers: [oauth.issuer], resource: oauth.resource, verify } };
  })
  .applyMiddleware(AccountMiddleware);
