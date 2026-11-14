import { via } from "akanjs/constant";

export class RemoteAuthorization extends via((field) => ({
  state: field(String),
  subjectId: field(String),
  url: field(String),
  verifier: field(String), // the PKCE verifier, kept here so it never reaches the browser
  redirectUri: field(String),
  issuer: field(String),
  tokenEndpoint: field(String),
  revocationEndpoint: field(String, { default: "" }),
  resource: field(String),
  clientId: field(String),
  clientSecret: field(String, { default: "" }), // sealed by RemoteVault
})) {}
