import { authTokenKey } from "./authToken";
import type { CookieJar } from "./cookieJar";
import { CookieSweep } from "./cookieSweep";
import { Logger } from "./Logger";

export interface SessionCookieDuplicate {
  name: string;
  count: number;
}

export class SessionCookies {
  static readonly #watched = new Set<() => string>();
  static readonly #maxHostLength = 100;

  // A thunk, because a library registers at import time and an app-scoped name reads the env only once it is set.
  static watch(name: string | (() => string)) {
    SessionCookies.#watched.add(typeof name === "string" ? () => name : name);
  }

  static names(): string[] {
    return [...new Set([authTokenKey(), ...[...SessionCookies.#watched].map((name) => name())])];
  }

  static duplicatesIn(jar: CookieJar): SessionCookieDuplicate[] {
    return SessionCookies.names().flatMap((name) => {
      const { count } = jar.read(name);
      return count > 1 ? [{ name, count }] : [];
    });
  }

  //? Names and counts only: either copy may be a live credential, and the log reaches files and every subscriber.
  //? The host is the caller's to write, so it is cut to a length a log line can carry.
  static report(duplicates: readonly SessionCookieDuplicate[], host: string) {
    for (const { name, count } of duplicates)
      Logger.emit({
        level: "warn",
        name: "SessionCookies",
        message: "A session cookie arrived more than once, so the request was read as signed out",
        attrs: { name, count, host: host.slice(0, SessionCookies.#maxHostLength) },
      });
  }

  static sweepOf(duplicates: readonly SessionCookieDuplicate[], host: string, path: string): string[] {
    return CookieSweep.setCookies({ names: duplicates.map(({ name }) => name), host, path });
  }
}
