import { describe, expect, test } from "bun:test";
import { hashPassword, isBcryptHash, isPasswordMatch } from "./bcrypt";

const randomText = (length = 16) => crypto.randomUUID().replaceAll("-", "").slice(0, length);

describe("isPasswordMatch", () => {
  test("matches the password a bcrypt hash was made from", async () => {
    const password = randomText();
    expect(await isPasswordMatch(password, await hashPassword(password))).toBe(true);
  });

  test("refuses another password against a bcrypt hash", async () => {
    expect(await isPasswordMatch(randomText(), await hashPassword(randomText()))).toBe(false);
  });

  test("matches a legacy cleartext value equal to the password", async () => {
    const password = randomText();
    expect(await isPasswordMatch(password, password)).toBe(true);
  });

  test("refuses a legacy cleartext value of another length", async () => {
    const stored = randomText(12);
    expect(await isPasswordMatch(stored.slice(0, 8), stored)).toBe(false);
    expect(await isPasswordMatch(`${stored}${randomText(4)}`, stored)).toBe(false);
  });

  test("refuses a legacy cleartext value of the same length", async () => {
    expect(await isPasswordMatch(randomText(12), randomText(12))).toBe(false);
  });
});

describe("isBcryptHash", () => {
  test("recognises a bcrypt hash", async () => {
    expect(isBcryptHash(await hashPassword(randomText()))).toBe(true);
  });

  test("rejects a cleartext value", () => {
    expect(isBcryptHash(randomText())).toBe(false);
    expect(isBcryptHash("")).toBe(false);
  });
});
