import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AkanNativeConfig } from "../src/config.ts";
import type { BuildContext } from "../src/lib/prepare.ts";
import { projectFromConfig } from "../src/lib/project.ts";
import { assertSigningKey, channelRevocations, nextSequence, publishRelease } from "../src/lib/publish.ts";
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
const phoneBuild = (root: string, publicKeys: string[]) => {
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
  const updates = { url: "https://updates.example.com", publicKeys, channel: "main", readyTimeout: 10_000 };
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

  test("carries on what the channel's releases revoke, and never signs with a key they revoke", async () => {
    const home = mkdtempSync(join(tmpdir(), "akan-native-revoke-"));
    const previous = process.env.AKAN_NATIVE_UPDATE_KEY;
    const signWith = (name: string) => {
      process.env.AKAN_NATIVE_UPDATE_KEY = join(home, `${name}.key`);
    };
    try {
      const [online, spare, last, stranger] = ["online", "spare", "last", "stranger"].map(
        (name) => generateUpdateKey(join(home, `${name}.key`)).publicKey,
      ) as [string, string, string, string];
      const ring = [online, spare, last];
      const ctx = phoneBuild(home, ring);
      const { config } = ctx.project;
      const out = join(home, "out");
      const write = (channel: string, nativeApi: string, signer: string, manifest: object, keys = ring) => {
        mkdirSync(join(out, "android", channel), { recursive: true });
        const bytes = new TextEncoder().encode(JSON.stringify({ schema: 2, kind: "web", channel, ...manifest }));
        const envelope = sealManifest(bytes, join(home, `${signer}.key`), keys);
        writeFileSync(join(out, "android", channel, `${nativeApi}.json`), JSON.stringify(envelope));
      };
      //? An external signer recovered with the spare: its manifest for this binary's native API revokes the leaked key.
      write("main", "0123456789abcdef", "spare", { sequence: 500, revokeKeys: [keyIdOf(online)] });
      //? Neither a key the binaries do not trust nor one listed before the spare makes a publish revoke the spare.
      write("main", "1111111111111111", "stranger", { sequence: 450, revokeKeys: [keyIdOf(spare)] }, [stranger]);
      write("main", "2222222222222222", "online", { sequence: 400, revokeKeys: [keyIdOf(spare)] });

      signWith("spare");
      expect(channelRevocations(config, "android", out, "main")).toEqual([keyIdOf(online)]);
      const { manifest, file } = await publishRelease(ctx, "android", "", out, "main");
      expect(manifest.revokeKeys).toEqual([keyIdOf(online)]);
      const opened = openEnvelope(readFileSync(file, "utf8"), ring);
      expect(opened.keyId).toBe(keyIdOf(spare));
      expect(JSON.parse(new TextDecoder().decode(opened.manifest)).revokeKeys).toEqual([keyIdOf(online)]);
      //? The external signer's envelope was replaced by that release, which keeps the revocation going.
      expect((await publishRelease(ctx, "android", "", out, "main")).manifest.revokeKeys).toEqual([keyIdOf(online)]);
      expect(channelRevocations(config, "ios", out, "main")).toEqual([]);
      expect(channelRevocations(config, "macos", out, "main")).toEqual([]);

      signWith("online");
      expect(() => channelRevocations(config, "android", out, "main")).toThrow("sign with a key listed after it");
      await expect(publishRelease(ctx, "android", "", out, "main")).rejects.toThrow("the key at");

      //? The last key revoked the spare alone: the online key, listed before the spare, may not sign that on.
      write("pilot", "0123456789abcdef", "last", { sequence: 700, revokeKeys: [keyIdOf(spare)] });
      expect(() => channelRevocations(config, "android", out, "pilot")).toThrow("so sign with one after them");
      signWith("last");
      expect(channelRevocations(config, "android", out, "pilot")).toEqual([keyIdOf(spare)]);
      expect(channelRevocations(config, "android", out, "main")).toEqual([keyIdOf(online)]);
    } finally {
      if (previous === undefined) delete process.env.AKAN_NATIVE_UPDATE_KEY;
      else process.env.AKAN_NATIVE_UPDATE_KEY = previous;
      rmSync(home, { recursive: true, force: true });
    }
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
