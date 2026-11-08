import { OAuthErrors } from "./OAuthErrors";
import { OAuthRedirect } from "./OAuthRedirect";
import type { OAuthClientAuthMethod, OAuthClientMetadata, OAuthClientRecord, OAuthRedirectPolicy } from "./oauthTypes";

export type OAuthRegistrationResult = { ok: true; client: OAuthClientMetadata } | { ok: false; response: Response };

// RFC 7591 Dynamic Client Registration; the caller assigns the client identifier.
export class OAuthRegistration {
  static readonly authMethods: readonly OAuthClientAuthMethod[] = ["none", "client_secret_post", "client_secret_basic"];
  static readonly grantTypes: readonly string[] = ["authorization_code", "refresh_token"];
  static readonly maxNameLength = 200;
  //? Registration is anonymous, so what one request may make the server store is bounded; an app may raise either.
  static maxRedirectUris = 10;
  static maxRedirectUriLength = 2048;

  static parse(body: unknown, policy: OAuthRedirectPolicy = {}): OAuthRegistrationResult {
    if (!body || typeof body !== "object" || Array.isArray(body))
      return OAuthRegistration.#fail("invalid_client_metadata", "The registration request must be a JSON object.");
    const meta = body as Record<string, unknown>;
    const redirectUris = meta.redirect_uris;
    if (!OAuthRegistration.#strings(redirectUris) || !redirectUris.length)
      return OAuthRegistration.#fail("invalid_redirect_uri", "`redirect_uris` must be a non-empty array of strings.");
    const { maxRedirectUris, maxRedirectUriLength } = OAuthRegistration;
    if (redirectUris.length > maxRedirectUris || redirectUris.some((uri) => uri.length > maxRedirectUriLength))
      return OAuthRegistration.#fail(
        "invalid_redirect_uri",
        `\`redirect_uris\` may hold ${maxRedirectUris} URIs of at most ${maxRedirectUriLength} characters each.`,
      );
    const rejected = redirectUris.find((uri) => !OAuthRedirect.isRegistrable(uri, policy));
    if (rejected !== undefined)
      return OAuthRegistration.#fail(
        "invalid_redirect_uri",
        `Redirect URI "${rejected}" must be HTTPS, a loopback HTTP address, or use an allowed private-use scheme.`,
      );
    const grantTypes = OAuthRegistration.#subset(meta.grant_types, OAuthRegistration.grantTypes, [
      "authorization_code",
    ]);
    if (!grantTypes)
      return OAuthRegistration.#fail(
        "invalid_client_metadata",
        "`grant_types` may name authorization_code and refresh_token only.",
      );
    if (!OAuthRegistration.#subset(meta.response_types, ["code"], ["code"]))
      return OAuthRegistration.#fail("invalid_client_metadata", "`response_types` may name code only.");
    const authMethod = meta.token_endpoint_auth_method ?? "none";
    if (!OAuthRegistration.authMethods.includes(authMethod as OAuthClientAuthMethod))
      return OAuthRegistration.#fail("invalid_client_metadata", "`token_endpoint_auth_method` is not supported.");
    const clientName =
      typeof meta.client_name === "string" && meta.client_name.trim()
        ? meta.client_name.trim().slice(0, OAuthRegistration.maxNameLength)
        : undefined;
    return {
      ok: true,
      client: { clientName, redirectUris, grantTypes, tokenEndpointAuthMethod: authMethod as OAuthClientAuthMethod },
    };
  }

  /** RFC 7591 §3.2.1: the metadata as stored, with the identifiers the server assigned. */
  static response(
    client: OAuthClientRecord,
    { clientSecret, issuedAt = Date.now() }: { clientSecret?: string; issuedAt?: number } = {},
  ) {
    return Response.json(
      {
        client_id: client.clientId,
        client_id_issued_at: Math.floor(issuedAt / 1000),
        ...(clientSecret ? { client_secret: clientSecret, client_secret_expires_at: 0 } : {}),
        ...(client.clientName ? { client_name: client.clientName } : {}),
        redirect_uris: client.redirectUris,
        grant_types: client.grantTypes,
        response_types: ["code"],
        token_endpoint_auth_method: client.tokenEndpointAuthMethod,
      },
      { status: 201, headers: OAuthErrors.noStore },
    );
  }

  static #strings(value: unknown): value is string[] {
    return Array.isArray(value) && value.every((entry) => typeof entry === "string");
  }

  static #subset(value: unknown, allowed: readonly string[], fallback: string[]): string[] | null {
    if (value === undefined) return fallback;
    if (!OAuthRegistration.#strings(value) || !value.length) return null;
    return value.every((entry) => allowed.includes(entry)) ? [...new Set(value)] : null;
  }

  static #fail(
    error: "invalid_redirect_uri" | "invalid_client_metadata",
    description: string,
  ): OAuthRegistrationResult {
    return { ok: false, response: OAuthErrors.registration(error, description) };
  }
}
