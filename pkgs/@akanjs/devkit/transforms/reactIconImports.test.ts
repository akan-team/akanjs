import { describe, expect, test } from "bun:test";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { IconType } from "react-icons";
import { printedInOwnProcess, tempDirs, writeText } from "../test/testHelpers";
import { ReactIconImports } from "./reactIconImports";

const makeTempRoot = tempDirs("akan-react-icons-");

const iconOf = (name: string, d: string) =>
  `export function ${name} (props) {\n  return GenIcon({"tag":"svg","attr":{"viewBox":"0 0 24 24"},"child":[{"tag":"path","attr":{"d":"${d}"},"child":[]}]})(props);\n};\n`;

const writeIconPackage = async (root: string) => {
  const pkg = path.join(root, "node_modules", "react-icons");
  await writeText(
    path.join(pkg, "package.json"),
    JSON.stringify({
      name: "react-icons",
      sideEffects: false,
      exports: { "./lib": "./lib/index.mjs", "./bi": "./bi/index.mjs", "./xx": "./xx/index.mjs" },
    }),
  );
  await writeText(
    path.join(pkg, "lib", "index.mjs"),
    "export const GenIcon = (data) => (props) => ({ data, props });\n",
  );
  await writeText(
    path.join(pkg, "bi", "index.mjs"),
    `// THIS FILE IS AUTO GENERATED\nimport { GenIcon } from '../lib/index.mjs';\n${iconOf("BiAlpha", "alpha")}${iconOf("BiBeta", "beta")}${iconOf("BiGamma", "gamma")}`,
  );
  await writeText(
    path.join(pkg, "xx", "index.mjs"),
    `import { GenIcon } from '../lib/index.mjs';\nconst shared = 1;\n${iconOf("XxAlpha", "x")}`,
  );
};

const setUp = async () => {
  const root = await makeTempRoot();
  await writeIconPackage(root);
  return { icons: new ReactIconImports(path.join(root, "out")), importer: path.join(root, "src", "page.tsx") };
};

describe("ReactIconImports", () => {
  test("imports the icons a file names from one module of that file's own, drawing the same icons", async () => {
    const { icons, importer } = await setUp();
    const source = 'import { BiAlpha, BiBeta as Beta } from "react-icons/bi";\nexport const list = [BiAlpha, Beta];\n';
    const file = await icons.fileOf("react-icons/bi", ["BiAlpha", "BiBeta"], importer);
    expect(await icons.rewrite(source, importer)).toBe(
      `import { BiAlpha, BiBeta as Beta } from ${JSON.stringify(file)};\nexport const list = [BiAlpha, Beta];\n`,
    );
    const cut = await import(file ?? "");
    expect(cut.BiAlpha({ size: 3 })).toEqual({ data: expect.objectContaining({ tag: "svg" }), props: { size: 3 } });
    expect(cut.BiBeta({}).data.child[0].attr.d).toBe("beta");
    expect(await Bun.file(file ?? "").text()).not.toContain("gamma");
    const other = await icons.fileOf(
      "react-icons/bi",
      ["BiAlpha", "BiBeta"],
      path.join(path.dirname(importer), "other.tsx"),
    );
    expect(other).not.toBe(file);
  });

  test("keeps every line where it was, and names it cannot cut on the set", async () => {
    const { icons, importer } = await setUp();
    const source = [
      "import {",
      "  BiAlpha,",
      "  BiMissing,",
      "  type BiType,",
      '} from "react-icons/bi";',
      "export const list = [BiAlpha, BiMissing];",
    ].join("\n");
    const alpha = await icons.fileOf("react-icons/bi", ["BiAlpha"], importer);
    const rewritten = await icons.rewrite(source, importer);
    expect(rewritten).toBe(
      `import { BiMissing, type BiType } from "react-icons/bi"; import { BiAlpha } from ${JSON.stringify(alpha)};\n\n\n\n\nexport const list = [BiAlpha, BiMissing];`,
    );
    expect(rewritten?.split("\n")).toHaveLength(source.split("\n").length);
  });

  test("leaves a namespace, default, type-only or re-export import, and a module that is no set, as written", async () => {
    const { icons, importer } = await setUp();
    const source = [
      'import * as Bi from "react-icons/bi";',
      'import BiDefault from "react-icons/bi";',
      'import type { BiAlpha as AlphaType } from "react-icons/bi";',
      'export { BiBeta } from "react-icons/bi";',
      'import { GenIcon } from "react-icons/lib";',
      'import { XxAlpha } from "react-icons/xx";',
      'import { BiGamma } from "react-icons/none";',
      "const text = 'import { BiAlpha } from \"react-icons/bi\"';",
    ].join("\n");
    expect(await icons.rewrite(source, importer)).toBeNull();
    expect(await icons.fileOf("react-icons/xx", ["XxAlpha"], importer)).toBeNull();
    expect(await icons.fileOf("react-icons/bi", ["BiAlpha", "BiMissing"], importer)).toBeNull();
  });

  test("hands the rewritten source to the next transform, and keeps it when that one has nothing to change", async () => {
    const { icons, importer } = await setUp();
    const source = 'import { BiGamma } from "react-icons/bi";\n';
    const seen: string[] = [];
    const rewritten = await icons.pipe((code) => {
      seen.push(code);
      return null;
    })(source, { path: importer });
    expect(seen).toEqual([rewritten ?? ""]);
    const gamma = await icons.fileOf("react-icons/bi", ["BiGamma"], importer);
    expect(rewritten).toBe(`import { BiGamma } from ${JSON.stringify(gamma)};\n`);
    expect(await icons.pipe((code) => `${code}// next`)("export {};\n", { path: importer })).toBe(
      "export {};\n// next",
    );
  });

  test("cuts icons of the installed package that differ only in case into two files, each drawing as the set does", async () => {
    const root = await makeTempRoot();
    const icons = new ReactIconImports(root);
    const importer = path.join(import.meta.dir, "page.tsx");
    const names = ["ImPagebreak", "ImPageBreak"];
    const files = await Promise.all(names.map((name) => icons.fileOf("react-icons/im", [name], importer)));
    expect(new Set(files.map((file) => file?.toLowerCase())).size).toBe(2);
    const set = (await import("react-icons/im")) as unknown as Record<string, IconType>;
    for (const [idx, name] of names.entries()) {
      const one = (await import(files[idx] ?? ""))[name] as IconType;
      const props = { size: 20, className: "icon", title: name };
      expect(renderToStaticMarkup(createElement(one, props))).toBe(
        renderToStaticMarkup(createElement(set[name] as IconType, props)),
      );
    }
  });

  test("bundles a file's icons into its own output and no shared chunk, where the set shares every named icon", async () => {
    const root = await makeTempRoot();
    await writeIconPackage(root);
    await writeText(
      path.join(root, "src", "a.ts"),
      'import { BiAlpha } from "react-icons/bi";\nexport const a = BiAlpha;\n',
    );
    await writeText(
      path.join(root, "src", "b.ts"),
      'import { BiBeta } from "react-icons/bi";\nexport const b = BiBeta;\n',
    );
    await writeText(
      path.join(root, "src", "c.ts"),
      'import { BiAlpha, BiBeta } from "react-icons/bi";\nexport const c = [BiAlpha, BiBeta];\n',
    );
    const dir = JSON.stringify(import.meta.dir);
    const loaded = await printedInOwnProcess(
      `
const path = await import("node:path");
const fs = await import("node:fs");
const { ReactIconImports } = await import(path.join(${dir}, "reactIconImports.ts"));
const root = ${JSON.stringify(root)};
const closureOf = (outdir, file) => {
  const text = fs.readFileSync(path.join(outdir, file), "utf8");
  const chunks = [...text.matchAll(/(?:from|import)\\s*["']\\.\\/([^"']+)["']/g)].map((match) => match[1]);
  return [text, ...chunks.map((chunk) => closureOf(outdir, chunk))].join("\\n");
};
const build = async (cut) => {
  const icons = new ReactIconImports(path.join(root, "generated"));
  await icons.fileOf("react-icons/bi", ["BiGamma"], path.join(root, "src", "a.ts"));
  const outdir = path.join(root, cut ? "cut" : "whole");
  const rewrite = {
    name: "rewrite",
    setup: (bundle) =>
      bundle.onLoad({ filter: /[\\\\/]src[\\\\/]/ }, async (args) => {
        const source = await Bun.file(args.path).text();
        return { contents: (await icons.rewrite(source, args.path)) ?? source, loader: "ts" };
      }),
  };
  const result = await Bun.build({
    entrypoints: ["a", "b", "c"].map((name) => path.join(root, "src", name + ".ts")),
    outdir,
    splitting: true,
    format: "esm",
    target: "browser",
    plugins: cut ? [icons.plugin, rewrite] : [],
  });
  if (!result.success) throw new Error(result.logs.join("\\n"));
  const drawn = (text) => ["alpha", "beta", "gamma"].filter((d) => text.includes('"' + d + '"'));
  const chunks = fs.readdirSync(outdir).filter((file) => !["a.js", "b.js", "c.js"].includes(file));
  return {
    ...Object.fromEntries(["a", "b", "c"].map((name) => [name, drawn(closureOf(outdir, name + ".js"))])),
    sharedIconChunks: chunks.filter((file) => drawn(fs.readFileSync(path.join(outdir, file), "utf8")).length > 0).length,
  };
};
console.log(JSON.stringify({ whole: await build(false), cut: await build(true) }));
`,
      root,
    );
    expect(loaded).toEqual({
      whole: { a: ["alpha", "beta"], b: ["alpha", "beta"], c: ["alpha", "beta"], sharedIconChunks: 1 },
      cut: { a: ["alpha"], b: ["beta"], c: ["alpha", "beta"], sharedIconChunks: 0 },
    });
  });
});
