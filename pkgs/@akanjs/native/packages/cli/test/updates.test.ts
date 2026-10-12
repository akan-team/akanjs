import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertSigningKey, nextSequence } from "../src/lib/publish.ts";
import {
  assertChannel,
  generateUpdateKey,
  keyIdOf,
  openEnvelope,
  sealManifest,
  signManifest,
  updateKeyPath,
  updatesResource,
  validateUpdates,
  verifyManifest,
  writePhoneUpdates,
} from "../src/lib/updates.ts";

describe("updates config (UP-1, UP-2)", () => {
  test("validates and fills defaults", () => {
    const problems: string[] = [];
    const key = Buffer.alloc(32, 7).toString("base64");
    expect(validateUpdates({ url: "https://example.com/u/", publicKey: key }, problems)).toEqual({
      url: "https://example.com/u",
      publicKeys: [key],
      channel: "production",
      readyTimeout: 10_000,
      reportUrl: null,
    });
    expect(problems).toEqual([]);
    expect(
      validateUpdates(
        { url: "https://example.com/u", publicKey: key, report: { url: "https://r.example/p/abc/" } },
        problems,
      )?.reportUrl,
    ).toBe("https://r.example/p/abc");
    expect(validateUpdates(undefined, problems)).toBeNull();
    validateUpdates(
      { url: "ftp://x", publicKey: "short", channel: "Bad Name", readyTimeout: 5, report: "https://r", extra: 1 },
      problems,
    );
    expect(problems).toEqual([
      "updates.url must be an http(s) URL without a query or fragment",
      "updates.publicKeys must be 1 to 3 base64 Ed25519 public keys (akan-native update keygen), or publicKey one",
      'updates.channel must be a short name like "production"',
      "updates.readyTimeout must be a number of milliseconds >= 1000",
      "updates.report must be { url } with an http(s) URL",
      "updates.extra is not supported",
    ]);
  });

  test("a ring of up to three keys, and a URL the shells can append a path to", () => {
    const keys = [7, 8, 9, 10].map((byte) => Buffer.alloc(32, byte).toString("base64"));
    const check = (raw: Record<string, unknown>) => {
      const problems: string[] = [];
      return { config: validateUpdates({ url: "https://cdn.example.com/ota/inst1/", ...raw }, problems), problems };
    };
    expect(check({ publicKeys: keys.slice(0, 3) }).config).toMatchObject({
      url: "https://cdn.example.com/ota/inst1",
      publicKeys: keys.slice(0, 3),
    });
    expect(check({ publicKeys: keys }).problems[0]).toContain("1 to 3");
    expect(check({ publicKeys: [] }).problems[0]).toContain("1 to 3");
    expect(check({ publicKeys: [keys[0], keys[0]] }).problems).toEqual(["updates.publicKeys lists a key twice"]);
    expect(check({ publicKey: keys[0], publicKeys: [keys[0]] }).problems).toEqual([
      "updates takes publicKey or publicKeys, not both",
    ]);
    for (const url of ["https://cdn.example.com/ota?v=1", "https://cdn.example.com/ota#x"]) {
      const problems: string[] = [];
      validateUpdates({ url, publicKey: keys[0] }, problems);
      expect(problems).toEqual(["updates.url must be an http(s) URL without a query or fragment"]);
    }
    expect(keyIdOf(Buffer.alloc(32, 7).toString("base64"))).toBe("4bb06f8e4e3a7715");
  });

  test("a phone's envelope carries the manifest, its signer and the signature in one object", () => {
    const home = mkdtempSync(join(tmpdir(), "akan-native-keys-"));
    const online = generateUpdateKey(join(home, "online.key")).publicKey;
    const spare = generateUpdateKey(join(home, "spare.key")).publicKey;
    const ring = [online, spare];
    const bytes = new TextEncoder().encode('{"schema":2,"sequence":2}\n');
    const envelope = sealManifest(bytes, join(home, "spare.key"), ring);
    expect(envelope.keyId).toBe(keyIdOf(spare));
    expect(Buffer.from(envelope.manifest, "base64").toString()).toBe('{"schema":2,"sequence":2}\n');
    const text = JSON.stringify(envelope);
    expect(openEnvelope(text, ring)).toEqual({ manifest: new Uint8Array(bytes), keyId: keyIdOf(spare) });
    expect(() => openEnvelope(text, [online])).toThrow("not trusted");
    expect(() => openEnvelope(text, ring, [keyIdOf(spare)])).toThrow("not trusted");
    const tampered = { ...envelope, manifest: Buffer.from('{"schema":2,"sequence":9}\n').toString("base64") };
    expect(() => openEnvelope(JSON.stringify(tampered), ring)).toThrow("does not verify");
    expect(() => signManifest(bytes, join(home, "spare.key"), ring)).toThrow("trusts the first");
    rmSync(home, { recursive: true, force: true });
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
    const signature = signManifest(manifest, path, [publicKey]);
    expect(verifyManifest(manifest, signature, publicKey)).toBe(true);
    expect(verifyManifest(new TextEncoder().encode('{"sequence":3}'), signature, publicKey)).toBe(false);
    expect(() => signManifest(manifest, path, [Buffer.alloc(32).toString("base64")])).toThrow(
      "is not one of updates.publicKeys",
    );
  });

  test("key location and the updates.json of a build", () => {
    expect(updateKeyPath("dev.x", { AKAN_NATIVE_HOME: "/h/.akan/native" })).toBe(
      "/h/.akan/native/keys/dev.x.update.key",
    );
    expect(updateKeyPath("dev.x", { AKAN_NATIVE_UPDATE_KEY: "/k/key.pem" })).toBe("/k/key.pem");
    const resource = JSON.parse(
      updatesResource(
        { url: "https://u", publicKeys: ["k", "s"], channel: "beta", readyTimeout: 3000, reportUrl: "https://r/p" },
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
      protocol: 2,
      publicKeys: ["k", "s"],
      publicKey: "k",
      channel: "beta",
      readyTimeout: 3000,
      reportUrl: "https://r/p",
    });
    expect(Math.abs(resource.embeddedSequence - Date.now() / 1000)).toBeLessThan(5);
  });

  test("a phone build's bundle.json names the report address a registering server checks", () => {
    const out = mkdtempSync(join(tmpdir(), "akan-phone-updates-"));
    try {
      writeFileSync(join(out, "bundle.json"), JSON.stringify({ app: { id: "dev.x" } }));
      const key = Buffer.alloc(32, 7).toString("base64");
      const updates = { url: "https://u", publicKeys: [key], channel: "main", readyTimeout: 20_000 };
      writePhoneUpdates(
        join(out, "updates.json"),
        out,
        { ...updates, reportUrl: "https://r/p" },
        { id: "dev.x", version: "1" },
        "android",
        "abc",
        false,
      );
      expect(JSON.parse(readFileSync(join(out, "bundle.json"), "utf8")).updates).toMatchObject({
        reportUrl: "https://r/p",
      });
      expect(JSON.parse(readFileSync(join(out, "updates.json"), "utf8")).reportUrl).toBe("https://r/p");

      writePhoneUpdates(
        join(out, "updates.json"),
        out,
        { ...updates, reportUrl: null },
        { id: "dev.x", version: "1" },
        "android",
        "abc",
        false,
      );
      expect(JSON.parse(readFileSync(join(out, "bundle.json"), "utf8")).updates.reportUrl).toBeUndefined();
      expect(JSON.parse(readFileSync(join(out, "updates.json"), "utf8")).reportUrl).toBeUndefined();
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });
});

describe("publishing a release", () => {
  test("takes only a channel an app could be configured for", () => {
    for (const channel of ["production", "pilot", "main", "beta-2", "v1.2"])
      expect(() => assertChannel(channel)).not.toThrow();
    for (const channel of ["../x", "Pilot", "", "a/b", "a\\b", ".hidden", "x".repeat(42)])
      expect(() => assertChannel(channel)).toThrow("is not a short lowercase name");
    for (const channel of ["bundle", "manifest.template", "compat", "pack", "files", "app"]) {
      expect(() => assertChannel(channel)).toThrow("already uses");
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
      const other = Buffer.alloc(32).toString("base64");
      expect(() => assertSigningKey({ app, updates: { publicKeys: [other] } })).toThrow(
        `no update signing key at ${path}`,
      );
      const { publicKey } = generateUpdateKey(path);
      expect(() => assertSigningKey({ app, updates: { publicKeys: [publicKey] } })).not.toThrow();
      expect(() => assertSigningKey({ app, updates: { publicKeys: [other, publicKey] } }, "android")).not.toThrow();
      expect(() => assertSigningKey({ app, updates: { publicKeys: [other, publicKey] } }, "macos")).toThrow(
        "trusts the first",
      );
      expect(() => assertSigningKey({ app, updates: { publicKeys: [other] } })).toThrow(
        "is not one of updates.publicKeys",
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
    //? A phone's channel is a folder of envelopes, one per native API, sharing one count.
    const envelope = (sequence: number) =>
      JSON.stringify({
        manifest: Buffer.from(JSON.stringify({ sequence })).toString("base64"),
        keyId: "x",
        signature: "x",
      });
    mkdirSync(join(dir, "main"));
    writeFileSync(join(dir, "main", "aaaa.json"), envelope(1500));
    writeFileSync(join(dir, "main", "bbbb.json"), envelope(1300));
    expect(nextSequence(dir, "main", 1000)).toBe(1501);
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
