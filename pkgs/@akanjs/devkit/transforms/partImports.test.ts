import { describe, expect, test } from "bun:test";
import path from "node:path";
import { ModuleParts } from "./moduleParts";
import { PartImports } from "./partImports";

const dir = "/repo/apps/demo/ui";
const pair = `${dir}/Pair.tsx`;
const importer = `${dir}/Page.tsx`;
const part = (id: string) => `"${pair}?akan-part=${id}"`;
const pairSource = [
  "export interface Props { a: number }",
  "export const A = () => 1;",
  "export const B = () => 2;",
  "const C = () => 3;",
  "export default C;",
  "",
].join("\n");

const imports = new PartImports({
  resolve: async (specifier, from) => path.resolve(path.dirname(from), `${specifier}.tsx`),
  partsOf: async (file) => (file === pair ? ModuleParts.read(pairSource, pair) : null),
});
const rewritten = async (...lines: string[]) => imports.rewrite(`${lines.join("\n")}\n`, importer);

describe("PartImports", () => {
  test("each name asked of a file in parts is asked of the part holding it, and a type is asked of none", async () => {
    expect(
      await rewritten(
        'import Pair, { A, B as Bee, type Props } from "./Pair";',
        'import { Other } from "./Other";',
        "export const page = [Pair, A, Bee, Other];",
      ),
    ).toBe(
      [
        `import { default as Pair } from ${part("p2")};`,
        `import { A } from ${part("p0")};`,
        `import { B as Bee } from ${part("p1")};`,
        'import { Other } from "./Other";',
        "export const page = [Pair, A, Bee, Other];",
        "",
      ].join("\n"),
    );
    expect(await rewritten('import { A, Props } from "./Pair";', "export const page = A;")).toBe(
      [`import { A } from ${part("p0")};`, "export const page = A;", ""].join("\n"),
    );
  });

  test("a re-export follows its names to their parts the same way", async () => {
    expect(await rewritten('export { A as First, B } from "./Pair";')).toBe(
      [`export { A as First } from ${part("p0")};`, `export { B } from ${part("p1")};`, ""].join("\n"),
    );
  });

  test("a name the parts do not hold stays asked of the file", async () => {
    expect(await rewritten('import { A, Missing } from "./Pair";')).toBe(
      [`import { A } from ${part("p0")};`, 'import { Missing } from "./Pair";', ""].join("\n"),
    );
  });

  test.each([
    ["a namespace import", 'import * as Pair from "./Pair";'],
    ["`export *`", 'export * from "./Pair";'],
    ["a bare import", 'import "./Pair";'],
    ["a type import", 'import type { Props } from "./Pair";'],
    ["an import with attributes", 'import { A } from "./Pair" with { type: "json" };'],
    ["`import()`", 'export const later = () => import("./Pair");'],
    ["an import of a file left whole", 'import { Other } from "./Other";'],
    ["an import already naming a part", `import { A } from ${part("p0")};`],
  ])("%s is left as written", async (_, line) => {
    expect(await rewritten(line)).toBeNull();
  });

  test("a file's import of itself is left as written", async () => {
    expect(await imports.rewrite('import { A } from "./Pair";\n', pair)).toBeNull();
  });
});
