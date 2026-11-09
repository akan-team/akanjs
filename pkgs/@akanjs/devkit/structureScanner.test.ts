import { describe, expect, test } from "bun:test";
import ts from "typescript";
import { StructureScanner } from "./structureScanner";

const measure = (source: string, file = "unit.ts") =>
  new StructureScanner().measure(
    ts.createSourceFile(
      file,
      source,
      ts.ScriptTarget.Latest,
      true,
      file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    ),
  );
const namesOf = (source: string) => measure(source).functions.map(({ name }) => name);

describe("StructureScanner functions", () => {
  test("names a function by the classes and functions around it, and counts the lines it spans", () => {
    const { functions } = measure(`export class Host {
  #children = new Map();
  constructor() {}
  get status() {
    return 1;
  }
  set status(value: number) {}
  async start() {
    const tick = () => {
      return 1;
    };
  }
  static #restart = function named() {};
}
export function build() {}
export default function () {}
`);

    expect(functions).toEqual([
      { name: "Host.constructor", line: 3, lineCount: 1 },
      { name: "Host.get status", line: 4, lineCount: 3 },
      { name: "Host.set status", line: 7, lineCount: 1 },
      { name: "Host.start", line: 8, lineCount: 5 },
      { name: "Host.start.tick", line: 9, lineCount: 3 },
      { name: "Host.named", line: 13, lineCount: 1 },
      { name: "build", line: 15, lineCount: 1 },
      { name: "default", line: 16, lineCount: 1 },
    ]);
  });

  test("names an anonymous function after what its call is bound to, else after the call", () => {
    expect(
      namesOf(`const rows = items.map((item) => item).filter(Boolean);
const View = memo(() => null);
const routes = { "/*": answering(async (req) => req), list: (() => []) as unknown };
describe("suite", () => {
  useEffect(() => {});
  holder.onExit = () => {};
});
export class ShowCommand extends command("show", ({ public: target }) => ({
  show: target().exec(async function (format) {}),
})) {}
export default () => {};
`),
    ).toEqual([
      "rows",
      "View",
      "routes./*",
      "routes.list",
      "describe()",
      "describe().useEffect()",
      "describe().onExit",
      "ShowCommand.command()",
      "ShowCommand.command().show",
      "default",
    ]);
  });

  test("keys the n-th repeat of a name in a file as name[n]", () => {
    expect(namesOf("test('a', () => {});\ntest('b', () => {});\ntest('c', () => {});\n")).toEqual([
      "test()",
      "test()[2]",
      "test()[3]",
    ]);
  });

  test("names an object literal's members after what the literal is bound to", () => {
    expect(
      namesOf(`const h = { foo() {} };
const k = { foo() {} };
const routes = { api: { list: () => [] } };
export function make() {
  return { setX() {} };
}
register({ onDone() {} });
`),
    ).toEqual(["h.foo", "k.foo", "routes.api.list", "make", "make.setX", "register().onDone"]);
  });

  test("names an inline JSX callback after its attribute, and a function child children", () => {
    const { functions } = measure(
      `export const Board = () => (
  <List onClick={() => {}} render={(row) => row}>
    {(row) => row}
  </List>
);
`,
      "Board.tsx",
    );

    expect(functions.map(({ name }) => name)).toEqual(["Board", "Board.onClick", "Board.render", "Board.children"]);
  });

  test("skips a signature without a body", () => {
    expect(
      namesOf(
        "export function overload(a: string): void;\nexport function overload(a: unknown) {}\ninterface I { m(): void }\n",
      ),
    ).toEqual(["overload"]);
  });
});

describe("StructureScanner classes", () => {
  test("counts every member of a class or class expression, named like a function", () => {
    const { classes } = measure(`export class Exception extends Error {
  static BadRequest = class BadRequestException extends Exception {
    constructor() {
      super();
    }
  };
  readonly code = 1;;
  #secret = 2;
  get status() {
    return 3;
  }
  set status(value: number) {}
  [key: string]: unknown;
}
const Mixin = class extends Base {};
export default class {}
`);

    expect(classes).toEqual([
      { name: "Exception", line: 1, memberCount: 5 },
      { name: "Exception.BadRequestException", line: 2, memberCount: 1 },
      { name: "Mixin", line: 15, memberCount: 0 },
      { name: "default", line: 16, memberCount: 0 },
    ]);
  });

  test("counts an overloaded method once, and neither an index signature nor a static block", () => {
    const { classes } = measure(`export abstract class Store {
  static {
    Store.ready = true;
  }
  [key: string]: unknown;
  constructor(name: string);
  constructor(name: string, id?: number) {}
  load(id: string): void;
  load(ids: string[]): void;
  load(arg: unknown) {}
  static load() {}
  abstract save(): void;
}
`);

    expect(classes).toEqual([{ name: "Store", line: 1, memberCount: 4 }]);
  });
});
