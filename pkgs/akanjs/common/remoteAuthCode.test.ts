import { describe, expect, test } from "bun:test";
import { RemoteAuthCode } from "./remoteAuthCode";

const remoteId = "9b2f6c1e-4a1d-4c55-9a53-0b1c9f8e7d21";

describe("RemoteAuthCode", () => {
  test("derives the same code from the same device code, and a different one from another", async () => {
    const code = await RemoteAuthCode.of(remoteId);

    expect(await RemoteAuthCode.of(remoteId)).toBe(code);
    expect(await RemoteAuthCode.of(crypto.randomUUID())).not.toBe(code);
  });

  test("keeps the derivation a CLI and a cloud of other versions both compute", async () => {
    expect(await RemoteAuthCode.of(remoteId)).toBe("JHXW-BKFT");
    expect(await RemoteAuthCode.of("")).toBe("HQHN-HMDC");
  });

  test("derives the login id a sign-in URL carries, from which neither the device code nor its code follows", async () => {
    const loginId = await RemoteAuthCode.loginIdOf(remoteId);

    expect(loginId).toBe("lq9lA6CwplwiIOjs-P9y0X2vsD5VAeRuBYNOsaHjqVU");
    expect(await RemoteAuthCode.loginIdOf("")).toBe("o8A2wizPduEyJ8oJ_nnfilS55pL_WMNLGDKJHYXghds");
    expect(await RemoteAuthCode.loginIdOf(remoteId)).toBe(loginId);
    expect(loginId).not.toContain(remoteId);
    expect(await RemoteAuthCode.of(loginId)).not.toBe(await RemoteAuthCode.of(remoteId));
    expect(await RemoteAuthCode.matches(remoteId, await RemoteAuthCode.of(loginId))).toBe(false);
    for (let idx = 0; idx < 50; idx++)
      expect(await RemoteAuthCode.loginIdOf(crypto.randomUUID())).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  test("formats eight symbols of the RFC 8628 consonant alphabet as two groups of four", async () => {
    for (let idx = 0; idx < 200; idx++)
      expect(await RemoteAuthCode.of(crypto.randomUUID())).toMatch(
        /^[BCDFGHJKLMNPQRSTVWXZ]{4}-[BCDFGHJKLMNPQRSTVWXZ]{4}$/,
      );
  });

  test("normalizes case, dashes, spaces and full-width letters, and drops what the alphabet lacks", () => {
    expect(RemoteAuthCode.normalize("abcd efgh")).toBe("BCDFGH");
    expect(RemoteAuthCode.normalize("ABCD-EFGH")).toBe("BCDFGH");
    expect(RemoteAuthCode.normalize(" bcdf-ghjk\n")).toBe("BCDFGHJK");
    expect(RemoteAuthCode.normalize("ＢＣＤＦ－ＧＨＪＫ")).toBe("BCDFGHJK");
    expect(RemoteAuthCode.normalize("0O1I-AEUY")).toBe("");
  });

  test("matches the code however it is typed", async () => {
    const code = await RemoteAuthCode.of(remoteId);

    for (const typed of [code, code.toLowerCase(), code.replace("-", ""), code.replace("-", " "), ` ${code} `])
      expect(await RemoteAuthCode.matches(remoteId, typed)).toBe(true);
  });

  test("refuses another device's code, a near miss, a prefix, an extra symbol and nothing at all", async () => {
    const code = RemoteAuthCode.normalize(await RemoteAuthCode.of(remoteId));
    const other = await RemoteAuthCode.of("another-device");
    const lastSwapped = code.slice(0, 7) + (code.endsWith("B") ? "C" : "B");

    for (const typed of [other, lastSwapped, code.slice(0, 7), `${code}B`, "", "--------"])
      expect(await RemoteAuthCode.matches(remoteId, typed)).toBe(false);
  });

  test("draws every symbol about equally often", async () => {
    const counts = new Map<string, number>();
    const codeNum = 2_000;
    for (let idx = 0; idx < codeNum; idx++)
      for (const symbol of RemoteAuthCode.normalize(await RemoteAuthCode.of(`device-${idx}`)))
        counts.set(symbol, (counts.get(symbol) ?? 0) + 1);

    const expected = (codeNum * RemoteAuthCode.symbolNum) / RemoteAuthCode.alphabet.length;
    const chiSquare = [...RemoteAuthCode.alphabet].reduce(
      (sum, symbol) => sum + ((counts.get(symbol) ?? 0) - expected) ** 2 / expected,
      0,
    );
    expect(counts.size).toBe(RemoteAuthCode.alphabet.length);
    //? 43.8 is the 0.999 quantile of chi-square with 19 degrees of freedom.
    expect(chiSquare).toBeLessThan(43.8);
  });
});
