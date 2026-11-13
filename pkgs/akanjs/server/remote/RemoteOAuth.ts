import { createHash, randomBytes } from "node:crypto";
import type { RemoteFetch } from "./RemoteFetch";
import { RemoteError } from "./remoteError";

export interface RemoteAuthServer {
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  registrationEndpoint?: string;
  revocationEndpoint?: string;
  /** RFC 8707: what the token is minted for, which is the MCP endpoint and not the authorization server. */
  resource: string;
  /** Whether the token endpoint takes a client secret in the form body. */
  secretPost: boolean;
}

export interface RemoteClient {
  clientId: string;
  clientSecret?: string;
}

export interface RemoteTokens {
  accessToken: string;
  refreshToken?: string;
  /** Epoch ms; absent when the server names no lifetime. */
  expiresAt?: number;
}

interface TokenBody {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
  error?: unknown;
}

// The client half of `server/oauth`: discovery from the MCP endpoint, registration, PKCE, exchange, refresh, revoke.
// Every request goes through the caller's `RemoteFetch`, since each url here was read out of a remote's document.
export class RemoteOAuth {
  static readonly resourceWellKnown = "/.well-known/oauth-protected-resource";
  static readonly serverWellKnown = "/.well-known/oauth-authorization-server";
  static readonly openidWellKnown = "/.well-known/openid-configuration";

  static pkce(): { verifier: string; challenge: string; state: string } {
    const verifier = randomBytes(32).toString("base64url");
    return {
      verifier,
      challenge: createHash("sha256").update(verifier).digest("base64url"),
      state: randomBytes(24).toString("base64url"),
    };
  }

  /** A resource with no metadata falls back to its own origin as issuer: many servers skip the discovery half. */
  static async discover(fetcher: RemoteFetch, mcpUrl: string, challenge?: string | null): Promise<RemoteAuthServer> {
    const resourceDoc = await RemoteOAuth.#first(fetcher, RemoteOAuth.#resourceUrls(mcpUrl, challenge));
    const resource = typeof resourceDoc?.resource === "string" ? resourceDoc.resource : mcpUrl;
    const issuers = RemoteOAuth.#strings(resourceDoc?.authorization_servers);
    for (const issuer of issuers.length ? issuers : [new URL(mcpUrl).origin]) {
      const doc = await RemoteOAuth.#first(fetcher, RemoteOAuth.#serverUrls(issuer));
      if (!doc) continue;
      const methods = RemoteOAuth.#strings(doc.code_challenge_methods_supported);
      //? Refused rather than downgraded (OAuth 2.1): a document without S256 is too old, or rewritten on the way.
      if (methods.length && !methods.includes("S256"))
        throw new RemoteError("remoteOAuth", `${issuer} does not offer PKCE S256.`);
      const authorizationEndpoint = RemoteOAuth.#endpoint(fetcher, doc.authorization_endpoint);
      const tokenEndpoint = RemoteOAuth.#endpoint(fetcher, doc.token_endpoint);
      if (!authorizationEndpoint || !tokenEndpoint) continue;
      const registrationEndpoint = RemoteOAuth.#endpoint(fetcher, doc.registration_endpoint);
      const revocationEndpoint = RemoteOAuth.#endpoint(fetcher, doc.revocation_endpoint);
      return {
        issuer: typeof doc.issuer === "string" ? doc.issuer : issuer,
        authorizationEndpoint,
        tokenEndpoint,
        ...(registrationEndpoint ? { registrationEndpoint } : {}),
        ...(revocationEndpoint ? { revocationEndpoint } : {}),
        resource,
        secretPost: RemoteOAuth.#strings(doc.token_endpoint_auth_methods_supported).includes("client_secret_post"),
      };
    }
    throw new RemoteError("remoteOAuth", `${new URL(mcpUrl).host} publishes no OAuth metadata.`);
  }

  /** RFC 7591. As a confidential client where the server issues secrets: this caller is a server and can keep one. */
  static async register(
    fetcher: RemoteFetch,
    server: RemoteAuthServer,
    { redirectUri, clientName }: { redirectUri: string; clientName: string },
  ): Promise<RemoteClient> {
    if (!server.registrationEndpoint)
      throw new RemoteError("remoteOAuth", `${server.issuer} registers no clients on demand.`);
    const { status, body } = await fetcher.json(server.registrationEndpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        client_name: clientName,
        redirect_uris: [redirectUri],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: server.secretPost ? "client_secret_post" : "none",
      }),
    });
    const { client_id: clientId, client_secret: clientSecret } = (body ?? {}) as Record<string, unknown>;
    if (status >= 300 || typeof clientId !== "string" || !clientId)
      throw new RemoteError("remoteOAuth", `${server.issuer} refused the client registration.`, { status });
    return { clientId, ...(typeof clientSecret === "string" && clientSecret ? { clientSecret } : {}) };
  }

  static authorizeUrl(
    server: RemoteAuthServer,
    request: { clientId: string; redirectUri: string; state: string; challenge: string },
  ): string {
    const url = new URL(server.authorizationEndpoint);
    for (const [key, value] of Object.entries({
      response_type: "code",
      client_id: request.clientId,
      redirect_uri: request.redirectUri,
      code_challenge: request.challenge,
      code_challenge_method: "S256",
      state: request.state,
      resource: server.resource,
    }))
      url.searchParams.set(key, value);
    return url.href;
  }

  static async exchange(
    fetcher: RemoteFetch,
    server: Pick<RemoteAuthServer, "tokenEndpoint" | "resource">,
    grant: { code: string; verifier: string; redirectUri: string; client: RemoteClient },
  ): Promise<RemoteTokens> {
    return await RemoteOAuth.#token(fetcher, server, grant.client, {
      grant_type: "authorization_code",
      code: grant.code,
      redirect_uri: grant.redirectUri,
      code_verifier: grant.verifier,
    });
  }

  static async refresh(
    fetcher: RemoteFetch,
    server: Pick<RemoteAuthServer, "tokenEndpoint" | "resource">,
    grant: { refreshToken: string; client: RemoteClient },
  ): Promise<RemoteTokens> {
    return await RemoteOAuth.#token(fetcher, server, grant.client, {
      grant_type: "refresh_token",
      refresh_token: grant.refreshToken,
    });
  }

  /** RFC 7009. Best effort: the local copy is dropped whether or not the remote answers. */
  static async revoke(fetcher: RemoteFetch, revocationEndpoint: string, token: string, client: RemoteClient) {
    await fetcher
      .send(revocationEndpoint, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token, ...RemoteOAuth.#credentials(client) }).toString(),
      })
      .catch(() => undefined);
  }

  static async #token(
    fetcher: RemoteFetch,
    server: Pick<RemoteAuthServer, "tokenEndpoint" | "resource">,
    client: RemoteClient,
    form: Record<string, string>,
  ): Promise<RemoteTokens> {
    const { status, body } = await fetcher.json(server.tokenEndpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        ...form,
        resource: server.resource,
        ...RemoteOAuth.#credentials(client),
      }).toString(),
    });
    const answer = (body ?? {}) as TokenBody;
    if (status >= 300 || typeof answer.access_token !== "string" || !answer.access_token) {
      const reason = typeof answer.error === "string" ? answer.error : String(status);
      throw new RemoteError("remoteOAuth", `The token request was refused: ${reason}.`, { status });
    }
    const seconds = typeof answer.expires_in === "number" && answer.expires_in > 0 ? answer.expires_in : null;
    return {
      accessToken: answer.access_token,
      ...(typeof answer.refresh_token === "string" && answer.refresh_token
        ? { refreshToken: answer.refresh_token }
        : {}),
      ...(seconds ? { expiresAt: Date.now() + seconds * 1_000 } : {}),
    };
  }

  static #credentials({ clientId, clientSecret }: RemoteClient): Record<string, string> {
    return { client_id: clientId, ...(clientSecret ? { client_secret: clientSecret } : {}) };
  }

  /** The challenge's `resource_metadata` wins over derived urls: only the server knows which spelling it published. */
  static #resourceUrls(mcpUrl: string, challenge?: string | null): string[] {
    const named = challenge ? /resource_metadata="([^"]+)"/.exec(challenge)?.[1] : undefined;
    const url = new URL(mcpUrl);
    const path = url.pathname === "/" ? "" : url.pathname.replace(/\/$/, "");
    //? Security: a challenge is the remote's own text, so a metadata url on another origin is not fetched.
    const derived = [
      new URL(`${RemoteOAuth.resourceWellKnown}${path}`, url.origin).href,
      new URL(RemoteOAuth.resourceWellKnown, url.origin).href,
    ];
    return named && URL.parse(named)?.origin === url.origin ? [named, ...derived] : derived;
  }

  /** RFC 8414 §3.1 inserts the issuer's path after the suffix; OpenID appends it. Both are tried. */
  static #serverUrls(issuer: string): string[] {
    const url = URL.parse(issuer);
    if (!url) return [];
    const path = url.pathname === "/" ? "" : url.pathname.replace(/\/$/, "");
    return [
      new URL(`${RemoteOAuth.serverWellKnown}${path}`, url.origin).href,
      new URL(`${path}${RemoteOAuth.openidWellKnown}`, url.origin).href,
      new URL(RemoteOAuth.serverWellKnown, url.origin).href,
    ];
  }

  static #endpoint(fetcher: RemoteFetch, value: unknown): string | undefined {
    if (typeof value !== "string") return undefined;
    try {
      return fetcher.parse(value).href;
    } catch {
      return undefined;
    }
  }

  static async #first(fetcher: RemoteFetch, urls: string[]): Promise<Record<string, unknown> | undefined> {
    for (const url of [...new Set(urls)]) {
      const answer = await fetcher.json(url).catch(() => null);
      const body = answer?.status === 200 ? answer.body : null;
      if (body && typeof body === "object" && !Array.isArray(body)) return body as Record<string, unknown>;
    }
    return undefined;
  }

  static #strings(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
  }
}
