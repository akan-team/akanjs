import type { Environment } from "akanjs/base";

/**
 * What an access token the OAuth authorization server minted carries on top of a browser session's claims. A
 * browser session has none of them, which is what makes `client_id`/`aud` the marker `isAgentToken` reads.
 */
export interface OAuthTokenClaims {
  iss?: string;
  aud?: string | string[];
  client_id?: string;
  sub?: string;
}

export type SerAccount<AddData = unknown> = {
  appName: string;
  environment: Environment;
} & OAuthTokenClaims &
  AddData;
// `sid` is the session the token was minted from; `selfSid` and `meSid` are the sessions behind each identity it holds.
export type AuthTokenMeta = {
  exp?: number;
  iat?: number;
  jti?: string;
  sid?: string;
  selfSid?: string;
  meSid?: string;
  tokenType?: string;
};
