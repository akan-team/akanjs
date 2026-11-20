import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";
import { dayjs } from "akanjs/base";
import type { CacheDatabase } from "akanjs/document";

import { Err } from "../lib/dict";

export type EmailCodePurpose = "accountId" | "address";

//? A bare hash of six digits is reversed from a copied cache in a million tries, so the digest is keyed (JWT secret).
export class SignCode {
  static readonly maxCodeFails = 10;
  static readonly #keyLabel = "akan-shared-sign-code-hmac-v1";
  readonly #cache: CacheDatabase;
  readonly #key: Buffer;
  constructor(cache: CacheDatabase, serverSecret: string) {
    this.#cache = cache;
    this.#key = Buffer.from(hkdfSync("sha256", serverSecret, "", SignCode.#keyLabel, 32));
  }
  // One live code per account and purpose: a new request replaces the old one instead of adding a second guess.
  async registerPhoneCode(userId: string, phone: string, purpose: string, phoneCode: string) {
    const slot = `${userId}:${purpose}`;
    await this.#cache.set("phoneCode", slot, this.#digestOf("phoneCode", slot, phone, phoneCode), {
      expireAt: dayjs().add(3, "minute"),
    });
  }
  async isPhoneCodeValid(userId: string, phone: string, purpose: string, phoneCode: string) {
    const slot = `${userId}:${purpose}`;
    return await this.#checkCode("phoneCode", slot, userId, this.#digestOf("phoneCode", slot, phone, phoneCode));
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
    const slot = SignCode.#emailCodeSlotOf(userId, purpose);
    await this.#cache.set("emailCode", slot, this.#digestOf("emailCode", slot, accountId, emailCode), {
      expireAt: dayjs().add(10, "minute"),
    });
  }
  async isEmailCodeValid(
    userId: string,
    accountId: string,
    emailCode: string,
    purpose: EmailCodePurpose = "accountId",
  ) {
    const slot = SignCode.#emailCodeSlotOf(userId, purpose);
    return await this.#checkCode("emailCode", slot, slot, this.#digestOf("emailCode", slot, accountId, emailCode));
  }
  // Misses count for a day however many codes were sent, so asking for a fresh code never resets the guesses.
  async #checkCode(topic: "phoneCode" | "emailCode", slot: string, failKey: string, answer: string) {
    const fails = Number((await this.#cache.get<number>("codeFails", failKey)) ?? 0);
    if (fails >= SignCode.maxCodeFails) throw new Err("user.error.tooManyCodeFailures");
    const stored = await this.#cache.get<string>(topic, slot);
    //? A pre-HMAC `<holder>:<sha256>` value is longer than a digest: answered as a wrong code, left uncounted.
    if (typeof stored === "string" && stored.length !== answer.length) return false;
    if (typeof stored !== "string" || !timingSafeEqual(Buffer.from(stored), Buffer.from(answer))) {
      await this.#cache.incr("codeFails", failKey, 1, { expireAt: dayjs().add(1, "day") });
      return false;
    }
    await this.#cache.delete(topic, slot);
    await this.#cache.delete("codeFails", failKey);
    return true;
  }
  #digestOf(topic: "phoneCode" | "emailCode", slot: string, holder: string, code: string) {
    return createHmac("sha256", this.#key)
      .update(JSON.stringify([topic, slot, holder, code]))
      .digest("hex");
  }
  //? Names both the code and its miss counter. The sign-up and reset key stays bare, shared with phone codes as before, so
  //? a public reset check cannot spend the verify flow's misses.
  static #emailCodeSlotOf(userId: string, purpose: EmailCodePurpose) {
    return purpose === "accountId" ? userId : `${userId}:${purpose}`;
  }
}
