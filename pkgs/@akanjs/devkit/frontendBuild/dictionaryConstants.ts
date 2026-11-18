import path from "node:path";
import { createAst, createFactReader } from "@akanjs/language";
import { Glob } from "bun";
import ts from "typescript";

type GroupKind = "model" | "service" | "scalar" | "enum";

const constantFile = /(?:^|\/)lib\/(?:(__scalar)\/)?(_?)([A-Za-z0-9]+)\/\3\.constant\.ts$/;
const enumClass = /class\s+([A-Za-z0-9_$]+)\s+extends\s+enumOf\(\s*["'`]([A-Za-z0-9_$]+)["'`]/g;

//* The dictionary groups a model's texts reach: a framework view, list or form labels the model's fields, the enums
//* and scalars they hold, and the models they refer to (a relation shows the other model's name).
export class DictionaryConstants {
  static readonly #reader = createFactReader(ts, createAst(ts));
  readonly #groupOfClass = new Map<string, Set<string>>();
  readonly #kindOf = new Map<string, GroupKind>();
  readonly #typesOf = new Map<string, Set<string>>();
  readonly #reach = new Map<string, string[]>();
  readonly #statics = new Map<string, (string[] | null)[]>();
  readonly #classCount = new Map<string, number>();

  static async read(workspaceRoot: string, scopes: string[]): Promise<DictionaryConstants> {
    const constants = new DictionaryConstants();
    for (const scope of scopes)
      for await (const rel of new Glob("lib/**/*.constant.ts").scan({ cwd: path.join(workspaceRoot, scope) })) {
        const file = path.join(workspaceRoot, scope, rel);
        constants.add(`${scope}/${rel}`, await Bun.file(file).text());
      }
    return constants;
  }

  add(fileName: string, text: string) {
    const sourceFile = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    this.#addStatics(sourceFile);
    const [, scalar, underscore, group] = fileName.match(constantFile) ?? [];
    if (!group) return;
    this.#kindOf.set(group, scalar ? "scalar" : underscore ? "service" : "model");
    const types = this.#typesOf.get(group) ?? new Set<string>();
    for (const constant of DictionaryConstants.#reader.read(sourceFile, null).constants) {
      this.#classTo(constant.name, group);
      for (const field of constant.fields) if (field.type) types.add(field.type);
    }
    this.#typesOf.set(group, types);
    for (const [, name, ref] of text.matchAll(enumClass))
      if (name && ref) {
        this.#classTo(name, ref);
        this.#kindOf.set(ref, "enum");
      }
  }

  #addStatics(sourceFile: ts.SourceFile) {
    for (const statement of sourceFile.statements) {
      if (!ts.isClassDeclaration(statement) || !statement.name) continue;
      this.#classCount.set(statement.name.text, (this.#classCount.get(statement.name.text) ?? 0) + 1);
      for (const member of statement.members) {
        const name =
          member.name && (ts.isIdentifier(member.name) || ts.isStringLiteral(member.name)) && member.name.text;
        if (!name || !(ts.getCombinedModifierFlags(member) & ts.ModifierFlags.Static)) continue;
        const key = `${statement.name.text}.${name}`;
        const table = ts.isPropertyDeclaration(member) ? DictionaryConstants.#tableOf(member) : null;
        this.#statics.set(key, [...(this.#statics.get(key) ?? []), table]);
      }
    }
  }

  //? `as const` with no annotation types the static as its literals, so nothing but the written keys is assignable to it.
  static #tableOf(member: ts.PropertyDeclaration): string[] | null {
    let node = member.initializer;
    while (node && (ts.isParenthesizedExpression(node) || ts.isSatisfiesExpression(node))) node = node.expression;
    if (member.type || !node || !ts.isAsExpression(node) || !ts.isConstTypeReference(node.type)) return null;
    let table = node.expression;
    while (ts.isParenthesizedExpression(table)) table = table.expression;
    const values = ts.isArrayLiteralExpression(table)
      ? [...table.elements]
      : ts.isObjectLiteralExpression(table)
        ? table.properties.map((property) =>
            ts.isPropertyAssignment(property) && !ts.isComputedPropertyName(property.name)
              ? property.initializer
              : null,
          )
        : [null];
    const keys: string[] = [];
    for (const value of values) {
      if (!value || !ts.isStringLiteralLike(value)) return null;
      keys.push(value.text);
    }
    return keys;
  }

  //? An app and a lib may each declare a class of the name, and one that leaves the static out may inherit another.
  staticKeysOf(className: string, member: string): string[] | null {
    const tables = this.#statics.get(`${className}.${member}`);
    if (!tables || tables.length !== this.#classCount.get(className)) return null;
    const keys = new Set<string>();
    for (const table of tables) {
      if (!table) return null;
      for (const key of table) keys.add(key);
    }
    return [...keys];
  }

  #classTo(name: string, group: string) {
    this.#groupOfClass.set(name, (this.#groupOfClass.get(name) ?? new Set()).add(group));
  }

  groupsOfClass(name: string): string[] {
    return [...(this.#groupOfClass.get(name) ?? [])];
  }

  //? A relation is followed one step: the other model's name and its own enums and scalars, not its relations.
  reachOf(group: string): string[] {
    const known = this.#reach.get(group);
    if (known) return known;
    const reached = new Set<string>([group]);
    this.#holds(group, reached, true);
    const result = [...reached].sort();
    this.#reach.set(group, result);
    return result;
  }

  #holds(group: string, reached: Set<string>, followRelations: boolean) {
    for (const type of this.#typesOf.get(group) ?? [])
      for (const held of this.groupsOfClass(type)) {
        if (reached.has(held)) continue;
        const kind = this.#kindOf.get(held);
        if (kind === "model" || kind === "service") {
          if (!followRelations) continue;
          reached.add(held);
          this.#holds(held, reached, false);
        } else {
          reached.add(held);
          this.#holds(held, reached, followRelations);
        }
      }
  }
}
