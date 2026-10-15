import { type Dayjs, dayjs } from "akanjs/base";

type RevokedSessionCheck = (sessionId: string) => Promise<boolean>;
type RevokedSessionMark = (sessionId: string, until: Dayjs) => Promise<void>;

/**
 * Whether an access token's session was revoked before the token expired. The answer lives in the OAuth service's
 * cache, but its readers run where no service can be injected — `AccountMiddleware`, and the `/mcp` verifier
 * `option.ts` builds before any service exists — so the service registers the check and the mark here at boot. No
 * check registered means nothing was ever revoked.
 */
export class RevokedSessions {
  //? Must stay at least `SecurityService.signAccessToken`'s default lifetime: a denial that ends early revives the token.
  static readonly accessTokenDays = 7;
  static #check: RevokedSessionCheck | null = null;
  static #mark: RevokedSessionMark | null = null;

  static use(check: RevokedSessionCheck | null, mark: RevokedSessionMark | null = null) {
    RevokedSessions.#check = check;
    RevokedSessions.#mark = mark;
  }

  /** A cache that cannot answer lets the token live: locking every caller out is the worse failure. */
  static async has(sessionId: string | undefined): Promise<boolean> {
    if (!sessionId || !RevokedSessions.#check) return false;
    try {
      return await RevokedSessions.#check(sessionId);
    } catch {
      return false;
    }
  }

  static async markRevoked(sessionIds: string[], until = dayjs().add(RevokedSessions.accessTokenDays, "day")) {
    const mark = RevokedSessions.#mark;
    if (!mark) return;
    await Promise.all(sessionIds.map((sessionId) => mark(sessionId, until)));
  }
}
