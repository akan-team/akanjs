import ts from "typescript";
import { expressionName, factoryArrowOf, sourceFileFor } from "./sourceAst";
import { ensureNamedImport, findNamedImport } from "./sourceImports";
import { lineIndentAt, lineStartAt, spliceText } from "./sourceText";

export const appendTopLevelTestCases = (
  content: string,
  describeTitle: string,
  render: (itName: string, indent: string) => string[],
) => {
  const bunImport = findNamedImport(sourceFileFor("test.ts", content), "bun:test", { valueOnly: true });
  const itName = !bunImport?.names.includes("it") && bunImport?.names.includes("test") ? "test" : "it";
  const imported = ensureNamedImport(content, "bun:test", itName);
  const source = sourceFileFor("test.ts", imported);
  const body = source.statements.flatMap((statement) => {
    if (!ts.isExpressionStatement(statement) || !ts.isCallExpression(statement.expression)) return [];
    if (expressionName(statement.expression.expression) !== "describe") return [];
    const callback = factoryArrowOf(statement.expression);
    return callback && ts.isBlock(callback.body) ? [callback.body] : [];
  })[0];
  if (!body) {
    const block = [`describe(${JSON.stringify(describeTitle)}, () => {`, ...render(itName, "  "), "});", ""];
    return `${ensureNamedImport(imported, "bun:test", "describe").trimEnd()}\n\n${block.join("\n")}`;
  }
  const firstStatement = body.statements[0];
  const indent = firstStatement
    ? lineIndentAt(imported, firstStatement.getStart(source))
    : `${lineIndentAt(imported, body.getStart(source))}  `;
  const insertAt = lineStartAt(imported, body.getEnd() - 1);
  return spliceText(imported, insertAt, insertAt, `${render(itName, indent).join("\n")}\n`);
};
