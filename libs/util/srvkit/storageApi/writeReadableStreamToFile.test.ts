import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeReadableStreamToFile } from "./writeReadableStreamToFile";

describe("writeReadableStreamToFile", () => {
  test("creates the folders a fresh data folder does not have yet", async () => {
    const root = await mkdtemp(join(tmpdir(), "akan-stream-"));
    try {
      const target = join(root, "local", "app", "backend", "memo", "a.txt");
      const written = await writeReadableStreamToFile(target, new Response("hello").body as ReadableStream);
      expect(written).toBe(5);
      expect(await readFile(target, "utf8")).toBe("hello");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
