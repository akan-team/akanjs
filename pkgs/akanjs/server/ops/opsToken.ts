import type { KeyObject } from "node:crypto";
import { bearerTokenOf } from "akanjs/common";
import { Ed25519Key } from "../ed25519Key";
import { EdDsaJwt } from "../edDsaJwt";

export interface OpsTokenClaims {
  aud: string;
  exp: number;
  iat: number;
  jti: string;
}

export type OpsTokenVerdict = { ok: true; claims: OpsTokenClaims } | { ok: false; reason: string };

// Security: verify-only EdDSA — the edge holds just a public key, so a stolen machine can mint no tokens.
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

  //* An instance-bound audience refuses an app-wide token, which would replay across every instance of app/env.
  static audienceOf(appName: string, environment: string, instance = process.env.AKAN_OPS_INSTANCE?.trim()) {
    return instance ? `${appName}/${environment}/${instance}` : `${appName}/${environment}`;
  }

  static parsePublicKey(value: string): KeyObject {
    return Ed25519Key.parsePublic(value, "AKAN_OPS_PUBLIC_KEY");
  }

  verifyRequest(req: Request, nowSec = Math.floor(Date.now() / 1000)): OpsTokenVerdict {
    const token = bearerTokenOf(req.headers.get("authorization"));
    if (!token) return { ok: false, reason: "missing bearer token" };
    return this.verify(token, nowSec);
  }

  verify(token: string, nowSec = Math.floor(Date.now() / 1000)): OpsTokenVerdict {
    const verdict = EdDsaJwt.verify(token, this.#key, { audience: this.audience });
    if (!verdict.ok) return verdict;
    const { exp, iat, jti } = verdict.claims;
    if (typeof exp !== "number" || typeof iat !== "number" || typeof jti !== "string" || !jti)
      return { ok: false, reason: "exp, iat and jti are required" };
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
}
