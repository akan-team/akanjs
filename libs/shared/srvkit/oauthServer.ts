import { generateHost, jwtVerify } from "@libs/util/srvkit";
import { type BackendEnv, getEnv } from "akanjs/base";
import { parseBasePaths } from "akanjs/common";
import type { OAuthClientAuthMethod } from "akanjs/server";
import { RevokedSessions } from "./revokedSessions";

export interface OAuthStaticClient {
  clientId: string;
  clientName?: string;
  redirectUris: string[];
  /** Plaintext in configuration, hashed before it is held. Omit for a public client. */
  clientSecret?: string;
  tokenEndpointAuthMethod?: OAuthClientAuthMethod;
}

export interface OAuthClientIdMetadataOptions {
  /** Off stops reading an HTTPS `client_id` as a metadata document, and the metadata stops advertising it. */
  enabled?: boolean;
  /** Resolve the document's host first and refuse one that points into a private range. On by default. */
  refusePrivateAddresses?: boolean;
}

export interface OAuthOptions {
  /** Off takes the authorization server and the MCP credential requirement away together. */
  enabled?: boolean;
  /** Public origin of this server when the derived one is wrong — a tunnel in front of a laptop, an edge that renames the host. */
  issuer?: string;
  /** The MCP endpoint's canonical URL and every token's `aud`; set it when the app moved `mcp.path` off `/mcp`. */
  resource?: string;
  /** Route of the consent page, basePath included when the app has one: `/office/oauth/consent`. */
  consentPath?: string;
  /** Route an anonymous browser is sent to first, with `?redirect=` back to the consent page. */
  signinPath?: string;
  clients?: OAuthStaticClient[];
  /** RFC 7591 registration, on by default: Claude Code and claude.ai register themselves this way. */
  dynamicRegistration?: boolean;
  /** Private-use redirect schemes accepted besides HTTPS and loopback. Cursor's desktop client registers `cursor://…`. */
  allowedRedirectSchemes?: string[];
  /** Access token lifetime, an hour by default; refresh tokens rotate for thirty days regardless. */
  accessTokenSeconds?: number;
  /** Client ID Metadata Documents — how Claude Code identifies itself. On, and resolved before fetched, by default. */
  clientIdMetadata?: OAuthClientIdMetadataOptions;
}

export type ResolvedOAuthOptions = Required<Omit<OAuthOptions, "clientIdMetadata">> & {
  clientIdMetadata: Required<OAuthClientIdMetadataOptions>;
  /** `consentPath` as the app's router names it: the sign-in page hands `?redirect=` to `router.push`, which puts the locale and basePath back in front. */
  consentRoute: string;
};

const routeOf = (path: string) => {
  const [, head = "", ...rest] = path.split("/");
  const basePaths = parseBasePaths(process.env.AKAN_PUBLIC_BASE_PATHS).map((basePath) =>
    basePath.replace(/^\/+|\/+$/g, ""),
  );
  return head && basePaths.includes(head) ? `/${rest.join("/")}` : path;
};

/**
 * The issuer is the one string an MCP client compares byte for byte: it fetches
 * `<issuer>/.well-known/oauth-authorization-server` and refuses the document unless `issuer` inside repeats the
 * URL it used. So it is fixed here from configuration and never read off a request
 * whose `Host` a proxy may have rewritten. Locally the dev host hands the child its public port.
 */
export const resolveOAuthOptions = (options: BackendEnv & { oauth?: OAuthOptions }): ResolvedOAuthOptions => {
  const { oauth = {} } = options;
  const derived =
    getEnv().operationMode === "local"
      ? `http://localhost:${process.env.AKAN_PUBLIC_CLIENT_PORT ?? process.env.PORT ?? "8282"}`
      : `https://${generateHost(options)}`;
  const issuer = (oauth.issuer ?? derived).replace(/\/$/, "");
  const consentPath = oauth.consentPath ?? "/oauth/consent";
  return {
    enabled: oauth.enabled ?? true,
    issuer,
    resource: oauth.resource ?? `${issuer}/mcp`,
    consentPath,
    consentRoute: routeOf(consentPath),
    signinPath: oauth.signinPath ?? "/signin",
    clients: oauth.clients ?? [],
    dynamicRegistration: oauth.dynamicRegistration ?? true,
    allowedRedirectSchemes: oauth.allowedRedirectSchemes ?? ["cursor"],
    accessTokenSeconds: oauth.accessTokenSeconds ?? 3600,
    clientIdMetadata: {
      enabled: oauth.clientIdMetadata?.enabled ?? true,
      refusePrivateAddresses: oauth.clientIdMetadata?.refusePrivateAddresses ?? true,
    },
  };
};

/**
 * What the MCP resource server runs on every bearer token: this app's own signature, app and environment, and the
 * `access` token type — the same three checks `AccountMiddleware` makes before it trusts a caller — plus whether
 * the grant it belongs to has been revoked since it was minted.
 */
export const verifyAkanAccessToken = async (token: string, jwtSecret: string) => {
  try {
    const claims = await jwtVerify(token, jwtSecret);
    const { appName, environment } = getEnv();
    if (claims.appName !== appName || claims.environment !== environment || claims.tokenType !== "access") return null;
    if (typeof claims.sid === "string" && (await RevokedSessions.has(claims.sid))) return null;
    return claims;
  } catch {
    return null;
  }
};
