import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type LogEvent, withLogSink } from "../src/lib/log.ts";
import type { BuildContext } from "../src/lib/prepare.ts";
import { assertServerOfChannel, type PublishedRelease, publishRelease, releaseDir } from "../src/lib/publish.ts";
import {
  generateUpdateKey,
  hostArch,
  keyIdOf,
  openEnvelope,
  type UpdateManifest,
  verifyManifest,
} from "../src/lib/updates.ts";
import { publishAppUpdate } from "../src/platforms/desktop-update.ts";

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
