import { via } from "akanjs/constant";

export class RemoteGrant extends via((field) => ({
  subjectId: field(String),
  url: field(String),
  tokenEndpoint: field(String, { default: "" }), // empty: the remote asked for no sign-in, and `access` is empty too
  revocationEndpoint: field(String, { default: "" }),
  resource: field(String, { default: "" }),
  clientId: field(String, { default: "" }),
  clientSecret: field(String, { default: "" }), // sealed by RemoteVault, like `access` and `refresh`
  access: field(String, { default: "" }),
  refresh: field(String, { default: "" }),
  accessExpiresAt: field(Date),
  connectedAt: field(Date),
})) {}
