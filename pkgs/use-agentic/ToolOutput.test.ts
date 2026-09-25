import { describe, expect, test } from "bun:test";
import { ToolOutput } from "./ToolOutput";

describe("ToolOutput.clipped", () => {
  test("a result inside the ceiling is handed back untouched", () => {
    const result = { id: "c1", name: "readState", result: { rows: [1, 2, 3] }, changes: [{ name: "count", value: 3 }] };
    expect(ToolOutput.clipped(result)).toEqual(result);
  });

  test("an enormous value becomes a clipped string that says what it was", () => {
    const huge = { data: "x".repeat(ToolOutput.limit * 3) };
    const clipped = ToolOutput.clipped({ id: "c1", name: "readState", result: huge });
    const text = clipped.result as string;
    expect(typeof text).toBe("string");
    expect(text).toContain("Truncated");
    expect(text).toContain(String(JSON.stringify(huge).length));
    // The note leads, so a reader and a provider that truncates further both see the ceiling before the value.
    expect(text.startsWith("[Truncated")).toBe(true);
    expect(text.length).toBeLessThan(ToolOutput.limit * 1.2);
  });

  test("a change's value is bounded too, since a diff carries whatever the screen holds", () => {
    const clipped = ToolOutput.clipped({
      id: "c1",
      name: "setRows",
      changes: [
        { name: "rows", value: "y".repeat(ToolOutput.limit * 2) },
        { name: "count", value: 2 },
      ],
    });
    expect(typeof clipped.changes?.[0].value).toBe("string");
    expect(String(clipped.changes?.[0].value)).toContain("Truncated");
    expect(clipped.changes?.[1].value).toBe(2);
  });

  test("a key absent on the way in stays absent, since an added one reads as a value the tool returned", () => {
    expect(ToolOutput.clipped({ id: "c1", name: "bump" })).toEqual({ id: "c1", name: "bump" });
    expect("result" in ToolOutput.clipped({ id: "c1", name: "bump" })).toBe(false);
  });

  test("a tool that returned nothing does not gain a value on the way through", () => {
    expect(ToolOutput.clipped({ id: "c1", name: "bump", result: undefined }).result).toBeUndefined();
  });
});

describe("ToolOutput.tokensOf", () => {
  test("estimates four characters to a token over the whole result", () => {
    const tokens = ToolOutput.tokensOf({ id: "c1", name: "readState", result: "z".repeat(4_000) });
    expect(tokens).toBeGreaterThan(1_000);
    expect(tokens).toBeLessThan(1_100);
  });
});
