import ts from "typescript";
import { findClassDeclaration, nodeName, sourceFileFor } from "./sourceAst";
import { spliceText } from "./sourceText";

export const hasClassMethod = (content: string, className: string, methodName: string) => {
  const node = findClassDeclaration(sourceFileFor("service.ts", content), className);
  return Boolean(
    node?.members.some((member) => ts.isMethodDeclaration(member) && nodeName(member.name) === methodName),
  );
};

export const classMethodParameters = (content: string, className: string, methodName: string) => {
  const source = sourceFileFor("service.ts", content);
  const method = findClassDeclaration(source, className)?.members.find(
    (member): member is ts.MethodDeclaration => ts.isMethodDeclaration(member) && nodeName(member.name) === methodName,
  );
  return (
    method?.parameters.map((parameter) => ({
      name: nodeName(parameter.name),
      optional: !!parameter.questionToken || !!parameter.initializer || !!parameter.dotDotDotToken,
    })) ?? null
  );
};

export const insertClassMethod = (content: string, className: string, methodBlock: string): string | null => {
  const source = sourceFileFor("service.ts", content);
  const node = findClassDeclaration(source, className);
  if (!node) return null;
  const closeBrace = node.getEnd() - 1;
  if (content[closeBrace] !== "}") return null;
  const lead = content.slice(0, closeBrace).endsWith("\n") ? "" : "\n";
  return spliceText(content, closeBrace, closeBrace, `${lead}${methodBlock}\n`);
};
