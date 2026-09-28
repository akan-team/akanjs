import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CsrDevPaths } from "./csrDevPaths";
import { CsrDevResolver } from "./csrDevResolver";
import type { CsrDevContext } from "./csrDevTypes";

const context: CsrDevContext = {
  pageEntries: [],
  basePaths: [],
  htmlBasePaths: [],
  define: {},
  optimizeImports: [],
  configKey: "key",
  refreshFile: null,
};

describe("CsrDevResolver before its resolution build", () => {
  let root: string;
  let paths: CsrDevPaths;
  const file = (relative: string) => path.join(paths.root, relative);
  const resolver = (runtimeResolved: Record<string, string[]> = {}) =>
    new CsrDevResolver({
      paths,
      context,
      entryFiles: [],
      resolution: { "node_modules/pkg/a.js": { dep: "node_modules/dep/index.js" } },
      runtimeResolved,
    });

  beforeAll(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "akan-csr-dev-resolver-"));
    for (const relative of [
      "apps/demo/ui/Card.tsx",
      "node_modules/pkg/a.js",
      "node_modules/pkg/b.js",
      "node_modules/dep/index.js",
      "node_modules/fresh/index.js",
    ])
      await Bun.write(path.join(root, relative), "export {};\n");
    await Bun.write(path.join(root, "node_modules/fresh/package.json"), '{ "name": "fresh", "main": "index.js" }');
    paths = new CsrDevPaths(root);
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test("a file of the same package reuses what the browser build resolved for a sibling", () => {
    expect(resolver().resolve(file("node_modules/pkg/b.js"), "dep")).toBe(file("node_modules/dep/index.js"));
  });

  test("but not what Bun's runtime resolver found for it: that ignores the browser condition", () => {
    const withFallback = resolver({ "node_modules/pkg/a.js": ["dep"] });
    expect(withFallback.resolve(file("node_modules/pkg/b.js"), "dep")).toBeNull();
    expect(withFallback.serializeRuntimeResolved()).toEqual({ "node_modules/pkg/a.js": ["dep"] });
  });

  test("a new package in the user's code asks for the resolution build, and a typo fails like a missing file", () => {
    expect(resolver().resolve(file("apps/demo/ui/Card.tsx"), "fresh")).toBeNull();
    expect(() => resolver().resolve(file("apps/demo/ui/Card.tsx"), "frseh")).toThrow('cannot resolve "frseh"');
    expect(resolver().resolve(file("node_modules/pkg/b.js"), "frseh")).toBeNull();
  });
});
