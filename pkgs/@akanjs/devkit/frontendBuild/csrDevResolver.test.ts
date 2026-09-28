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

  test("the resolution build clears a runtime resolution it records itself, so a sibling may reuse it again", async () => {
    await Bun.write(
      file("apps/demo/ui/Fresh.tsx"),
      'import * as fresh from "fresh";\nexport const Fresh = () => fresh;\n',
    );
    const prepassed = new CsrDevResolver({
      paths,
      context,
      entryFiles: [file("apps/demo/ui/Fresh.tsx")],
      runtimeResolved: { "apps/demo/ui/Fresh.tsx": ["fresh"] },
    });
    await prepassed.prepass();
    expect(prepassed.serializeRuntimeResolved()).toEqual({});
  });

  test("a relative import follows a file moved into a folder or renamed, which Bun's resolver cache does not", async () => {
    const card = file("apps/demo/ui/Card.tsx");
    await Bun.write(file("apps/demo/ui/Moved.tsx"), "export {};\n");
    await Bun.write(file("apps/demo/ui/renamed.ts"), "export {};\n");
    expect(CsrDevPaths.tryResolve("./Moved", path.dirname(card))).toBe(file("apps/demo/ui/Moved.tsx"));
    expect(CsrDevPaths.tryResolve("./renamed", path.dirname(card))).toBe(file("apps/demo/ui/renamed.ts"));
    await rm(file("apps/demo/ui/Moved.tsx"));
    await Bun.write(file("apps/demo/ui/Moved/index.tsx"), "export {};\n");
    await rm(file("apps/demo/ui/renamed.ts"));
    await Bun.write(file("apps/demo/ui/renamed.tsx"), "export {};\n");

    expect(resolver().resolve(card, "./Moved")).toBe(file("apps/demo/ui/Moved/index.tsx"));
    expect(resolver().resolve(card, "./renamed")).toBe(file("apps/demo/ui/renamed.tsx"));
    expect(() => resolver().resolve(card, "./Missing")).toThrow('cannot resolve "./Missing"');
  });

  test("a recorded target moved away since is reused by no sibling, nor by its importer, nor kept in the graph", () => {
    const stale = new CsrDevResolver({
      paths,
      context,
      entryFiles: [],
      resolution: {
        "node_modules/pkg/a.js": { dep: "node_modules/dep/old.js" },
        "node_modules/pkg/b.js": { dep: "node_modules/dep/old.js" },
      },
    });
    expect(stale.resolve(file("node_modules/pkg/b.js"), "dep")).toBeNull();
    expect(stale.serialize()).toEqual({ "node_modules/pkg/a.js": {}, "node_modules/pkg/b.js": {} });
  });

  test("a new package in the user's code asks for the resolution build, and a typo fails like a missing file", () => {
    expect(resolver().resolve(file("apps/demo/ui/Card.tsx"), "fresh")).toBeNull();
    expect(() => resolver().resolve(file("apps/demo/ui/Card.tsx"), "frseh")).toThrow('cannot resolve "frseh"');
    expect(resolver().resolve(file("node_modules/pkg/b.js"), "frseh")).toBeNull();
  });
});

describe("CsrDevPaths.resolveOnDisk", () => {
  let root: string;
  const at = (relative: string) => path.join(root, relative);

  beforeAll(async () => {
    root = CsrDevPaths.realpath(await mkdtemp(path.join(os.tmpdir(), "akan-csr-dev-disk-")));
    for (const relative of [
      "pair/x.js",
      "pair/x.mjs",
      "fields/b.js",
      "fields/m.js",
      "fields/main.js",
      "fields/index.js",
      "dirmain/lib/index.js",
      "dirmain/index.js",
      "shadow/Foo/index.tsx",
      "shadow/Page.tsx",
      "sibling/x.ts",
      "sibling/Page.tsx",
      "slash/Foo/index.ts",
      "slash/Foo.ts",
      "slash/Page.tsx",
      "req/index.js",
      "req/main.js",
      "req/m.js",
      "modonly/index.js",
      "modonly/m.js",
      "dot/Foo.tsx",
      "dot/Foo/index.tsx",
      "dot/Foo/Sub/x.ts",
      "bmap/lib/server.ts",
      "bmap/lib/client.ts",
      "bmap/entry.ts",
    ])
      await Bun.write(at(relative), "export {};\n");
    await Bun.write(at("fields/package.json"), '{ "browser": "b.js", "module": "m.js", "main": "main.js" }');
    await Bun.write(at("dirmain/package.json"), '{ "main": "lib" }');
    await Bun.write(at("req/package.json"), '{ "module": "m.js", "main": "main.js" }');
    await Bun.write(at("modonly/package.json"), '{ "module": "m.js" }');
    await Bun.write(at("bmap/package.json"), '{ "browser": { "./lib/server.ts": "./lib/client.ts" } }');
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test("weighs extensions as Bun's browser build does, a require call apart from an import", () => {
    expect(CsrDevPaths.resolveOnDisk(at("pair/x"))).toBe(at("pair/x.mjs"));
    expect(CsrDevPaths.resolveOnDisk(at("pair/x"), "require")).toBe(at("pair/x.js"));
  });

  test("enters a folder through browser, then module, then main (which may name a folder), then index", () => {
    expect(CsrDevPaths.resolveOnDisk(at("fields"))).toBe(at("fields/b.js"));
    expect(CsrDevPaths.resolveOnDisk(at("dirmain"))).toBe(at("dirmain/lib/index.js"));
  });

  test("a require call reads no module field: main when there is one, otherwise the index", () => {
    expect(CsrDevPaths.resolveOnDisk(at("req"))).toBe(at("req/m.js"));
    expect(CsrDevPaths.resolveOnDisk(at("req"), "require")).toBe(at("req/main.js"));
    expect(CsrDevPaths.resolveOnDisk(at("modonly"), "require")).toBe(at("modonly/index.js"));
  });

  test("a bare import Bun cannot resolve here goes to a worker only when its package landed after this process began", async () => {
    //? A package Bun's resolver misses in this process: it keeps node_modules listings, so one added by `bun add` while
    //? the builder runs looks like this until a fresh process reads it.
    await Bun.write(at("inst/node_modules/half/package.json"), '{ "name": "half", "main": "missing.js" }');
    await Bun.write(at("inst/src/a.ts"), 'import "half";\n');
    const started = (startedAt: number) =>
      new CsrDevResolver({ paths: new CsrDevPaths(root), context, entryFiles: [], startedAt });
    const before = started(Date.now() - 60_000);
    expect(before.resolve(at("inst/src/a.ts"), "half")).toBeNull();
    expect(before.resolve(at("inst/src/a.ts"), "half/formatt")).toBeNull();
    expect(() => before.resolve(at("inst/src/a.ts"), "nowhere-to-be-found")).toThrow("cannot resolve");
    //? Installed before the builder started: its listing is Bun's, so a miss is a typo or a half-typed import.
    const after = started(Date.now() + 60_000);
    expect(() => after.resolve(at("inst/src/a.ts"), "half/formatt")).toThrow("cannot resolve");
  });

  test('"." and ".." name the folder alone, as a trailing slash does', () => {
    expect(CsrDevPaths.resolveRelative(at("dot/Foo"), ".")).toBe(at("dot/Foo/index.tsx"));
    expect(CsrDevPaths.resolveRelative(at("dot/Foo/Sub"), "..")).toBe(at("dot/Foo/index.tsx"));
  });

  test("app code under a package.json that maps files with a browser object keeps the recorded answer", () => {
    const resolver = new CsrDevResolver({
      paths: new CsrDevPaths(root),
      context,
      entryFiles: [],
      resolution: { "bmap/entry.ts": { "./lib/server": "bmap/lib/client.ts" } },
    });
    expect(resolver.resolve(at("bmap/entry.ts"), "./lib/server")).toBe(at("bmap/lib/client.ts"));
  });

  test("a specifier ending in a slash names the folder alone", () => {
    expect(CsrDevPaths.resolveRelative(at("slash"), "./Foo/")).toBe(at("slash/Foo/index.ts"));
    expect(CsrDevPaths.resolveRelative(at("slash"), "./Foo")).toBe(at("slash/Foo.ts"));
  });

  test("a recorded relative resolution stands while the disk resolves it the same way", async () => {
    const paths = new CsrDevPaths(root);
    const resolver = new CsrDevResolver({
      paths,
      context,
      entryFiles: [],
      resolution: {
        "shadow/Page.tsx": { "./Foo": "shadow/Foo/index.tsx" },
        "pair/entry.ts": { "./x": "pair/x.js" },
      },
    });
    expect(resolver.resolve(at("pair/entry.ts"), "./x", "require")).toBe(at("pair/x.js"));
    expect(resolver.resolve(at("pair/entry.ts"), "./x")).toBe(at("pair/x.mjs"));
    expect(resolver.resolve(at("shadow/Page.tsx"), "./Foo")).toBe(at("shadow/Foo/index.tsx"));
    await Bun.write(at("shadow/Foo.tsx"), "export {};\n");
    expect(resolver.resolve(at("shadow/Page.tsx"), "./Foo")).toBe(at("shadow/Foo.tsx"));
  });

  test("a sibling with a stronger extension takes over a recorded import", async () => {
    const resolver = new CsrDevResolver({
      paths: new CsrDevPaths(root),
      context,
      entryFiles: [],
      resolution: { "sibling/Page.tsx": { "./x": "sibling/x.ts" } },
    });
    expect(resolver.resolve(at("sibling/Page.tsx"), "./x")).toBe(at("sibling/x.ts"));
    await Bun.write(at("sibling/x.tsx"), "export {};\n");
    expect(resolver.resolve(at("sibling/Page.tsx"), "./x")).toBe(at("sibling/x.tsx"));
  });
});
