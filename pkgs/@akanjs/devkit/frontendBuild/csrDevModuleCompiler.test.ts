import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { App } from "../commandDecorators";
import { CsrDevModuleCompiler } from "./csrDevModuleCompiler";
import { CsrDevPaths } from "./csrDevPaths";
import { CsrDevResolver } from "./csrDevResolver";
import type { CsrDevCompiledModule, CsrDevContext } from "./csrDevTypes";

const context: CsrDevContext = {
  pageEntries: [],
  basePaths: [],
  htmlBasePaths: [],
  define: {},
  optimizeImports: [],
  configKey: "key",
  refreshFile: null,
};

//? esbuild's own interop helpers, as a pre-bundled chunk ships them (@mermaid-js/parser's dist/chunks).
const prebundled = `var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __reExport = (target, mod, secondTarget) => (__copyProps(target, mod, "default"), secondTarget && __copyProps(secondTarget, mod, "default"));
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target, mod));
var parts = {};
__reExport(parts, { a: 1 });
var wrapped = __toESM({ b: 2 });
export { parts, wrapped };
`;

//? The development checks jotai's and zustand's ESM builds ship, as written in jotai/esm/vanilla.mjs.
const jotai = `let keyCount = 0;
export function atom(read) {
  const key = \`atom\${++keyCount}\`;
  return {
    read,
    toString() {
      return (import.meta.env ? import.meta.env.MODE : void 0) !== "production" && this.debugLabel ? key + ":" + this.debugLabel : key;
    },
  };
}
`;
const zustand = `export const devtools = (fn) => (import.meta.env ? import.meta.env.MODE : void 0) !== "production" ? "dev" : fn;
`;

describe("CsrDevModuleCompiler", () => {
  let root: string;
  const origin = "http://localhost:8283";
  const file = (relative: string) => path.join(root, relative);
  const logged: string[] = [];
  const compile = async (relative: string | string[], { prepass = false }: { prepass?: boolean } = {}) => {
    const files = (Array.isArray(relative) ? relative : [relative]).map(file);
    const paths = new CsrDevPaths(root);
    const resolver = new CsrDevResolver({ paths, context, entryFiles: prepass ? files : [] });
    if (prepass) await resolver.prepass();
    const compiler = new CsrDevModuleCompiler({
      app: { verbose: () => undefined, logger: { error: (message: string) => logged.push(message) } } as unknown as App,
      paths,
      resolver,
      context,
      outDir: file("out"),
      routePrefix: "/_akan/registry/",
    });
    return { resolver, ...(await compiler.compile(files, new Set())) };
  };
  //? As the page runs a factory: a classic script whose only globals are the runtime and the window.
  const run = (module: CsrDevCompiledModule | undefined) => {
    const helpers = new Map<string, Record<string, unknown>>();
    const akan = {
      defineHelpers: (hash: string, define: () => Record<string, unknown>) => helpers.set(hash, define()),
      helpers: (hash: string) => helpers.get(hash),
    };
    if (module?.helpers) new Function("__akan", module.helpers.definition)(akan);
    const factory = new Function("__akan", "self", `return (${module?.factory});`)(akan, {
      location: { href: `${origin}/en/dashboard` },
    });
    const record = { exports: {} as Record<string, unknown> };
    factory.call(
      record.exports,
      () => ({}),
      record,
      record.exports,
      () => undefined,
      () => (type: unknown) => type,
      async () => ({}),
    );
    return record.exports;
  };

  beforeAll(async () => {
    root = CsrDevPaths.realpath(await mkdtemp(path.join(os.tmpdir(), "akan-csr-dev-compiler-")));
    await Bun.write(file("node_modules/prebundled/chunk.mjs"), prebundled);
    await Bun.write(file("node_modules/bare-reexport/index.mjs"), "export const parts = __reExport({}, { a: 1 });\n");
    await Bun.write(file("node_modules/bare-toesm/index.mjs"), "export const wrapped = __toESM({ b: 2 });\n");
    await Bun.write(file("node_modules/jotai/esm/vanilla.mjs"), jotai);
    await Bun.write(file("node_modules/zustand/esm/middleware.mjs"), zustand);
    await Bun.write(
      file("apps/demo/ui/meta.ts"),
      [
        "export const url = import.meta.url;",
        "export const env = import.meta.env;",
        'export const asset = new URL("./x.wasm", import.meta.url).href;',
        'export const label = "import.meta.env";',
        "",
      ].join("\n"),
    );
    //? The shape of an app's useClient.ts: a macro whose module graph reaches server code that reads import.meta.
    await Bun.write(
      file("apps/demo/lib/macroDep.ts"),
      'import { createRequire } from "node:module";\nconst req = createRequire(import.meta.url);\nexport const depUrl = import.meta.url;\nexport const hasRequire = typeof req;\n',
    );
    await Bun.write(
      file("apps/demo/lib/macro.ts"),
      'import { depUrl, hasRequire } from "./macroDep";\nexport const serialized = () => ({ depUrl, hasRequire });\n',
    );
    await Bun.write(
      file("apps/demo/lib/useClient.ts"),
      [
        'import { used } from "barrel";',
        'import { serialized } from "./macro" with { type: "macro" };',
        "export const signal = serialized();",
        "export const own = import.meta.url;",
        'export const label = "import.meta.url";',
        "export const barrel = used;",
        "",
      ].join("\n"),
    );
    await Bun.write(file("node_modules/with-bin/index.mjs"), "#!/usr/bin/env node\nexport const a = 1;\n");
    await Bun.write(file("node_modules/awaits/index.mjs"), "export const a = await Promise.resolve(1);\n");
    await Bun.write(file("apps/demo/ui/awaits.ts"), "export const a = await Promise.resolve(1);\n");
    await Bun.write(
      file("node_modules/barrel/package.json"),
      JSON.stringify({
        name: "barrel",
        type: "module",
        main: "index.js",
        sideEffects: false,
        imports: {
          "#where": { node: "./where.node.js", default: "./where.browser.js" },
          "#other": { node: "./other.node.js", default: "./other.browser.js" },
        },
      }),
    );
    await Bun.write(
      file("node_modules/barrel/index.js"),
      'export { used } from "./used.js";\nexport { unused } from "./unused.js";\nexport { other } from "#other";\n',
    );
    await Bun.write(file("node_modules/barrel/used.js"), "export const used = 1;\n");
    await Bun.write(
      file("node_modules/barrel/unused.js"),
      'import { where } from "#where";\nexport const unused = where;\n',
    );
    await Bun.write(
      file("node_modules/barrel/where.node.js"),
      'import path from "node:path";\nexport const where = path.sep;\n',
    );
    await Bun.write(file("node_modules/barrel/where.browser.js"), 'export const where = "browser";\n');
    await Bun.write(
      file("node_modules/barrel/other.node.js"),
      'import path from "node:path";\nexport const other = path.sep;\n',
    );
    await Bun.write(file("node_modules/barrel/other.browser.js"), 'export const other = "browser";\n');
    await Bun.write(file("apps/demo/entry.ts"), 'import { used } from "barrel";\nexport const run = used;\n');
    await Bun.write(
      file("node_modules/inspectish/package.json"),
      JSON.stringify({ name: "inspectish", main: "index.js", browser: { "./util.inspect.js": false, fs: false } }),
    );
    await Bun.write(
      file("node_modules/inspectish/index.js"),
      'var inspect = require("./util.inspect");\nvar fs = require("fs");\nmodule.exports = { inspect, fs };\n',
    );
    await Bun.write(file("node_modules/inspectish/util.inspect.js"), 'module.exports = require("util").inspect;\n');
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test("a pre-bundled file keeps its own __reExport and __toESM, which Bun leaves in place of its own", async () => {
    const { modules } = await compile("node_modules/prebundled/chunk.mjs");
    const [module] = modules;
    expect(module?.id).toBe("node_modules/prebundled/chunk.mjs");
    const factory = module?.factory ?? "";
    expect(factory).toContain("var __reExport = (target, mod, secondTarget) => (");
    expect(factory).toContain("var __toESM = (mod, isNodeMode, target) => (");
    expect(factory).not.toContain("__akan.reExport");
    expect(factory).not.toContain("__akan.toESM");
    expect(factory).not.toContain("__akanMeta");
    expect(run(module)).toMatchObject({ parts: { a: 1 }, wrapped: { b: 2 } });
  });

  test.each([
    ["__reExport", "node_modules/bare-reexport/index.mjs"],
    ["__toESM", "node_modules/bare-toesm/index.mjs"],
  ])("a %s call with no definition anywhere still stops the build", async (name, relative) => {
    await expect(compile(relative)).rejects.toThrow(`Bun's ${name} helper no longer reads`);
  });

  test("jotai's and zustand's import.meta.env checks run as a classic script and take the ESM bundle's branch", async () => {
    const [{ modules: jotaiModules }, { modules: zustandModules }] = await Promise.all([
      compile("node_modules/jotai/esm/vanilla.mjs"),
      compile("node_modules/zustand/esm/middleware.mjs"),
    ]);
    const [jotaiModule] = jotaiModules;
    const [zustandModule] = zustandModules;
    expect(jotaiModule?.factory).not.toContain("import.meta");
    expect(zustandModule?.factory).not.toContain("import.meta");
    const labeled = Object.assign((run(jotaiModule).atom as (read: unknown) => object)(null), { debugLabel: "count" });
    expect(String(labeled)).toBe("atom1:count");
    expect((run(zustandModule).devtools as (fn: unknown) => unknown)("prod")).toBe("dev");
  });

  test("an app module reads import.meta as a browser module does, on its own path and with no env", async () => {
    const [module] = (await compile("apps/demo/ui/meta.ts")).modules;
    expect(module?.factory).not.toContain("file://");
    expect(run(module)).toEqual({
      url: `${origin}/apps/demo/ui/meta.ts`,
      env: undefined,
      asset: `${origin}/apps/demo/ui/x.wasm`,
      label: "import.meta.env",
    });
  });

  test("a macro runs with its modules' own import.meta, and the file importing it still reads the browser's", async () => {
    const { modules } = await compile("apps/demo/lib/useClient.ts", { prepass: true });
    const module = modules.find((compiled) => compiled.id === "apps/demo/lib/useClient.ts");
    expect(module?.deps.some((dep) => dep.includes(`${path.join("node_modules", "barrel")}${path.sep}`))).toBe(true);
    expect(run(module)).toMatchObject({
      signal: { depUrl: Bun.pathToFileURL(file("apps/demo/lib/macroDep.ts")).href, hasRequire: "function" },
      own: `${origin}/apps/demo/lib/useClient.ts`,
      label: "import.meta.url",
    });
  });

  test("a file or re-export the browser build tree-shook away resolves with the browser condition", async () => {
    const { modules, resolver } = await compile("apps/demo/entry.ts", { prepass: true });
    const ids = modules.map((module) => module.id);
    expect(ids).toContain("node_modules/barrel/unused.js");
    expect(ids).toContain("node_modules/barrel/where.browser.js");
    expect(ids).not.toContain("node_modules/barrel/where.node.js");
    expect(ids).toContain("node_modules/barrel/other.browser.js");
    expect(ids).not.toContain("node_modules/barrel/other.node.js");
    expect([...resolver.fallbacks]).toEqual([]);
  });

  test("what a package's browser field maps to false is an empty stub, not the file or the Node built-in", async () => {
    const { modules } = await compile("node_modules/inspectish/index.js");
    expect(modules.map((module) => module.id)).toEqual(["node_modules/inspectish/index.js"]);
    expect(modules[0]?.deps.sort()).toEqual(["stub:empty:fs", "stub:empty:node_modules/inspectish/util.inspect.js"]);
  });

  test("a package's #! line is a comment in its factory, so the package loads", async () => {
    const [module] = (await compile("node_modules/with-bin/index.mjs")).modules;
    expect(module?.factory).not.toContain("#!");
    expect(run(module)).toEqual({ a: 1 });
  });

  test("a package file Bun cannot build as CommonJS is left out, named in the log, and the rest still builds", async () => {
    logged.length = 0;
    const { modules } = await compile(["node_modules/awaits/index.mjs", "node_modules/zustand/esm/middleware.mjs"]);
    const left = modules.find((module) => module.id === "node_modules/awaits/index.mjs");
    expect(modules.map((module) => module.id)).toContain("node_modules/zustand/esm/middleware.mjs");
    expect(left?.deps).toEqual([]);
    expect(() => run(left)).toThrow(
      "[akan-csr] node_modules/awaits/index.mjs was left out of the dev registry: a top-level await",
    );
    expect(logged).toEqual([
      expect.stringContaining(
        "[csr-dev] node_modules/awaits/index.mjs is left out of the dev registry: a top-level await",
      ),
    ]);
    expect(logged[0]).toContain("(node_modules/awaits/index.mjs:1)");
  });

  test("app code Bun cannot build as CommonJS still fails the build with Bun's messages", async () => {
    const failure = await compile("apps/demo/ui/awaits.ts").catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(AggregateError);
    expect(String((failure as AggregateError).errors[0])).toContain('"await" can only be used');
  });
});
