import { describe, expect, test } from "bun:test";
import { createHmac, generateKeyPairSync, sign } from "node:crypto";
import { EdDsaJwt } from "./edDsaJwt";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
const signedWith = (header: object, claims: unknown) => {
  const signed = `${encode(header)}.${encode(claims)}`;
  return `${signed}.${sign(null, Buffer.from(signed), privateKey).toString("base64url")}`;
};
const audience = "app/main";

describe("EdDsaJwt", () => {
  test("verifies what it signs, an audience among a list's included", () => {
    const token = EdDsaJwt.sign({ aud: audience, sub: "pc-7" }, privateKey, { typ: "akan-machine+jwt" });
    expect(EdDsaJwt.headerOf(token)).toEqual({ alg: "EdDSA", typ: "akan-machine+jwt" });
    expect(EdDsaJwt.verify(token, publicKey, { audience, typ: "akan-machine+jwt" })).toEqual({
      ok: true,
      claims: { aud: audience, sub: "pc-7" },
    });
    const listed = EdDsaJwt.sign({ aud: ["other/main", audience] }, privateKey);
    expect(EdDsaJwt.verify(listed, publicKey, { audience }).ok).toBe(true);
  });

  test("refuses any algorithm but EdDSA before it looks at the signature", () => {
    const claims = encode({ aud: audience });
    const unsigned = `${encode({ alg: "none" })}.${claims}.`;
    const hmac = `${encode({ alg: "HS256" })}.${claims}`;
    const hs256 = `${hmac}.${createHmac("sha256", "secret").update(hmac).digest("base64url")}`;
    for (const token of [unsigned, hs256, signedWith({ typ: "JWT" }, { aud: audience })]) {
      expect(EdDsaJwt.verify(token, publicKey, { audience })).toEqual({ ok: false, reason: "alg must be EdDSA" });
      expect(EdDsaJwt.verify(token, publicKey, { audience, typ: "akan-machine+jwt" })).toEqual({
        ok: false,
        reason: "not an EdDSA akan-machine+jwt",
      });
    }
  });

  test("refuses another typ only when one is required", () => {
    const token = signedWith({ alg: "EdDSA", typ: "JWT" }, { aud: audience });
    expect(EdDsaJwt.verify(token, publicKey, { audience, typ: "akan-machine+jwt" })).toEqual({
      ok: false,
      reason: "not an EdDSA akan-machine+jwt",
    });
    expect(EdDsaJwt.verify(signedWith({ alg: "EdDSA" }, { aud: audience }), publicKey, { audience }).ok).toBe(true);
    expect(EdDsaJwt.verify(token, publicKey, { audience }).ok).toBe(true);
  });

  test("refuses another audience, a missing one and one only a prefix of it", () => {
    for (const aud of ["app/debug", undefined, "app", ["app/debug", "app/main/edge"]])
      expect(EdDsaJwt.verify(signedWith({ alg: "EdDSA" }, { aud }), publicKey, { audience })).toEqual({
        ok: false,
        reason: "audience mismatch",
      });
  });

  test("refuses another key's signature, a tampered payload and claims that are not an object", () => {
    const other = generateKeyPairSync("ed25519").privateKey;
    expect(EdDsaJwt.verify(EdDsaJwt.sign({ aud: audience }, other), publicKey, { audience })).toEqual({
      ok: false,
      reason: "bad signature",
    });
    const [header, , signature] = EdDsaJwt.sign({ aud: audience, sub: "a" }, privateKey).split(".");
    const tampered = `${header}.${encode({ aud: audience, sub: "b" })}.${signature}`;
    expect(EdDsaJwt.verify(tampered, publicKey, { audience })).toEqual({ ok: false, reason: "bad signature" });
    expect(EdDsaJwt.verify(signedWith({ alg: "EdDSA" }, [audience]), publicKey, { audience })).toEqual({
      ok: false,
      reason: "malformed claims",
    });
  });

  test("refuses a token that is not three parts, and reads no header from one that is not JSON", () => {
    for (const token of ["", "a.b", "a.b.c.d"])
      expect(EdDsaJwt.verify(token, publicKey, { audience })).toEqual({ ok: false, reason: "malformed token" });
    expect(EdDsaJwt.headerOf("not-json.x.y")).toBeNull();
    expect(EdDsaJwt.headerOf("")).toBeNull();
  });
});
