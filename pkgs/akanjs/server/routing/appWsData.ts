const CREDENTIAL_HEADERS = ["authorization", "cookie", "user-agent"] as const;

/**
 * Credential snapshot taken at the websocket handshake and carried on `ws.data` for the life of the
 * socket, so auth middleware and guards can read the caller the same way they read an HTTP request.
 * Only the credential headers are copied — retaining the whole `Request` would pin it for as long
 * as the socket stays open.
 */
export class AppWsData {
  static fromRequest(req: Request): AppWsData {
    const headers = new Headers();
    for (const key of CREDENTIAL_HEADERS) {
      const value = req.headers.get(key);
      if (value) headers.set(key, value);
    }
    return new AppWsData(headers);
  }
  static of(ws: Bun.ServerWebSocket<unknown>): AppWsData {
    return ws.data as AppWsData;
  }
  /**
   * Swaps the credential the socket authenticates with. Callers must run this synchronously on the
   * auth frame: frames arrive in order, so a subscribe sent right after the credential must not be
   * able to observe the previous one.
   */
  static applyCredential(data: AppWsData, jwt: string | null) {
    if (jwt) data.headers.set("authorization", `Bearer ${jwt}`);
    else {
      data.headers.delete("authorization");
      data.cookies.delete("jwt");
      const cookie = [...data.cookies].map(([name, value]) => `${name}=${value}`).join("; ");
      if (cookie) data.headers.set("cookie", cookie);
      else data.headers.delete("cookie");
    }
    data.account = undefined;
    data.resolvedAuthorization = undefined;
  }
  createdAt: number;
  headers: Headers;
  cookies: Bun.CookieMap;
  account?: unknown;
  /** The `authorization` value `account` was resolved from, so each frame need not re-verify it. */
  resolvedAuthorization?: string;
  socketId?: string;
  constructor(headers: Headers) {
    this.createdAt = Date.now();
    this.headers = headers;
    this.cookies = new Bun.CookieMap(headers.get("cookie") ?? "");
  }
}
