import { describe, expect, test } from "bun:test";
import ts from "typescript";
import { SourceComments } from "./sourceComments";

const commentsOf = (content: string) =>
  SourceComments.of(ts.createSourceFile("demo.tsx", content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)).map(
    ({ line, body, isJsDoc }) => ({ line, body, isJsDoc }),
  );

describe("SourceComments", () => {
  test("finds leading, trailing, empty-block and end-of-file comments", () => {
    expect(
      commentsOf(
        ["// leading", "const a = 1; // trailing", "const f = () => {", "  /* inside */", "};", "// last", ""].join(
          "\n",
        ),
      ),
    ).toEqual([
      { line: 1, body: ["leading"], isJsDoc: false },
      { line: 2, body: ["trailing"], isJsDoc: false },
      { line: 4, body: ["inside"], isJsDoc: false },
      { line: 6, body: ["last"], isJsDoc: false },
    ]);
  });

  test("ignores comment syntax inside strings, templates, regexes and JSX text", () => {
    expect(
      commentsOf(
        [
          'const url = "https://host//path";',
          `const tpl = \`a // b \${url} // c\`;`,
          "const re = /\\/\\/x/;",
          'export const C = () => <div title="//x">// text {/* real */}</div>;',
          "",
        ].join("\n"),
      ),
    ).toEqual([{ line: 4, body: ["real"], isJsDoc: false }]);
  });

  test("strips block delimiters and marks a JSDoc", () => {
    expect(
      commentsOf(["/**", " * Summary", " * @deprecated use b", " */", "export const a = 1;", ""].join("\n")),
    ).toEqual([{ line: 1, body: ["", "Summary", "@deprecated use b", ""], isJsDoc: true }]);
  });
});
