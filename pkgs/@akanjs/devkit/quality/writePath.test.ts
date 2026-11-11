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

  test("reads every branch that returns as exclusive of the statements after it, however it is nested", () => {
    const countIn = (body: string) => pathIn(body).count;
    expect(
      countIn(
        "if (x) {\n  await writeA();\n  return;\n} else if (y) {\n  await writeB();\n  return;\n}\nawait writeC();",
      ),
    ).toBe(1);
    expect(countIn('switch (x) {\n  case "a":\n    await writeA();\n    return;\n}\nawait writeC();')).toBe(1);
    expect(countIn("if (x) {\n  if (y) {\n    await writeA();\n    return;\n  }\n}\nawait writeC();")).toBe(1);
    expect(writesIn("try {\n  await writeA();\n  return;\n} catch {\n  await writeB();\n}")).toEqual([
      "writeA",
      "writeB",
    ]);
  });

  test("runs a switch clause without break on into the next one", () => {
    expect(
      writesIn("switch (x) {\n  case 1:\n    await writeA();\n  case 2:\n    await writeB();\n    break;\n}"),
    ).toEqual(["writeA", "writeB"]);
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
    expect(pathIn("for (let i = 0; i < ids.length; i++) await writeA(ids[i]);")).toEqual({
      labels: ["writeA (per item)"],
      count: 2,
    });
    expect(pathIn("while (queue.length) await writeA(queue.shift());")).toEqual({
      labels: ["writeA (per item)"],
      count: 2,
    });
  });

  test("counts a retry or a poll as one write, and a loop that returns on its write as one", () => {
    expect(pathIn("for (let i = 0; i < 3; i++) {\n  try {\n    await writeA();\n    return;\n  } catch {}\n}")).toEqual(
      {
        labels: ["writeA"],
        count: 1,
      },
    );
    expect(pathIn("let ok = false;\nwhile (!ok) ok = await writeA();")).toEqual({ labels: ["writeA"], count: 1 });
    expect(pathIn("for (const id of ids)\n  if (id) {\n    await writeA(id);\n    return;\n  }")).toEqual({
      labels: ["writeA"],
      count: 1,
    });
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
