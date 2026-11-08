import { getEnv } from "akanjs/base";
import { authTokenKey } from "akanjs/common";

interface SessionCookieIssueOption {
  /** Seconds the pair is kept; left out, both are session cookies. */
  maxAge?: number;
}

//? Security: the token is HttpOnly; the readable twin carries its claims unsigned, so a page holds no credential.
export class SessionCookie {
  static claimsKey(): string {
    return `${authTokenKey()}.claims`;
  }

  static claimsOf(jwt: string): string {
    const [header = "", payload = ""] = jwt.split(".");
    return `${header}.${payload}`;
  }

  static issue(jwt: string, { maxAge }: SessionCookieIssueOption = {}): string[] {
    const age = maxAge === undefined ? "" : `; Max-Age=${maxAge}`;
    return [
      `${authTokenKey()}=${encodeURIComponent(jwt)}; ${SessionCookie.#attrs()}; HttpOnly${age}`,
      `${SessionCookie.claimsKey()}=${encodeURIComponent(SessionCookie.claimsOf(jwt))}; ${SessionCookie.#attrs()}${age}`,
    ];
  }

  static expire(): string[] {
    return [
      `${authTokenKey()}=; ${SessionCookie.#attrs()}; HttpOnly; Max-Age=0`,
      `${SessionCookie.claimsKey()}=; ${SessionCookie.#attrs()}; Max-Age=0`,
    ];
  }

  // A plain-http local server cannot keep a Secure cookie, and `authTokenKey()` drops `__Host-` there for the same reason.
  static #attrs() {
    return `Path=/; SameSite=Lax${getEnv().operationMode === "local" ? "" : "; Secure"}`;
  }
}
