import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

class ObjectFile {
  static readonly #extensions = [".tsx", ".ts", "/index.tsx", "/index.ts"];
  readonly #file: string;
  readonly #sourceFile: ts.SourceFile;
  readonly #imports = new Map<string, string>();
  readonly #locals = new Set<string>();
  readonly #problems: string[] = [];
  readonly #useClient: boolean;

  constructor(file: string, source = fs.readFileSync(file, "utf8")) {
    this.#file = file;
    this.#useClient = ObjectFile.#startsWithUseClient(source);
    const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    this.#sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, false, kind);
  }

  problems() {
    for (const statement of this.#sourceFile.statements) this.#statement(statement);
    return this.#problems;
  }

  static #unwrap(node: ts.Expression): ts.Expression {
    let value = node;
    while (ts.isAsExpression(value) || ts.isSatisfiesExpression(value) || ts.isParenthesizedExpression(value))
      value = value.expression;
    return value;
  }

  static #startsWithUseClient(source: string) {
    return /^\s*["']use client["']/.test(source);
  }

  #line(node: ts.Node) {
    return this.#sourceFile.getLineAndCharacterOfPosition(node.getStart(this.#sourceFile)).line + 1;
  }

  #statement(statement: ts.Statement) {
    if (ts.isImportDeclaration(statement)) return this.#import(statement);
    if (ts.isExportDeclaration(statement) || ts.isInterfaceDeclaration(statement)) return;
    if (ts.isTypeAliasDeclaration(statement)) return;
    if (ts.isFunctionDeclaration(statement)) return void this.#locals.add(statement.name?.text ?? "default");
    if (ts.isVariableStatement(statement) && statement.declarationList.flags & ts.NodeFlags.Const) {
      const exported = statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
      for (const { name, initializer } of statement.declarationList.declarations) {
        if (!ts.isIdentifier(name) || !initializer) return void this.#problems.push(`line ${this.#line(statement)}`);
        this.#locals.add(name.text);
        this.#value(initializer, name.text);
        const value = ObjectFile.#unwrap(initializer);
        if (exported && ts.isObjectLiteralExpression(value)) this.#members(name.text, value);
      }
      return;
    }
    const expression = ts.isExpressionStatement(statement) ? ObjectFile.#unwrap(statement.expression) : null;
    if (expression && ts.isStringLiteral(expression)) return;
    if (
      expression &&
      ts.isBinaryExpression(expression) &&
      expression.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isPropertyAccessExpression(expression.left) &&
      ts.isIdentifier(expression.left.expression) &&
      this.#locals.has(expression.left.expression.text)
    ) {
      this.#value(expression.right);
      return this.#member(`${expression.left.expression.text}.${expression.left.name.text}`, expression.right);
    }
    this.#problems.push(`line ${this.#line(statement)} runs at load`);
  }

  #import(statement: ts.ImportDeclaration) {
    const clause = statement.importClause;
    if (!clause) return void this.#problems.push(`line ${this.#line(statement)} imports for its effect`);
    if (clause.phaseModifier === ts.SyntaxKind.TypeKeyword || !ts.isStringLiteral(statement.moduleSpecifier)) return;
    const specifier = statement.moduleSpecifier.text;
    if (clause.name) this.#imports.set(clause.name.text, specifier);
    const bindings = clause.namedBindings;
    if (bindings && ts.isNamespaceImport(bindings)) this.#imports.set(bindings.name.text, specifier);
    else
      for (const element of bindings?.elements ?? [])
        if (!element.isTypeOnly) this.#imports.set(element.name.text, specifier);
  }

  #value(node: ts.Expression, owner?: string): void {
    const value = ObjectFile.#unwrap(node);
    if (ts.isIdentifier(value) || ts.isLiteralExpression(value) || ts.isArrowFunction(value)) return;
    if (ts.isFunctionExpression(value) || value.kind === ts.SyntaxKind.TrueKeyword) return;
    if (value.kind === ts.SyntaxKind.FalseKeyword || value.kind === ts.SyntaxKind.NullKeyword) return;
    if (ts.isPropertyAccessExpression(value)) {
      this.#value(value.expression);
      return;
    }
    if (ts.isObjectLiteralExpression(value)) {
      for (const property of value.properties)
        if (ts.isPropertyAssignment(property)) this.#value(property.initializer);
        else if (ts.isSpreadAssignment(property)) this.#value(property.expression);
      return;
    }
    const [target, ...sources] = ts.isCallExpression(value) && this.#isObjectAssign(value) ? value.arguments : [];
    if (target && ts.isIdentifier(target) && this.#locals.has(target.text)) {
      for (const source of sources) {
        this.#value(source);
        const literal = ObjectFile.#unwrap(source);
        if (ts.isObjectLiteralExpression(literal)) this.#members(owner ?? target.text, literal);
      }
      return;
    }
    this.#problems.push(`line ${this.#line(value)} calls or assigns at load`);
  }

  #isObjectAssign(call: ts.CallExpression) {
    const callee = call.expression;
    return ts.isPropertyAccessExpression(callee) && callee.getText(this.#sourceFile) === "Object.assign";
  }

  #members(owner: string, literal: ts.ObjectLiteralExpression) {
    for (const property of literal.properties) {
      const key = property.name && ts.isIdentifier(property.name) ? property.name.text : null;
      if (ts.isShorthandPropertyAssignment(property)) this.#member(`${owner}.${property.name.text}`, property.name);
      else if (key && ts.isPropertyAssignment(property)) this.#member(`${owner}.${key}`, property.initializer);
      else this.#problems.push(`${owner} has a member at line ${this.#line(property)} no file holds`);
    }
  }

  #member(name: string, node: ts.Expression) {
    const value = ObjectFile.#unwrap(node);
    if (ts.isObjectLiteralExpression(value)) return this.#members(name, value);
    const specifier = ts.isIdentifier(value) ? this.#imports.get(value.text) : undefined;
    if (!specifier) return void this.#problems.push(`${name} is declared in the object's own file`);
    if (!this.#useClient || !specifier.startsWith(".")) return;
    const base = path.resolve(path.dirname(this.#file), specifier);
    const file = ObjectFile.#extensions
      .map((extension) => base + extension)
      .find((candidate) => fs.existsSync(candidate));
    if (!file || !ObjectFile.#startsWithUseClient(fs.readFileSync(file, "utf8")))
      this.#problems.push(`${name} leaves a "use client" object for a server file`);
  }
}

const objectFiles = fs
  .readdirSync(import.meta.dir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .flatMap((entry) => ["index.ts", "index.tsx"].map((name) => path.join(import.meta.dir, entry.name, name)))
  .filter((file) => fs.existsSync(file));

describe("akanjs/ui object files", () => {
  test("each only binds names at load, and each member comes from a file of its own", () => {
    const problems = objectFiles.flatMap((file) =>
      new ObjectFile(file).problems().map((problem) => `${path.relative(import.meta.dir, file)}: ${problem}`),
    );
    expect(objectFiles.length).toBeGreaterThanOrEqual(16);
    //? The generated root layout imports System/index.tsx, whose imports the build reads to swap in SSR.tsx.
    expect(problems).toEqual(["System/index.tsx: System.Provider is declared in the object's own file"]);
  });

  test("a call at load, a member declared in place, or a server member of a client object is refused", () => {
    const file = path.join(import.meta.dir, "Field/index.tsx");
    const source = [
      `"use client";`,
      `import { memo } from "react";`,
      `import { Text } from "./Text";`,
      `import { Edit } from "../Load/Edit";`,
      `const Section = () => null;`,
      `const Inline = () => null;`,
      `export const Field = Object.assign(Section, { Text: memo(Text), Inline, Edit });`,
    ].join("\n");
    expect(new ObjectFile(file, source).problems()).toEqual([
      "line 7 calls or assigns at load",
      "Field.Text is declared in the object's own file",
      "Field.Inline is declared in the object's own file",
      `Field.Edit leaves a "use client" object for a server file`,
    ]);
  });
});
