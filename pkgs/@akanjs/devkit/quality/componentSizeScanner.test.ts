import { describe, expect, test } from "bun:test";
import ts from "typescript";
import { ComponentSizeScanner } from "./componentSizeScanner";

const measure = (content: string) =>
  new ComponentSizeScanner().measure(
    ts.createSourceFile("Board.tsx", content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX),
  );

const bodyOf = (lineNum: number) => Array.from({ length: lineNum }, (_, idx) => `  const v${idx} = ${idx};`).join("\n");

describe("ComponentSizeScanner", () => {
  test("measures a function declaration and a const arrow from their first to their last line", () => {
    const sizes = measure(
      `import { cn } from "akanjs/client";\n\nexport function Board() {\n${bodyOf(3)}\n  return null;\n}\n\nexport const Cell = () => {\n${bodyOf(10)}\n  return null;\n};\n`,
    );
    expect(sizes).toEqual([
      { name: "Board", line: 3, lineCount: 6 },
      { name: "Cell", line: 10, lineCount: 13 },
    ]);
  });

  test("measures a wrapped component with its wrapper", () => {
    const sizes = measure(
      `export const Canvas = memo(\n  forwardRef((props, ref) => {\n${bodyOf(4)}\n    return null;\n  }),\n);\n`,
    );
    expect(sizes).toEqual([{ name: "Canvas", line: 1, lineCount: 9 }]);
  });

  test("skips a helper, a value, a bodiless overload and a nested component", () => {
    const sizes = measure(
      `const toLabel = () => "x";\nexport const Columns = 3;\nexport const Theme = { dark: true };\nexport function Overloaded(): null;\nexport const Outer = () => {\n  const Inner = () => null;\n  return <Inner />;\n};\n`,
    );
    expect(sizes.map(({ name }) => name)).toEqual(["Outer"]);
  });
});
