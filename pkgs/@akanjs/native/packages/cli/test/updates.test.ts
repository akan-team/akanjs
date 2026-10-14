import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { updateDecision } from "../../core/src/kernel.ts";
import type { AkanNativeConfig } from "../src/config.ts";
import { readBundleInfo } from "../src/lib/compat.ts";
import { type LogEvent, withLogSink } from "../src/lib/log.ts";
import type { BuildContext } from "../src/lib/prepare.ts";
import { projectFromConfig } from "../src/lib/project.ts";
import { assertSigningKey, nextSequence, publishRelease, releaseRevocations } from "../src/lib/publish.ts";
import {
  assertChannel,
  generateUpdateKey,
  keyIdOf,
  openEnvelope,
  sealManifest,
  signManifest,
  type UpdateEnvelope,
  updateKeyPath,
  updatesResource,
  validateUpdates,
  verifyManifest,
  writePhoneUpdates,
} from "../src/lib/updates.ts";

/** A phone's release build as publishRelease reads it: the config, bundle.json and the web files. */
const phoneBuild = (root: string, publicKeys: string[], revokedKeys: string[] = []) => {
  const outDir = join(root, "build");
  const webDir = join(root, "web");
  mkdirSync(outDir, { recursive: true });
  mkdirSync(webDir, { recursive: true });
  writeFileSync(join(webDir, "index.html"), "<!doctype html>");
  writeFileSync(
    join(outDir, "bundle.json"),
    JSON.stringify({
      schema: 1,
      nativeApi: { hash: "0123456789abcdef", inputs: {} },
      web: { hash: "fedcba98", files: 1 },
    }),
  );
  const updates = {
    url: "https://updates.example.com",
    publicKeys,
    revokedKeys,
    channel: "main",
    readyTimeout: 10_000,
  };
  return {
    project: { config: { app: { id: "dev.test.revoke", version: "1.0.0" }, updates: { ...updates, reportUrl: null } } },
    outDir,
    webDir,
    html: "<!doctype html>",
    env: {},
  } as unknown as BuildContext;
};

describe("updates config (UP-1, UP-2)", () => {
  test("validates and fills defaults", () => {
    const problems: string[] = [];
    const key = Buffer.alloc(32, 7).toString("base64");
    expect(validateUpdates({ url: "https://example.com/u/", publicKey: key }, problems)).toEqual({
      url: "https://example.com/u",
      publicKeys: [key],
      revokedKeys: [],
      channel: "production",
      readyTimeout: 10_000,
      reportUrl: null,
    });
    expect(problems).toEqual([]);
    //? Posted to as it is: a receiver whose route ends in "/" may not redirect a POST.
    expect(
      validateUpdates(
        { url: "https://example.com/u", publicKey: key, report: { url: "https://r.example/p/abc/" } },
        problems,
      )?.reportUrl,
    ).toBe("https://r.example/p/abc/");
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
    //? Node decodes these to the same 32 bytes; iOS decodes neither and would run with no updates at all.
    for (const loose of [keys[0]?.replace(/=$/, ""), `${keys[0]?.slice(0, 20)}\n${keys[0]?.slice(20)}`])
      expect(check({ publicKeys: [loose] }).problems[0]).toContain("1 to 3");
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

  test("updates.revokedKeys lists keyIds, each once, no more than a manifest may revoke", () => {
    const check = (revokedKeys: unknown) => {
      const problems: string[] = [];
      const key = Buffer.alloc(32, 7).toString("base64");
      return { config: validateUpdates({ url: "https://u", publicKey: key, revokedKeys }, problems), problems };
    };
    expect(check(["4bb06f8e4e3a7715"]).config?.revokedKeys).toEqual(["4bb06f8e4e3a7715"]);
    for (const loose of ["4bb06f8e4e3a7715", ["4BB06F8E4E3A7715"], ["4bb06f8e"], [7]])
      expect(check(loose).problems).toEqual([
        "updates.revokedKeys must list keyIds: 16 lowercase hex characters, as `update keygen` prints them",
      ]);
    expect(check(["4bb06f8e4e3a7715", "4bb06f8e4e3a7715"]).problems).toEqual(["updates.revokedKeys lists a key twice"]);
    const many = Array.from({ length: 17 }, (_, i) => i.toString(16).padStart(16, "0"));
    expect(check(many).problems).toEqual(["updates.revokedKeys lists more than the 16 keys a manifest may revoke"]);
    expect(check(many.slice(0, 16)).problems).toEqual([]);
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

  test("an envelope opens only as the shells read it: an object, strict base64, a manifest of at most 1 MiB", () => {
    const home = mkdtempSync(join(tmpdir(), "akan-native-keys-"));
    try {
      const keyPath = join(home, "online.key");
      const ring = [generateUpdateKey(keyPath).publicKey];
      for (const text of ["null", "[]", "7", '"x"'])
        expect(() => openEnvelope(text, ring)).toThrow("needs manifest, keyId and signature");
      const envelope = sealManifest(new TextEncoder().encode('{"schema":2,"sequence":2}\n'), keyPath, ring);
      const reshaped = (change: Partial<UpdateEnvelope>) => JSON.stringify({ ...envelope, ...change });
      for (const manifest of [
        `${envelope.manifest.slice(0, 8)}\n${envelope.manifest.slice(8)}`,
        ` ${envelope.manifest}`,
        envelope.manifest.replace(/=+$/, ""),
        `ab-_${envelope.manifest.slice(4)}`,
        `${envelope.manifest}=`,
      ])
        expect(() => openEnvelope(reshaped({ manifest }), ring)).toThrow("not padded standard base64");
      expect(() => openEnvelope(reshaped({ signature: `${envelope.signature}\n` }), ring)).toThrow(
        "not padded standard base64",
      );
      const big = new TextEncoder().encode(`{"schema":2,"pad":"${"x".repeat(1 << 20)}"}`);
      expect(() => openEnvelope(JSON.stringify(sealManifest(big, keyPath, ring)), ring)).toThrow("larger than 1 MiB");
      const fits = new TextEncoder().encode(`{"pad":"${"x".repeat((1 << 20) - 10)}"}`);
      expect(openEnvelope(JSON.stringify(sealManifest(fits, keyPath, ring)), ring).manifest.length).toBe(1 << 20);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  test("an envelope opens as the shared vectors say the shells open it", async () => {
    const { envelopeKeys, envelopes } = (await Bun.file(
      new URL("../../core/vectors/updates.json", import.meta.url),
    ).json()) as {
      envelopeKeys: string[];
      envelopes: [string | [string, number, string], string, string, string[], string, string][];
    };
    const refusals: Record<string, string> = {
      untrusted: "which is not trusted",
      revoked: "which is not trusted",
      encoding: "not padded standard base64",
      "too-large": "larger than 1 MiB",
      signature: "does not verify",
    };
    for (const [field, keyId, signature, revoked, verdict] of envelopes) {
      const manifest = typeof field === "string" ? field : field[0].repeat(field[1]) + field[2];
      const text = JSON.stringify({ manifest, keyId, signature });
      if (verdict === "open") expect(openEnvelope(text, envelopeKeys, revoked).keyId).toBe(keyId);
      else expect(() => openEnvelope(text, envelopeKeys, revoked)).toThrow(refusals[verdict]);
    }
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

  test("updates.revokedKeys may not revoke every key of updates.publicKeys", () => {
    const key = Buffer.alloc(32, 7).toString("base64");
    const problems: string[] = [];
    validateUpdates({ url: "https://u", publicKey: key, revokedKeys: [keyIdOf(key)] }, problems);
    expect(problems).toEqual([
      "updates.revokedKeys revokes every key of updates.publicKeys: a phone built from it would trust none (add one with `akan-native update keygen`)",
    ]);
  });

  test("a phone build trusts no key updates.revokedKeys revokes, so a fresh install never takes one; a desktop build reads the first", () => {
    const online = Buffer.alloc(32, 1).toString("base64");
    const spare = Buffer.alloc(32, 2).toString("base64");
    const updates = {
      url: "https://u",
      publicKeys: [online, spare],
      revokedKeys: [keyIdOf(online)],
      channel: "main",
      readyTimeout: 3000,
      reportUrl: null,
    };
    const resource = (platform: "android" | "ios" | "macos") =>
      JSON.parse(updatesResource(updates, { id: "dev.x", version: "1" }, platform, "abc", false));
    expect(resource("android").publicKeys).toEqual([spare]);
    expect(resource("ios").publicKeys).toEqual([spare]);
    expect(resource("macos")).toMatchObject({ publicKeys: [online, spare], publicKey: online });
    const out = mkdtempSync(join(tmpdir(), "akan-phone-ring-"));
    try {
      writeFileSync(
        join(out, "bundle.json"),
        JSON.stringify({
          schema: 1,
          app: { id: "dev.x", version: "1", build: 1 },
          nativeApi: { hash: "abc", inputs: {} },
          web: { hash: "w", files: 1 },
        }),
      );
      writePhoneUpdates({
        updatesJson: join(out, "updates.json"),
        outDir: out,
        updates,
        app: { id: "dev.x", version: "1" },
        platform: "ios",
        nativeApi: "abc",
        dev: false,
      });
      expect(readBundleInfo(join(out, "bundle.json")).updates?.keyIds).toEqual([keyIdOf(spare)]);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
    const ring = [keyIdOf(spare)];
    const release = { ring, revoked: [], resetSequence: false, sequence: 10, embedded: 1, running: null };
    expect(updateDecision({ ...release, signer: keyIdOf(online), revokeKeys: [] }).kind).toBe("untrusted");
    expect(updateDecision({ ...release, signer: keyIdOf(spare), revokeKeys: [keyIdOf(online)] }).kind).toBe("take");
  });

  test("key location and the updates.json of a build", () => {
    expect(updateKeyPath("dev.x", { AKAN_NATIVE_HOME: "/h/.akan/native" })).toBe(
      "/h/.akan/native/keys/dev.x.update.key",
    );
    expect(updateKeyPath("dev.x", { AKAN_NATIVE_UPDATE_KEY: "/k/key.pem" })).toBe("/k/key.pem");
    const resource = JSON.parse(
      updatesResource(
        {
          url: "https://u",
          publicKeys: ["k", "s"],
          revokedKeys: [],
          channel: "beta",
          readyTimeout: 3000,
          reportUrl: "https://r/p",
        },
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
      const bundle = {
        schema: 1,
        app: { id: "dev.x", version: "1", build: 1 },
        nativeApi: { hash: "abc", inputs: {} },
        web: { hash: "w", files: 1 },
      };
      writeFileSync(join(out, "bundle.json"), JSON.stringify(bundle));
      const key = Buffer.alloc(32, 7).toString("base64");
      const updates = { url: "https://u", publicKeys: [key], revokedKeys: [], channel: "main", readyTimeout: 20_000 };
      const write = (reportUrl: string | null) =>
        writePhoneUpdates({
          updatesJson: join(out, "updates.json"),
          outDir: out,
          updates: { ...updates, reportUrl },
          app: { id: "dev.x", version: "1" },
          platform: "android",
          nativeApi: "abc",
          dev: false,
        });
      write("https://r/p");
      const written = readBundleInfo(join(out, "bundle.json"));
      expect(written).toMatchObject({
        ...bundle,
        updates: { protocol: 2, keyIds: [keyIdOf(key)], reportUrl: "https://r/p" },
      });
      expect(JSON.parse(readFileSync(join(out, "updates.json"), "utf8")).reportUrl).toBe("https://r/p");

      write(null);
      expect(readBundleInfo(join(out, "bundle.json")).updates?.reportUrl).toBeUndefined();
      expect(JSON.parse(readFileSync(join(out, "updates.json"), "utf8")).reportUrl).toBeUndefined();

      writeFileSync(join(out, "bundle.json"), JSON.stringify({ app: { id: "dev.x" } }));
      expect(() => write(null)).toThrow("is not an akan-native bundle.json");
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

  type KeyName = "online" | "spare" | "last" | "stranger";
  interface Keyring {
    home: string;
    key: Record<KeyName, string>;
    id: Record<KeyName, string>;
    /** online, spare and last, in that order. */
    ring: string[];
    out: string;
    signWith: (name: KeyName) => void;
  }
  const keyring = async (run: (keys: Keyring) => Promise<void>) => {
    const home = mkdtempSync(join(tmpdir(), "akan-native-revoke-"));
    const previous = process.env.AKAN_NATIVE_UPDATE_KEY;
    const make = (name: KeyName) => generateUpdateKey(join(home, `${name}.key`)).publicKey;
    try {
      const key = { online: make("online"), spare: make("spare"), last: make("last"), stranger: make("stranger") };
      await run({
        home,
        key,
        id: {
          online: keyIdOf(key.online),
          spare: keyIdOf(key.spare),
          last: keyIdOf(key.last),
          stranger: keyIdOf(key.stranger),
        },
        ring: [key.online, key.spare, key.last],
        out: join(home, "out"),
        signWith: (name) => {
          process.env.AKAN_NATIVE_UPDATE_KEY = join(home, `${name}.key`);
        },
      });
    } finally {
      if (previous === undefined) delete process.env.AKAN_NATIVE_UPDATE_KEY;
      else process.env.AKAN_NATIVE_UPDATE_KEY = previous;
      rmSync(home, { recursive: true, force: true });
    }
  };
  /** An envelope an external signer put in the publish folder. */
  const writeEnvelope = (
    { home, out, ring }: Keyring,
    channel: string,
    nativeApi: string,
    signer: string,
    manifest: object,
    keys = ring,
  ) => {
    mkdirSync(join(out, "android", channel), { recursive: true });
    const bytes = new TextEncoder().encode(JSON.stringify({ schema: 2, kind: "web", channel, ...manifest }));
    const envelope = sealManifest(bytes, join(home, `${signer}.key`), keys);
    writeFileSync(join(out, "android", channel, `${nativeApi}.json`), JSON.stringify(envelope));
  };
  const warningsOf = async (run: () => Promise<unknown>) => {
    const events: LogEvent[] = [];
    await withLogSink((event) => events.push(event), run);
    return events.filter((event) => event.level === "warn").map((event) => event.message);
  };

  test("carries on what the channel's releases revoke, and never signs with a key they revoke", async () => {
    await keyring(async (keys) => {
      const { id, key, ring, out, signWith } = keys;
      const ctx = phoneBuild(keys.home, ring);
      const { config } = ctx.project;
      //? An external signer recovered with the spare: its manifest for this binary's native API revokes the leaked key.
      writeEnvelope(keys, "main", "0123456789abcdef", "spare", { sequence: 500, revokeKeys: [id.online] });
      //? Neither a key the binaries do not trust nor one listed before the spare makes a publish revoke the spare.
      writeEnvelope(keys, "main", "1111111111111111", "stranger", { sequence: 450, revokeKeys: [id.spare] }, [
        key.stranger,
      ]);
      writeEnvelope(keys, "main", "2222222222222222", "online", { sequence: 400, revokeKeys: [id.spare] });

      signWith("spare");
      expect(releaseRevocations(config, "android", out, "main")).toEqual({
        revokeKeys: [id.online],
        resetSequence: false,
      });
      const { manifest, file } = await publishRelease(ctx, "android", "", out, "main");
      expect(manifest.revokeKeys).toEqual([id.online]);
      expect(manifest.resetSequence).toBeUndefined();
      const opened = openEnvelope(readFileSync(file, "utf8"), ring);
      expect(opened.keyId).toBe(id.spare);
      expect(JSON.parse(new TextDecoder().decode(opened.manifest)).revokeKeys).toEqual([id.online]);
      //? The external signer's envelope was replaced by that release, which keeps the revocation going.
      expect((await publishRelease(ctx, "android", "", out, "main")).manifest.revokeKeys).toEqual([id.online]);
      expect(releaseRevocations(config, "ios", out, "main").revokeKeys).toEqual([]);
      expect(releaseRevocations(config, "macos", out, "main").revokeKeys).toEqual([]);

      signWith("online");
      expect(() => releaseRevocations(config, "android", out, "main")).toThrow(
        `the release revokes ${id.online} (the main releases in ${join(out, "android")}), the key it would be signed with`,
      );
      await expect(publishRelease(ctx, "android", "", out, "main")).rejects.toThrow(`sign with ${id.spare}`);

      //? The last key revoked the spare alone: the online key, listed before the spare, may not sign that on.
      writeEnvelope(keys, "pilot", "0123456789abcdef", "last", { sequence: 700, revokeKeys: [id.spare] });
      expect(() => releaseRevocations(config, "android", out, "pilot")).toThrow(
        `listed after ${id.online}, the key it would be signed with`,
      );
      signWith("last");
      expect(releaseRevocations(config, "android", out, "pilot").revokeKeys).toEqual([id.spare]);
      expect(releaseRevocations(config, "android", out, "main").revokeKeys).toEqual([id.online]);
    });
  });

  test("a desktop release signed with a revoked first key warns that installed desktop apps still take it", async () => {
    await keyring(async ({ id, ring, signWith }) => {
      signWith("online");
      const check = (revokedKeys: string[], platform: "macos" | "android") =>
        warningsOf(async () =>
          assertSigningKey({ app: { id: "dev.test.revoke" }, updates: { publicKeys: ring, revokedKeys } }, platform),
        );
      expect(await check([id.online], "macos")).toEqual([
        `updates.revokedKeys revokes ${id.online}, the first of updates.publicKeys, which a desktop app trusts: installed desktop apps keep taking releases it signs until a binary built with another first key replaces them`,
      ]);
      expect(await check([], "macos")).toEqual([]);
      expect(await check([id.online], "android")).toEqual([]);
    });
  });

  test("--revoke starts a revocation, signed with a key listed after it, and resets the sequence on request", async () => {
    await keyring(async (keys) => {
      const { id, ring, out, signWith } = keys;
      const ctx = phoneBuild(keys.home, ring);
      signWith("spare");
      const warnings = await warningsOf(async () => {
        const { manifest, file } = await publishRelease(ctx, "android", "", out, "main", {
          revoke: [id.online],
          resetSequence: true,
        });
        expect(manifest).toMatchObject({ revokeKeys: [id.online], resetSequence: true });
        const opened = openEnvelope(readFileSync(file, "utf8"), ring);
        expect(opened.keyId).toBe(id.spare);
        expect(JSON.parse(new TextDecoder().decode(opened.manifest))).toMatchObject({
          revokeKeys: [id.online],
          resetSequence: true,
        });
      });
      expect(warnings).toEqual([
        `this release revokes ${id.online}, which updates.revokedKeys does not list: add it, or a release published from another folder stops revoking it`,
      ]);
      //? The next routine publish from this folder carries the revocation on, without the reset.
      const next = await publishRelease(ctx, "android", "", out, "main");
      expect(next.manifest.revokeKeys).toEqual([id.online]);
      expect(next.manifest.resetSequence).toBeUndefined();
    });
  });

  test("refuses a revocation no phone would take, before anything is signed", async () => {
    await keyring(async (keys) => {
      const { id, ring, out, signWith } = keys;
      const { config } = phoneBuild(keys.home, ring).project;
      const refuse = (
        request: { revoke?: string[]; resetSequence?: boolean },
        platform: "android" | "macos" = "android",
      ) => expect(() => releaseRevocations(config, platform, out, "main", request));

      signWith("spare");
      refuse({ revoke: [id.stranger] }).toThrow(
        `--revoke ${id.stranger}: updates.publicKeys holds ${id.online}, ${id.spare}, ${id.last} only`,
      );
      refuse({ revoke: ["not-a-key-id"] }).toThrow("--revoke not-a-key-id: updates.publicKeys holds");
      //? A key revokes only keys listed before it: the spare may not revoke the last key, nor itself.
      refuse({ revoke: [id.last] }).toThrow(
        `the release revokes ${id.last} (--revoke), listed after ${id.spare}, the key it would be signed with`,
      );
      refuse({ revoke: [id.spare] }).toThrow(
        `the release revokes ${id.spare} (--revoke), the key it would be signed with`,
      );
      refuse({ revoke: [id.spare] }).toThrow(`sign with ${id.last}, the key listed after every key it revokes`);
      signWith("last");
      refuse({ revoke: [id.last] }).toThrow("so the phones need a new binary with another key");
      refuse({ resetSequence: true }).toThrow("--reset-sequence counts only in a release that revokes a key");
      refuse({ revoke: [id.online] }, "macos").toThrow("are for a phone's release");
      refuse({ resetSequence: true }, "macos").toThrow("are for a phone's release");
      expect(releaseRevocations(config, "android", out, "main", { revoke: [id.online, id.spare] })).toEqual({
        revokeKeys: [id.online, id.spare].sort(),
        resetSequence: false,
      });

      const full = Array.from({ length: 16 }, (_, i) => i.toString(16).padStart(16, "0"));
      const crowded = phoneBuild(keys.home, ring, full).project.config;
      expect(() => releaseRevocations(crowded, "android", out, "main", { revoke: [id.online] })).toThrow(
        "the release would revoke 17 keys, more than the 16 a manifest may",
      );
    });
  });

  test("updates.revokedKeys rides every phone release with what the channel's releases revoke", async () => {
    await keyring(async (keys) => {
      const { id, ring, out, signWith } = keys;
      const elsewhere = "0123456789abcdef";
      const ctx = phoneBuild(keys.home, ring, [id.online, elsewhere]);
      writeEnvelope(keys, "main", "0123456789abcdef", "last", { sequence: 500, revokeKeys: [id.spare] });
      signWith("last");
      let revokeKeys: string[] | undefined;
      const warnings = await warningsOf(async () => {
        ({ revokeKeys } = (await publishRelease(ctx, "android", "", out, "main")).manifest);
      });
      expect(revokeKeys).toEqual([elsewhere, id.online, id.spare].sort());
      expect(warnings).toEqual([
        `this release revokes ${id.spare}, which updates.revokedKeys does not list: add it, or a release published from another folder stops revoking it`,
        `updates.revokedKeys lists ${elsewhere}, which updates.publicKeys does not hold: only binaries built with an earlier ring act on it`,
      ]);
      //? From a fresh folder the config alone carries the revocations.
      const fresh = await publishRelease(ctx, "android", "", join(keys.home, "fresh"), "main");
      expect(fresh.manifest.revokeKeys).toEqual([elsewhere, id.online].sort());
      signWith("online");
      await expect(publishRelease(ctx, "android", "", join(keys.home, "fresh"), "main")).rejects.toThrow(
        `the release revokes ${id.online} (updates.revokedKeys), the key it would be signed with`,
      );
    });
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

  test("of a phone take an https report address, or http to this machine", async () => {
    const { prepare } = await import("../src/lib/prepare.ts");
    const dir = mkdtempSync(join(tmpdir(), "akan-native-report-"));
    try {
      mkdirSync(join(dir, "web"));
      writeFileSync(join(dir, "web", "index.html"), "<!doctype html><html><head></head><body></body></html>");
      const project = (report: string) =>
        projectFromConfig(
          {
            app: { id: "dev.test.report", name: "Report", version: "1.0.0" },
            web: { dir: "web" },
            updates: {
              url: "https://updates.example.com",
              publicKey: Buffer.alloc(32, 7).toString("base64"),
              report: { url: report },
            },
          } as AkanNativeConfig,
          dir,
        );
      const release = {
        mode: "production",
        profile: "release" as const,
        skipWebBuild: true,
        outDir: join(dir, "out"),
        api: true,
        envFiles: false,
      };
      for (const platform of ["android", "ios"] as const)
        await expect(prepare(project("http://reports.example.com/r/"), platform, release)).rejects.toThrow(
          "updates.report.url must be https in a release build",
        );
      for (const report of ["https://reports.example.com/r/", "http://127.0.0.1:8791/r"])
        expect((await prepare(project(report), "android", release)).profile).toBe("release");
      const debug = { ...release, profile: "debug" as const };
      expect((await prepare(project("http://10.0.2.2:8791/r"), "android", debug)).profile).toBe("debug");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
