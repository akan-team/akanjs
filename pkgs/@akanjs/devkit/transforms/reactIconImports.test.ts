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
  const bi = ["alpha", "beta", "gamma", "delta"].map((d) => iconOf(`Bi${d[0]?.toUpperCase()}${d.slice(1)}`, d));
  await writeText(
    path.join(pkg, "bi", "index.mjs"),
    `// THIS FILE IS AUTO GENERATED\nimport { GenIcon } from '../lib/index.mjs';\n${bi.join("")}`,
  );
  await writeText(
    path.join(pkg, "xx", "index.mjs"),
    `import { GenIcon } from '../lib/index.mjs';\nconst shared = 1;\n${iconOf("XxAlpha", "x")}`,
  );
};

const importOf = (names: string[], name: string) =>
  `import { ${names.join(", ")} } from "react-icons/bi";\nexport const ${name} = [${names.join(", ")}];\n`;

const setUp = async () => {
  const root = await makeTempRoot();
  await writeIconPackage(root);
  const app = path.join(root, "app");
  const files = {
    page: path.join(app, "page.tsx"),
    other: path.join(app, "other.tsx"),
    lib: path.join(root, "libs", "ui", "Card.tsx"),
  };
  await writeText(files.page, importOf(["BiAlpha", "BiBeta"], "page"));
  await writeText(files.other, importOf(["BiAlpha"], "other"));
  await writeText(files.lib, importOf(["BiBeta", "BiGamma"], "card"));
  return { icons: new ReactIconImports(path.join(root, "out"), app, [path.join(root, "libs")]), ...files };
};

const drawnBy = async (file: string | null) => {
  const text = await Bun.file(file ?? "").text();
  return ["alpha", "beta", "gamma", "delta"].filter((d) => text.includes(`"d":"${d}"`));
};

describe("ReactIconImports", () => {
  test("puts an icon one file names with that file, one app files share in the app's module, one a library names in the shared module", async () => {
    const { icons, page, other, lib } = await setUp();
    const alpha = await icons.moduleOf("react-icons/bi", "BiAlpha", page);
    const beta = await icons.moduleOf("react-icons/bi", "BiBeta", page);
    const gamma = await icons.moduleOf("react-icons/bi", "BiGamma", lib);
    expect(await drawnBy(alpha)).toEqual(["alpha"]);
    expect(await drawnBy(beta)).toEqual(["beta"]);
    expect(await drawnBy(gamma)).toEqual(["gamma"]);
    expect(await icons.moduleOf("react-icons/bi", "BiAlpha", other)).toBe(alpha);
    expect(await icons.moduleOf("react-icons/bi", "BiBeta", lib)).toBe(beta);
    expect(new Set([alpha, beta, gamma]).size).toBe(3);
    const source = 'import { BiAlpha, BiBeta as Beta } from "react-icons/bi";\nexport const list = [BiAlpha, Beta];\n';
    expect(await icons.rewrite(source, page)).toBe(
      `import { BiAlpha } from ${JSON.stringify(alpha)}; import { BiBeta as Beta } from ${JSON.stringify(beta)};\nexport const list = [BiAlpha, Beta];\n`,
    );
    const cut = await import(alpha ?? "");
    expect(cut.BiAlpha({ size: 3 })).toEqual({ data: expect.objectContaining({ tag: "svg" }), props: { size: 3 } });
  });

  test("gives a file the census never read the module its icon already lives in, and an icon no file names one of its own", async () => {
    const { icons, page } = await setUp();
    const unread = path.join(path.dirname(page), "..", "elsewhere", "late.tsx");
    expect(await icons.moduleOf("react-icons/bi", "BiAlpha", unread)).toBe(
      await icons.moduleOf("react-icons/bi", "BiAlpha", page),
    );
    const delta = await icons.moduleOf("react-icons/bi", "BiDelta", unread);
    expect(await drawnBy(delta)).toEqual(["delta"]);
    expect(await icons.moduleOf("react-icons/bi", "BiDelta", page)).toBe(delta);
  });

  test("keeps every line where it was, and names it cannot cut on the set", async () => {
    const { icons, page } = await setUp();
    const source = [
      "import {",
      "  BiAlpha,",
      "  BiMissing,",
      "  type BiType,",
      '} from "react-icons/bi";',
      "export const list = [BiAlpha, BiMissing];",
    ].join("\n");
    const alpha = await icons.moduleOf("react-icons/bi", "BiAlpha", page);
    const rewritten = await icons.rewrite(source, page);
    expect(rewritten).toBe(
      `import { BiMissing, type BiType } from "react-icons/bi"; import { BiAlpha } from ${JSON.stringify(alpha)};\n\n\n\n\nexport const list = [BiAlpha, BiMissing];`,
    );
    expect(rewritten?.split("\n")).toHaveLength(source.split("\n").length);
  });

  test("leaves a namespace, default, type-only or re-export import, and a module that is no set, as written", async () => {
    const { icons, page } = await setUp();
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
    expect(await icons.rewrite(source, page)).toBeNull();
    expect(await icons.moduleOf("react-icons/xx", "XxAlpha", page)).toBeNull();
    expect(await icons.moduleOf("react-icons/bi", "BiMissing", page)).toBeNull();
  });

  test("hands the rewritten source to the next transform, and keeps it when that one has nothing to change", async () => {
    const { icons, lib } = await setUp();
    const source = 'import { BiGamma } from "react-icons/bi";\n';
    const seen: string[] = [];
    const rewritten = await icons.pipe((code) => {
      seen.push(code);
      return null;
    })(source, { path: lib });
    expect(seen).toEqual([rewritten ?? ""]);
    const gamma = await icons.moduleOf("react-icons/bi", "BiGamma", lib);
    expect(rewritten).toBe(`import { BiGamma } from ${JSON.stringify(gamma)};\n`);
    expect(await icons.pipe((code) => `${code}// next`)("export {};\n", { path: lib })).toBe("export {};\n// next");
  });

  test("cuts icons of the installed package that differ only in case into two files, each drawing as the set does", async () => {
    const root = await makeTempRoot();
    const icons = new ReactIconImports(root);
    const importer = path.join(import.meta.dir, "page.tsx");
    const names = ["ImPagebreak", "ImPageBreak"];
    const files = await Promise.all(names.map((name) => icons.moduleOf("react-icons/im", name, importer)));
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

  test("bundles each icon once into a route whose many files all name it, and never an icon the whole set's chunk lacked", async () => {
    const root = await makeTempRoot();
    await writeIconPackage(root);
    const app = path.join(root, "app");
    const many = ["f1", "f2", "f3", "f4", "f5", "f6"];
    for (const name of many)
      await writeText(
        path.join(app, `${name}.ts`),
        importOf(name === "f1" ? ["BiAlpha", "BiBeta", "BiGamma"] : ["BiAlpha", "BiBeta"], name),
      );
    await writeText(path.join(app, "g.ts"), importOf(["BiDelta"], "g"));
    await writeText(path.join(root, "libs", "card.ts"), importOf(["BiBeta"], "card"));
    await writeText(
      path.join(app, "one.ts"),
      `${many.map((name) => `import { ${name} } from "./${name}";`).join("\n")}\nexport const one = [${many.join(", ")}];\n`,
    );
    await writeText(
      path.join(app, "two.ts"),
      'import { g } from "./g";\nimport { card } from "../libs/card";\nexport const two = [g, card];\n',
    );
    const dir = JSON.stringify(import.meta.dir);
    const loaded = await printedInOwnProcess(
      `
const path = await import("node:path");
const fs = await import("node:fs");
const { ReactIconImports } = await import(path.join(${dir}, "reactIconImports.ts"));
const root = ${JSON.stringify(root)};
const closureOf = (outdir, file, seen = new Set()) => {
  if (seen.has(file)) return "";
  seen.add(file);
  const text = fs.readFileSync(path.join(outdir, file), "utf8");
  const chunks = [...text.matchAll(/(?:from|import)\\s*["']\\.\\/([^"']+)["']/g)].map((match) => match[1]);
  return [text, ...chunks.map((chunk) => closureOf(outdir, chunk, seen))].join("\\n");
};
const build = async (cut) => {
  const icons = new ReactIconImports(path.join(root, "generated"), path.join(root, "app"), [path.join(root, "libs")]);
  const outdir = path.join(root, cut ? "cut" : "whole");
  const rewrite = {
    name: "rewrite",
    setup: (bundle) =>
      bundle.onLoad({ filter: /[\\\\/](?:app|libs)[\\\\/]/ }, async (args) => {
        const source = await Bun.file(args.path).text();
        return { contents: (await icons.rewrite(source, args.path)) ?? source, loader: "ts" };
      }),
  };
  const result = await Bun.build({
    entrypoints: ["one", "two"].map((name) => path.join(root, "app", name + ".ts")),
    outdir,
    splitting: true,
    format: "esm",
    target: "browser",
    plugins: cut ? [icons.plugin, rewrite] : [],
  });
  if (!result.success) throw new Error(result.logs.join("\\n"));
  const drawn = (text) =>
    Object.fromEntries(
      ["alpha", "beta", "gamma", "delta"]
        .map((d) => [d, text.split('"' + d + '"').length - 1])
        .filter(([, count]) => count > 0),
    );
  return Object.fromEntries(["one", "two"].map((name) => [name, drawn(closureOf(outdir, name + ".js"))]));
};
console.log(JSON.stringify({ whole: await build(false), cut: await build(true) }));
`,
      root,
    );
    const everyIcon = { alpha: 1, beta: 1, gamma: 1, delta: 1 };
    expect(loaded).toEqual({
      whole: { one: everyIcon, two: everyIcon },
      cut: { one: { alpha: 1, beta: 1, gamma: 1 }, two: { beta: 1, delta: 1 } },
    });
  });
});
