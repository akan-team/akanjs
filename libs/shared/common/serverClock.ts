export class ServerClock {
  //? Network delay and time-sync steps stay under this, itself under the two minutes a refresh runs ahead of expiry.
  static readonly toleranceMs = 60 * 1000;
  #aheadMs: number | null;

  constructor(aheadMs: number | null = null) {
    this.#aheadMs = aheadMs;
  }

  get aheadMs() {
    return this.#aheadMs;
  }

  //? The server signed after it was asked, so the asking time can only read the device as less ahead than it is.
  measure(issuedAtSec: number, askedAtMs: number) {
    this.#aheadMs = askedAtMs - issuedAtSec * 1000;
  }

  //? No token is younger than nothing: one that reads so says the device clock moved back since it was measured.
  doubts(issuedAtSec: number, nowMs: number) {
    return nowMs - issuedAtSec * 1000 < (this.#aheadMs ?? 0) - ServerClock.toleranceMs;
  }

  concede(issuedAtSec: number, nowMs: number) {
    this.#aheadMs = Math.min(this.#aheadMs ?? 0, nowMs - issuedAtSec * 1000);
  }

  //? A clock fast by under half the lifetime is taken as it reads: that only renews early, and survives it being set right.
  expiresAt(expiresAtSec: number, issuedAtSec?: number) {
    if (!issuedAtSec) return expiresAtSec * 1000;
    const aheadMs = this.#aheadMs ?? 0;
    const isSmallLead = aheadMs > 0 && aheadMs < ((expiresAtSec - issuedAtSec) * 1000) / 2;
    return expiresAtSec * 1000 + (isSmallLead ? 0 : aheadMs);
  }
}
