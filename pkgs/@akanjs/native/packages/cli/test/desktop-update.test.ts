import { afterEach, describe, expect, test } from "bun:test";
import { createPrivateKey, sign } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type LogEvent, withLogSink } from "../src/lib/log.ts";
import type { BuildContext } from "../src/lib/prepare.ts";
import {
  assertServerOfChannel,
  type PublishedRelease,
  publishRelease,
  releaseDir,
  republishRelease,
} from "../src/lib/publish.ts";
import {
  fillManifest,
  generateUpdateKey,
  hostArch,
  keyIdOf,
  manifestBytes,
  openEnvelope,
  sealManifest,
  sha256,
  type UpdateManifest,
  updateEnvelope,
  verifyManifest,
} from "../src/lib/updates.ts";
import { packAppUpdate, publishAppUpdate, readAppArchive } from "../src/platforms/desktop-update.ts";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const ctx = { project: { config: { app: { id: "dev.test.publish", version: "1.0.0" } } } } as unknown as BuildContext;

/** A built Linux app folder: resources/updates.json, and resources/server.json when it carries a server. */
function builtApp(root: string, { server = false, marker = "a" } = {}): string {
  const app = join(root, "build", "Sample");
  rmSync(app, { recursive: true, force: true });
  mkdirSync(join(app, "resources"), { recursive: true });
  writeFileSync(join(app, "resources", "updates.json"), JSON.stringify({ embeddedSequence: 100 }));
  writeFileSync(join(app, "resources", "boot.json"), JSON.stringify({ marker }));
  if (server) writeFileSync(join(app, "resources", "server.json"), "{}");
  writeFileSync(join(app, "sample"), "x".repeat(4096));
  return app;
}

const publish = async (root: string, out: string, options: { server?: boolean; marker?: string }, sequence: number) => {
  const result = await publishAppUpdate(ctx, "linux", builtApp(root, options), out, "production", sequence);
  writeFileSync(join(out, "production.json"), JSON.stringify(result.manifest));
  return result;
};

describe("publishing a desktop release", () => {
  test("says whether the release carries a server, and leaves only what is uploaded", async () => {
    const root = mkdtempSync(join(tmpdir(), "akan-native-publish-"));
    roots.push(root);
    const out = join(root, "out");
    const first = await publish(root, out, { server: true, marker: "a" }, 1000);
    expect(first.manifest.server).toBe(true);
    expect(readdirSync(join(out, "app")).every((name) => name.endsWith(".tar.gz"))).toBe(true);
    const second = await publish(root, out, { server: true, marker: "b" }, 1001);
    expect(second.manifest.patches?.[0]?.from).toBe(first.manifest.archive?.sha256 as string);
    expect(existsSync(join(out, second.manifest.patches?.[0]?.url as string))).toBe(true);
  });

  test("refuses a build whose server presence differs from the channel's previous release", async () => {
    const root = mkdtempSync(join(tmpdir(), "akan-native-publish-"));
    roots.push(root);
    const out = join(root, "out");
    await publish(root, out, { server: false }, 1000);
    await expect(publish(root, out, { server: true }, 1001)).rejects.toThrow("carries no server and this build does");
  });

  test("the same refusal comes before the build, from the config", () => {
    const root = mkdtempSync(join(tmpdir(), "akan-native-publish-"));
    roots.push(root);
    mkdirSync(join(root, `linux-${hostArch()}`), { recursive: true });
    writeFileSync(
      join(root, `linux-${hostArch()}`, "production.json"),
      JSON.stringify({ bundle: "1.0.0-1", server: false }),
    );
    expect(() => assertServerOfChannel({ desktop: { server: {} } }, "linux", root, "production")).toThrow(
      "carries no server and this build does",
    );
    expect(() => assertServerOfChannel({ desktop: {} }, "linux", root, "production")).not.toThrow();
    expect(() => assertServerOfChannel({ desktop: { server: {} } }, "linux", root, "pilot")).not.toThrow();
    expect(() => assertServerOfChannel({ desktop: { server: {} } }, "ios", root, "production")).not.toThrow();
  });

  test("a release built for another CPU goes to that CPU's feed, and its manifest names it", async () => {
    const other = hostArch() === "arm64" ? "x64" : "arm64";
    expect(releaseDir("/out", "windows", other)).toBe(join("/out", `windows-${other}`));
    expect(releaseDir("/out", "android", other)).toBe(join("/out", "android"));
    const root = mkdtempSync(join(tmpdir(), "akan-native-publish-"));
    roots.push(root);
    mkdirSync(join(root, `linux-${other}`), { recursive: true });
    writeFileSync(
      join(root, `linux-${other}`, "production.json"),
      JSON.stringify({ bundle: "1.0.0-1", server: false }),
    );
    expect(() => assertServerOfChannel({ desktop: { server: {} } }, "linux", root, "production", other)).toThrow(
      "carries no server and this build does",
    );
    expect(() => assertServerOfChannel({ desktop: { server: {} } }, "linux", root, "production")).not.toThrow();
    const cross = { ...ctx, arch: other } as BuildContext;
    const { manifest } = await publishAppUpdate(cross, "linux", builtApp(root), join(root, "out"), "production", 1000);
    expect(manifest.arch).toBe(other);
  });

  test("a previous release published before the field was recorded is not compared", async () => {
    const root = mkdtempSync(join(tmpdir(), "akan-native-publish-"));
    roots.push(root);
    const out = join(root, "out");
    const { manifest } = await publish(root, out, { server: false }, 1000);
    const { server: _server, ...older } = manifest as UpdateManifest;
    writeFileSync(join(out, "production.json"), JSON.stringify(older));
    const next = await publishAppUpdate(ctx, "linux", builtApp(root, { server: true }), out, "production", 1001);
    expect(next.manifest.server).toBe(true);
  });

  test("an uncompressed tar an earlier publish kept is handed back to be removed", async () => {
    const root = mkdtempSync(join(tmpdir(), "akan-native-publish-"));
    roots.push(root);
    const out = join(root, "out");
    mkdirSync(join(out, "app"), { recursive: true });
    const kept = join(out, "app", `${"a".repeat(64)}.tar`);
    writeFileSync(kept, "");
    const { leftovers } = await publish(root, out, {}, 1000);
    expect(leftovers).toEqual([kept]);
  });
});

describe("publishing a desktop release for protocol v2", () => {
  test("writes the envelope naming its target, and the v1 pair only while the first key signs", async () => {
    const root = mkdtempSync(join(tmpdir(), "akan-native-publish-"));
    roots.push(root);
    const online = generateUpdateKey(join(root, "online.key")).publicKey;
    const spare = generateUpdateKey(join(root, "spare.key")).publicKey;
    const previous = process.env.AKAN_NATIVE_UPDATE_KEY;
    try {
      const updates = {
        url: "https://u",
        publicKeys: [online, spare],
        revokedKeys: [],
        channel: "production",
        readyTimeout: 10_000,
        reportUrl: null,
        target: "pilot",
      };
      const app = { id: "dev.test.publish", version: "1.0.0" };
      const build = { project: { config: { app, updates } } } as unknown as BuildContext;
      const out = join(root, "out");
      const dir = join(out, `linux-${hostArch()}`);
      const manifestOf = (release: PublishedRelease) =>
        JSON.parse(
          new TextDecoder().decode(openEnvelope(readFileSync(release.file, "utf8"), [online, spare]).manifest),
        );

      process.env.AKAN_NATIVE_UPDATE_KEY = join(root, "online.key");
      const first = await publishRelease(build, "linux", builtApp(root, { marker: "a" }), out, "production");
      expect(first.file).toBe(join(dir, "production", "app.json"));
      expect(openEnvelope(readFileSync(first.file, "utf8"), [online, spare]).keyId).toBe(keyIdOf(online));
      expect(manifestOf(first)).toEqual(first.manifest);
      expect(first.manifest).toMatchObject({ schema: 2, kind: "app", target: "pilot", server: false });
      expect(first.manifest.revokeKeys).toBeUndefined();
      const v1 = readFileSync(join(dir, "production.json"));
      expect(verifyManifest(v1, readFileSync(join(dir, "production.json.sig"), "utf8").trim(), online)).toBe(true);
      const { schema, target, ...same } = JSON.parse(v1.toString()) as UpdateManifest;
      expect([schema, target]).toEqual([1, undefined]);
      expect(first.manifest).toEqual({ ...same, schema: 2, target: "pilot" });

      process.env.AKAN_NATIVE_UPDATE_KEY = join(root, "spare.key");
      const events: LogEvent[] = [];
      const second = await withLogSink(
        (event) => events.push(event),
        () =>
          publishRelease(build, "linux", builtApp(root, { marker: "b" }), out, "production", {
            revoke: [keyIdOf(online)],
          }),
      );
      expect(second.manifest).toMatchObject({ schema: 2, target: "pilot", revokeKeys: [keyIdOf(online)] });
      expect(second.manifest.patches?.[0]?.from).toBe(first.manifest.archive?.sha256 as string);
      expect(second.manifest.sequence).toBeGreaterThan(first.manifest.sequence);
      expect(openEnvelope(readFileSync(second.file, "utf8"), [online, spare]).keyId).toBe(keyIdOf(spare));
      //? The pair stays the first release's: an app built before protocol v2 sees nothing newer it could verify.
      expect(JSON.parse(readFileSync(join(dir, "production.json"), "utf8")).bundle).toBe(first.manifest.bundle);
      expect(events.filter((event) => event.level === "warn").map((event) => event.message)).toContain(
        `this release is signed with ${keyIdOf(spare)}, not the first of updates.publicKeys: desktop apps built before protocol v2 trust only that key, so they do not see it`,
      );

      rmSync(join(dir, "production.json"));
      expect(() => assertServerOfChannel({ desktop: { server: {} } }, "linux", out, "production")).toThrow(
        `the production release in ${dir} (${second.manifest.bundle}) carries no server and this build does`,
      );
    } finally {
      if (previous === undefined) delete process.env.AKAN_NATIVE_UPDATE_KEY;
      else process.env.AKAN_NATIVE_UPDATE_KEY = previous;
    }
  });
});

/** A config with one update key, the key file AKAN_NATIVE_UPDATE_KEY names for the length of `run`. */
async function withKey<T>(
  root: string,
  run: (build: BuildContext, publicKey: string, keyPath: string) => Promise<T>,
  updates: Record<string, unknown> = {},
): Promise<T> {
  const keyPath = join(root, "online.key");
  const publicKey = generateUpdateKey(keyPath).publicKey;
  const previous = process.env.AKAN_NATIVE_UPDATE_KEY;
  process.env.AKAN_NATIVE_UPDATE_KEY = keyPath;
  try {
    const config = {
      app: { id: "dev.test.publish", version: "1.0.0" },
      updates: {
        url: "https://u",
        publicKeys: [publicKey],
        revokedKeys: [],
        channel: "production",
        readyTimeout: 10_000,
        reportUrl: null,
        target: "pilot",
        ...updates,
      },
    };
    return await run({ project: { config } } as unknown as BuildContext, publicKey, keyPath);
  } finally {
    if (previous === undefined) delete process.env.AKAN_NATIVE_UPDATE_KEY;
    else process.env.AKAN_NATIVE_UPDATE_KEY = previous;
  }
}

const tempRoot = () => {
  const root = mkdtempSync(join(tmpdir(), "akan-native-publish-"));
  roots.push(root);
  return root;
};

describe("an unsigned desktop pack", () => {
  test("holds the archive as a publish names it and a manifest whose channel, sequence and bundle are the signer's", async () => {
    const root = tempRoot();
    await withKey(root, async (build) => {
      const out = join(root, "pack");
      const { manifest, patch } = await packAppUpdate(build, "linux", builtApp(root, { server: true }), out);
      expect(patch).toBeNull();
      expect(manifest).toMatchObject({
        schema: 2,
        kind: "app",
        app: "dev.test.publish",
        platform: "linux",
        arch: hostArch(),
        channel: "",
        sequence: 0,
        bundle: "",
        version: "1.0.0",
        build: 100,
        target: "pilot",
        server: true,
        patches: [],
      });
      expect(JSON.parse(readFileSync(join(out, "manifest.template.json"), "utf8"))).toEqual(manifest);
      const archive = manifest.archive as NonNullable<UpdateManifest["archive"]>;
      expect(archive.url).toBe(`app/${archive.sha256}.tar.gz`);
      const gz = readFileSync(join(out, archive.url));
      expect([sha256(gz), gz.length, sha256(Bun.gunzipSync(gz))]).toEqual([
        archive.gzSha256,
        archive.size,
        archive.sha256,
      ]);
      expect(readdirSync(out).sort()).toEqual(["app", "manifest.template.json"]);
      expect(readdirSync(join(out, "app"))).toEqual([`${archive.sha256}.tar.gz`]);
    });
  });

  test("with the previous release's archive, a path or a URL of the feed, carries the delta from it", async () => {
    const root = tempRoot();
    await withKey(root, async (build) => {
      const first = await packAppUpdate(build, "linux", builtApp(root, { marker: "a" }), join(root, "first"));
      const from = first.manifest.archive as NonNullable<UpdateManifest["archive"]>;
      const feed = Bun.serve({
        port: 0,
        fetch: (request) => {
          const file = join(root, "first", new URL(request.url).pathname.replace("/feed/linux-arm64/", ""));
          return existsSync(file) ? new Response(Bun.file(file)) : new Response("gone", { status: 404 });
        },
      });
      try {
        const sources = [join(root, "first", from.url), `http://localhost:${feed.port}/feed/linux-arm64/${from.url}`];
        for (const [idx, source] of sources.entries()) {
          const out = join(root, `second-${idx}`);
          const previous = await readAppArchive(source);
          expect(previous.sha256).toBe(from.sha256);
          const { manifest, patch } = await packAppUpdate(
            build,
            "linux",
            builtApp(root, { marker: "b" }),
            out,
            previous,
          );
          const to = (manifest.archive as NonNullable<UpdateManifest["archive"]>).sha256;
          expect(to).not.toBe(from.sha256);
          expect(manifest.patches).toEqual([patch as NonNullable<typeof patch>]);
          expect(patch).toMatchObject({ from: from.sha256, url: `app/${from.sha256}-${to}.delta.gz` });
          const delta = readFileSync(join(out, patch?.url as string));
          expect([sha256(delta), delta.length]).toEqual([patch?.sha256 as string, patch?.size as number]);
        }
        const same = await packAppUpdate(
          build,
          "linux",
          builtApp(root, { marker: "a" }),
          join(root, "same"),
          await readAppArchive(sources[0] as string),
        );
        expect(same.manifest.patches).toEqual([]);

        const renamed = join(root, `${"0".repeat(64)}.tar.gz`);
        writeFileSync(renamed, readFileSync(sources[0] as string));
        writeFileSync(join(root, `${"1".repeat(64)}.tar.gz`), "not gzip");
        await expect(readAppArchive(renamed)).rejects.toThrow("does not unpack to the tar its name says");
        await expect(readAppArchive(join(root, `${"1".repeat(64)}.tar.gz`))).rejects.toThrow("is not a gzip archive");
        await expect(readAppArchive(join(root, "first", "manifest.template.json"))).rejects.toThrow(
          "is not named as a release archive is",
        );
        await expect(readAppArchive(join(root, `${"2".repeat(64)}.tar.gz`))).rejects.toThrow("does not exist");
        await expect(
          readAppArchive(`http://localhost:${feed.port}/feed/linux-arm64/app/${"3".repeat(64)}.tar.gz`),
        ).rejects.toThrow("answered 404");
      } finally {
        await feed.stop(true);
      }
    });
  });

  test("is signed by whoever holds the key: the template filled, its exact bytes, and an envelope apps open", async () => {
    const root = tempRoot();
    await withKey(root, async (build, publicKey, keyPath) => {
      const { manifest: template } = await packAppUpdate(build, "linux", builtApp(root), join(root, "pack"));
      const manifest = fillManifest(template, { channel: "pilot", sequence: 1_800_000_000 });
      expect(manifest).toEqual({ ...template, channel: "pilot", sequence: 1_800_000_000, bundle: "1.0.0-1800000000" });
      expect(Object.keys(manifest)).toEqual(Object.keys(template));

      const bytes = manifestBytes(manifest);
      expect(new TextDecoder().decode(bytes)).toBe(`${JSON.stringify(manifest, null, 2)}\n`);
      const key = createPrivateKey(readFileSync(keyPath, "utf8"));
      const signature = sign(null, bytes, key);
      const envelope = updateEnvelope(bytes, publicKey, signature);
      expect(envelope).toEqual(updateEnvelope(bytes, publicKey, signature.toString("base64")));
      expect(envelope).toEqual(sealManifest(bytes, keyPath, [publicKey]));
      expect(envelope.keyId).toBe(keyIdOf(publicKey));
      expect(openEnvelope(JSON.stringify(envelope), [publicKey]).manifest).toEqual(bytes);

      const other = generateUpdateKey(join(root, "other.key")).publicKey;
      const refusal = `the signature is not key ${keyIdOf(other)}'s over these manifest bytes`;
      expect(() => updateEnvelope(bytes, other, signature)).toThrow(refusal);
      const edited = manifestBytes({ ...manifest, sequence: manifest.sequence + 1 });
      expect(() => updateEnvelope(edited, publicKey, signature)).toThrow("over these manifest bytes");
      expect(() => updateEnvelope(bytes, publicKey, "not base64")).toThrow("over these manifest bytes");
      expect(() => updateEnvelope(bytes, "short", signature)).toThrow("not a raw 32-byte Ed25519 key");
    });
  });

  test("a filled manifest takes the signer's patches, revocations and expiry, and refuses what no app would take", async () => {
    const root = tempRoot();
    await withKey(root, async (build) => {
      const { manifest: template } = await packAppUpdate(build, "linux", builtApp(root), join(root, "pack"));
      const patch = { from: "a".repeat(64), url: "app/x.delta.gz", sha256: "b".repeat(64), size: 9 };
      const keyIds = ["ffffffffffffffff", "0000000000000000"];
      const filled = fillManifest(
        { ...template, revokeKeys: ["1111111111111111"], resetSequence: true, expiresAt: 5 },
        {
          channel: "production",
          sequence: 7,
          bundle: "rollback-7",
          patches: [patch],
          revokeKeys: keyIds,
          expiresAt: 99,
        },
      );
      expect(filled).toMatchObject({
        bundle: "rollback-7",
        patches: [patch],
        revokeKeys: [...keyIds].sort(),
        expiresAt: 99,
      });
      expect(filled.resetSequence).toBeUndefined();
      const plain = fillManifest(
        { ...template, revokeKeys: keyIds, expiresAt: 5 },
        { channel: "production", sequence: 7 },
      );
      expect([plain.revokeKeys, plain.expiresAt, plain.patches]).toEqual([undefined, undefined, []]);

      const release = { channel: "production", sequence: 7 };
      expect(() => fillManifest(template, { ...release, channel: "../other" })).toThrow();
      for (const sequence of [0, -1, 1.5, Number.NaN])
        expect(() => fillManifest(template, { ...release, sequence })).toThrow("a positive whole number");
      expect(() => fillManifest(template, { ...release, bundle: "../up" })).toThrow("cannot name a release's bundle");
      expect(() => fillManifest(template, { ...release, revokeKeys: ["short"] })).toThrow("keyIds, 16 hex digits each");
      expect(() => fillManifest(template, { ...release, resetSequence: true })).toThrow("revokes a key");
      expect(() => fillManifest(template, { ...release, expiresAt: 0 })).toThrow("Unix seconds");
      const web = { ...template, kind: "web" as const };
      expect(() => fillManifest(web, release)).toThrow("needs its bundle id");
      expect(() => fillManifest(web, { ...release, bundle: "7-abcdef12", patches: [patch] })).toThrow(
        "only a desktop app",
      );
      expect(fillManifest(web, { ...release, bundle: "7-abcdef12" }).bundle).toBe("7-abcdef12");
      expect(() => manifestBytes({ ...template, bundle: "x".repeat(1 << 20) })).toThrow("an app reads at most");
    });
  });
});

describe("signing an earlier desktop release again (--republish)", () => {
  const opened = (file: string, publicKey: string) =>
    JSON.parse(
      new TextDecoder().decode(openEnvelope(readFileSync(file, "utf8"), [publicKey]).manifest),
    ) as UpdateManifest;
  const withFeed = async (run: (url: string, served: Map<string, Uint8Array>) => Promise<void>) => {
    const served = new Map<string, Uint8Array>();
    const feed = Bun.serve({
      port: 0,
      fetch: (request) => {
        const body = served.get(new URL(request.url).pathname);
        return body ? new Response(Buffer.from(body)) : new Response("gone", { status: 404 });
      },
    });
    try {
      await run(`http://localhost:${feed.port}/feed`, served);
    } finally {
      await feed.stop(true);
    }
  };

  test("makes it the channel's newest under a new sequence and bundle id, with the same archive and no patch", async () => {
    const root = tempRoot();
    await withKey(root, async (build, publicKey) => {
      const out = join(root, "out");
      const dir = join(out, `linux-${hostArch()}`);
      const good = await publishRelease(build, "linux", builtApp(root, { marker: "a" }), out, "production");
      const bad = await publishRelease(build, "linux", builtApp(root, { marker: "b" }), out, "production");
      expect(readdirSync(join(dir, "production", "releases")).sort()).toEqual(
        [`${good.manifest.bundle}.json`, `${bad.manifest.bundle}.json`].sort(),
      );
      expect(opened(join(dir, "production", "releases", `${good.manifest.bundle}.json`), publicKey)).toEqual(
        good.manifest,
      );

      const { project } = build;
      const back = await republishRelease(project, "linux", good.manifest.bundle, out, "production");
      expect(back.from).toEqual(good.manifest);
      expect(back.file).toBe(bad.file);
      expect(opened(back.file, publicKey)).toEqual(back.manifest);
      expect(back.manifest.sequence).toBeGreaterThan(bad.manifest.sequence);
      expect(back.manifest).toEqual({
        ...good.manifest,
        sequence: back.manifest.sequence,
        bundle: `1.0.0-${back.manifest.sequence}`,
        patches: [],
      });
      expect(back.manifest.bundle).not.toBe(good.manifest.bundle);
      const v1 = readFileSync(join(dir, "production.json"));
      expect(verifyManifest(v1, readFileSync(join(dir, "production.json.sig"), "utf8").trim(), publicKey)).toBe(true);
      expect(JSON.parse(v1.toString())).toMatchObject({ schema: 1, bundle: back.manifest.bundle, patches: [] });
      expect(readdirSync(join(dir, "production", "releases"))).toHaveLength(3);

      const promoted = await republishRelease(project, "linux", bad.manifest.bundle, out, "pilot");
      expect(promoted.file).toBe(join(dir, "pilot", "app.json"));
      expect(promoted.manifest).toMatchObject({ channel: "pilot", archive: bad.manifest.archive, patches: [] });
    });
  });

  test("refuses a release nobody signed, another CPU's, and one whose server differs from the channel's", async () => {
    const root = tempRoot();
    await withFeed((url) =>
      withKey(
        root,
        async (build, publicKey) => {
          const out = join(root, "out");
          const dir = join(out, `linux-${hostArch()}`);
          const { project } = build;
          await expect(republishRelease(project, "linux", "1.0.0-1", out, "production")).rejects.toThrow(
            `${dir} holds no release 1.0.0-1, and ${url}/linux-${hostArch()}/production/releases/1.0.0-1.json answered 404`,
          );
          await expect(republishRelease(project, "linux", "../1.0.0-1", out, "production")).rejects.toThrow(
            "takes a release's bundle id",
          );
          const plain = await publishRelease(build, "linux", builtApp(root), out, "production");
          //? Another version: a bundle id is `<version>-<seconds>`, and two channels published in one second share it.
          const { config } = project;
          const kiosk = {
            project: { config: { ...config, app: { ...config.app, version: "2.0.0" } } },
          } as BuildContext;
          const carrying = await publishRelease(kiosk, "linux", builtApp(root, { server: true }), out, "kiosk");
          await expect(republishRelease(project, "linux", carrying.manifest.bundle, out, "production")).rejects.toThrow(
            "carries no server and this build does",
          );
          const other = hostArch() === "arm64" ? "x64" : "arm64";
          await expect(
            republishRelease(project, "linux", plain.manifest.bundle, out, "production", {}, other),
          ).rejects.toThrow(`holds no release ${plain.manifest.bundle}`);

          const kept = join(dir, "production", "releases", `${plain.manifest.bundle}.json`);
          const forged = JSON.parse(readFileSync(kept, "utf8"));
          const edited = { ...plain.manifest, archive: { ...plain.manifest.archive, gzSha256: "0".repeat(64) } };
          writeFileSync(
            kept,
            JSON.stringify({ ...forged, manifest: Buffer.from(JSON.stringify(edited)).toString("base64") }),
          );
          await expect(republishRelease(project, "linux", plain.manifest.bundle, out, "production")).rejects.toThrow(
            "signature does not verify",
          );
          expect(opened(plain.file, publicKey).bundle).toBe(plain.manifest.bundle);
        },
        { url },
      ),
    );
  });

  test("a computer that never published the release reads its envelope and archive back from the feed", async () => {
    const root = tempRoot();
    await withFeed((url, served) =>
      withKey(
        root,
        async (build, publicKey) => {
          const out = join(root, "out");
          const dir = join(out, `linux-${hostArch()}`);
          const { project } = build;
          const good = await publishRelease(build, "linux", builtApp(root, { marker: "a" }), out, "production");
          const archive = good.manifest.archive as NonNullable<UpdateManifest["archive"]>;
          const envelope = `production/releases/${good.manifest.bundle}.json`;
          const fresh = join(root, "fresh");
          const republish = () => republishRelease(project, "linux", good.manifest.bundle, fresh, "production");

          served.set(`/feed/linux-${hostArch()}/${archive.url}`, readFileSync(join(dir, archive.url)));
          const signed = JSON.parse(readFileSync(join(dir, envelope), "utf8"));
          const edited = Buffer.from(JSON.stringify({ ...good.manifest, version: "9.9.9" })).toString("base64");
          served.set(
            `/feed/linux-${hostArch()}/${envelope}`,
            new TextEncoder().encode(JSON.stringify({ ...signed, manifest: edited })),
          );
          await expect(republish()).rejects.toThrow("signature does not verify");
          expect(existsSync(fresh)).toBe(false);

          served.set(`/feed/linux-${hostArch()}/${envelope}`, readFileSync(join(dir, envelope)));
          const back = await republish();
          expect(back.from).toEqual(good.manifest);
          expect(back.manifest).toMatchObject({ channel: "production", archive, patches: [] });
          expect(back.manifest.sequence).toBeGreaterThan(good.manifest.sequence);
          expect(opened(join(fresh, `linux-${hostArch()}`, "production", "app.json"), publicKey)).toEqual(
            back.manifest,
          );
          expect(readFileSync(join(fresh, `linux-${hostArch()}`, archive.url))).toEqual(
            readFileSync(join(dir, archive.url)),
          );
        },
        { url },
      ),
    );
  });

  test("an archive gone from the folder is fetched from the feed, and refused unless it is the one the release names", async () => {
    const root = tempRoot();
    await withFeed((url, served) =>
      withKey(
        root,
        async (build) => {
          const out = join(root, "out");
          const dir = join(out, `linux-${hostArch()}`);
          const { project } = build;
          const first = await publishRelease(build, "linux", builtApp(root, { marker: "a" }), out, "production");
          await publishRelease(build, "linux", builtApp(root, { marker: "b" }), out, "production");
          const archive = first.manifest.archive as NonNullable<UpdateManifest["archive"]>;
          const file = join(dir, archive.url);
          const bytes = readFileSync(file);
          const path = `/feed/linux-${hostArch()}/${archive.url}`;
          const republish = () => republishRelease(project, "linux", first.manifest.bundle, out, "production");

          rmSync(file);
          await expect(republish()).rejects.toThrow("answered 404");
          served.set(path, new TextEncoder().encode("another archive"));
          await expect(republish()).rejects.toThrow("is not the archive the release names");
          expect(existsSync(file)).toBe(false);
          served.set(path, bytes);
          expect((await republish()).manifest.archive).toEqual(archive);
          expect(readFileSync(file)).toEqual(bytes);

          writeFileSync(file, "changed here");
          await expect(republish()).rejects.toThrow("is not the archive the release names: nothing was signed");
        },
        { url },
      ),
    );
  });
});
