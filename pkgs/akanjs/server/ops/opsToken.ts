import { createPublicKey, type KeyObject, verify } from "node:crypto";

export interface OpsTokenClaims {
  aud: string;
  exp: number;
  iat: number;
  jti: string;
}

export type OpsTokenVerdict = { ok: true; claims: OpsTokenClaims } | { ok: false; reason: string };

/**
 * A compact EdDSA JWS the control plane signs and this app only verifies — the edge holds a public key, so a
 * machine someone carries off yields nothing that mints a token for any other.
 */
export class OpsTokenVerifier {
  static readonly maxLifetimeSec = 300;
  static readonly clockSkewSec = 30;
  static readonly maxRememberedJti = 10_000;

  readonly audience: string;
  readonly #key: KeyObject;
  readonly #seen = new Map<string, number>();

  constructor(key: KeyObject, audience: string) {
    if (key.asymmetricKeyType !== "ed25519") throw new Error("AKAN_OPS_PUBLIC_KEY must be an Ed25519 public key");
    this.#key = key;
    this.audience = audience;
  }

  //* With AKAN_OPS_INSTANCE set the audience carries it, so a token minted for the app as a whole — which the other
  //* instances sharing app/env would also accept — is refused here instead of replayable across them.
  static audienceOf(appName: string, environment: string, instance = process.env.AKAN_OPS_INSTANCE?.trim()) {
    return instance ? `${appName}/${environment}/${instance}` : `${appName}/${environment}`;
  }

  static parsePublicKey(value: string): KeyObject {
    const trimmed = value.trim();
    if (trimmed.startsWith("{")) return createPublicKey({ key: JSON.parse(trimmed) as JsonWebKey, format: "jwk" });
    const pem = trimmed.includes("-----BEGIN") ? trimmed.replace(/\\n/g, "\n") : null;
    if (pem) return createPublicKey(pem);
    const raw = Buffer.from(trimmed, "base64url");
    if (raw.length === 32)
      return createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: raw.toString("base64url") }, format: "jwk" });
    if (raw.length === 44) return createPublicKey({ key: raw, format: "der", type: "spki" });
    throw new Error("AKAN_OPS_PUBLIC_KEY must be a PEM, a JWK, base64 SPKI DER, or a raw 32-byte base64url key");
  }

  verifyRequest(req: Request, nowSec = Math.floor(Date.now() / 1000)): OpsTokenVerdict {
    const match = /^Bearer\s+(\S+)$/i.exec(req.headers.get("authorization") ?? "");
    if (!match?.[1]) return { ok: false, reason: "missing bearer token" };
    return this.verify(match[1], nowSec);
  }

  verify(token: string, nowSec = Math.floor(Date.now() / 1000)): OpsTokenVerdict {
    const parts = token.split(".");
    if (parts.length !== 3) return { ok: false, reason: "malformed token" };
    const [headerPart = "", payloadPart = "", signaturePart = ""] = parts;
    const header = OpsTokenVerifier.#decodeJson(headerPart);
    if (header?.alg !== "EdDSA") return { ok: false, reason: "alg must be EdDSA" };
    const signed = verify(
      null,
      Buffer.from(`${headerPart}.${payloadPart}`),
      this.#key,
      Buffer.from(signaturePart, "base64url"),
    );
    if (!signed) return { ok: false, reason: "bad signature" };
    const claims = OpsTokenVerifier.#decodeJson(payloadPart);
    if (!claims) return { ok: false, reason: "malformed claims" };
    const { aud, exp, iat, jti } = claims;
    if (typeof exp !== "number" || typeof iat !== "number" || typeof jti !== "string" || !jti)
      return { ok: false, reason: "exp, iat and jti are required" };
    const audiences = Array.isArray(aud) ? aud : [aud];
    if (!audiences.includes(this.audience)) return { ok: false, reason: "audience mismatch" };
    if (exp <= nowSec) return { ok: false, reason: "expired" };
    if (iat > nowSec + OpsTokenVerifier.clockSkewSec) return { ok: false, reason: "issued in the future" };
    if (exp - iat > OpsTokenVerifier.maxLifetimeSec) return { ok: false, reason: "lifetime exceeds 300s" };
    if (!this.#remember(jti, exp, nowSec)) return { ok: false, reason: "replayed jti" };
    return { ok: true, claims: { aud: this.audience, exp, iat, jti } };
  }

  #remember(jti: string, exp: number, nowSec: number) {
    for (const [seen, seenExp] of this.#seen) if (seenExp <= nowSec) this.#seen.delete(seen);
    if (this.#seen.has(jti)) return false;
    //* Refusing when full, rather than evicting, keeps a flood of fresh tokens from pushing a live jti out to replay it.
    if (this.#seen.size >= OpsTokenVerifier.maxRememberedJti) return false;
    this.#seen.set(jti, exp);
    return true;
  }

  static #decodeJson(part: string): Record<string, unknown> | null {
    try {
      const value = JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as unknown;
      return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
}
