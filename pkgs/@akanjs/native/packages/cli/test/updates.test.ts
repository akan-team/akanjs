import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertSigningKey, nextSequence } from "../src/lib/publish.ts";
import {
  assertChannel,
  generateUpdateKey,
  signManifest,
  updateKeyPath,
  updatesResource,
  validateUpdates,
  verifyManifest,
} from "../src/lib/updates.ts";

describe("updates config (UP-1, UP-2)", () => {
  test("validates and fills defaults", () => {
    const problems: string[] = [];
    const key = Buffer.alloc(32, 7).toString("base64");
    expect(validateUpdates({ url: "https://example.com/u/", publicKey: key }, problems)).toEqual({
      url: "https://example.com/u",
      publicKey: key,
      channel: "production",
      readyTimeout: 10_000,
    });
    expect(problems).toEqual([]);
    expect(validateUpdates(undefined, problems)).toBeNull();
    validateUpdates({ url: "ftp://x", publicKey: "short", channel: "Bad Name", readyTimeout: 5, extra: 1 }, problems);
    expect(problems).toEqual([
      "updates.url must be an http(s) URL",
      "updates.publicKey must be a base64 Ed25519 public key (akan-native update keygen)",
      'updates.channel must be a short name like "production"',
      "updates.readyTimeout must be a number of milliseconds >= 1000",
      "updates.extra is not supported",
    ]);
  });

  test("the key stays private, signs, and verifies like the apps do", () => {
    const path = join(mkdtempSync(join(tmpdir(), "akan-native-keys-")), "app.update.key");
    const { publicKey, created } = generateUpdateKey(path);
    expect(created).toBe(true);
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(Buffer.from(publicKey, "base64").length).toBe(32);
    // Never overwritten: the installed apps trust this key.
    expect(generateUpdateKey(path)).toEqual({ publicKey, created: false });
    const manifest = new TextEncoder().encode('{"sequence":2}');
    const signature = signManifest(manifest, path, publicKey);
    expect(verifyManifest(manifest, signature, publicKey)).toBe(true);
    expect(verifyManifest(new TextEncoder().encode('{"sequence":3}'), signature, publicKey)).toBe(false);
    expect(() => signManifest(manifest, path, Buffer.alloc(32).toString("base64"))).toThrow(
      "does not match updates.publicKey",
    );
  });

  test("key location and the updates.json of a build", () => {
    expect(updateKeyPath("dev.x", { AKAN_NATIVE_HOME: "/h/.akan/native" })).toBe(
      "/h/.akan/native/keys/dev.x.update.key",
    );
    expect(updateKeyPath("dev.x", { AKAN_NATIVE_UPDATE_KEY: "/k/key.pem" })).toBe("/k/key.pem");
    const resource = JSON.parse(
      updatesResource(
        { url: "https://u", publicKey: "k", channel: "beta", readyTimeout: 3000 },
        { id: "dev.x", version: "1.2.0" },
        "ios",
        "abc",
        false,
      ),
    );
    expect(resource).toMatchObject({
      app: "dev.x",
      version: "1.2.0",
      platform: "ios",
      nativeApi: "abc",
      dev: false,
      url: "https://u",
      publicKey: "k",
      channel: "beta",
      readyTimeout: 3000,
    });
    expect(Math.abs(resource.embeddedSequence - Date.now() / 1000)).toBeLessThan(5);
  });
});

describe("publishing a release", () => {
  test("takes only a channel an app could be configured for", () => {
    for (const channel of ["production", "pilot", "main", "beta-2", "v1.2"])
      expect(() => assertChannel(channel)).not.toThrow();
    for (const channel of ["../x", "Pilot", "", "a/b", "a\\b", ".hidden", "x".repeat(42)])
      expect(() => assertChannel(channel)).toThrow("is not a short lowercase name");
    for (const channel of ["bundle", "manifest.template", "compat"]) {
      expect(() => assertChannel(channel)).toThrow("would overwrite");
      const problems: string[] = [];
      validateUpdates({ url: "https://x", publicKey: Buffer.alloc(32).toString("base64"), channel }, problems);
      expect(problems).toEqual(['updates.channel must be a short name like "production"']);
    }
  });

  test("refuses to start a publish that could not be signed", () => {
    const home = mkdtempSync(join(tmpdir(), "akan-native-keys-"));
    const path = join(home, "app.update.key");
    const previous = process.env.AKAN_NATIVE_UPDATE_KEY;
    process.env.AKAN_NATIVE_UPDATE_KEY = path;
    try {
      const app = { id: "dev.x" };
      expect(() => assertSigningKey({ app })).toThrow("has no updates");
      expect(() => assertSigningKey({ app, updates: { publicKey: Buffer.alloc(32).toString("base64") } })).toThrow(
        `no update signing key at ${path}`,
      );
      const { publicKey } = generateUpdateKey(path);
      expect(() => assertSigningKey({ app, updates: { publicKey } })).not.toThrow();
      expect(() => assertSigningKey({ app, updates: { publicKey: Buffer.alloc(32).toString("base64") } })).toThrow(
        "does not match updates.publicKey",
      );
    } finally {
      if (previous === undefined) delete process.env.AKAN_NATIVE_UPDATE_KEY;
      else process.env.AKAN_NATIVE_UPDATE_KEY = previous;
      rmSync(home, { recursive: true, force: true });
    }
  });

  test("numbers a release past the one already published here, whatever this computer's clock says", () => {
    const dir = mkdtempSync(join(tmpdir(), "akan-native-sequence-"));
    expect(nextSequence(dir, "production", 1000)).toBe(1000);
    writeFileSync(join(dir, "production.json"), JSON.stringify({ sequence: 900 }));
    expect(nextSequence(dir, "production", 1000)).toBe(1000);
    writeFileSync(join(dir, "production.json"), JSON.stringify({ sequence: 1200 }));
    expect(nextSequence(dir, "production", 1000)).toBe(1201);
    expect(nextSequence(dir, "production", 1200)).toBe(1201);
    expect(nextSequence(dir, "pilot", 1000)).toBe(1000);
  });
});

describe("release builds", () => {
  test("take an https updates.url, or http to this machine", async () => {
    const { secureUpdateUrl } = await import("../src/lib/prepare.ts");
    for (const url of [
      "https://updates.example.com",
      "http://127.0.0.1:8790",
      "http://localhost:8790",
      "http://[::1]:1",
    ])
      expect(secureUpdateUrl(url)).toBe(true);
    for (const url of ["http://updates.example.com", "http://10.0.2.2:8790", "ftp://x", "nonsense"])
      expect(secureUpdateUrl(url)).toBe(false);
  });
});
