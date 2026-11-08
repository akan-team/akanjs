import { describe, expect, test } from "bun:test";
import { toCsvBlob } from "./dataExport";

const csvOf = async (rows: Record<string, unknown>[]) =>
  (await toCsvBlob(["value"], rows, () => "value").text()).replace(/^﻿/, "").split("\r\n").slice(1);

describe("toCsvBlob", () => {
  test("keeps a text cell that opens like a formula as text", async () => {
    expect(
      await csvOf([
        { value: '=HYPERLINK("https://example.test","x")' },
        { value: "+1" },
        { value: "-1" },
        { value: "@SUM(A1)" },
        { value: "\t=1" },
      ]),
    ).toEqual([`"'=HYPERLINK(""https://example.test"",""x"")"`, `"'+1"`, `"'-1"`, `"'@SUM(A1)"`, `"'\t=1"`]);
  });

  test("writes numbers and ordinary text as they are", async () => {
    expect(await csvOf([{ value: -12.5 }, { value: "O'Brien" }, { value: "a, b" }, { value: "x-1" }])).toEqual([
      "-12.5",
      "O'Brien",
      `"a, b"`,
      "x-1",
    ]);
  });
});
