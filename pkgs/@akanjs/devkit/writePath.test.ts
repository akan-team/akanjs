import { describe, expect, test } from "bun:test";
import ts from "typescript";
import { WritePath } from "./writePath";

const pathIn = (body: string, enters?: (fn: ts.SignatureDeclaration) => boolean) => {
  const sourceFile = ts.createSourceFile("a.ts", `async function run() {\n${body}\n}`, ts.ScriptTarget.Latest, true);
  const fn = sourceFile.statements[0];
  if (!fn || !ts.isFunctionDeclaration(fn) || !fn.body) throw new Error("fixture has no function body");
  const isWrite = (call: ts.CallExpression) => /^write/.test(call.expression.getText(sourceFile));
  const path = new WritePath(isWrite, { enters });
  const calls = path.along(fn.body);
  return { labels: calls.map((call) => path.labelOf(call, sourceFile)), count: path.countOf(calls) };
};
const writesIn = (body: string, enters?: (fn: ts.SignatureDeclaration) => boolean) =>
  pathIn(body, enters).labels.map((label) => label.replace(" (per item)", ""));

describe("WritePath", () => {
  test("adds up writes in sequence, nested callbacks and logical operands included", () => {
    expect(
      writesIn("await writeA();\nawait Promise.all(ids.map((id) => writeB(id)));\nok && (await writeC());"),
    ).toEqual(["writeA", "writeB", "writeC"]);
  });

  test("counts only the busiest of exclusive branches", () => {
    expect(writesIn("if (x) await writeA();\nelse await writeB();")).toEqual(["writeA"]);
    expect(writesIn("await (x ? writeA() : Promise.all([writeB(), writeC()]));")).toEqual(["writeB", "writeC"]);
    expect(
      writesIn(
        "switch (x) {\n  case 1:\n    await writeA();\n    break;\n  default:\n    await writeB();\n    await writeC();\n}",
      ),
    ).toEqual(["writeB", "writeC"]);
  });

  test("reads an if that returns as the else of the statements after it", () => {
    expect(
      writesIn("await writeA();\nif (x) {\n  await writeB();\n  return;\n}\nawait writeC();\nawait writeD();"),
    ).toEqual(["writeA", "writeC", "writeD"]);
    expect(writesIn("if (x) await writeB();\nawait writeC();")).toEqual(["writeB", "writeC"]);
  });

  test("counts a write in a loop or a per-element callback as two, but not the list it loops over", () => {
    expect(pathIn("for (const id of ids) await writeA(id);")).toEqual({ labels: ["writeA (per item)"], count: 2 });
    expect(pathIn("for (const id of await writeA()) read(id);")).toEqual({ labels: ["writeA"], count: 1 });
    expect(pathIn("while (await more()) await writeA();")).toEqual({ labels: ["writeA (per item)"], count: 2 });
    expect(pathIn("await Promise.all(ids.map((id) => writeA(id)));")).toEqual({
      labels: ["writeA (per item)"],
      count: 2,
    });
    expect(pathIn("await read().then(() => writeA());")).toEqual({ labels: ["writeA"], count: 1 });
  });

  test("weighs a branch writing per item above one writing once", () => {
    expect(pathIn("if (x) await writeA();\nelse for (const id of ids) await writeB(id);")).toEqual({
      labels: ["writeB (per item)"],
      count: 2,
    });
  });

  test("leaves out a nested function the caller does not enter", () => {
    const body = "await writeA();\nids.map((id) => writeB(id));\nsetTimeout(() => writeC(), 0);";
    const entersMapOnly = (fn: ts.SignatureDeclaration) =>
      ts.isCallExpression(fn.parent) && fn.parent.expression.getText().endsWith(".map");

    expect(writesIn(body, entersMapOnly)).toEqual(["writeA", "writeB"]);
  });
});
