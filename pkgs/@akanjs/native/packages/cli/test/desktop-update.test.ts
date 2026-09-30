import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BuildContext } from "../src/lib/prepare.ts";
import { assertServerOfChannel } from "../src/lib/publish.ts";
import { hostArch, type UpdateManifest } from "../src/lib/updates.ts";
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
