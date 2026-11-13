import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

// Seals what a remote connection stores, so the cache alone yields no token. AES-256-GCM under a key derived from the
// app's signing secret: rotating that secret closes every connection, as it signs every session out.
export class RemoteVault {
  static readonly #info = "akan.remote.vault.v1";
  readonly #key: Buffer;

  constructor(secret: string) {
    this.#key = Buffer.from(hkdfSync("sha256", secret, "", RemoteVault.#info, 32));
  }

  seal(text: string): string {
    if (!text) return "";
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.#key, iv);
    const sealed = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
    return [iv, cipher.getAuthTag(), sealed].map((part) => part.toString("base64url")).join(".");
  }

  /** Empty for anything this key did not seal: a tampered value and one sealed under a rotated secret read alike. */
  open(sealed: string): string {
    const [iv, tag, body] = sealed.split(".").map((part) => Buffer.from(part, "base64url"));
    if (!iv?.length || !tag?.length || !body?.length) return "";
    try {
      const decipher = createDecipheriv("aes-256-gcm", this.#key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
    } catch {
      return "";
    }
  }
}
