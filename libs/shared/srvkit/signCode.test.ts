import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import type { CacheDatabase } from "akanjs/document";

import { SignCode } from "./signCode";

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

const codesOf = (serverSecret = "server-secret-a") => {
  const store = new Map<string, unknown>();
  const keyOf = (topic: string, key: string) => `${topic}:${key}`;
  const cache = {
    get: async (topic: string, key: string) => store.get(keyOf(topic, key)),
    set: async (topic: string, key: string, value: unknown) => {
      store.set(keyOf(topic, key), value);
    },
    delete: async (topic: string, key: string) => {
      store.delete(keyOf(topic, key));
    },
    incr: async (topic: string, key: string, by = 1) => {
      const sum = Number(store.get(keyOf(topic, key)) ?? 0) + by;
      store.set(keyOf(topic, key), sum);
      return sum;
    },
  };
  return { codes: new SignCode(cache as unknown as CacheDatabase, serverSecret), store };
};

describe("SignCode phone codes", () => {
  const phone = "010-0000-0000";
  const purpose = "signinWithSignToken";

  test("refuses every code for the day once the misses reach the cap, a fresh code included", async () => {
    const { codes } = codesOf();
    await codes.registerPhoneCode("u1", phone, purpose, "123456");
    for (let missNum = 0; missNum < SignCode.maxCodeFails; missNum++)
      expect(await codes.isPhoneCodeValid("u1", phone, purpose, "000000")).toBe(false);
    await codes.registerPhoneCode("u1", phone, purpose, "654321");
    await expect(codes.isPhoneCodeValid("u1", phone, purpose, "654321")).rejects.toThrow(/tooManyCodeFailures/);
    await codes.registerPhoneCode("u2", phone, purpose, "123456");
    expect(await codes.isPhoneCodeValid("u2", phone, purpose, "123456")).toBe(true);
  });

  test("a wrong code counts one miss and a code for another number never verifies", async () => {
    const { codes, store } = codesOf();
    await codes.registerPhoneCode("u1", phone, purpose, "123456");
    expect(await codes.isPhoneCodeValid("u1", phone, purpose, "123457")).toBe(false);
    expect(await codes.isPhoneCodeValid("u1", "010-0000-0001", purpose, "123456")).toBe(false);
    expect(store.get("codeFails:u1")).toBe(2);
    expect(await codes.isPhoneCodeValid("u1", phone, purpose, "123456")).toBe(true);
    expect(store.get("codeFails:u1")).toBeUndefined();
  });

  test("the stored value is matched by no unkeyed hash of any six-digit code", async () => {
    const { codes, store } = codesOf();
    await codes.registerPhoneCode("u1", phone, purpose, "123456");
    const stored = store.get(`phoneCode:u1:${purpose}`);
    if (typeof stored !== "string") throw new Error("no phone code was stored");
    expect(stored).not.toContain(phone);
    for (let value = 0; value < 1_000_000; value++) {
      const code = String(value).padStart(6, "0");
      if (sha256(code) === stored || sha256(JSON.stringify(["phoneCode", `u1:${purpose}`, phone, code])) === stored)
        throw new Error(`code ${code} matched without the key`);
    }
  });

  test("the same code under another server secret stores another value and does not verify", async () => {
    const first = codesOf("server-secret-a");
    const second = codesOf("server-secret-b");
    await first.codes.registerPhoneCode("u1", phone, purpose, "123456");
    await second.codes.registerPhoneCode("u1", phone, purpose, "123456");
    const firstStored = first.store.get(`phoneCode:u1:${purpose}`);
    expect(firstStored).not.toBe(second.store.get(`phoneCode:u1:${purpose}`));
    second.store.set(`phoneCode:u1:${purpose}`, firstStored);
    expect(await second.codes.isPhoneCodeValid("u1", phone, purpose, "123456")).toBe(false);
  });

  test("a code stored by the build before the HMAC answers as wrong, counts nothing, and a fresh one verifies", async () => {
    const { codes, store } = codesOf();
    store.set(`phoneCode:u1:${purpose}`, `${phone}:${sha256("123456")}`);
    expect(await codes.isPhoneCodeValid("u1", phone, purpose, "123456")).toBe(false);
    expect(store.get("codeFails:u1")).toBeUndefined();
    await codes.registerPhoneCode("u1", phone, purpose, "123456");
    expect(await codes.isPhoneCodeValid("u1", phone, purpose, "123456")).toBe(true);
  });
});

describe("SignCode email codes", () => {
  const accountId = "ann@client.example.com";

  test("stores a keyed digest, verifies the right code once, and keeps each purpose apart", async () => {
    const { codes, store } = codesOf();
    await codes.registerEmailCode("u1", accountId, "123456");
    await codes.registerEmailCode("u1", accountId, "654321", "address");
    const stored = store.get("emailCode:u1");
    expect(stored).not.toBe(`${accountId}:${sha256("123456")}`);
    expect(stored).not.toBe(sha256("123456"));
    expect(String(stored)).not.toContain(accountId);
    expect(await codes.isEmailCodeValid("u1", accountId, "654321")).toBe(false);
    expect(await codes.isEmailCodeValid("u1", accountId, "123456")).toBe(true);
    expect(await codes.isEmailCodeValid("u1", accountId, "123456")).toBe(false);
    expect(await codes.isEmailCodeValid("u1", accountId, "654321", "address")).toBe(true);
  });

  test("a code mailed by the build before the HMAC answers as wrong", async () => {
    const { codes, store } = codesOf();
    store.set("emailCode:u1", `${accountId}:${sha256("123456")}`);
    expect(await codes.isEmailCodeValid("u1", accountId, "123456")).toBe(false);
    expect(store.get("codeFails:u1")).toBeUndefined();
  });
});
