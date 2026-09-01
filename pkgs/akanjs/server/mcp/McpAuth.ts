import type { HttpRoutes } from "../types";

export interface McpAuthOption {
  /** Where a client may obtain a token, published in the metadata document for it to discover. */
  authorizationServers?: string[];
  /** Scopes every call must carry. Declaring any turns `insufficient_scope` enforcement on. */
  scopes?: string[];
  /** Overrides the resource identifier when the public URL differs from what the request reports. */
  resource?: string;
}

export interface McpAuthProps extends McpAuthOption {
  /** Path the MCP endpoint is mounted at. Its absolute URL is this server's OAuth resource identifier. */
  path: string;
}

interface McpAuthFailure {
  status: 401 | 403;
  error: "invalid_token" | "insufficient_scope";
  description: string;
}

/**
 * The OAuth 2.1 protected-resource half of the MCP authorization spec: the RFC 9728 metadata document, the
 * `WWW-Authenticate` challenge that points at it, and the token checks that can be made without an issuer.
 *
 * The authorization server itself is a separate project. What lives here is what a resource server owes a
 * client regardless of who mints the tokens, so wiring one up later needs no change on this side.
 */
export class McpAuth {
  static readonly wellKnownPath = "/.well-known/oauth-protected-resource";

  readonly #props: McpAuthProps;

  constructor(props: McpAuthProps) {
    this.#props = props;
  }

  /**
   * Both spellings of the metadata path. RFC 9728 inserts the resource's path into the well-known URL, and MCP
   * clients try that form first and the bare one second; serving only one leaves half the clients at a 404.
   */
  createRoutes(): HttpRoutes {
    const handler = { GET: (req: Request) => this.#metadata(req) };
    return {
      [McpAuth.wellKnownPath]: handler,
      [`${McpAuth.wellKnownPath}${this.#props.path}`]: handler,
    };
  }

  unauthorized(req: Request, failure?: McpAuthFailure) {
    const { status, error, description } = failure ?? {
      status: 401 as const,
      error: "invalid_token" as const,
      description: "Authentication is required to use this MCP server.",
    };
    return Response.json(
      { error, error_description: description },
      { status, headers: { "WWW-Authenticate": this.#challenge(req, error, description) } },
    );
  }

  /**
   * Refuses a bearer token that is already provably unusable, before the signal pipeline sees it.
   *
   * The claims are read **without verifying the signature**, which is sound only because every branch below can
   * deny and none can grant: a forged token still has to pass the app's own middleware afterwards, so the worst
   * a crafted payload achieves is refusing itself. What this buys is the failure mode it removes — an expired or
   * foreign token otherwise degrades to an anonymous caller, and the agent is told a tool does not exist rather
   * than that it needs to authenticate.
   */
  reject(req: Request): Response | null {
    const claims = McpAuth.#claims(req);
    if (!claims) return null;
    const failure = this.#failureOf(claims, req);
    return failure ? this.unauthorized(req, failure) : null;
  }

  #failureOf(claims: Record<string, unknown>, req: Request): McpAuthFailure | null {
    const { exp, aud } = claims;
    if (typeof exp === "number" && exp * 1000 <= Date.now())
      return { status: 401, error: "invalid_token", description: "The access token has expired." };
    const audience = (Array.isArray(aud) ? aud : typeof aud === "string" ? [aud] : []).filter(
      (value): value is string => typeof value === "string",
    );
    // An absent `aud` is not a violation while this server mints its own tokens: those are bound to the app and
    // environment rather than to a resource URI, and refusing them would lock out every internal caller. Naming an
    // authorization server changes that — the same issuer mints tokens for its other resources, and one that
    // reaches this server carrying no audience at all is the confused-deputy case RFC 8707 is a MUST for.
    if (this.#props.authorizationServers?.length && !audience.length)
      return { status: 401, error: "invalid_token", description: "The access token names no resource." };
    if (audience.length && !audience.includes(this.#resource(req)))
      return { status: 401, error: "invalid_token", description: "The access token was issued for another resource." };
    const missing = this.#missingScopes(claims);
    // Every missing scope at once — a client that has to discover them one 403 at a time re-authorizes N times.
    if (missing.length)
      return { status: 403, error: "insufficient_scope", description: `Missing required scope: ${missing.join(" ")}.` };
    return null;
  }

  /**
   * Enforced only when `scopes` is configured, because this server's own tokens carry no scope claim at all —
   * declaring one is how a deployment says its issuer mints them.
   */
  #missingScopes(claims: Record<string, unknown>) {
    const required = this.#props.scopes ?? [];
    if (!required.length) return [];
    const raw = claims.scope ?? claims.scp;
    const granted = new Set(Array.isArray(raw) ? raw.map(String) : String(raw ?? "").split(/\s+/));
    return required.filter((scope) => !granted.has(scope));
  }

  #metadata(req: Request) {
    const { authorizationServers, scopes } = this.#props;
    return Response.json(
      {
        resource: this.#resource(req),
        ...(authorizationServers?.length ? { authorization_servers: authorizationServers } : {}),
        bearer_methods_supported: ["header"],
        ...(scopes?.length ? { scopes_supported: scopes } : {}),
      },
      {
        // Public metadata a browser-hosted client has to read cross-origin before it holds any credential.
        headers: { "access-control-allow-origin": "*", "cache-control": "public, max-age=3600" },
      },
    );
  }

  #challenge(req: Request, error: string, description: string) {
    const scopes = this.#props.scopes ?? [];
    return [
      "Bearer",
      [
        `resource_metadata="${new URL(McpAuth.wellKnownPath + this.#props.path, McpAuth.origin(req)).href}"`,
        `error="${error}"`,
        `error_description="${description}"`,
        ...(scopes.length ? [`scope="${scopes.join(" ")}"`] : []),
      ].join(", "),
    ].join(" ");
  }

  #resource(req: Request) {
    return this.#props.resource ?? new URL(this.#props.path, McpAuth.origin(req)).href;
  }

  /**
   * The public origin, not the one the request arrived on. Behind a proxy `req.url` names the internal host the
   * proxy dialed, and publishing that as the resource identifier is not cosmetic: an authorization server issues
   * `aud` for the URL the *client* used, so every correctly-issued token would then fail the audience check.
   *
   * `McpRouter` compares an `Origin` header against this too — the same proxy that makes `req.url` wrong for the
   * metadata document makes it wrong for a same-origin check, and there the cost is a flat 403.
   *
   * `x-forwarded-host` is a request header, so this is exactly as trustworthy as the edge that overwrites it, and
   * a deployment whose edge merely appends leaves both the same-origin comparison and the audience a token is
   * checked against to the caller. A browser cannot reach it — a custom header is not on a preflight, and the
   * `OPTIONS` is judged on the real host — but a direct caller can. `AKAN_MCP_RESOURCE` pins the identifier for a
   * deployment that cannot make the guarantee.
   */
  static origin(req: Request) {
    const url = new URL(req.url);
    const forwarded = (header: string) => req.headers.get(header)?.split(",")[0]?.trim();
    const host = forwarded("x-forwarded-host") ?? req.headers.get("host") ?? url.host;
    return `${forwarded("x-forwarded-proto") ?? url.protocol.replace(":", "")}://${host}`;
  }

  static #claims(req: Request): Record<string, unknown> | null {
    const [scheme, token] = (req.headers.get("authorization") ?? "").split(" ");
    if (scheme !== "Bearer" || !token) return null;
    const segments = token.split(".");
    // An opaque token carries nothing to read, and judging one on shape alone would lock out a deployment that
    // does not use JWTs at all.
    if (segments.length !== 3) return null;
    try {
      const claims: unknown = JSON.parse(Buffer.from(segments[1], "base64url").toString("utf8"));
      return claims && typeof claims === "object" ? (claims as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
}
