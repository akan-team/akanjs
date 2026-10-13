import { type KeyObject, sign, verify } from "node:crypto";
import { decodeJwtHeader, decodeJwtPayload } from "../common/jwtDecode";

export interface EdDsaJwtVerifyOptions {
  /** Must be among the token's `aud`, a string or a list. */
  audience: string;
  /** Required of the header when given; a token minted by another party may carry none. */
  typ?: string;
}

export type EdDsaJwtVerdict = { ok: true; claims: Record<string, unknown> } | { ok: false; reason: string };

export class EdDsaJwt {
  static sign(claims: object, key: KeyObject, { typ }: { typ?: string } = {}) {
    const signed = `${EdDsaJwt.#encode({ alg: "EdDSA", ...(typ ? { typ } : {}) })}.${EdDsaJwt.#encode(claims)}`;
    return `${signed}.${sign(null, Buffer.from(signed), key).toString("base64url")}`;
  }

  /** Unverified: enough to tell one kind of token from another before choosing how to verify it. */
  static headerOf(token: string): Record<string, unknown> | null {
    return EdDsaJwt.#record(() => decodeJwtHeader(token));
  }

  //* The algorithm is pinned before the signature is checked, so a header cannot pick a weaker one (`none`, HS256).
  static verify(token: string, key: KeyObject, { audience, typ }: EdDsaJwtVerifyOptions): EdDsaJwtVerdict {
    const parts = token.split(".");
    if (parts.length !== 3) return { ok: false, reason: "malformed token" };
    const [headerPart = "", payloadPart = "", signaturePart = ""] = parts;
    const header = EdDsaJwt.headerOf(token);
    if (header?.alg !== "EdDSA" || (typ !== undefined && header.typ !== typ))
      return { ok: false, reason: typ === undefined ? "alg must be EdDSA" : `not an EdDSA ${typ}` };
    const signed = verify(
      null,
      Buffer.from(`${headerPart}.${payloadPart}`),
      key,
      Buffer.from(signaturePart, "base64url"),
    );
    if (!signed) return { ok: false, reason: "bad signature" };
    const claims = EdDsaJwt.#record(() => decodeJwtPayload(token));
    if (!claims) return { ok: false, reason: "malformed claims" };
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!audiences.includes(audience)) return { ok: false, reason: "audience mismatch" };
    return { ok: true, claims };
  }

  static #encode(value: object) {
    return Buffer.from(JSON.stringify(value)).toString("base64url");
  }

  static #record(read: () => unknown): Record<string, unknown> | null {
    try {
      const value = read();
      return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
}
