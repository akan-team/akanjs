import { describe, expect, test } from "bun:test";
import { appendFile, utimes, writeFile } from "node:fs/promises";
import path from "node:path";
import { tempDirs } from "../test/testHelpers";
import { buildCacheStamp, isBuildCacheStamp } from "./buildCacheStamp";

const tempRoot = tempDirs("akan-devkit-stamp-");

const makeProducer = async () => {
  const file = path.join(await tempRoot(), "producer.ts");
  await writeFile(file, "export const regex = /x/;\n");
  await utimes(file, new Date(1_700_000_000_000), new Date(1_700_000_000_000));
  return file;
};

describe("buildCacheStamp", () => {
  test("matches a stamp taken from the same producing file", async () => {
    const file = await makeProducer();
    expect(isBuildCacheStamp(buildCacheStamp([file]), buildCacheStamp([file]))).toBe(true);
  });

  test("misses when the producing file's mtime moves", async () => {
    const file = await makeProducer();
    const before = buildCacheStamp([file]);
    await utimes(file, new Date(1_700_000_001_000), new Date(1_700_000_001_000));
    expect(isBuildCacheStamp(before, buildCacheStamp([file]))).toBe(false);
  });

  test("misses when the producing file's size changes under the same mtime", async () => {
    const file = await makeProducer();
    const before = buildCacheStamp([file]);
    await appendFile(file, "export const more = 1;\n");
    await utimes(file, new Date(1_700_000_000_000), new Date(1_700_000_000_000));
    expect(isBuildCacheStamp(before, buildCacheStamp([file]))).toBe(false);
  });

  test("misses an entry written before the stamp named its producing files", async () => {
    const file = await makeProducer();
    const { code: _, ...older } = buildCacheStamp([file]);
    expect(isBuildCacheStamp(older, buildCacheStamp([file]))).toBe(false);
  });
});
