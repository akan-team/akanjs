import { describe, expect, test } from "bun:test";
import { generateKeyPairSync, type KeyObject, sign } from "node:crypto";
import { OpsTokenVerifier } from "./opsToken";

const now = 1_800_000_000;
const { publicKey, privateKey } = generateKeyPairSync("ed25519");

const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
const mint = (
  claims: Record<string, unknown>,
  { key = privateKey, alg = "EdDSA" }: { key?: KeyObject; alg?: string } = {},
) => {
  const head = `${b64({ alg, typ: "JWT" })}.${b64(claims)}`;
  return `${head}.${sign(null, Buffer.from(head), key).toString("base64url")}`;
};
const claims = (extra: Record<string, unknown> = {}) => ({
  aud: "puffinplace/main/edge-3",
  iat: now,
  exp: now + 120,
  jti: crypto.randomUUID(),
  ...extra,
});

describe("OpsTokenVerifier", () => {
  test("accepts a token signed for this exact audience", () => {
    const verifier = new OpsTokenVerifier(publicKey, "puffinplace/main/edge-3");
    expect(verifier.verify(mint(claims()), now)).toMatchObject({ ok: true });
  });

  test("an instance-bound app refuses a token minted for the app as a whole", () => {
    const verifier = new OpsTokenVerifier(publicKey, OpsTokenVerifier.audienceOf("puffinplace", "main", "edge-3"));
    expect(verifier.verify(mint(claims({ aud: "puffinplace/main" })), now)).toEqual({
      ok: false,
      reason: "audience mismatch",
    });
    expect(verifier.verify(mint(claims({ aud: "puffinplace/main/edge-4" })), now).ok).toBe(false);
  });

  test("refuses a replayed jti, an expired token and one living past 300s", () => {
    const verifier = new OpsTokenVerifier(publicKey, "puffinplace/main/edge-3");
    const token = mint(claims());
    expect(verifier.verify(token, now).ok).toBe(true);
    expect(verifier.verify(token, now)).toEqual({ ok: false, reason: "replayed jti" });
    expect(verifier.verify(mint(claims({ exp: now - 1 })), now)).toEqual({ ok: false, reason: "expired" });
    expect(verifier.verify(mint(claims({ exp: now + 301 })), now)).toEqual({
      ok: false,
      reason: "lifetime exceeds 300s",
    });
  });

  test("refuses another key's signature and a non-EdDSA header", () => {
    const verifier = new OpsTokenVerifier(publicKey, "puffinplace/main/edge-3");
    const other = generateKeyPairSync("ed25519").privateKey;
    expect(verifier.verify(mint(claims(), { key: other }), now)).toEqual({ ok: false, reason: "bad signature" });
    expect(verifier.verify(mint(claims(), { alg: "none" }), now)).toEqual({ ok: false, reason: "alg must be EdDSA" });
  });

  test("parses the key from PEM, JWK and raw base64url", () => {
    const pem = publicKey.export({ format: "pem", type: "spki" }).toString();
    const jwk = publicKey.export({ format: "jwk" });
    const der = publicKey.export({ format: "der", type: "spki" }).toString("base64");
    for (const form of [pem, pem.replace(/\n/g, "\\n"), JSON.stringify(jwk), jwk.x ?? "", der]) {
      const verifier = new OpsTokenVerifier(OpsTokenVerifier.parsePublicKey(form), "puffinplace/main/edge-3");
      expect(verifier.verify(mint(claims()), now).ok).toBe(true);
    }
  });
});
