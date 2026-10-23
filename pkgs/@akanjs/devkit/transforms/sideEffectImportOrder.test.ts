import { describe, expect, test } from "bun:test";
import path from "node:path";
import { tempDirs, writeText } from "../testHelpers";
import { SideEffectImportOrder } from "./sideEffectImportOrder";

const makeTempRoot = tempDirs("akan-devkit-side-effect-order-");

const writePackage = async (root: string, name: string, files: Record<string, string>, manifest = {}) => {
  await writeText(
    path.join(root, "node_modules", name, "package.json"),
    `${JSON.stringify({ name, main: "index.js", ...manifest })}\n`,
  );
  for (const [file, source] of Object.entries(files))
    await writeText(path.join(root, "node_modules", name, file), source);
};

//? Prism's shape: a CommonJS core that sets a global, then language files that read it, imported only by `import()`.
const writeHighlighter = async (root: string) => {
  await writePackage(root, "core", {
    "index.js": "var Core = { langs: [] };\nglobalThis.Core = Core;\nmodule.exports = Core;\n",
    "components/a.js": 'Core.langs.push("a");\n',
  });
  await writePackage(
    root,
    "highlight",
    {
      "index.js": 'import "core";\nimport "core/components/a.js";\nexport const langs = () => globalThis.Core.langs;\n',
    },
    { type: "module" },
  );
  const entry = path.join(root, "entry.ts");
  await writeText(entry, 'import("highlight").then(({ langs }) => console.info(JSON.stringify(langs())));\n');
  return entry;
};

const bundle = async (entry: string, plugins = [SideEffectImportOrder.plugin()]) => {
  const result = await Bun.build({ entrypoints: [entry], target: "browser", splitting: false, minify: true, plugins });
  expect(result.success).toBe(true);
  return (await result.outputs[0]?.text()) ?? "";
};

const run = async (root: string, code: string) => {
  const outFile = path.join(root, "out.js");
  await Bun.write(outFile, code);
  const proc = Bun.spawn([process.execPath, outFile], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout: stdout.trim(), stderr };
};

describe("SideEffectImportOrder", () => {
  test("runs a CommonJS side-effect import before the imports after it in a module only import() reaches", async () => {
    const root = await makeTempRoot();

    const { stdout, stderr } = await run(root, await bundle(await writeHighlighter(root)));

    expect(stderr).toBe("");
    expect(stdout).toBe('["a"]');
  });

  //? A shim would keep what the bundler drops: a bare import of a module its package declares free of side effects.
  test("bundles bare imports of ES modules, and of modules a package calls pure, as it would without the plugin", async () => {
    const root = await makeTempRoot();
    await writePackage(
      root,
      "chunks",
      {
        "index.js": 'import "./a.js";\nexport const a = () => globalThis.a;\n',
        "a.js": 'globalThis.a = "chunk";\nexport {};\n',
      },
      { type: "module" },
    );
    await writePackage(
      root,
      "pure",
      {
        "index.js": 'import "./esm.js";\nimport "./cjs.cjs";\nexport const used = () => "used";\n',
        "esm.js": 'globalThis.esm = "PURE_ESM";\nexport {};\n',
        "cjs.cjs": 'globalThis.cjs = "PURE_CJS";\nmodule.exports = {};\n',
      },
      { type: "module", sideEffects: false },
    );
    const entry = path.join(root, "entry.ts");
    await writeText(
      entry,
      'import("chunks").then(({ a }) => console.info(a()));\nimport("pure").then(({ used }) => console.info(used()));\n',
    );

    const [plugged, plain] = [await bundle(entry), await bundle(entry, [])];

    expect(plugged).toBe(plain);
    expect(plugged).not.toContain("PURE_");
  });

  test("resolves a shimmed import as the bundler resolves the original, browser field included", async () => {
    const root = await makeTempRoot();
    await writePackage(
      root,
      "pick",
      {
        "index.js": 'globalThis.picked = "node";\nmodule.exports = {};\n',
        "browser.js": 'globalThis.picked = "browser";\nmodule.exports = {};\n',
      },
      { browser: "browser.js" },
    );
    await writePackage(
      root,
      "picker",
      { "index.js": 'import "pick";\nexport const picked = () => globalThis.picked;\n' },
      {
        type: "module",
      },
    );
    const entry = path.join(root, "entry.ts");
    await writeText(entry, 'import("picker").then(({ picked }) => console.info(picked()));\n');

    const { stdout } = await run(root, await bundle(entry));

    expect(stdout).toBe("browser");
  });

  //? How the CSR shell and every view build: their entry HTML lives only in the build's `files`.
  test("leaves an entry point a build hands in files to the bundler", async () => {
    const root = await makeTempRoot();
    await writeHighlighter(root);
    const html = path.join(root, "generated/index.html");
    const result = await Bun.build({
      entrypoints: [html],
      files: {
        [html]: '<!doctype html><html><body><script type="module" src="./boot.ts"></script></body></html>\n',
        [path.join(root, "generated/boot.ts")]:
          'import("highlight").then(({ langs }) => console.info(langs().join()));\n',
      },
      target: "browser",
      splitting: false,
      outdir: path.join(root, "out"),
      plugins: [SideEffectImportOrder.plugin()],
    });
    expect(result.success).toBe(true);
    const script = result.outputs.find((output) => output.path.endsWith(".js"));

    const { stdout, stderr } = await run(root, (await script?.text()) ?? "");

    expect(stderr).toBe("");
    expect(stdout).toBe("a");
  });

  //? An OTA release is keyed on the CSR bundle's hash, and a shim is named after its importer's absolute path.
  test("bundles a shimmed import identically from two checkout paths", async () => {
    const [first, second] = [await makeTempRoot(), await makeTempRoot()];

    const [firstOutput, secondOutput] = [
      await bundle(await writeHighlighter(first)),
      await bundle(await writeHighlighter(second)),
    ];

    expect(firstOutput).toBe(secondOutput);
    expect(firstOutput).not.toContain(path.basename(first));
  });

  test("points only a module's bare imports at their shims", async () => {
    const root = await makeTempRoot();
    await writePackage(root, "mod", {}, { type: "module" });
    const source = [
      'import "a";',
      'import"b";import { c } from "c";',
      'export * from "d";',
      'import "e" with { type: "json" };',
      'const text = `import "f";`;',
    ];

    const rewritten = await SideEffectImportOrder.rewrite(source.join("\n"), path.join(root, "node_modules/mod/x.js"));

    expect(rewritten).toBe(
      ['import "akan-side-effect:a";', 'import"akan-side-effect:b";import { c } from "c";', ...source.slice(2)].join(
        "\n",
      ),
    );
  });
});
