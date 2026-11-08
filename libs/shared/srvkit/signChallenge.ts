import { createOpaqueToken, hashToken } from "@libs/util/srvkit";
import { dayjs } from "akanjs/base";
import type { CacheDatabase } from "akanjs/document";

import { Err } from "../lib/dict";
import { hashPassword, isPasswordMatch } from "./bcrypt";

export type SignTokenPurpose = "signin" | "password";
export type EmailCodePurpose = "accountId" | "address";

export class SignChallenge {
  static readonly maxCodeFails = 10;
  static readonly maxSigninFails = 10;
  static readonly maxAccountSigninFails = 50;
  readonly #cache: CacheDatabase;
  constructor(cache: CacheDatabase) {
    this.#cache = cache;
  }
  // Only the hash is kept and the first use consumes it; a sign-in token and a password token never stand in for each other.
  async setSignToken(userId: string, purpose: SignTokenPurpose, expireAt = dayjs().add(10, "minute")) {
    const signToken = createOpaqueToken();
    await this.#cache.set(`${purpose}Token`, hashToken(signToken), userId, { expireAt });
    return signToken;
  }
  async consumeSignToken(purpose: SignTokenPurpose, signToken: string) {
    return (await this.#cache.getDel<string>(`${purpose}Token`, hashToken(signToken))) ?? null;
  }
  // A fixed window per key; the count expires with the window it started.
  async takeSendSlot(topic: string, key: string, limit: number, windowEnd = dayjs().add(1, "day")) {
    return (await this.#cache.incr(topic, hashToken(key), 1, { expireAt: windowEnd })) <= limit;
  }
  //? Misses count per account and caller address, so a stranger who knows the accountId locks out only their own
  //? address; the account-wide count only bounds guesses spread over many addresses, and a success never resets it.
  async isSigninLocked(accountId: string, ip: string | null) {
    const [callerFails, accountFails] = await Promise.all([
      this.#cache.get<number>("signinFails", SignChallenge.#signinCallerKeyOf(accountId, ip)),
      this.#cache.get<number>("accountSigninFails", hashToken(accountId)),
    ]);
    return (
      Number(callerFails ?? 0) >= SignChallenge.maxSigninFails ||
      Number(accountFails ?? 0) >= SignChallenge.maxAccountSigninFails
    );
  }
  async failSignin(accountId: string, ip: string | null) {
    const expireAt = dayjs().add(15, "minute");
    await this.#cache.incr("signinFails", SignChallenge.#signinCallerKeyOf(accountId, ip), 1, { expireAt });
    await this.#cache.incr("accountSigninFails", hashToken(accountId), 1, { expireAt });
  }
  async clearSigninFailures(accountId: string, ip: string | null) {
    await this.#cache.delete("signinFails", SignChallenge.#signinCallerKeyOf(accountId, ip));
  }
  static #signinCallerKeyOf(accountId: string, ip: string | null) {
    return hashToken(JSON.stringify([accountId, ip ?? ""]));
  }
  static #dummyHash: Promise<string> | undefined;
  //? An account with no password, or none at all, still pays for one bcrypt verify, so the answer time does not
  //? tell which account ids exist.
  static async isStoredPasswordMatch(password: string, stored: string | null | undefined) {
    if (stored) return await isPasswordMatch(password, stored);
    SignChallenge.#dummyHash ??= hashPassword(createOpaqueToken());
    await isPasswordMatch(password, await SignChallenge.#dummyHash);
    return false;
  }
  //? bcrypt reads at most 72 bytes, so anything past them would be silently ignored.
  static readonly #passwordMaxBytes = 72;
  static readonly #passwordMinLength = 7;
  static assertPassword(password: string) {
    const bytes = new TextEncoder().encode(password).length;
    if (password.length < SignChallenge.#passwordMinLength || bytes > SignChallenge.#passwordMaxBytes)
      throw new Err("user.error.invalidPasswordLength", { min: SignChallenge.#passwordMinLength });
  }
  async logResetTime(userId: string, at = dayjs()) {
    await this.#cache.set("lastResetAt", userId, at.toDate().getTime(), { expireAt: at.add(3, "minute") });
  }
  async isResetable(userId: string) {
    const lastResetTime = await this.#cache.get<number>("lastResetAt", userId);
    const lastResetAt = lastResetTime ? dayjs(lastResetTime) : undefined;
    return !lastResetAt || lastResetAt.isBefore(dayjs().subtract(3, "minute"));
  }
  // A reset only offers a second password; the stored one changes when the mailbox owner signs in with it, so
  // asking for a reset cannot lock the account out.
  async setResetPassword(userId: string, password: string, expireAt = dayjs().add(30, "minute")) {
    await this.#cache.set("resetPassword", userId, await hashPassword(password), { expireAt });
  }
  async consumeResetPassword(userId: string, password: string) {
    const hashedPassword = await this.#cache.get<string>("resetPassword", userId);
    if (!hashedPassword || !(await isPasswordMatch(password, hashedPassword))) return false;
    await this.#cache.delete("resetPassword", userId);
    return true;
  }
  // One live code per account and purpose: a new request replaces the old one instead of adding a second guess.
  async registerPhoneCode(userId: string, phone: string, purpose: string, phoneCode: string) {
    await this.#cache.set("phoneCode", `${userId}:${purpose}`, `${phone}:${hashToken(phoneCode)}`, {
      expireAt: dayjs().add(3, "minute"),
    });
  }
  async isPhoneCodeValid(userId: string, phone: string, purpose: string, phoneCode: string) {
    await this.#assertCodeAttemptsLeft(userId);
    const stored = await this.#cache.get<string>("phoneCode", `${userId}:${purpose}`);
    if (stored !== `${phone}:${hashToken(phoneCode)}`) {
      await this.#failCodeAttempt(userId);
      return false;
    }
    await this.#cache.delete("phoneCode", `${userId}:${purpose}`);
    await this.#cache.delete("codeFails", userId);
    return true;
  }
  async registerEmailCode(
    userId: string,
    accountId: string,
    emailCode: string,
    purpose: EmailCodePurpose = "accountId",
  ) {
    const sendNum = (await this.#cache.get<number>("emailCodeSends", accountId)) ?? 0;
    if (sendNum >= 5) throw new Err("user.error.tooManyEmailCodes");
    await this.#cache.set("emailCodeSends", accountId, sendNum + 1, { expireAt: dayjs().add(1, "hour") });
    await this.#cache.set(
      "emailCode",
      SignChallenge.#emailCodeSlotOf(userId, purpose),
      `${accountId}:${hashToken(emailCode)}`,
      {
        expireAt: dayjs().add(10, "minute"),
      },
    );
  }
  async isEmailCodeValid(
    userId: string,
    accountId: string,
    emailCode: string,
    purpose: EmailCodePurpose = "accountId",
  ) {
    const slot = SignChallenge.#emailCodeSlotOf(userId, purpose);
    await this.#assertCodeAttemptsLeft(slot);
    const existingEmailCode = await this.#cache.get<string>("emailCode", slot);
    if (existingEmailCode !== `${accountId}:${hashToken(emailCode)}`) {
      await this.#failCodeAttempt(slot);
      return false;
    }
    await this.#cache.delete("emailCode", slot);
    await this.#cache.delete("codeFails", slot);
    return true;
  }
  // Written once a removal lands, so a removal a hook refuses records nothing; a re-signup cannot read the removed row.
  async recordLeave(keys: string[], at = dayjs()) {
    await Promise.all(
      keys.map((key) => this.#cache.set("leftAt", hashToken(key), at.valueOf(), { expireAt: at.add(1, "year") })),
    );
  }
  async assertResignable(key: string, resignupDays: number) {
    if (!resignupDays) return;
    const leftAt = await this.#cache.get<number>("leftAt", hashToken(key));
    if (leftAt && dayjs(Number(leftAt)).add(resignupDays, "day").isAfter(dayjs()))
      throw new Err("user.error.resignupNotAvailable", { days: resignupDays });
  }
  // Misses count for a day however many codes were sent, so asking for a fresh code never resets the guesses.
  async #assertCodeAttemptsLeft(failKey: string) {
    const fails = Number((await this.#cache.get<number>("codeFails", failKey)) ?? 0);
    if (fails >= SignChallenge.maxCodeFails) throw new Err("user.error.tooManyCodeFailures");
  }
  async #failCodeAttempt(failKey: string) {
    await this.#cache.incr("codeFails", failKey, 1, { expireAt: dayjs().add(1, "day") });
  }
  //? Names both the code and its miss counter. The sign-up and reset key stays bare, shared with phone codes as before, so
  //? a code mailed by the previous image still verifies and a public reset check cannot spend the verify flow's misses.
  static #emailCodeSlotOf(userId: string, purpose: EmailCodePurpose) {
    return purpose === "accountId" ? userId : `${userId}:${purpose}`;
  }
}
