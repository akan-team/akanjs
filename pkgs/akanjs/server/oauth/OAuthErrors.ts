import { applySecurityHeaders } from "../assetHeaders";
import type {
  OAuthAuthorizeErrorCode,
  OAuthClientCredential,
  OAuthRegistrationErrorCode,
  OAuthTokenErrorCode,
} from "./oauthTypes";

interface OAuthRedirectParams {
  state?: string;
  /** RFC 9207: names the server that answered, so a client can tell an honest response from a mixed-up one. */
  iss: string;
}

export class OAuthErrors {
  // RFC 6749 §5.1 makes both mandatory on a token response; every other answer here carries a credential too.
  static readonly noStore = { "cache-control": "no-store", pragma: "no-cache" } as const;

  // RFC 6749 §5.2: `invalid_client` is 401, with `WWW-Authenticate` only when the client used the Authorization header.
  static token(
    error: OAuthTokenErrorCode,
    description: string,
    { method }: { method?: OAuthClientCredential["method"] } = {},
  ) {
    const headers: Record<string, string> = { ...OAuthErrors.noStore };
    if (error === "invalid_client" && method === "basic") headers["www-authenticate"] = 'Basic realm="oauth"';
    return Response.json(
      { error, error_description: description },
      { status: error === "invalid_client" ? 401 : 400, headers },
    );
  }

  /** RFC 7591 §3.2.2. */
  static registration(error: OAuthRegistrationErrorCode, description: string) {
    return Response.json({ error, error_description: description }, { status: 400, headers: OAuthErrors.noStore });
  }

  // RFC 6749 §4.1.2.1: legal only once the redirect URI matched the client's registration; before that, `page`.
  static redirect(
    redirectUri: string,
    { error, description, state, iss }: OAuthRedirectParams & { error: OAuthAuthorizeErrorCode; description?: string },
  ) {
    return OAuthErrors.#located(redirectUri, { error, error_description: description, state, iss });
  }

  static redirectWithCode(redirectUri: string, { code, state, iss }: OAuthRedirectParams & { code: string }) {
    return OAuthErrors.#located(redirectUri, { code, state, iss });
  }

  static page(status: number, title: string, detail: string) {
    const body = `<!doctype html><meta charset="utf-8"><title>${OAuthErrors.#escape(title)}</title><main style="font:16px system-ui;max-width:32rem;margin:4rem auto"><h1>${OAuthErrors.#escape(title)}</h1><p>${OAuthErrors.#escape(detail)}</p></main>`;
    return new Response(body, {
      status,
      headers: applySecurityHeaders(
        new Headers({ "content-type": "text/html; charset=utf-8", ...OAuthErrors.noStore }),
        { html: true },
      ),
    });
  }

  static #located(redirectUri: string, params: Record<string, string | undefined>) {
    const url = new URL(redirectUri);
    for (const [key, value] of Object.entries(params)) if (value !== undefined) url.searchParams.set(key, value);
    return new Response(null, { status: 302, headers: { location: url.href, ...OAuthErrors.noStore } });
  }

  static #escape(text: string) {
    return text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
  }
}
