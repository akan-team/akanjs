import {
  createHmac,
  createPrivateKey,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
  type KeyObject,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { Transform } from "node:stream";
import type { SnapshotDecryptor } from "./snapshotRestore";
import type { SnapshotEncryption } from "./snapshotTypes";
import type { SnapshotEncryptor } from "./sqliteSnapshot";

type Aead = (
  key: Uint8Array,
  nonce: Uint8Array,
) => {
  encrypt(data: Uint8Array): Uint8Array;
  decrypt(data: Uint8Array): Uint8Array;
};

/**
 * age v1 (age-encryption.org/v1) with X25519 recipients, so an operator restores with `age -d -i key.txt`.
 * ChaCha20-Poly1305 comes from @noble/ciphers because Bun exposes it through neither node:crypto nor WebCrypto;
 * it is loaded only when a recipient is configured.
 */
export class AgeEncryption {
  static readonly intro = "age-encryption.org/v1";
  static readonly chunkSize = 64 * 1024;
  static readonly tagSize = 16;
  static readonly #x25519Info = "age-encryption.org/v1/X25519";
  static readonly #spkiPrefix = Buffer.from("302a300506032b656e032100", "hex");
  static readonly #pkcs8Prefix = Buffer.from("302e020100300506032b656e04220420", "hex");
  static readonly #bech32Charset = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";

  static async encryptor(recipients: string[]): Promise<SnapshotEncryptor> {
    const aead = await AgeEncryption.#aead();
    const keys = recipients.map((recipient) => AgeEncryption.parseRecipient(recipient));
    const encryption: SnapshotEncryption = { format: "age", recipients };
    return { encryption, extension: ".age", transform: () => AgeEncryption.#encryptStream(aead, keys) };
  }

  static async decryptor(identities: string[]): Promise<SnapshotDecryptor> {
    const aead = await AgeEncryption.#aead();
    const keys = identities.map((identity) => AgeEncryption.parseIdentity(identity));
    return { transform: () => AgeEncryption.#decryptStream(aead, keys) };
  }

  static async fromEnv(): Promise<SnapshotEncryptor | null> {
    const recipients = (process.env.AKAN_BACKUP_RECIPIENT ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    return recipients.length ? await AgeEncryption.encryptor(recipients) : null;
  }

  static identitiesIn(text: string) {
    return text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("AGE-SECRET-KEY-1"));
  }

  static generateIdentity() {
    const { privateKey, publicKey } = generateKeyPairSync("x25519");
    const secret = privateKey.export({ format: "der", type: "pkcs8" }).subarray(-32);
    const pub = publicKey.export({ format: "der", type: "spki" }).subarray(-32);
    return {
      identity: AgeEncryption.#bech32Encode("age-secret-key-", secret).toUpperCase(),
      recipient: AgeEncryption.#bech32Encode("age", pub),
    };
  }

  static parseRecipient(recipient: string): KeyObject {
    const bytes = AgeEncryption.#bech32Decode(recipient.trim(), "age");
    return createPublicKey({ key: Buffer.concat([AgeEncryption.#spkiPrefix, bytes]), format: "der", type: "spki" });
  }

  static parseIdentity(identity: string): KeyObject {
    const bytes = AgeEncryption.#bech32Decode(identity.trim().toLowerCase(), "age-secret-key-");
    return createPrivateKey({ key: Buffer.concat([AgeEncryption.#pkcs8Prefix, bytes]), format: "der", type: "pkcs8" });
  }

  static async #aead(): Promise<Aead> {
    const { chacha20poly1305 } = await import("@noble/ciphers/chacha.js");
    return (key, nonce) => chacha20poly1305(key, nonce);
  }

  static #header(aead: Aead, recipients: KeyObject[], fileKey: Buffer) {
    const lines = [AgeEncryption.intro];
    for (const recipient of recipients) {
      const ephemeral = generateKeyPairSync("x25519");
      const share = ephemeral.publicKey.export({ format: "der", type: "spki" }).subarray(-32);
      const recipientRaw = recipient.export({ format: "der", type: "spki" }).subarray(-32);
      const shared = diffieHellman({ privateKey: ephemeral.privateKey, publicKey: recipient });
      const wrapKey = AgeEncryption.#hkdf(shared, Buffer.concat([share, recipientRaw]), AgeEncryption.#x25519Info);
      const body = aead(wrapKey, new Uint8Array(12)).encrypt(fileKey);
      lines.push(`-> X25519 ${AgeEncryption.#b64(share)}`, ...AgeEncryption.#wrap(AgeEncryption.#b64(body)));
    }
    const beforeMac = `${lines.join("\n")}\n---`;
    const mac = createHmac("sha256", AgeEncryption.#hkdf(fileKey, Buffer.alloc(0), "header"))
      .update(beforeMac)
      .digest();
    return Buffer.from(`${beforeMac} ${AgeEncryption.#b64(mac)}\n`);
  }

  static #encryptStream(aead: Aead, recipients: KeyObject[]) {
    const fileKey = randomBytes(16);
    const payloadNonce = randomBytes(16);
    const streamKey = AgeEncryption.#hkdf(fileKey, payloadNonce, "payload");
    let pending: Buffer = Buffer.alloc(0);
    let counter = 0n;
    let started = false;
    const seal = (chunk: Buffer, last: boolean) =>
      aead(streamKey, AgeEncryption.#chunkNonce(counter++, last)).encrypt(chunk);
    return new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        if (!started) {
          this.push(AgeEncryption.#header(aead, recipients, fileKey));
          this.push(payloadNonce);
          started = true;
        }
        pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;
        //* A full chunk is sealed only once more data follows it: the final chunk carries the last flag, and a
        //* payload that is an exact multiple of 64KiB must end on a full chunk flagged last, not an empty one.
        while (pending.length > AgeEncryption.chunkSize) {
          this.push(seal(pending.subarray(0, AgeEncryption.chunkSize), false));
          pending = pending.subarray(AgeEncryption.chunkSize);
        }
        callback();
      },
      flush(callback) {
        if (!started) {
          this.push(AgeEncryption.#header(aead, recipients, fileKey));
          this.push(payloadNonce);
        }
        this.push(seal(pending, true));
        callback();
      },
    });
  }

  static #decryptStream(aead: Aead, identities: KeyObject[]) {
    let buffered: Buffer = Buffer.alloc(0);
    let streamKey: Uint8Array | null = null;
    let counter = 0n;
    const sealedSize = AgeEncryption.chunkSize + AgeEncryption.tagSize;
    const open = (chunk: Buffer, last: boolean) => {
      if (!streamKey) throw new Error("age payload before header");
      return aead(streamKey, AgeEncryption.#chunkNonce(counter++, last)).decrypt(chunk);
    };
    return new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        try {
          buffered = buffered.length ? Buffer.concat([buffered, chunk]) : chunk;
          if (!streamKey) {
            const parsed = AgeEncryption.#readHeader(aead, buffered, identities);
            if (!parsed) return callback();
            streamKey = parsed.streamKey;
            buffered = buffered.subarray(parsed.consumed);
          }
          while (buffered.length > sealedSize) {
            this.push(open(buffered.subarray(0, sealedSize), false));
            buffered = buffered.subarray(sealedSize);
          }
          callback();
        } catch (error) {
          callback(error as Error);
        }
      },
      flush(callback) {
        try {
          if (!streamKey) throw new Error("truncated age header");
          const plain = open(buffered, true);
          if (plain.length === 0 && counter > 1n) throw new Error("age payload ends with an empty chunk");
          this.push(plain);
          callback();
        } catch (error) {
          callback(error as Error);
        }
      },
    });
  }

  static #readHeader(aead: Aead, data: Buffer, identities: KeyObject[]) {
    const macAt = data.indexOf("\n--- ");
    if (macAt < 0) return null;
    const macEnd = data.indexOf("\n", macAt + 1);
    if (macEnd < 0 || data.length < macEnd + 1 + 16) return null;
    const text = data.subarray(0, macAt).toString("utf8");
    const lines = text.split("\n");
    if (lines[0] !== AgeEncryption.intro) throw new Error("not an age v1 file");
    const stanzas: { args: string[]; body: Buffer }[] = [];
    for (let idx = 1; idx < lines.length; ) {
      const line = lines[idx++] ?? "";
      if (!line.startsWith("-> ")) throw new Error("malformed age stanza");
      let body = "";
      for (;;) {
        const bodyLine = lines[idx++] ?? "";
        body += bodyLine;
        if (bodyLine.length < 64) break;
      }
      stanzas.push({ args: line.slice(3).split(" "), body: Buffer.from(body, "base64") });
    }
    const fileKey = AgeEncryption.#unwrapFileKey(aead, stanzas, identities);
    const macText = data.subarray(0, macAt + 4).toString("utf8");
    const mac = Buffer.from(data.subarray(macAt + 5, macEnd).toString("utf8"), "base64");
    const expected = createHmac("sha256", AgeEncryption.#hkdf(fileKey, Buffer.alloc(0), "header"))
      .update(macText)
      .digest();
    if (mac.length !== expected.length || !timingSafeEqual(mac, expected)) throw new Error("age header MAC mismatch");
    const nonce = data.subarray(macEnd + 1, macEnd + 17);
    return { streamKey: AgeEncryption.#hkdf(fileKey, nonce, "payload"), consumed: macEnd + 17 };
  }

  static #unwrapFileKey(aead: Aead, stanzas: { args: string[]; body: Buffer }[], identities: KeyObject[]) {
    for (const identity of identities) {
      const ourPublic = createPublicKey(identity).export({ format: "der", type: "spki" }).subarray(-32);
      for (const { args, body } of stanzas) {
        if (args[0] !== "X25519" || !args[1]) continue;
        const share = Buffer.from(args[1], "base64");
        const peer = createPublicKey({
          key: Buffer.concat([AgeEncryption.#spkiPrefix, share]),
          format: "der",
          type: "spki",
        });
        const shared = diffieHellman({ privateKey: identity, publicKey: peer });
        if (shared.every((byte) => byte === 0)) continue;
        const wrapKey = AgeEncryption.#hkdf(shared, Buffer.concat([share, ourPublic]), AgeEncryption.#x25519Info);
        try {
          return Buffer.from(aead(wrapKey, new Uint8Array(12)).decrypt(body));
        } catch {
          // Another recipient's stanza: its body does not authenticate under this identity.
        }
      }
    }
    throw new Error("no identity matches any age recipient in this file");
  }

  static #chunkNonce(counter: bigint, last: boolean) {
    const nonce = new Uint8Array(12);
    let value = counter;
    for (let idx = 10; idx >= 0; idx--) {
      nonce[idx] = Number(value & 0xffn);
      value >>= 8n;
    }
    nonce[11] = last ? 1 : 0;
    return nonce;
  }

  static #hkdf(ikm: Uint8Array, salt: Uint8Array, info: string) {
    return new Uint8Array(hkdfSync("sha256", ikm, salt, info, 32));
  }

  static #b64(bytes: Uint8Array) {
    return Buffer.from(bytes).toString("base64").replace(/=+$/, "");
  }

  static #wrap(value: string) {
    const lines: string[] = [];
    for (let idx = 0; idx < value.length; idx += 64) lines.push(value.slice(idx, idx + 64));
    //* age ends a stanza body at the first line shorter than 64 columns, so an exact multiple needs an empty one.
    if (value.length % 64 === 0) lines.push("");
    return lines;
  }

  static #bech32Polymod(values: number[]) {
    const generators = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
    let chk = 1;
    for (const value of values) {
      const top = chk >>> 25;
      chk = ((chk & 0x1ffffff) << 5) ^ value;
      for (let idx = 0; idx < 5; idx++) if ((top >>> idx) & 1) chk ^= generators[idx] ?? 0;
    }
    return chk;
  }

  static #hrpExpand(hrp: string) {
    const codes = [...hrp].map((char) => char.charCodeAt(0));
    return [...codes.map((code) => code >>> 5), 0, ...codes.map((code) => code & 31)];
  }

  static #convertBits(data: Iterable<number>, from: number, to: number, pad: boolean) {
    let acc = 0;
    let bits = 0;
    const out: number[] = [];
    const max = (1 << to) - 1;
    for (const value of data) {
      acc = (acc << from) | value;
      bits += from;
      while (bits >= to) {
        bits -= to;
        out.push((acc >>> bits) & max);
      }
    }
    if (pad && bits > 0) out.push((acc << (to - bits)) & max);
    else if (!pad && (bits >= from || (acc << (to - bits)) & max)) throw new Error("invalid bech32 padding");
    return out;
  }

  static #bech32Encode(hrp: string, bytes: Uint8Array) {
    const data = AgeEncryption.#convertBits(bytes, 8, 5, true);
    const polymod = AgeEncryption.#bech32Polymod([...AgeEncryption.#hrpExpand(hrp), ...data, 0, 0, 0, 0, 0, 0]) ^ 1;
    const checksum = Array.from({ length: 6 }, (_, idx) => (polymod >>> (5 * (5 - idx))) & 31);
    return `${hrp}1${[...data, ...checksum].map((value) => AgeEncryption.#bech32Charset[value]).join("")}`;
  }

  static #bech32Decode(value: string, expectedHrp: string) {
    const lower = value.toLowerCase();
    const separator = lower.lastIndexOf("1");
    const hrp = lower.slice(0, separator);
    if (separator < 1 || hrp !== expectedHrp) throw new Error(`expected an ${expectedHrp}1… key`);
    const data = [...lower.slice(separator + 1)].map((char) => AgeEncryption.#bech32Charset.indexOf(char));
    if (data.length < 6 || data.some((code) => code < 0)) throw new Error("invalid bech32 characters");
    if (AgeEncryption.#bech32Polymod([...AgeEncryption.#hrpExpand(hrp), ...data]) !== 1)
      throw new Error("invalid bech32 checksum");
    const bytes = Buffer.from(AgeEncryption.#convertBits(data.slice(0, -6), 5, 8, false));
    if (bytes.length !== 32) throw new Error("age keys are 32 bytes");
    return bytes;
  }
}
