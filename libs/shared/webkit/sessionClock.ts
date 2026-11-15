import { ServerClock } from "@libs/shared/common";
import { getEnv } from "akanjs/base";
import { storage } from "akanjs/client";
import { decodeJwtPayload } from "akanjs/common";

export class SessionClock {
  //? A native shell's storage answers over its bridge; the first expiry check does not wait on it longer than this.
  static readonly #loadWaitMs = 1000;
  static #clock = new ServerClock();
  static #loading: Promise<void> | null = null;

  //? A token found at page load says when the server signed it, not how long ago, so the measurement outlives the page.
  static ready() {
    SessionClock.#loading ??= Promise.race([
      SessionClock.#load(),
      new Promise<void>((resolve) => setTimeout(resolve, SessionClock.#loadWaitMs)),
    ]);
    return SessionClock.#loading;
  }

  static measure(jwt: string, askedAt: number) {
    try {
      const { iat } = decodeJwtPayload<{ iat?: number }>(jwt);
      if (!iat) return;
      SessionClock.#clock.measure(iat, askedAt);
      void SessionClock.#keep();
    } catch {
      // A token that cannot be read measures nothing.
    }
  }

  static isDoubted(issuedAt?: number) {
    return !!issuedAt && SessionClock.#clock.doubts(issuedAt, Date.now());
  }

  static concede(issuedAt?: number) {
    if (issuedAt) SessionClock.#clock.concede(issuedAt, Date.now());
  }

  static expiresAt(expiresAt: number, issuedAt?: number) {
    return SessionClock.#clock.expiresAt(expiresAt, issuedAt);
  }

  static reset() {
    SessionClock.#clock = new ServerClock();
    SessionClock.#loading = null;
  }

  static #key() {
    return `serverClockAheadMs:${getEnv().appName}`;
  }

  static async #load() {
    try {
      const kept = await storage.getItem(SessionClock.#key());
      const aheadMs = kept ? Number(kept) : Number.NaN;
      if (Number.isFinite(aheadMs) && SessionClock.#clock.aheadMs === null)
        SessionClock.#clock = new ServerClock(aheadMs);
    } catch {
      // Storage a browser refuses leaves the device clock trusted until a refresh measures it.
    }
  }

  static async #keep() {
    try {
      await storage.setItem(SessionClock.#key(), String(SessionClock.#clock.aheadMs));
    } catch {
      // Same refusal: the measurement then lasts as long as the page.
    }
  }
}
