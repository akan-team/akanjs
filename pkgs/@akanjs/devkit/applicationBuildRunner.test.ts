import { describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AKAN_BACKEND_MINIFY, AKAN_OPTIONAL_BACKEND_EXTERNALS } from "./applicationBuildRunner";

describe("ApplicationBuildRunner", () => {
  test("externalizes Akan optional backend dependencies", () => {
    expect(AKAN_OPTIONAL_BACKEND_EXTERNALS).toEqual(
      expect.arrayContaining(["@libsql/client", "bullmq", "ioredis", "postgres", "protobufjs"]),
    );
  });

  test("keeps backend identifiers so a class names its own logger and stack frames", () => {
    expect(AKAN_BACKEND_MINIFY.identifiers).toBe(false);
    expect(AKAN_BACKEND_MINIFY.whitespace).toBe(true);
    expect(AKAN_BACKEND_MINIFY.syntax).toBe(true);
  });

  test("a bundler that mangles identifiers loses the class name a Logger reads", async () => {
    const dir = path.join(os.tmpdir(), `akan-minify-${Bun.randomUUIDv7()}`);
    const entry = path.join(dir, "entry.ts");
    await Bun.write(
      entry,
      `const serve = () => class Service { readonly name = this.constructor.name; };
export class SampleService extends serve() {}
console.info(new SampleService().name);
`,
    );
    const build = async (minify: Bun.BuildConfig["minify"]) => {
      const result = await Bun.build({ entrypoints: [entry], target: "bun", minify, outdir: path.join(dir, "out") });
      expect(result.success).toBe(true);
      const proc = Bun.spawn([process.execPath, result.outputs[0].path], { stdout: "pipe" });
      return (await new Response(proc.stdout).text()).trim();
    };
    try {
      expect(await build(AKAN_BACKEND_MINIFY)).toBe("SampleService");
      expect(await build(true)).not.toBe("SampleService");
      // Bun 1.4.2 accepts `keepNames` and ignores it; drop this expectation once it keeps the name.
      expect(await build({ whitespace: true, syntax: true, identifiers: true, keepNames: true })).not.toBe(
        "SampleService",
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
