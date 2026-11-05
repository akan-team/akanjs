import ts from "typescript";
import { WritePath } from "./writePath";

export interface ServiceLoopCall {
  method: string;
  line: number;
  calls: string[];
}

type NamedMethod = ts.MethodDeclaration & { name: ts.Identifier | ts.PrivateIdentifier };

//? A counted loop (`for (;;)`, `while`) retries or pages through a query, so only a loop over items is per item.
export class ServiceLoopCallScanner {
  static readonly #reachingField = /(?:Service|Model)$/;
  static readonly #generatedQuery =
    /^_*(?:get|load|list|find|pick|exists|count|insight|create|update|remove|search)[A-Z]/;

  scan(sourceFile: ts.SourceFile, answersCaller: (method: string) => boolean): ServiceLoopCall[] {
    return sourceFile.statements.filter(ts.isClassDeclaration).flatMap((cls) => {
      const methods = cls.members.filter(
        (member): member is NamedMethod =>
          ts.isMethodDeclaration(member) &&
          !!member.body &&
          (ts.isIdentifier(member.name) || ts.isPrivateIdentifier(member.name)),
      );
      const declared = new Set(methods.map((method) => method.name.text));
      const reaching = ServiceLoopCallScanner.#reachingMethodsOf(methods, declared);
      const reaches = (call: ts.CallExpression) => ServiceLoopCallScanner.#reaches(call, declared, reaching);
      return methods.flatMap((method) => {
        if (!answersCaller(method.name.text)) return [];
        const calls: ts.CallExpression[] = [];
        const visit = (node: ts.Node, perItem: boolean) => {
          if (perItem && ts.isCallExpression(node) && reaches(node)) calls.push(node);
          if (ts.isForOfStatement(node) || ts.isForInStatement(node)) {
            visit(node.expression, perItem);
            visit(node.statement, true);
            return;
          }
          ts.forEachChild(node, (child) => visit(child, perItem || WritePath.isPerElementCallback(child)));
        };
        visit(method, false);
        const first = calls[0];
        if (!first) return [];
        return [
          {
            method: method.name.text,
            line: sourceFile.getLineAndCharacterOfPosition(first.getStart(sourceFile)).line + 1,
            calls: calls.map((call) => call.expression.getText(sourceFile)),
          },
        ];
      });
    });
  }

  static #reachingMethodsOf(methods: NamedMethod[], declared: Set<string>) {
    const reaching = new Set<string>();
    let grew = true;
    while (grew) {
      grew = false;
      for (const method of methods) {
        const name = method.name.text;
        if (reaching.has(name)) continue;
        let found = false;
        const visit = (node: ts.Node) => {
          if (found) return;
          if (ts.isCallExpression(node) && ServiceLoopCallScanner.#reaches(node, declared, reaching)) found = true;
          else ts.forEachChild(node, visit);
        };
        visit(method);
        if (found) {
          reaching.add(name);
          grew = true;
        }
      }
    }
    return reaching;
  }

  static #reaches(call: ts.CallExpression, declared: Set<string>, reaching: Set<string>) {
    const callee = call.expression;
    if (!ts.isPropertyAccessExpression(callee)) return false;
    const owner = callee.expression;
    if (owner.kind === ts.SyntaxKind.ThisKeyword) {
      const name = callee.name.text;
      return declared.has(name) ? reaching.has(name) : ServiceLoopCallScanner.#generatedQuery.test(name);
    }
    return (
      ts.isPropertyAccessExpression(owner) &&
      owner.expression.kind === ts.SyntaxKind.ThisKeyword &&
      ServiceLoopCallScanner.#reachingField.test(owner.name.text)
    );
  }
}
