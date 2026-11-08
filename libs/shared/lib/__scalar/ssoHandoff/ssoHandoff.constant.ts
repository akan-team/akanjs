import { via } from "akanjs/constant";

import { SsoType } from "../../user/user.constant";

export class SsoHandoff extends via((field) => ({
  ssoType: field(SsoType),
  callbackScheme: field(String), // the native app's deep link scheme, one of the lib's allowed callback schemes
  codeChallenge: field(String), // PKCE S256 challenge; only the app that started the sign-in holds the verifier
  nonce: field(String), // the app's own state, echoed on the deep link so auth-session takes this callback only
  origin: field(String), // server origin the browser opened; the provider token exchange repeats it as redirect_uri
  lang: field(String, { default: "en" }),
  returnPage: field(Boolean, { default: false }), // desktop: the browser tab outlives the callback, so it gets a page
  accountId: field(String).optional(), // set once the provider answered, which is what makes the code exchangeable
  nickname: field(String).optional(),
  expiresAt: field(Date),
})) {}
