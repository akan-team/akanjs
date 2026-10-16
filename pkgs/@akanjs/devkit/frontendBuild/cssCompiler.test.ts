import { describe, expect, test } from "bun:test";
import { declaredCustomProperties } from "./cssCompiler";

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
