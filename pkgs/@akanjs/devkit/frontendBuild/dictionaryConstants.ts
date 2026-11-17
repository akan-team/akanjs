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
    const [, scalar, underscore, group] = fileName.match(constantFile) ?? [];
    if (!group) return;
    this.#kindOf.set(group, scalar ? "scalar" : underscore ? "service" : "model");
    const sourceFile = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
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
