import { describe, expect, test } from "bun:test";
import { ModuleParts } from "./moduleParts";

const self = "/repo/apps/demo/ui/Pair.tsx";
const from = (id: string) => `"${self}?akan-part=${id}"`;
const read = (lines: string[]) => {
  const parts = ModuleParts.read(`${lines.join("\n")}\n`, self);
  if (!parts) throw new Error("the file stayed one module");
  return parts;
};
const linesOf = (parts: ModuleParts, id: string) => (parts.sourceOf(id, self) ?? "").trimEnd().split("\n");
const partOf = (parts: ModuleParts, exported: string) => linesOf(parts, parts.partOf(exported) ?? "");

describe("ModuleParts", () => {
  test("each export that only builds a value is a part holding the imports it alone reads", () => {
    const parts = read([
      '"use client";',
      'import { cn } from "./cn";',
      'import Heavy, { type Props, tune as tuned } from "./Heavy";',
      'import * as icons from "./icons";',
      "export const A = () => cn(icons.a);",
      "export const B = (props: Props) => [Heavy, tuned, props];",
    ]);

    expect(parts.ids).toEqual(["p0", "p1"]);
    expect(parts.exports).toEqual(["A", "B"]);
    expect(linesOf(parts, "p0")).toEqual([
      '"use client";',
      'import { cn } from "./cn";',
      'import * as icons from "./icons";',
      "export const A = () => cn(icons.a);",
    ]);
    expect(linesOf(parts, "p1")).toEqual([
      '"use client";',
      'import Heavy, { tune as tuned } from "./Heavy";',
      "export const B = (props: Props) => [Heavy, tuned, props];",
    ]);
    expect(parts.facade(self)).toBe(
      ['"use client";', `export { A } from ${from("p0")};`, `export { B } from ${from("p1")};`, ""].join("\n"),
    );
    expect(parts.sourceOf("p9", self)).toBeNull();
  });

  test("what the file does when it loads is `rest`, which every part imports before anything else", () => {
    const parts = read([
      'import "./side.css";',
      'import { track } from "./track";',
      'import { cn } from "./cn";',
      "const registry = new Map<string, number>();",
      'registry.set("x", 1);',
      "track();",
      "export const A = () => cn();",
      'export const D = () => registry.get("x");',
    ]);

    expect(parts.ids).toEqual(["p0", "p1", "rest"]);
    expect(linesOf(parts, "rest")).toEqual([
      'import "./side.css";',
      'import { track } from "./track";',
      "const registry = new Map<string, number>();",
      'registry.set("x", 1);',
      "track();",
      "export { registry as __akanPart_registry };",
    ]);
    expect(linesOf(parts, "p0")).toEqual([
      `import ${from("rest")};`,
      'import { cn } from "./cn";',
      "export const A = () => cn();",
    ]);
    expect(linesOf(parts, "p1")).toEqual([
      `import ${from("rest")};`,
      `import { __akanPart_registry as registry } from ${from("rest")};`,
      'export const D = () => registry.get("x");',
    ]);
  });

  test("a declaration no export names joins the one export reading it, and is lent out when two read it", () => {
    const parts = read([
      "const double = (value: number) => value * 2;",
      "const only = { deep: true };",
      "const unread = 1;",
      "export const A = () => double(1);",
      "export const B = () => double(2);",
      "export const C = () => only;",
    ]);

    expect(parts.ids).toEqual(["p0", "p1", "p2", "p3"]);
    expect(linesOf(parts, "p0")).toEqual([
      "const double = (value: number) => value * 2;",
      "export { double as __akanPart_double };",
    ]);
    for (const [name, call] of [
      ["A", "double(1)"],
      ["B", "double(2)"],
    ] as const)
      expect(partOf(parts, name)).toEqual([
        `import { __akanPart_double as double } from ${from("p0")};`,
        `export const ${name} = () => ${call};`,
      ]);
    expect(partOf(parts, "C")).toEqual(["const only = { deep: true };", "export const C = () => only;"]);
    for (const id of parts.ids) expect(parts.sourceOf(id, self)).not.toContain("unread");
  });

  test("declarations reading each other in a cycle are one part", () => {
    const parts = read([
      "export function even(n: number): boolean {",
      "  return n === 0 || odd(n - 1);",
      "}",
      "export function odd(n: number): boolean {",
      "  return n !== 0 && even(n - 1);",
      "}",
      "export const other = 1;",
    ]);

    expect(parts.partOf("even")).toBe(parts.partOf("odd"));
    expect(parts.partOf("other")).not.toBe(parts.partOf("even"));
  });

  test("a member given to a declared value stays in its part, and one built by a call moves it to `rest`", () => {
    const parts = read([
      'import { Item } from "./Item";',
      'import { make } from "./make";',
      "export const List = () => null;",
      "List.Item = Item;",
      "export const Menu = () => null;",
      "Object.assign(Menu, { Item });",
      "export const Made = () => null;",
      "Made.extra = make();",
      "export const Plain = () => null;",
    ]);

    expect(partOf(parts, "List")).toEqual([
      `import ${from("rest")};`,
      'import { Item } from "./Item";',
      "export const List = () => null;",
      "List.Item = Item;",
    ]);
    expect(partOf(parts, "Menu")).toContain("Object.assign(Menu, { Item });");
    expect(parts.partOf("Made")).toBe("rest");
    expect(partOf(parts, "Plain")).toEqual([`import ${from("rest")};`, "export const Plain = () => null;"]);
  });

  test("a type is no export of any part, and every part carries the file's type declarations", () => {
    const parts = read([
      'import type { Outer } from "./types";',
      "export interface Props { a: Outer }",
      "type Local = Props;",
      'export type { Other } from "./other";',
      'export { type Third, value } from "./third";',
      "export const A = (props: Local) => props;",
    ]);

    expect(parts.exports).toEqual(["value", "A"]);
    for (const name of ["Props", "Other", "Third"]) expect(parts.isType(name)).toBe(true);
    expect(parts.isType("A")).toBe(false);
    expect(partOf(parts, "value")).toEqual([
      "export interface Props { a: Outer }",
      "type Local = Props;",
      'export { value } from "./third";',
    ]);
    expect(partOf(parts, "A")).toEqual([
      "export interface Props { a: Outer }",
      "type Local = Props;",
      "export const A = (props: Local) => props;",
    ]);
  });

  test("an export list, a renamed export and a default export each go to the part of what they name", () => {
    const parts = read([
      'import { outer } from "./outer";',
      "const a = 1;",
      "const b = () => a;",
      "export { a, b as c, outer };",
      "export default b;",
    ]);

    expect(new Set(parts.exports)).toEqual(new Set(["a", "c", "default", "outer"]));
    expect(partOf(parts, "a")).toEqual(["const a = 1;", "export { a as __akanPart_a, a };"]);
    expect(partOf(parts, "c")).toEqual([
      `import { __akanPart_a as a } from ${from(parts.partOf("a") ?? "")};`,
      "const b = () => a;",
      "export { b as __akanPart_b, b as c };",
    ]);
    expect(partOf(parts, "default")).toEqual([
      `import { __akanPart_b as b } from ${from(parts.partOf("c") ?? "")};`,
      "export default b;",
    ]);
    expect(partOf(parts, "outer")).toEqual(['import { outer } from "./outer";', "export { outer };"]);
  });

  test("an overloaded function keeps its signatures with its body", () => {
    const parts = read([
      "export function pick(value: string): string;",
      "export function pick(value: number): number;",
      "export function pick(value: unknown) {",
      "  return value;",
      "}",
      "export const other = 1;",
    ]);

    expect(partOf(parts, "pick")).toEqual([
      "export function pick(value: string): string;",
      "export function pick(value: number): number;",
      "export function pick(value: unknown) {",
      "  return value;",
      "}",
    ]);
  });

  test.each([
    ["a single export", ["export const A = 1;"]],
    ["everything running on load", ["export const A = make();", "export const B = make();"]],
    ["a top-level `let`", ["export let count = 0;", "export const A = 1;", "export const B = 2;"]],
    ["`export *`", ['export * from "./other";', "export const A = 1;", "export const B = 2;"]],
    ["a namespace", ["namespace Inner {}", "export const A = 1;", "export const B = 2;"]],
    ["`export =`", ["const A = 1;", "const B = 2;", "export = A;"]],
    [
      "a macro import",
      ['import { read } from "./read" with { type: "macro" };', "export const A = 1;", "export const B = 2;"],
    ],
    ["an export of a name it does not hold", ["export { missing };", "export const A = 1;", "export const B = 2;"]],
  ])("a file with %s stays one module", (_, lines) => {
    expect(ModuleParts.read(`${lines.join("\n")}\n`, self)).toBeNull();
  });
});
