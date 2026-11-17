import { describe, expect, test } from "bun:test";
import { ObjectModule } from "./objectModule";

const read = (lines: string[], file = "index.tsx") => ObjectModule.read(lines.join("\n"), file);
const membersOf = (lines: string[], object: string) =>
  Object.fromEntries(read(lines).objects.get(object)?.members ?? []);

describe("ObjectModule: a module an importer may skip for the members it names", () => {
  test("passes the model index akan sync writes", () => {
    const facts = read([
      'import * as Template from "./Memo.Template";',
      'import * as Unit from "./Memo.Unit";',
      'import * as Zone from "./Memo.Zone";',
      "export const Memo = { Template, Unit, Zone };",
    ]);

    expect(facts.failed).toBeNull();
    expect(Object.fromEntries(facts.objects.get("Memo")?.members ?? [])).toEqual({
      Template: { specifier: "./Memo.Template", imported: "*" },
      Unit: { specifier: "./Memo.Unit", imported: "*" },
      Zone: { specifier: "./Memo.Zone", imported: "*" },
    });
  });

  test("passes declarations that bind names: types, directives, functions, const values, export lists", () => {
    const facts = read([
      '"use client";',
      'import type { Props } from "./types";',
      'import { Text } from "./Text";',
      'import Default from "./Default";',
      "interface Local { a: string }",
      "type Alias = Local;",
      "declare const injected: string;",
      "const enum Size { Small }",
      "function helper(props: Props) { return props; }",
      // biome-ignore lint/suspicious/noTemplateCurlyInString: the fixture module's own source holds a template literal
      "const label = `size ${Size.Small}`;",
      "const options = [1, ...[2]];",
      "const pick = typeof label === 'string' ? !label : void 0;",
      "const Wrapper = () => null;",
      "const Fields = { Text, Default, Wrapper, helper, label, options, pick };",
      "export { Fields as Field };",
    ]);

    expect(facts.failed).toBeNull();
    expect(facts.useClient).toBe(true);
    expect([...facts.objects.keys()]).toEqual(["Field"]);
  });

  test("passes members put on an object the module declares, with `X.m = …` or `Object.assign`", () => {
    const lines = [
      'import { Navigator } from "./Navigator";',
      'import { Slide } from "./Slide";',
      'import * as parts from "./parts";',
      "export const Scroll = () => null;",
      "Scroll.Navigator = Navigator;",
      "export const Dialog = Object.assign(() => null, { Slide, Part: parts.Part });",
      "const Base = { Slide };",
      "Object.assign(Base, { Navigator });",
      "export { Base };",
    ];

    expect(read(lines).failed).toBeNull();
    expect(membersOf(lines, "Scroll")).toEqual({ Navigator: { specifier: "./Navigator", imported: "Navigator" } });
    expect(membersOf(lines, "Dialog")).toEqual({
      Slide: { specifier: "./Slide", imported: "Slide" },
      Part: { specifier: "./parts", imported: "Part" },
    });
    expect(Object.keys(membersOf(lines, "Base"))).toEqual(["Slide", "Navigator"]);
  });

  test("fails an import that runs a module for its effect (bare-import)", () => {
    expect(read(['import "./register";', 'import { A } from "./A";', "export const X = { A };"]).failed).toEqual({
      clause: "bare-import",
      line: 1,
    });
    const tail = ['import { A } from "./A";', "export const X = { A };"];
    expect(read(['import {} from "./register";', ...tail]).failed).toEqual({ clause: "bare-import", line: 1 });
    expect(read(['import { type T } from "./types";', ...tail]).failed).toBeNull();
  });

  test("fails a re-export, which runs a module no member of the object loads (reexport)", () => {
    const tail = ['import { A } from "./A";', "export const X = { A };"];
    for (const line of [
      'export * from "./register";',
      'export * as parts from "./register";',
      'export { helper } from "./register";',
      'export { type T, helper } from "./register";',
      'export {} from "./register";',
    ])
      expect(read([line, ...tail]).failed).toEqual({ clause: "reexport", line: 1 });
    for (const line of [
      'export type { T } from "./types";',
      'export type * from "./types";',
      'export { type T } from "./types";',
    ])
      expect(read([line, ...tail]).failed).toBeNull();
  });

  test("fails a statement with an effect, a `let`, or a member put on a name the module does not declare (effect-statement)", () => {
    const exported = 'import { A } from "./A";\nexport const X = { A };';
    for (const line of [
      "register(X);",
      "let count = 0;",
      "if (X) X.b = A;",
      "class Holder { static { register(); } }",
      "enum Size { Small }",
      "globalThis.X = X;",
      "window.X = X;",
    ])
      expect(read([exported, line]).failed?.clause).toBe("effect-statement");
  });

  test("fails a call or construction evaluated at load (call)", () => {
    const head = 'import { memo } from "react";\nimport { A } from "./A";';
    for (const value of ["memo(A)", "new Map()", "tag`x`", "{ Text: memo(A) }", "Object.assign({}, { A: memo(A) })"])
      expect(read([head, `export const X = ${value};`]).failed).toEqual({ clause: "call", line: 3 });
  });

  test("fails a value that assigns or awaits while it is evaluated (effect-value)", () => {
    const head = 'import { A } from "./A";\nconst state = { n: 0 };';
    for (const value of ["{ A, n: (state.n = 1) }", "{ A, n: ++state.n }", "await A", "Object.assign(window, { A })"])
      expect(read([head, `export const X = ${value};`]).failed?.clause).toBe("effect-value");
  });

  test("fails a module that puts a member on an import (mutated-import)", () => {
    const head = 'import { Field } from "./Field";\nimport { A } from "./A";';
    expect(read([head, "Field.A = A;", "export const X = { A };"]).failed?.clause).toBe("mutated-import");
    expect(read([head, "Object.assign(Field, { A });", "export const X = { A };"]).failed?.clause).toBe(
      "mutated-import",
    );
    expect(read([head, "export const X = Object.assign(Field, { A });"]).failed?.clause).toBe("mutated-import");
    expect(read([head, "export const X = Object.assign(Field.Sub, { A });"]).failed?.clause).toBe("mutated-import");
  });

  test("fails a member put on anything but an object the module created above it, which the object would not record", () => {
    const head = 'import { Base } from "./Base";\nimport { A } from "./A";\nimport { B } from "./B";';
    const failedOn = (...lines: string[]) => read([head, ...lines]).failed;

    expect(failedOn("const Alias = Base;", "Alias.Extra = B;", "export const X = { A };")).toEqual({
      clause: "effect-statement",
      line: 5,
    });
    expect(failedOn("const Alias = Base;", "Object.assign(Alias, { B });", "export const X = { A };")?.clause).toBe(
      "effect-statement",
    );
    expect(failedOn("X.A = B;", "export const X = { A };")).toEqual({ clause: "effect-statement", line: 4 });
    expect(failedOn("const Own = { A };", "export const X = { Sub: Object.assign(Own, { B }) };")?.clause).toBe(
      "effect-value",
    );
    const shadowed = ['import { Object } from "./Object";', 'import { A } from "./A";'];
    expect(read([...shadowed, "export const X = Object.assign({}, { A });"]).failed?.clause).toBe("call");
  });

  test("records a member put on an object under every name bound to it, in the order the module runs", () => {
    const lines = [
      'import { A } from "./A";',
      'import { B } from "./B";',
      'import { C } from "./C";',
      "export function Root() { return null; }",
      "export const Toast = Object.assign(Root, { A });",
      "Root.B = B;",
      "Toast.A = C;",
    ];

    expect(read(lines).failed).toBeNull();
    for (const object of ["Root", "Toast"])
      expect(membersOf(lines, object)).toEqual({
        A: { specifier: "./C", imported: "C" },
        B: { specifier: "./B", imported: "B" },
      });
  });

  test("names no file for a member a function with members of its own may replace when it is copied in", () => {
    const head = ['import { A } from "./A";', 'import { B } from "./B";', "export const X = { A };"];
    const merged = [...head, "const Base = () => null;", "Base.A = B;", "Object.assign(X, Base);"];

    expect(membersOf(merged, "X")).toEqual({ A: null });
    expect(read(merged).objects.get("X")?.open).toBe(true);
    expect(membersOf([...head, "const Plain = () => null;", "Object.assign(X, Plain);"], "X")).toEqual({
      A: { specifier: "./A", imported: "A" },
    });
  });

  test("points a member written one level down at its file, and no deeper", () => {
    const lines = [
      'import { Zone } from "./Doc";',
      'import { Graph } from "./Graph";',
      'import { Leaf } from "./Leaf";',
      "export const Constant = { Doc: { Zone, Deep: { Leaf } }, Graph };",
    ];

    expect(membersOf(lines, "Constant")).toEqual({
      Doc: null,
      "Doc.Zone": { specifier: "./Doc", imported: "Zone" },
      "Doc.Deep": null,
      Graph: { specifier: "./Graph", imported: "Graph" },
    });
  });

  test("names no file for a member a later spread, computed key or source may replace", () => {
    const head = ['import { A } from "./A";', 'import { B } from "./B";', 'import { Other } from "./Other";'];

    expect(membersOf([...head, "export const X = { A, ...Other, B };"], "X")).toEqual({
      A: null,
      B: { specifier: "./B", imported: "B" },
    });
    expect(membersOf([...head, 'export const X = { A, ["k"]: B };'], "X")).toEqual({ A: null });
    expect(membersOf([...head, "export const X = Object.assign({ A }, Other, { B });"], "X")).toEqual({
      A: null,
      B: { specifier: "./B", imported: "B" },
    });
    expect(membersOf([...head, "export const X = { Doc: { A, ...Other }, B };"], "X")).toEqual({
      Doc: null,
      "Doc.A": null,
      B: { specifier: "./B", imported: "B" },
    });
    expect(membersOf([...head, "export const X = { Doc: { A } };", "X.Doc = Other;"], "X")).toEqual({
      Doc: { specifier: "./Other", imported: "Other" },
    });
  });

  test("names no file for a member declared in the object's own file or keyed with a dot", () => {
    const lines = [
      'import { A } from "./A";',
      "const Local = () => null;",
      'export const X = { A, Local, "Doc.A": A, method() { return A; } };',
    ];

    expect(membersOf(lines, "X")).toEqual({
      A: { specifier: "./A", imported: "A" },
      Local: null,
      "Doc.A": null,
      method: null,
    });
  });
});
