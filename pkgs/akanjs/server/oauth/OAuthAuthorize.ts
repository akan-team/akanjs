import { OAuthErrors } from "./OAuthErrors";
import { OAuthPkce } from "./OAuthPkce";
import { OAuthRedirect } from "./OAuthRedirect";
import type { OAuthAuthorizeErrorCode, OAuthAuthorizeParams, OAuthClientRecord } from "./oauthTypes";

export interface OAuthAuthorizeContext {
  /** `null` when the request's `client_id` resolved to no client. */
  client: OAuthClientRecord | null;
  issuer: string;
  /** The one resource this server issues tokens for — the MCP endpoint's canonical URL. */
  resource: string;
}

export type OAuthAuthorizeResult = { ok: true; params: OAuthAuthorizeParams } | { ok: false; response: Response };

export class OAuthAuthorize {
  // RFC 6749 §4.1.2.1 order: client and redirect URI first, refused with a page (never redirect to an unverified
  // URI); every later failure goes through the registered redirect with `state` and `iss`.
  static parse(url: URL, { client, issuer, resource }: OAuthAuthorizeContext): OAuthAuthorizeResult {
    const param = (name: string) => url.searchParams.get(name) ?? undefined;
    const clientId = param("client_id");
    if (!clientId) return OAuthAuthorize.#page("Missing client", "The authorization request names no client_id.");
    if (!client) return OAuthAuthorize.#page("Unknown client", `No client is registered as "${clientId}".`);
    // OAuth 2.1 §4.1.1: the parameter may be omitted only when exactly one URI was registered.
    const redirectUri =
      param("redirect_uri") ?? (client.redirectUris.length === 1 ? client.redirectUris[0] : undefined);
    if (!redirectUri)
      return OAuthAuthorize.#page(
        "Missing redirect URI",
        "The client registered several redirect URIs and named none.",
      );
    if (!OAuthRedirect.matches(client.redirectUris, redirectUri))
      return OAuthAuthorize.#page(
        "Redirect URI not registered",
        `"${redirectUri}" is not a redirect URI registered for this client.`,
      );
    const state = param("state");
    const fail = (error: OAuthAuthorizeErrorCode, description: string): OAuthAuthorizeResult => ({
      ok: false,
      response: OAuthErrors.redirect(redirectUri, { error, description, state, iss: issuer }),
    });
    if (param("response_type") !== "code")
      return fail("unsupported_response_type", "Only response_type=code is supported.");
    if (!client.grantTypes.includes("authorization_code"))
      return fail("unauthorized_client", "This client is not registered for the authorization_code grant.");
    const codeChallenge = param("code_challenge");
    const method = param("code_challenge_method");
    // Method before shape: a `plain` challenge rarely fits the S256 shape, and its sender must hear about the method.
    if (method !== undefined && method !== OAuthPkce.method)
      return fail("invalid_request", `code_challenge_method "${method}" is not supported; use ${OAuthPkce.method}.`);
    if (!OAuthPkce.isChallenge(codeChallenge)) return fail("invalid_request", "A PKCE code_challenge is required.");
    if (method === undefined)
      return fail("invalid_request", `code_challenge_method is required and must be ${OAuthPkce.method}.`);
    const requested = param("resource");
    if (requested !== undefined && !OAuthAuthorize.sameResource(requested, resource))
      return fail("invalid_target", `This server issues tokens for ${resource} only.`);
    return {
      ok: true,
      params: { clientId, redirectUri, codeChallenge, state, resource, scope: param("scope") },
    };
  }

  /**
   * RFC 8707 §2 compares resource identifiers as URIs, so a trailing slash a client added is not another server. A
   * path under `resource` is one of its MCP shelves, which take the token issued for `resource` itself.
   */
  static sameResource(requested: string, resource: string): boolean {
    const asked = OAuthAuthorize.#canonical(requested);
    const served = OAuthAuthorize.#canonical(resource);
    return asked === served || asked.startsWith(`${served}/`);
  }

  static #canonical(resource: string): string {
    try {
      const url = new URL(resource);
      url.hash = "";
      return url.href.replace(/\/$/, "");
    } catch {
      return resource;
    }
  }

  static #page(title: string, detail: string): OAuthAuthorizeResult {
    return { ok: false, response: OAuthErrors.page(400, title, detail) };
  }
}
