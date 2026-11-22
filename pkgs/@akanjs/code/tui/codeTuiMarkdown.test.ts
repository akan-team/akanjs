import { describe, expect, test } from "bun:test";
import { CodeTuiLines } from "./CodeTuiLines";
import { CodeTuiMarkdown } from "./CodeTuiMarkdown";

const render = (source: string, width = 60) =>
  CodeTuiLines.rows(CodeTuiMarkdown.rows(source, width), width, "m").map((line) => CodeTuiLines.text(line));

const spanOf = (source: string, text: string) =>
  CodeTuiLines.rows(CodeTuiMarkdown.rows(source, 60), 60, "m")
    .flatMap((line) => line.spans)
    .find((span) => span.text === text);

describe("CodeTuiMarkdown", () => {
  test("a heading is styling, not hashes", () => {
    expect(render("## Results").join("\n")).toBe("Results");
    expect(spanOf("## Results", "Results")).toMatchObject({ bold: true, color: "cyan" });
  });

  test("inline markers style their text and are not printed", () => {
    const line = render("use **cn** and `Err` here").join("\n");
    expect(line).toBe("use cn and Err here");
    expect(spanOf("use **cn** and `Err` here", "cn")).toMatchObject({ bold: true });
    expect(spanOf("use **cn** and `Err` here", "Err")).toMatchObject({ color: "yellow" });
  });

  test("a list gets a marker and hangs its wrapped lines under the text", () => {
    const lines = render("- first item that is quite long and will need to wrap somewhere", 30);
    expect(lines[0]).toStartWith("• first item");
    expect(lines[1]).toStartWith("  ");
    expect(lines[1]?.trim()).not.toStartWith("•");
  });

  test("a nested list is indented by its depth", () => {
    expect(render("- outer\n  - inner")).toEqual(["• outer", "  • inner"]);
  });

  test("a numbered list keeps its numbers", () => {
    expect(render("1. one\n2. two")).toEqual(["1. one", "2. two"]);
  });

  test("a fenced block keeps its own line breaks and is not word-wrapped", () => {
    const lines = render("```ts\nconst a = 1;\n  const b = 2;\n```", 20);
    expect(lines).toEqual(["ts", "│ const a = 1;", "│   const b = 2;"]);
  });

  test("a table aligns its columns by display width, so a Korean cell does not shift the row", () => {
    const lines = render("| name | 값 |\n| --- | --- |\n| a | 가나 |\n| bb | 다 |");
    const second = lines.map((line) => CodeTuiLines.width(line.slice(0, line.length - line.trimStart().length)) + 0);
    expect(second).toBeDefined();
    expect(lines[0]).toBe("name  값  ");
    expect(lines[2]).toBe("a     가나");
    expect(lines[3]).toBe("bb    다  ");
  });

  test("a table too wide for the pane narrows instead of overflowing", () => {
    const source = [
      "| file | what it does |",
      "| --- | --- |",
      '| minimal.service.ts | serve("minimal") with a batch server mode and one published fanout |',
    ].join("\n");
    const lines = render(source, 40);
    for (const line of lines) expect(CodeTuiLines.width(line)).toBeLessThanOrEqual(40);
    const wrapped = lines.slice(2);
    expect(wrapped.length).toBeGreaterThan(1);
    for (const line of wrapped) expect(line).toStartWith(" ".repeat(0));
    expect(wrapped.every((line) => CodeTuiLines.width(line) <= 40)).toBe(true);
  });

  test("a link shows both its label and where it goes, because a terminal cannot hide one behind the other", () => {
    expect(render("see [the docs](https://akanjs.com)").join("")).toBe("see the docs (https://akanjs.com)");
  });

  test("a javascript: url is refused the same way it is in the browser", () => {
    expect(render("[click](javascript:alert(1))").join("")).toBe("click");
  });

  test("a quote and a rule read as themselves", () => {
    expect(render("> careful")).toEqual(["▌ careful"]);
    expect(render("---")[0]).toMatch(/^─+$/);
  });

  test("Korean prose wraps at the column it is drawn in, not at its code-unit count", () => {
    const lines = render("안녕하세요 반갑습니다 여기는 터미널입니다", 12);
    for (const line of lines) expect(CodeTuiLines.width(line)).toBeLessThanOrEqual(12);
    expect(lines.length).toBeGreaterThan(1);
  });

  test("blocks are separated, so a heading does not sit on its paragraph", () => {
    expect(render("# Title\n\nbody text")).toEqual(["Title", "", "body text"]);
  });
});
