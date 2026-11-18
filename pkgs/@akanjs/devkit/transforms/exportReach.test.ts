import { describe, expect, test } from "bun:test";
import { ExportReach } from "./exportReach";

const read = (source: string, file = "View.tsx") => ExportReach.read(source, file) as ExportReach;
const importsOf = (source: string, name: string) => {
  const reached = read(source).of(name);
  return reached.known ? reached.imports : null;
};

const view = `
import { Remove, Edit } from "./Memo.Util";
import { Chart } from "./Chart";
import type { Memo } from "./memo.constant";
import * as Unit from "./Memo.Unit";
import { format } from "./format";

const Title = ({ memo }: { memo: Memo }) => <h1>{format(memo.title)}</h1>;

export const General = ({ memo }: { memo: Memo }) => (
  <div>
    <Title memo={memo} />
    <Remove id={memo.id} />
  </div>
);

export function Stats({ memo }: { memo: Memo }) {
  return <Chart value={memo.count} />;
}

export const Card = ({ memo }: { memo: Memo }) => <Unit.Card memo={memo} />;
export const All = () => Object.values(Unit);
export interface Props { memo: Memo }
`;

describe("ExportReach", () => {
  test("reaches, from one export, the imports its declaration reads and those of the declarations it reads", () => {
    expect(importsOf(view, "General")).toEqual([
      { specifier: "./Memo.Util", names: ["Remove"] },
      { specifier: "./format", names: ["format"] },
    ]);
    expect(importsOf(view, "Stats")).toEqual([{ specifier: "./Chart", names: ["Chart"] }]);
  });

  test("asks a namespace import for the members read from it, and for the whole module once it is handed on", () => {
    expect(importsOf(view, "Card")).toEqual([{ specifier: "./Memo.Unit", names: ["Card"] }]);
    expect(importsOf(view, "All")).toEqual([{ specifier: "./Memo.Unit", names: null }]);
  });

  test("reaches nothing for a type, and does not follow a name read only in a type", () => {
    expect(importsOf(view, "Props")).toEqual([]);
    expect(
      read(view)
        .whole()
        .map(({ specifier }) => specifier),
    ).not.toContain("./memo.constant");
  });

  test("answers a name the file does not hold as unknown, with the `export *` targets that may hold it", () => {
    expect(read(view).of("Missing")).toEqual({ known: false, stars: [] });
    expect(read('export * from "./a";\nexport * from "./b";\nexport const X = 1;\n').of("Y")).toEqual({
      known: false,
      stars: ["./a", "./b"],
    });
  });

  test("follows an export list, a re-export, a namespace re-export and a default export", () => {
    const source = `
import Base from "./Base";
import { Row } from "./Row";
const List = () => <Row />;
export { List as Rows };
export { Cell as GridCell, default as Grid } from "./Grid";
export * as Icons from "./icons";
export default function Page() { return <Base />; }
`;
    expect(importsOf(source, "Rows")).toEqual([{ specifier: "./Row", names: ["Row"] }]);
    expect(importsOf(source, "GridCell")).toEqual([{ specifier: "./Grid", names: ["Cell"] }]);
    expect(importsOf(source, "Grid")).toEqual([{ specifier: "./Grid", names: ["default"] }]);
    expect(importsOf(source, "Icons")).toEqual([{ specifier: "./icons", names: null }]);
    expect(importsOf(source, "default")).toEqual([{ specifier: "./Base", names: ["default"] }]);
  });

  test("reads a member put on a declaration with the declaration, not with every importer", () => {
    const source = `
import { Header } from "./Header";
import { Footer } from "./Footer";
import { Plain } from "./Plain";
export const Card = () => null;
Card.Header = Header;
Object.assign(Card, { Footer });
export const Other = () => <Plain />;
`;
    expect(importsOf(source, "Card")).toEqual([
      { specifier: "./Header", names: ["Header"] },
      { specifier: "./Footer", names: ["Footer"] },
    ]);
    expect(importsOf(source, "Other")).toEqual([{ specifier: "./Plain", names: ["Plain"] }]);
    expect(read(source).always()).toEqual([]);
  });

  test("reaches, for every importer, a bare import and what a statement that is no declaration reads", () => {
    const source = `
import "./polyfill";
import { register } from "./registry";
import { Panel } from "./Panel";
import { Plain } from "./Plain";
register("panel", Panel);
export const Other = () => <Plain />;
`;
    expect(read(source).always()).toEqual([
      { specifier: "./polyfill", names: null },
      { specifier: "./registry", names: ["register"] },
      { specifier: "./Panel", names: ["Panel"] },
    ]);
    expect(importsOf(source, "Other")).toEqual([{ specifier: "./Plain", names: ["Plain"] }]);
  });

  test("reaches a module loaded on demand as a whole, from the export whose declaration loads it", () => {
    const source = `
import { lazy } from "react";
const Editor = lazy(() => import("./Editor"));
export const Rich = () => <Editor />;
export const Plain = () => null;
`;
    expect(importsOf(source, "Rich")).toEqual([
      { specifier: "./Editor", names: null },
      { specifier: "react", names: ["lazy"] },
    ]);
    expect(importsOf(source, "Plain")).toEqual([]);
  });

  test("counts a property name as no read of an import of that name, and a shadowed name as one", () => {
    const source = `
import { Card } from "./Card";
import { Row } from "./Row";
export const A = (props: { Card: string }) => [props.Card, { Card: 1 }];
export const B = (Row: string) => Row;
`;
    expect(importsOf(source, "A")).toEqual([]);
    expect(importsOf(source, "B")).toEqual([{ specifier: "./Row", names: ["Row"] }]);
  });

  test("the whole module reaches every import a value of it reads, re-exports and `export *` included", () => {
    const source = `
import { A } from "./a";
import type { T } from "./t";
export { B } from "./b";
export * from "./c";
export const X = () => <A />;
`;
    expect(read(source).whole()).toEqual([
      { specifier: "./a", names: ["A"] },
      { specifier: "./b", names: ["B"] },
      { specifier: "./c", names: null },
    ]);
  });

  test("does not read a CommonJS module, whose exports are assigned at run time", () => {
    expect(ExportReach.read('const a = require("./a");\nmodule.exports = { a };\n', "legacy.js")).toBeNull();
    expect(ExportReach.read("export const a = 1;\n", "modern.js")).not.toBeNull();
  });
});
