import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

//* Pins the Bun behaviour CsrDevBundler is built on, so a Bun upgrade that changes it fails here, not in a browser.
describe("Bun output the CSR registry bundle relies on", () => {
  let dir: string;
  const externalizeAll = {
    name: "externalize-all",
    setup(build: Bun.PluginBuilder) {
      build.onResolve({ filter: /.*/ }, (args) =>
        args.kind === "entry-point-build" ? undefined : { path: `akan-module:${args.path}`, external: true },
      );
    },
  };

  beforeAll(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "akan-csr-dev-bundler-"));
    await Bun.write(path.join(dir, "a.ts"), "export const a = 1;\n");
    await Bun.write(
      path.join(dir, "entry.ts"),
      'import value from "./a";\nexport * from "./a";\nexport const lazy = () => import("./a");\nconsole.log(value);\n',
    );
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const build = async (entrypoints: string[]) =>
    await Bun.build({
      entrypoints: entrypoints.map((file) => path.join(dir, file)),
      root: dir,
      target: "browser",
      format: "cjs",
      naming: { entry: "[dir]/[name].[ext]" },
      plugins: [externalizeAll],
    });

  test("the CJS helpers keep the shapes CsrDevBundler rewrites", async () => {
    const [output] = (await build(["entry.ts"])).outputs;
    const code = (await output?.text()) ?? "";
    expect(code).toContain("var __toESM = (mod, isNodeMode, target) => {");
    expect(code).toContain("var __reExport = (target, mod, secondTarget) => {");
    expect(code).toContain('require("akan-module:./a")');
    expect(code).toContain('import("akan-module:./a")');
  });

  test("the helper preamble ends at the first path comment and names no factory argument", async () => {
    const [output] = (await build(["entry.ts"])).outputs;
    const code = (await output?.text()) ?? "";
    const marker = code.search(/^\/\/ /m);
    expect(marker).toBeGreaterThan(0);
    const preamble = code.slice(0, marker);
    expect(preamble).toMatch(/^var __toESM = /m);
    expect(preamble).not.toMatch(/(?<![\w$.])(?:require|module|exports)(?![\w$]|\s*:)/);
  });

  test("a relative import of another entrypoint in the same build stays external", async () => {
    const outputs = (await build(["entry.ts", "a.ts"])).outputs;
    const entry = await outputs.find((output) => output.path.includes("entry"))?.text();
    expect(entry).toContain('require("akan-module:./a")');
    expect(entry).not.toContain("var a = 1");
  });
});
