// macOS builds without a Team ID read the data key through /usr/bin/security: run as Linux, where the shell's
// keychain.* ops hold it.

import { afterAll, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AkanNativeError } from "../../core/src/index.ts";
import { createSecretStore, encrypt } from "../src/secretStore.ts";

const root = mkdtempSync(join(tmpdir(), "akan-native-secrets-"));
const platform = Object.getOwnPropertyDescriptor(process, "platform");
Object.defineProperty(process, "platform", { value: "linux" });
afterAll(() => {
  if (platform) Object.defineProperty(process, "platform", platform);
  rmSync(root, { recursive: true, force: true });
});

describe("secret store", () => {
  test("a key read that fails is shared by the gets waiting on it, then dropped: the next get asks the shell again", async () => {
    const key = randomBytes(32);
    const file = join(root, "secure-storage.json");
    writeFileSync(file, JSON.stringify({ v: 1, entries: { apiKey: encrypt(key, "apiKey", "sk-123") } }));
    const ops: string[] = [];
    const shell = async (op: string) => {
      ops.push(op);
      if (ops.length === 1) throw new AkanNativeError("TIMEOUT", `${op} had no answer within 360 s`);
      return { value: key.toString("hex") };
    };
    const store = createSecretStore({ service: "dev.test.server-secrets", file, label: "Test", shell });
    const codes = await Promise.all(
      [store.get("apiKey"), store.get("apiKey")].map((get) => get.then(null, (error: { code?: string }) => error.code)),
    );
    expect(codes).toEqual(["TIMEOUT", "TIMEOUT"]);
    expect(await store.get("apiKey")).toBe("sk-123");
    expect(ops).toEqual(["keychain.get", "keychain.get"]);
  });
});
