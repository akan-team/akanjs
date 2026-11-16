import { describe, expect, test } from "bun:test";
import path from "node:path";
import { PlainStylesheet, type StylesheetLoader } from "./plainStylesheet";

const loaderOf = (files: Record<string, string>): StylesheetLoader => {
  return async (id, fromBase) => {
    const filePath = path.resolve(fromBase, id);
    const content = files[filePath];
    if (content === undefined) throw new Error(`no stylesheet at ${filePath}`);
    return { path: filePath, base: path.dirname(filePath), content };
  };
};
const refuseLoad: StylesheetLoader = async (id) => {
  throw new Error(`loaded ${id}`);
};

describe("PlainStylesheet.scan", () => {
  test("finds nothing Tailwind in plain CSS", () => {
    const css = [
      '@charset "utf-8";',
      "@layer reset, app;",
      ":root { --brand: #111; }",
      "@media (prefers-reduced-motion: reduce) { .a { animation: none; } }",
      "@supports (display: grid) { .grid { display: grid; } }",
      "@container card (min-width: 20rem) { .b { color: color-mix(in oklab, var(--brand) 50%, transparent); } }",
      "@font-face { font-family: X; src: url(data:font/woff2;base64,AAAA) format('woff2'); }",
      "@keyframes spin { to { transform: rotate(1turn); } }",
      '.c::before { content: "@apply theme(x)"; }',
      "/* @theme { --color-x: red; } and --spacing(4) */",
      ".icon { background: url(icon@2x.png); }",
    ].join("\n");
    expect(PlainStylesheet.scan(css)).toEqual([]);
  });

  test.each([
    "@tailwind utilities;",
    "@TAILWIND utilities;",
    ".a { @apply flex; }",
    '@plugin "tailwind-scrollbar";',
    '@config "./tailwind.config.js";',
    "@theme { --color-brand: red; }",
    "@theme inline { --color-brand: var(--brand); }",
    "@utility tab-4 { tab-size: 4; }",
    ".a { @variant hover { color: red; } }",
    "@custom-variant dark (&:where([data-theme=dark] *));",
    "@custom-variant any-hover { @media (any-hover: hover) { &:hover { @slot; } } }",
    '@source "../node_modules/x";',
    '@source not "./legacy";',
    '@source inline("underline");',
    '@reference "./app.css";',
    ".a { color: theme(colors.red.500); }",
    ".a { color: --theme(--color-red-500); }",
    ".a { color: --alpha(var(--brand) / 50%); }",
    ".a { margin: --spacing(4); }",
    "@media (width >= theme(--breakpoint-md)) { .a { color: red; } }",
    "@media source(none) { .a { color: red; } }",
    '@import "tailwindcss";',
    "@import 'tailwindcss';",
    '@import "tailwindcss/theme.css" layer(theme);',
    '@import "tailwindcss/utilities";',
    '@import "./theme.css" theme(reference);',
    '@import "./app.css" source(none);',
    '@import "./app.css" prefix(tw);',
    '@import "./app.css" important;',
    '@import "./app.css" reference;',
  ])("needs Tailwind: %s", (css) => {
    expect(PlainStylesheet.scan(css)).toBeNull();
  });

  test("reads the conditions of an import Tailwind would inline", () => {
    const css = [
      '@import "./a.css";',
      "@import './b.css' layer;",
      '@import "./c.css" layer(base) supports(display: grid) screen and (min-width: 40rem);',
      '@import "./d.css" supports((display: flex) and (gap: 1rem)) print;',
    ].join("\n");
    expect(
      PlainStylesheet.scan(css)?.map(({ uri, layer, supports, media }) => ({ uri, layer, supports, media })),
    ).toEqual([
      { uri: "./a.css", layer: null, supports: null, media: null },
      { uri: "./b.css", layer: "", supports: null, media: null },
      { uri: "./c.css", layer: "base", supports: "display: grid", media: "screen and (min-width: 40rem)" },
      { uri: "./d.css", layer: null, supports: "(display: flex) and (gap: 1rem)", media: "print" },
    ]);
  });

  test("leaves url(), data: and remote imports where they stand, as Tailwind does", () => {
    const css = [
      '@import url("./a.css");',
      "@import url(./b.css) screen;",
      '@import "https://fonts.example.com/x.css";',
      '@import "data:text/css,.a{color:red}";',
    ].join("\n");
    expect(PlainStylesheet.scan(css)).toEqual([]);
  });

  test("defers to Tailwind on CSS it cannot read with certainty", () => {
    expect(PlainStylesheet.scan("/* never closed")).toBeNull();
    expect(PlainStylesheet.scan(".a { color: red;")).toBeNull();
    expect(PlainStylesheet.scan(".a { color: red; } }")).toBeNull();
    expect(PlainStylesheet.scan('@import "./a.css" layer(x) layer(y);')).toBeNull();
    expect(PlainStylesheet.scan('@import "./a.css" supports(display: grid;')).toBeNull();
  });
});

describe("PlainStylesheet.bundle", () => {
  test("returns a stylesheet without imports byte for byte", async () => {
    const css = "/* brand */\n:root {\n  --brand: #111;\n}\n.a { color: var(--brand) }";
    expect(await PlainStylesheet.bundle(css, "/app", refuseLoad)).toBe(css);
  });

  test("inlines imports, nested ones too, wrapped in their layer, supports and media conditions", async () => {
    const load = loaderOf({
      "/app/a.css": '@import "./nested/b.css";\n.a { color: red; }\n',
      "/app/nested/b.css": ".b { color: blue; }",
      "/app/c.css": ".c { color: green; }",
    });
    const css =
      '@import "./a.css";\n@import "./c.css" layer(base) supports(display: grid) print;\n.app { margin: 0; }\n';

    expect(await PlainStylesheet.bundle(css, "/app", load)).toBe(
      [
        ".b { color: blue; }",
        ".a { color: red; }",
        "",
        "@supports (display: grid) {",
        "@media print {",
        "@layer base {",
        ".c { color: green; }",
        "}",
        "}",
        "}",
        ".app { margin: 0; }",
        "",
      ].join("\n"),
    );
  });

  test("needs Tailwind when only an imported stylesheet uses it", async () => {
    const load = loaderOf({
      "/app/a.css": '@import "./b.css";\n',
      "/app/b.css": ".b { color: red; }\n@custom-variant dark (&:where(.dark *));\n",
    });
    expect(await PlainStylesheet.bundle('@import "./a.css";\n.app { margin: 0; }\n', "/app", load)).toBeNull();
  });

  test('decides on `@import "tailwindcss"` without resolving it', async () => {
    expect(await PlainStylesheet.bundle('@import "tailwindcss";\n.a { color: red; }\n', "/app", refuseLoad)).toBeNull();
  });

  test("hands an import cycle to Tailwind instead of following it forever", async () => {
    const load = loaderOf({ "/app/a.css": '@import "./b.css";', "/app/b.css": '@import "./a.css";' });
    expect(await PlainStylesheet.bundle('@import "./a.css";', "/app", load)).toBeNull();
  });
});
