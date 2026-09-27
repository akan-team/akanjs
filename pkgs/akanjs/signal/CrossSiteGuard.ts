import { hostFromRequest, isJsonContentType, Logger } from "akanjs/common";
import { Exception } from "./exception";

export interface CrossSiteOption {
  /** Besides the serving origin; the native shell origins are always allowed. */
  allowedOrigins?: string[];
  /** `false` turns the gate off, for an API reached only by non-browser callers. */
  enabled?: boolean;
}

// The `SameSite=None` auth cookie rides every cross-site request, so JSON-only bodies force a CORS preflight (which
// fails) and `Origin` covers multipart and bodiless mutations. No `Origin` is a non-browser caller; `null` is refused.
export class CrossSiteGuard {
  static readonly logger = new Logger("CrossSiteGuard");
  /** The native shell serves the page from `app://localhost` on iOS, macOS and Linux, `https://app.localhost` on
   * Android and Windows; both WebViews send exactly that as `Origin`. */
  static readonly nativeOrigins = ["app://localhost", "https://app.localhost"] as const;
  static #enabled = true;
  static #allowed = new Set<string>(CrossSiteGuard.nativeOrigins);

  /** Applied at boot from the mounting app's `option.ts`; the native shells stay allowed unless disabled. */
  static configure({ allowedOrigins = [], enabled = true }: CrossSiteOption) {
    CrossSiteGuard.#enabled = enabled;
    CrossSiteGuard.#allowed = new Set([...CrossSiteGuard.nativeOrigins, ...allowedOrigins]);
  }

  static reset() {
    CrossSiteGuard.#enabled = true;
    CrossSiteGuard.#allowed = new Set(CrossSiteGuard.nativeOrigins);
  }

  /** Call only where a JSON body is read: a multipart upload relies on `assertOrigin` alone. */
  static assertJsonBody(contentType: string | null) {
    if (!CrossSiteGuard.#enabled) return;
    if (isJsonContentType(contentType)) return;
    throw new Exception.UnsupportedMediaType("Content-Type must be application/json.");
  }

  static assertOrigin(req: Request, url: URL, key: string) {
    if (!CrossSiteGuard.#enabled) return;
    const origin = req.headers.get("origin");
    if (origin === null) return;
    if (origin !== "null" && (CrossSiteGuard.#isSameSite(origin, req, url) || CrossSiteGuard.#allowed.has(origin)))
      return;
    // Logged rather than echoed: only the operator learns which origin tried against which host.
    CrossSiteGuard.logger.warn(
      `Refused "${key}" from cross-site origin ${origin} (request host ${hostFromRequest(req.headers, url)})`,
    );
    throw new Exception.Forbidden("This request was not permitted.");
  }

  // Host, not full origin: a TLS-terminating edge loses the scheme, and matching our own host over plaintext
  // already requires holding the name.
  static #isSameSite(origin: string, req: Request, url: URL): boolean {
    try {
      const { protocol, host } = new URL(origin);
      // Re-parsed under the caller's scheme so an explicit default port (`:443`) and its absence compare equal.
      return host === new URL(`${protocol}//${hostFromRequest(req.headers, url)}`).host;
    } catch {
      return false;
    }
  }
}
