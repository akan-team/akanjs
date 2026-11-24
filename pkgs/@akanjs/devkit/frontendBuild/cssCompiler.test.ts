import { describe, expect, test } from "bun:test";
import path from "node:path";
import { tempDirs, writeText as write } from "../test/testHelpers";
import { CssCompiler, declaredCustomProperties } from "./cssCompiler";
import { prepareCssAsset } from "./ssrBaseArtifactBuilder";

const makeTempRoot = tempDirs("akan-css-compiler-");
const TAILWIND_BANNER = "/*! tailwindcss v";

const cssCompilerFor = (root: string, cwdPath: string, app: object = {}) =>
  new CssCompiler({
    workspace: { workspaceRoot: root },
    cwdPath,
    getTsConfig: async () => ({ compilerOptions: { paths: {} } }),
    getPageKeys: async () => ["./_index.tsx"],
    getConfig: async () => ({ barrelImports: [], basePaths: [] }),
    ...app,
  } as never);

describe("CssCompiler on a stylesheet that uses no Tailwind", () => {
  test("passes it through as written, with no banner, before and after the build's optimizer", async () => {
    const root = await makeTempRoot();
    const css = "/* brand */\n:root {\n  --brand: #111111;\n}\n\n.card { color: var(--brand); padding: 1rem; }\n";
    await write(path.join(root, "styles.css"), css);

    const compiled = await cssCompilerFor(root, root).compileCss([path.join(root, "styles.css")], []);

    expect(compiled).toBe(css);
    const built = prepareCssAsset("build", "", compiled);
    expect(built).toBe(":root{--brand:#111}.card{color:var(--brand);padding:1rem}");
  });

  test("inlines its imports through the resolver alone, where Tailwind stamped its banner", async () => {
    const root = await makeTempRoot();
    await write(path.join(root, "page/styles.css"), '@import "../ui/reset.css" layer(reset);\n.page { margin: 0; }\n');
    await write(path.join(root, "ui/reset.css"), "* { box-sizing: border-box; }\n");

    const compiled = await cssCompilerFor(root, root).compileCss([path.join(root, "page/styles.css")], []);

    expect(compiled).toBe("@layer reset {\n* { box-sizing: border-box; }\n\n}\n.page { margin: 0; }\n");
    expect(prepareCssAsset("build", "", compiled)).not.toContain("tailwind");
  });

  test("reports its imports like a compiled stylesheet's", async () => {
    const root = await makeTempRoot();
    const appDir = path.join(root, "apps/demo");
    await write(path.join(appDir, "page/_index.tsx"), 'import "./styles.css";\nexport default () => null;\n');
    await write(path.join(appDir, "page/styles.css"), '@import "../../../libs/shared/ui/brand.css";\n');
    await write(path.join(root, "libs/shared/ui/brand.css"), ":root { --kakao : #fee500; }\n");

    const compiler = cssCompilerFor(root, appDir);
    const cssByBasePath = await compiler.getCssByBasePath();

    expect(cssByBasePath[""]).toBe(":root { --kakao : #fee500; }\n\n");
    expect(compiler.importedStylesheetsByBasePath[""]).toEqual([
      { cssPath: path.join(root, "libs/shared/ui/brand.css"), declaredNames: ["--kakao"] },
    ]);
  });

  test.each([
    ["@theme", "@theme { --color-brand: red; }"],
    ["@utility", "@utility tab-4 { tab-size: 4; }"],
    ["@variant", ".a { @variant hover { color: red; } }"],
    ["@custom-variant", "@custom-variant pointer-coarse (@media (pointer: coarse));"],
    ["@source", '@source "./src";'],
    ["@tailwind", "@tailwind utilities;"],
    ["@apply", ".a { @apply flex; }"],
    ["@plugin", '@plugin "./plugin.js";'],
    ["@config", '@config "./tailwind.config.js";'],
    ["@reference", '@reference "./plain.css";'],
    ["--alpha()", ".a { color: --alpha(red / 50%); }"],
    ["--theme()", ".a { color: --theme(--color-brand, red); }"],
    ["an import's source()", '@import "./plain.css" source(none);'],
  ])("compiles with Tailwind when only an imported stylesheet uses %s", async (_, directive) => {
    const root = await makeTempRoot();
    await write(path.join(root, "styles.css"), '@import "./part.css";\n.app { margin: 0; }\n');
    await write(path.join(root, "part.css"), `${directive}\n`);
    await write(path.join(root, "plain.css"), ".plain { color: red; }\n");
    await write(path.join(root, "plugin.js"), "export default function () {}\n");
    await write(path.join(root, "tailwind.config.js"), "export default {};\n");

    const compiled = await cssCompilerFor(root, root).compileCss([path.join(root, "styles.css")], []);

    expect(compiled.startsWith(TAILWIND_BANNER)).toBe(true);
  });

  test('compiles `@import "tailwindcss"` and the utilities the sources use', async () => {
    const root = await makeTempRoot();
    await write(path.join(root, "styles.css"), '@import "tailwindcss";\n');
    await write(path.join(root, "Page.tsx"), 'export const Page = () => <main className="flex" />;\n');

    const compiled = await cssCompilerFor(root, root).compileCss(
      [path.join(root, "styles.css")],
      [path.join(root, "Page.tsx")],
    );

    expect(compiled.startsWith(TAILWIND_BANNER)).toBe(true);
    expect(compiled).toContain(".flex {");
  });

  test("compiles a utility marked important, leading or trailing, as `!important`", async () => {
    const root = await makeTempRoot();
    await write(path.join(root, "styles.css"), '@import "tailwindcss";\n');
    await write(path.join(root, "Page.tsx"), 'export const Page = () => <main className="h-0! !w-0" />;\n');

    const compiled = await cssCompilerFor(root, root).compileCss(
      [path.join(root, "styles.css")],
      [path.join(root, "Page.tsx")],
    );

    expect(compiled).toMatch(/\.h-0\\! \{\s*height: 0px !important;/);
    expect(compiled).toMatch(/\.\\!w-0 \{\s*width: 0px !important;/);
  });

  test("switches to Tailwind on the next rebuild once a stylesheet gains a directive, and back", async () => {
    const root = await makeTempRoot();
    const stylesPath = path.join(root, "page/styles.css");
    await write(path.join(root, "page/_index.tsx"), 'import "./styles.css";\nexport default () => null;\n');
    await write(stylesPath, '@import "./tokens.css";\n');
    await write(path.join(root, "page/tokens.css"), ":root { --brand: #111; }\n");
    const compiler = cssCompilerFor(root, root);

    expect((await compiler.getCssByBasePath({ refresh: true }))[""]).toBe(":root { --brand: #111; }\n\n");
    await write(
      path.join(root, "page/tokens.css"),
      ":root { --brand: #111; }\n@theme { --color-brand: var(--brand); }\n",
    );
    expect((await compiler.getCssByBasePath({ refresh: true }))[""]?.startsWith(TAILWIND_BANNER)).toBe(true);
    await write(path.join(root, "page/tokens.css"), ":root { --brand: #222; }\n");
    expect((await compiler.getCssByBasePath({ refresh: true }))[""]).toBe(":root { --brand: #222; }\n\n");
  });
});

describe("declaredCustomProperties", () => {
  test("names what the regex-based version named", () => {
    expect(declaredCustomProperties(":root { --kakao: #fee500; --naver: #1ec800; }")).toEqual(["--kakao", "--naver"]);
    expect(declaredCustomProperties("@theme inline {\n  --color-brand: var(--brand);\n}\n")).toEqual([]);
    expect(declaredCustomProperties("@theme { --color-x: initial; }\n:root { --brand: #111; }")).toEqual(["--brand"]);
    expect(declaredCustomProperties(".a { color: var(--kakao); }")).toEqual([]);
    expect(declaredCustomProperties(":root{--a:#111}\n@media (min-width:1px){:root{--a:#222;--b:#333}}")).toEqual([
      "--a",
      "--b",
    ]);
    expect(declaredCustomProperties(":root { --a : 1; --b:2 }")).toEqual(["--a", "--b"]);
    expect(declaredCustomProperties(".a{--x:1}.b{--y:2}.c{--z:3}")).toEqual(["--x", "--y", "--z"]);
    expect(declaredCustomProperties("--top: 1;")).toEqual(["--top"]);
    expect(declaredCustomProperties("@property --percentage { syntax: '<number>'; inherits: false; }")).toEqual([]);
  });

  test("keeps source order across nested rules", () => {
    expect(declaredCustomProperties(".x { --a: 1; .y { --b: 2; } --c: 3; }")).toEqual(["--a", "--b", "--c"]);
  });

  test("skips a whole @theme block, nested blocks included", () => {
    const css = `@theme { --animate-spin: spin 1s; @keyframes spin { to { --inner: 1; } } --color-after: red; } :root { --kept: 1; }`;
    expect(declaredCustomProperties(css)).toEqual(["--kept"]);
  });

  test("ignores comments and strings, so a comment mentioning @theme hides nothing", () => {
    const css = [
      "/* `@theme` extension does not work from a lib, so these are plain variables. */",
      ":root { --kakao: #fee500; }",
      "/* :root { --commented: 1; } */",
      `.a::before { content: "--quoted: 1"; }`,
    ].join("\n");
    expect(declaredCustomProperties(css)).toEqual(["--kakao"]);
  });

  test("adversarial input finishes well under a second", () => {
    for (const css of [
      "@theme".repeat(100_000),
      "@theme{".repeat(100_000),
      `@theme ${"x".repeat(100_000)}`,
      `:root{${"--".repeat(100_000)}`,
      " --a".repeat(100_000),
      "@media x{".repeat(100_000),
    ]) {
      const started = performance.now();
      declaredCustomProperties(css);
      expect(performance.now() - started).toBeLessThan(1000);
    }
  });
});

describe("CssCompiler.discoverCssAndSources", () => {
  test("scans the files a page reaches through a client barrel's narrowed imports, never the barrel's other modules", async () => {
    const root = await makeTempRoot();
    const paths = { "@apps/*": ["./apps/*"], "@libs/*": ["./libs/*"] };
    const writeSys = async (dir: string, modules: string[]) => {
      await write(
        path.join(dir, "client.ts"),
        [
          'export * as cnst from "./lib/cnst";',
          'export { msg, usePage } from "./lib/useClient";',
          'export { st, RootStore } from "./lib/st";',
          ...modules.map((name) => `export { ${name} } from "./lib/${name.toLowerCase()}";`),
          "",
        ].join("\n"),
      );
      await write(path.join(dir, "lib/cnst.ts"), "export const Sample = 1;\n");
      await write(path.join(dir, "lib/useClient.ts"), "export const msg = 1;\nexport const usePage = () => msg;\n");
      for (const name of modules) {
        await write(
          path.join(dir, `lib/${name.toLowerCase()}/index.ts`),
          `import * as Zone from "./${name}.Zone";\nexport const ${name} = { Zone };\n`,
        );
        await write(path.join(dir, `lib/${name.toLowerCase()}/${name}.Zone.tsx`), 'export const Card = () => "p-4";\n');
      }
    };
    const appDir = path.join(root, "apps/demo");
    await writeSys(appDir, ["Memo", "Other"]);
    await writeSys(path.join(root, "libs/kit"), ["Widget"]);
    await write(path.join(root, "libs/kit/lib/st.ts"), "export class RootStore {}\nexport const st = {};\n");
    await write(
      path.join(appDir, "lib/st.ts"),
      'import { RootStore as kit } from "@libs/kit/client";\nexport class RootStore {}\nexport const st = { kit };\n',
    );
    await write(
      path.join(appDir, "page/_index.tsx"),
      'import { Memo, st } from "@apps/demo/client";\nexport default function Page() { return [Memo, st]; }\n',
    );
    const app = {
      cwdPath: appDir,
      workspace: { workspaceRoot: root },
      getTsConfig: async () => ({ compilerOptions: { paths } }),
      getConfig: async () => ({ barrelImports: ["@apps/demo/client", "@libs/kit/client"] }),
    };

    const { sourcePaths } = await new CssCompiler(app as never).discoverCssAndSources({ pageKeys: ["_index.tsx"] });

    const relativePaths = sourcePaths.map((file) => path.relative(root, file).split(path.sep).join("/"));
    expect(relativePaths.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))).toEqual([
      "apps/demo/lib/memo/Memo.Zone.tsx",
      "apps/demo/lib/memo/index.ts",
      "apps/demo/lib/st.ts",
      "apps/demo/lib/useClient.ts",
      "apps/demo/page/_index.tsx",
      "libs/kit/lib/st.ts",
      "libs/kit/lib/useClient.ts",
    ]);
  });
});
