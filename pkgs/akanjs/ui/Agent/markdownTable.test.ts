import { describe, expect, test } from "bun:test";
import { MarkdownTable } from "./markdownTable";

const at = (source: string) => MarkdownTable.at(source.split("\n"), 0);

describe("MarkdownTable", () => {
  test("reads a pipe-fenced table and reports where it ended", () => {
    expect(at("| a | b |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |")).toEqual({
      block: {
        kind: "table",
        aligns: [null, null],
        head: ["a", "b"],
        rows: [
          ["1", "2"],
          ["3", "4"],
        ],
      },
      next: 4,
    });
  });

  test("reads the form that writes no outer pipes", () => {
    expect(at("a | b\n--- | ---\n1 | 2")?.block).toEqual({
      kind: "table",
      aligns: [null, null],
      head: ["a", "b"],
      rows: [["1", "2"]],
    });
  });

  test("reads each column's alignment from its delimiter", () => {
    expect(at("| l | c | r | d |\n| :-- | :-: | --: | --- |")?.block.aligns).toEqual(["left", "center", "right", null]);
  });

  test("sizes every row to the header, padding a short row and dropping a long one's tail", () => {
    expect(at("| a | b |\n| --- | --- |\n| 1 |\n| 1 | 2 | 3 |")?.block.rows).toEqual([
      ["1", ""],
      ["1", "2"],
    ]);
  });

  test("keeps an escaped pipe inside its cell", () => {
    expect(at("| expr |\n| --- |\n| a \\| b |")?.block.rows).toEqual([["a | b"]]);
  });

  test("ends the table at the first line that carries no pipe", () => {
    const table = at("| a |\n| --- |\n| 1 |\nafter");
    expect(table?.block.rows).toEqual([["1"]]);
    expect(table?.next).toBe(3);
  });

  test("is not a table without a delimiter row under the header", () => {
    expect(at("| a | b |\n| 1 | 2 |")).toBeNull();
  });

  test("is not a table where the delimiter row is a rule that carries no pipe", () => {
    expect(at("a | b\n---\nc")).toBeNull();
  });

  test("is not a table where a delimiter cell is not made of dashes", () => {
    expect(at("| a | b |\n| --- | x |\n| 1 | 2 |")).toBeNull();
  });

  test("is not a table where the header carries no pipe", () => {
    expect(at("title\n| --- |\n| 1 |")).toBeNull();
  });
});
