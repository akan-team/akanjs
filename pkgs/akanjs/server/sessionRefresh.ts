import { createHash } from "node:crypto";
import type { PromiseOrObject } from "akanjs/base";
import { CookieJar, Logger } from "akanjs/common";

export type SessionRefreshHook = (request: Request) => PromiseOrObject<string[] | null | undefined>;

interface IssuedCookie {
  name: string;
  pair: string;
  expired: boolean;
}

export class SessionRefresh {
  //? A refresh token is single-use: a request the browser sent with the old cookies before it stored the new ones
  //? gets the same answer, instead of presenting a rotated token the app may read as reuse.
  static reuseMs = 10_000;
  static timeoutMs = 10_000;
  static #hook: SessionRefreshHook | null = null;
  static readonly #flights = new Map<string, Promise<string[]>>();
  static readonly #issued = new WeakMap<Request, string[]>();
  static readonly #logger = new Logger("SessionRefresh");

  static use(hook: SessionRefreshHook | null) {
    SessionRefresh.#hook = hook;
    SessionRefresh.#flights.clear();
  }

  //? Rewrites the Cookie header in place, so the render, its server fetches and the RSC worker read the new session.
  static async apply(request: Request): Promise<string[]> {
    const hook = SessionRefresh.#hook;
    const cookie = request.headers.get("cookie");
    if (!hook || !cookie) return [];
    const key = createHash("sha256").update(cookie).digest("base64url");
    let flight = SessionRefresh.#flights.get(key);
    if (!flight) {
      flight = SessionRefresh.#run(hook, request);
      SessionRefresh.#flights.set(key, flight);
      const settled = flight;
      void settled.then((setCookies) => {
        const forget = () => {
          if (SessionRefresh.#flights.get(key) === settled) SessionRefresh.#flights.delete(key);
        };
        if (!setCookies.length) return forget();
        setTimeout(forget, SessionRefresh.reuseMs).unref?.();
      });
    }
    const setCookies = await flight;
    if (!setCookies.length) return [];
    request.headers.set("cookie", SessionRefresh.cookieHeaderAfter(cookie, setCookies));
    SessionRefresh.#issued.set(request, setCookies);
    return setCookies;
  }

  static answering<Req extends Request, Args extends unknown[]>(
    handler: (req: Req, ...args: Args) => Promise<Response>,
  ): (req: Req, ...args: Args) => Promise<Response> {
    return async (req, ...args) => {
      const response = await handler(req, ...args);
      const setCookies = SessionRefresh.#issued.get(req);
      return setCookies ? SessionRefresh.#withSetCookies(response, setCookies) : response;
    };
  }

  static cookieHeaderAfter(cookie: string, setCookies: string[]): string {
    const issued = setCookies.map(SessionRefresh.#parse).filter((entry): entry is IssuedCookie => entry !== null);
    const names = new Set(issued.map((entry) => entry.name));
    const kept = CookieJar.parse(cookie)
      .without((name) => names.has(name))
      .toHeader();
    const latest = new Map(issued.map((entry) => [entry.name, entry]));
    const pairs = [...latest.values()].filter((entry) => !entry.expired).map((entry) => entry.pair);
    return [kept, ...pairs].filter(Boolean).join("; ");
  }

  static async #run(hook: SessionRefreshHook, request: Request): Promise<string[]> {
    const late = Symbol("late");
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<typeof late>((resolve) => {
      timer = setTimeout(() => resolve(late), SessionRefresh.timeoutMs);
    });
    try {
      const answer = await Promise.race([(async () => await hook(request))(), deadline]);
      if (answer === late) {
        SessionRefresh.#logger.warn(`session refresh gave no answer in ${SessionRefresh.timeoutMs}ms`);
        return [];
      }
      //? Cookie values are ASCII (RFC 6265), and a line Bun refuses as a header would fail the render after the hook ran.
      return (answer ?? []).filter(
        (line) => typeof line === "string" && line.includes("=") && /^[\t\x20-\x7e]+$/.test(line),
      );
    } catch (error) {
      SessionRefresh.#logger.warn(`session refresh failed: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    } finally {
      clearTimeout(timer);
    }
  }

  static #parse(line: string): IssuedCookie | null {
    const [pair = "", ...attributes] = line.split(";").map((part) => part.trim());
    const eq = pair.indexOf("=");
    if (eq <= 0) return null;
    const attribute = (name: string) =>
      attributes
        .find((part) => part.toLowerCase().startsWith(`${name}=`))
        ?.slice(name.length + 1)
        .trim();
    const maxAge = attribute("max-age");
    const expires = attribute("expires");
    const expired =
      maxAge !== undefined ? Number(maxAge) <= 0 : expires !== undefined && Date.parse(expires) <= Date.now();
    return { name: pair.slice(0, eq).trim(), pair, expired };
  }

  //? No shared cache may keep it: the response carries this browser's new session.
  static #withSetCookies(response: Response, setCookies: string[]): Response {
    const answer = (target: Response) => {
      for (const line of setCookies) target.headers.append("Set-Cookie", line);
      target.headers.set("Cache-Control", "private, no-store");
      return target;
    };
    try {
      return answer(response);
    } catch {
      return answer(new Response(response.body, response));
    }
  }
}
