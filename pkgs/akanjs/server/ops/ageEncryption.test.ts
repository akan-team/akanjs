import { afterAll, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable, type Transform } from "node:stream";
import { buffer } from "node:stream/consumers";
import { AgeEncryption } from "./ageEncryption";

//* Interop against the reference implementation runs only where AKAN_TEST_AGE_BIN points at an `age` binary.
const ageBin = process.env.AKAN_TEST_AGE_BIN;
const root = mkdtempSync(path.join(tmpdir(), "akan-age-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const run = async (transform: Transform, input: Buffer, pieceSize = 7_777) => {
  const pieces: Buffer[] = [];
  for (let idx = 0; idx < input.length; idx += pieceSize) pieces.push(input.subarray(idx, idx + pieceSize));
  return await buffer(Readable.from(pieces).pipe(transform));
};

describe("AgeEncryption", () => {
  test("round-trips payloads around the 64KiB chunk boundary", async () => {
    const { identity, recipient } = AgeEncryption.generateIdentity();
    const encryptor = await AgeEncryption.encryptor([recipient]);
    const decryptor = await AgeEncryption.decryptor([identity]);
    for (const size of [0, 1, 65_535, 65_536, 65_537, 3 * 65_536, 200_000]) {
      const plain = randomBytes(size);
      const sealed = await run(encryptor.transform(), plain);
      expect(sealed.subarray(0, 22).toString()).toBe("age-encryption.org/v1\n");
      expect(Buffer.compare(await run(decryptor.transform(), sealed), plain)).toBe(0);
    }
  });

  test("any listed recipient can open it, and a stranger cannot", async () => {
    const first = AgeEncryption.generateIdentity();
    const second = AgeEncryption.generateIdentity();
    const sealed = await run(
      (await AgeEncryption.encryptor([first.recipient, second.recipient])).transform(),
      randomBytes(1000),
    );
    await run((await AgeEncryption.decryptor([second.identity])).transform(), sealed);
    const stranger = await AgeEncryption.decryptor([AgeEncryption.generateIdentity().identity]);
    await expect(run(stranger.transform(), sealed)).rejects.toThrow("no identity matches");
  });

  test("a flipped payload byte fails authentication", async () => {
    const { identity, recipient } = AgeEncryption.generateIdentity();
    const sealed = await run((await AgeEncryption.encryptor([recipient])).transform(), randomBytes(5000));
    sealed[sealed.length - 20] = (sealed[sealed.length - 20] ?? 0) ^ 1;
    await expect(run((await AgeEncryption.decryptor([identity])).transform(), sealed)).rejects.toThrow();
  });

  test("rejects a recipient with a bad checksum", () => {
    const { recipient } = AgeEncryption.generateIdentity();
    const broken = `${recipient.slice(0, -1)}${recipient.endsWith("q") ? "p" : "q"}`;
    expect(() => AgeEncryption.parseRecipient(broken)).toThrow("checksum");
  });

  test.skipIf(!ageBin)("interoperates with the age CLI both ways", async () => {
    const bin = ageBin ?? "";
    const keygen = path.join(path.dirname(bin), "age-keygen");
    const keyFile = path.join(root, "key.txt");
    Bun.spawnSync([keygen, "-o", keyFile]);
    const [identity = ""] = AgeEncryption.identitiesIn(readFileSync(keyFile, "utf8"));
    const recipient = Bun.spawnSync([keygen, "-y", keyFile]).stdout.toString().trim();
    const plain = randomBytes(150_000);

    const ours = path.join(root, "ours.age");
    writeFileSync(ours, await run((await AgeEncryption.encryptor([recipient])).transform(), plain));
    const decrypted = Bun.spawnSync([bin, "-d", "-i", keyFile, ours]);
    expect(decrypted.exitCode).toBe(0);
    expect(Buffer.compare(Buffer.from(decrypted.stdout), plain)).toBe(0);

    const plainFile = path.join(root, "plain.bin");
    writeFileSync(plainFile, plain);
    const theirs = Bun.spawnSync([bin, "-r", recipient, plainFile]).stdout;
    const opened = await run((await AgeEncryption.decryptor([identity])).transform(), Buffer.from(theirs));
    expect(Buffer.compare(opened, plain)).toBe(0);
  });
});
