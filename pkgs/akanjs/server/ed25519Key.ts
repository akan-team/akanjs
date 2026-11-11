import { createPrivateKey, createPublicKey, generateKeyPairSync, type KeyObject } from "node:crypto";
import { AkanError } from "akanjs/base";

export class Ed25519Key {
  /** PEM (with `\n` escapes, as an env file holds one), a JWK, base64 SPKI DER, or a raw 32-byte base64url key. */
  static parsePublic(value: string, name: string): KeyObject {
    const trimmed = value.trim();
    const key = Ed25519Key.#read(
      `${name} must be a PEM, a JWK, base64 SPKI DER, or a raw 32-byte base64url key`,
      () => {
        if (trimmed.startsWith("{")) return createPublicKey({ key: JSON.parse(trimmed) as JsonWebKey, format: "jwk" });
        if (trimmed.includes("-----BEGIN")) return createPublicKey(trimmed.replace(/\\n/g, "\n"));
        const raw = Buffer.from(trimmed, "base64url");
        if (raw.length === 32)
          return createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: raw.toString("base64url") }, format: "jwk" });
        if (raw.length === 44) return createPublicKey({ key: raw, format: "der", type: "spki" });
        return null;
      },
    );
    if (key.asymmetricKeyType !== "ed25519") throw new AkanError("invalidKey", `${name} must be an Ed25519 public key`);
    return key;
  }

  /** PEM (with `\n` escapes), a JWK, or base64 PKCS#8 DER. */
  static parsePrivate(value: string, name: string): KeyObject {
    const trimmed = value.trim();
    const key = Ed25519Key.#read(`${name} must be a PEM, a JWK, or base64 PKCS#8 DER private key`, () => {
      if (trimmed.startsWith("{")) return createPrivateKey({ key: JSON.parse(trimmed) as JsonWebKey, format: "jwk" });
      if (trimmed.includes("-----BEGIN")) return createPrivateKey(trimmed.replace(/\\n/g, "\n"));
      const raw = Buffer.from(trimmed, "base64");
      if (raw.length === 48) return createPrivateKey({ key: raw, format: "der", type: "pkcs8" });
      return null;
    });
    if (key.asymmetricKeyType !== "ed25519")
      throw new AkanError("invalidKey", `${name} must be an Ed25519 private key`);
    return key;
  }

  /** The private key as PKCS#8 PEM, and the public key as the raw 32 bytes in base64url, short enough for an env line. */
  static generate() {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    return {
      privatePem: privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
      publicKey: Ed25519Key.rawPublic(publicKey),
    };
  }

  static #read(unreadable: string, parse: () => KeyObject | null): KeyObject {
    let key: KeyObject | null;
    try {
      key = parse();
    } catch (cause) {
      throw new AkanError("invalidKey", unreadable, { cause });
    }
    if (!key) throw new AkanError("invalidKey", unreadable);
    return key;
  }

  static rawPublic(key: KeyObject) {
    const { x } = key.export({ format: "jwk" });
    if (!x) throw new AkanError("invalidKey", "not an Ed25519 public key");
    return x;
  }
}
