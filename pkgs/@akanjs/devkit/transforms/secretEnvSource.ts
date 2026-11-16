import path from "node:path";
import { Logger } from "akanjs/common";
import type { SecretEnvKind } from "akanjs/server/lifecycle/secretEnv";
import ts from "typescript";
import { SecretEnvName } from "./secretEnvName";
import { ServerEnvProfile } from "./serverEnvProfile";

//* `inline` keeps the literal as the read's fallback; `mark` wraps it with its variable's name, for a listing.
export type SecretEnvMode = "read" | "inline" | "mark";

interface Edit {
  start: number;
  end: number;
  text: string;
}

//* Reads source text alone, so a secret that is computed, imported or spread stays as written.
export class SecretEnvSource {
  static readonly markKey = "__akanSecretEnv";
  static readonly #runtime = "akanjs/server/lifecycle/secretEnv";
  static readonly #binding = "__akanSecretEnv";
  static readonly #dynamic = Symbol("dynamic");

  readonly #file: string;
  readonly #source: ts.SourceFile;
  readonly #mode: SecretEnvMode;
  readonly #edits: Edit[] = [];
  readonly #pathOfName = new Map<string, string>();

  private constructor(file: string, contents: string, mode: SecretEnvMode) {
    this.#file = file;
    this.#source = ts.createSourceFile(file, contents, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    this.#mode = mode;
  }

  static rewrite(file: string, contents: string, mode: SecretEnvMode): string {
    return new SecretEnvSource(file, contents, mode).#rewritten(contents);
  }

  #rewritten(contents: string) {
    for (const statement of this.#source.statements) {
      if (!ts.isVariableStatement(statement)) continue;
      if (!statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) continue;
      for (const declaration of statement.declarationList.declarations)
        if (ts.isIdentifier(declaration.name) && declaration.name.text === "env" && declaration.initializer)
          this.#visit(declaration.initializer, [], false);
    }
    if (!this.#edits.length) return contents;
    const rewritten = this.#edits
      .toSorted((a, b) => b.start - a.start)
      .reduce((text, edit) => `${text.slice(0, edit.start)}${edit.text}${text.slice(edit.end)}`, contents);
    if (this.#mode === "mark") return rewritten;
    //? On the first line, so every line of the file keeps its number in an error the bundler reports.
    return `import { SecretEnv as ${SecretEnvSource.#binding} } from ${JSON.stringify(this.#runtimePath())}; ${rewritten}`;
  }

  //? As the env file itself would import it, then as this package does: a lib's env file may have no akanjs beside it.
  #runtimePath() {
    for (const from of [path.dirname(this.#file), import.meta.dir]) {
      try {
        return Bun.resolveSync(SecretEnvSource.#runtime, from);
      } catch {}
    }
    throw new Error(
      `${this.#file} holds secret values, which the build reads from the process env through ${SecretEnvSource.#runtime}, and the installed akanjs has no such module. Install the akanjs of this akan version.`,
    );
  }

  static #unwrap(node: ts.Expression): ts.Expression {
    return ts.isParenthesizedExpression(node) ||
      ts.isAsExpression(node) ||
      ts.isSatisfiesExpression(node) ||
      ts.isNonNullExpression(node) ||
      ts.isTypeAssertionExpression(node)
      ? SecretEnvSource.#unwrap(node.expression)
      : node;
  }

  static #keyOf(name: ts.PropertyName): string | null {
    return ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name) ? name.text : null;
  }

  #visit(expression: ts.Expression, keys: string[], underSecret: boolean, beside?: ts.Expression): void {
    const node = SecretEnvSource.#unwrap(expression);
    if (ts.isObjectLiteralExpression(node)) {
      for (const property of node.properties) {
        const key = ts.isPropertyAssignment(property) ? SecretEnvSource.#keyOf(property.name) : null;
        if (key !== null && ts.isPropertyAssignment(property))
          this.#visit(property.initializer, [...keys, key], underSecret || Logger.isSecretKey(key));
      }
      return;
    }
    if (!keys.length) return;
    //? `process.env.X ?? "literal"`: the developer's own variable keeps its place ahead of the one read here.
    if (ts.isBinaryExpression(node)) {
      const { kind } = node.operatorToken;
      if (kind === ts.SyntaxKind.QuestionQuestionToken || kind === ts.SyntaxKind.BarBarToken)
        this.#visit(node.right, keys, underSecret, beside ?? expression);
      return;
    }
    if (ts.isStringLiteralLike(node)) {
      if (ServerEnvProfile.isSecret(node.text, underSecret))
        this.#replace(node, keys, node.text.includes("\n") ? "multiline" : "string", beside);
      return;
    }
    if (!ts.isArrayLiteralExpression(node)) return;
    const value = SecretEnvSource.#literal(node);
    if (value !== SecretEnvSource.#dynamic && ServerEnvProfile.secretPaths(value, underSecret).length)
      this.#replace(node, keys, "json", beside);
  }

  static #literal(expression: ts.Expression): unknown {
    const node = SecretEnvSource.#unwrap(expression);
    if (ts.isStringLiteralLike(node)) return node.text;
    if (ts.isNumericLiteral(node)) return Number(node.text);
    if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
    if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
    if (node.kind === ts.SyntaxKind.NullKeyword) return null;
    if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken) {
      const operand = SecretEnvSource.#literal(node.operand);
      return typeof operand === "number" ? -operand : SecretEnvSource.#dynamic;
    }
    if (ts.isArrayLiteralExpression(node)) {
      const items = node.elements.map((element) => SecretEnvSource.#literal(element));
      return items.includes(SecretEnvSource.#dynamic) ? SecretEnvSource.#dynamic : items;
    }
    if (!ts.isObjectLiteralExpression(node)) return SecretEnvSource.#dynamic;
    const entries: [string, unknown][] = [];
    for (const property of node.properties) {
      const key = ts.isPropertyAssignment(property) ? SecretEnvSource.#keyOf(property.name) : null;
      if (key === null || !ts.isPropertyAssignment(property)) return SecretEnvSource.#dynamic;
      const value = SecretEnvSource.#literal(property.initializer);
      if (value === SecretEnvSource.#dynamic) return SecretEnvSource.#dynamic;
      entries.push([key, value]);
    }
    return Object.fromEntries(entries);
  }

  //? A listing marks the whole `process.env.X ?? "literal"`, so it names the variable whether or not a shell sets X.
  #replace(node: ts.Expression, keys: string[], kind: SecretEnvKind, beside?: ts.Expression) {
    const at = keys.join(".");
    const name = SecretEnvName.of(keys);
    const refusal = SecretEnvName.refusal(name);
    if (refusal)
      throw new Error(
        `${this.#file} \`${at}\` is a secret a build would read from the environment variable ${name}, ${refusal}. Rename the key, or write \`process.env.<NAME>\` there yourself, which a build leaves as it is.`,
      );
    const taken = this.#pathOfName.get(name);
    if (taken !== undefined && taken !== at)
      throw new Error(
        `${this.#file} \`${taken}\` and \`${at}\` are secrets a build would both read from the environment variable ${name}. Rename one of the keys.`,
      );
    this.#pathOfName.set(name, at);
    const start = node.getStart(this.#source);
    const written = this.#source.text.slice(start, node.end);
    const read = `${SecretEnvSource.#binding}.${kind === "json" ? "json" : "read"}`;
    const text =
      this.#mode === "mark"
        ? `({ ${SecretEnvSource.markKey}: [${JSON.stringify(name)}, ${JSON.stringify(kind)}, ${written}] })`
        : this.#mode === "inline"
          ? `${read}(${JSON.stringify(name)}, ${written})`
          : `${read}(${JSON.stringify(name)})`;
    const marked = this.#mode === "mark" && beside ? beside : node;
    this.#edits.push({ start: marked.getStart(this.#source), end: marked.end, text });
  }
}
