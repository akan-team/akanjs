import { describe, expect, test } from "bun:test";
import path from "node:path";
import { tempDirs, writeText as write } from "../test/testHelpers";
import { CssCompiler, declaredCustomProperties } from "./cssCompiler";

const makeTempRoot = tempDirs("akan-css-compiler-");

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

    expect(sourcePaths.map((file) => path.relative(root, file)).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))).toEqual([
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
