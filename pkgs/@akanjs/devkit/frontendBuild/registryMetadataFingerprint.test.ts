import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import fs from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { isAkanRuntimeMetadataFile } from "akanjs/server/hmr/runtimeMetadataFile";
import { RegistryMetadataFingerprint } from "./registryMetadataFingerprint";

describe("RegistryMetadataFingerprint", () => {
  let root: string;
  let later = Date.now() / 1000 + 60;
  const file = (relative: string) => path.join(root, relative);
  const touch = (relative: string) => {
    later += 1;
    fs.utimesSync(file(relative), later, later);
  };
  const ssrMetadata = (target: string) =>
    isAkanRuntimeMetadataFile(target) && !target.endsWith(".dictionary.ts") && path.basename(target) !== "dict.ts";
  const stamp = async (isMetadataFile = isAkanRuntimeMetadataFile) =>
    await RegistryMetadataFingerprint.of([root], isMetadataFile);

  beforeAll(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "akan-registry-metadata-"));
    for (const relative of [
      "lib/sig.ts",
      "lib/dict.ts",
      "lib/useClient.ts",
      "lib/user/user.signal.ts",
      "lib/user/user.dictionary.ts",
      "lib/user/User.Zone.tsx",
      "lib/user/user.signal.test.ts",
    ])
      await Bun.write(file(relative), "export {};\n");
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test("moves with a signal save and stays with a component save", async () => {
    const before = await stamp();
    touch("lib/user/User.Zone.tsx");
    touch("lib/user/user.signal.test.ts");
    expect(await stamp()).toBe(before);
    touch("lib/user/user.signal.ts");
    expect(await stamp()).not.toBe(before);
  });

  test("a registry that inlines no dictionary is not moved by a dictionary save", async () => {
    const ssrBefore = await stamp(ssrMetadata);
    const csrBefore = await stamp();
    touch("lib/user/user.dictionary.ts");
    touch("lib/dict.ts");
    expect(await stamp(ssrMetadata)).toBe(ssrBefore);
    expect(await stamp()).not.toBe(csrBefore);
  });

  test("a root without a lib folder counts for nothing", async () => {
    expect(await RegistryMetadataFingerprint.of([root, path.join(root, "lib/user")], isAkanRuntimeMetadataFile)).toBe(
      await stamp(),
    );
  });
});
