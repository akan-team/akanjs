import { hashToken } from "@libs/util/srvkit";
import { OAuthClientIdMetadata, type OAuthClientRecord } from "akanjs/server";

import type * as cnst from "../lib/cnst";
import type { OAuthStaticClient } from "./oauthServer";

export const oauthDynamicClientPrefix = "dcr_";

/** Whether a `client_id` names a client this OAuth server issues tokens to, rather than one an app mints for itself. */
export const isOauthServerClientId = (clientId: string, configured: OAuthStaticClient[]) =>
  clientId.startsWith(oauthDynamicClientPrefix) ||
  OAuthClientIdMetadata.isDocumentUrl(clientId) ||
  configured.some((client) => client.clientId === clientId);

export const oauthStaticClientRecord = (configured: OAuthStaticClient): OAuthClientRecord => ({
  clientId: configured.clientId,
  clientName: configured.clientName,
  redirectUris: configured.redirectUris,
  grantTypes: ["authorization_code", "refresh_token"],
  tokenEndpointAuthMethod: configured.clientSecret
    ? (configured.tokenEndpointAuthMethod ?? "client_secret_post")
    : "none",
  clientSecretHash: configured.clientSecret ? hashToken(configured.clientSecret) : undefined,
  source: "static",
});

export const oauthClientRecordOf = (client: cnst.OauthClient): OAuthClientRecord => ({
  clientId: client.clientId,
  clientName: client.clientName || undefined,
  redirectUris: client.redirectUris,
  grantTypes: client.grantTypes,
  tokenEndpointAuthMethod: client.tokenEndpointAuthMethod,
  clientSecretHash: client.clientSecretHash || undefined,
  source: client.source,
});
