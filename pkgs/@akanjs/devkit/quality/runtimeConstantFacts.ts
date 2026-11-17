import path from "node:path";
import ts from "typescript";
import type { RuntimeSourceFile } from "./runtimeModuleFacts";

export interface RuntimeConstantFact {
  scope: string;
  module: string;
  kind: "database" | "scalar";
  file: string;
  exports: string[];
}

export type RuntimeConstantEntry =
  | { type: "model" | "export"; fact: RuntimeConstantFact }
  | { type: "namespace"; scope: string };

const constantPath = /^((?:apps|libs)\/[^/]+)\/lib\/(__scalar\/)?([^/_][^/]*)\/\3\.constant$/;

export class RuntimeConstantFacts {
  static of({ file, sourceFile }: RuntimeSourceFile): RuntimeConstantFact | null {
    const [, scope, scalar, module] = file.replace(/\.ts$/, "").match(constantPath) ?? [];
    if (!scope || !module) return null;
    const exports = new Set<string>();
    for (const statement of sourceFile.statements) {
      if (ts.isExportDeclaration(statement)) {
        if (statement.isTypeOnly) continue;
        const clause = statement.exportClause;
        if (clause && ts.isNamedExports(clause))
          for (const element of clause.elements) if (!element.isTypeOnly) exports.add(element.name.text);
      } else for (const name of RuntimeConstantFacts.#declaredExports(statement)) exports.add(name);
    }
    return {
      scope,
      module,
      kind: scalar ? "scalar" : "database",
      file: file.replace(/\.ts$/, ""),
      exports: [...exports].sort(),
    };
  }

  static ownerOf(specifier: string, fileName: string): { scope: string; module: string } | null {
    const aliased = specifier.match(/^@((?:apps|libs)\/[\s\S]+)$/)?.[1];
    const joined =
      aliased ?? (specifier.startsWith(".") ? path.posix.join(path.posix.dirname(fileName), specifier) : null);
    const [, scope, , module] = joined
      ? (path.posix.normalize(joined).replace(/\.ts$/, "").match(constantPath) ?? [])
      : [];
    return scope && module ? { scope, module } : null;
  }

  static #declaredExports(statement: ts.Statement): string[] {
    const modifiers = ts.canHaveModifiers(statement) ? ts.getModifiers(statement) : undefined;
    const exported = modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
    if (!exported || modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DeclareKeyword)) return [];
    if (modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword)) return [];
    if (ts.isVariableStatement(statement))
      return statement.declarationList.declarations.flatMap((declaration) =>
        RuntimeConstantFacts.#bindingNames(declaration.name),
      );
    if (ts.isClassDeclaration(statement) || ts.isFunctionDeclaration(statement) || ts.isEnumDeclaration(statement))
      return statement.name ? [statement.name.text] : [];
    return [];
  }

  static #bindingNames(name: ts.BindingName): string[] {
    if (ts.isIdentifier(name)) return [name.text];
    return name.elements.flatMap((element) =>
      ts.isOmittedExpression(element) ? [] : RuntimeConstantFacts.#bindingNames(element.name),
    );
  }
}
