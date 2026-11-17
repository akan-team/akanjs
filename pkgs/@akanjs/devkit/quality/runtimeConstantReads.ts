import ts from "typescript";
import { type RuntimeConstantEntry, RuntimeConstantFacts } from "./runtimeConstantFacts";
import type { RuntimeNameTable, RuntimeOwner } from "./runtimeNameTable";
import { climb, memberName, type PositionedProblem, problemAt, sortedProblems, staticName } from "./runtimeSyntax";
import type { RuntimeUseProblem, RuntimeUseReason } from "./runtimeUse";

export interface RuntimeConstantName {
  name: string;
  owner: RuntimeOwner;
  file: string;
  //? The object `ConstantRegistry.buildModel` returns, which only the model's registration piece exports.
  model: boolean;
}

export type RuntimeConstantRead =
  | ({ kind: "member"; start: number; end: number } & RuntimeConstantName)
  | { kind: "destructure"; start: number; end: number; keys: ({ key: string } & RuntimeConstantName)[] };

export interface RuntimeConstantUse {
  reads: RuntimeConstantRead[];
  imports: RuntimeOwner[];
  problems: RuntimeUseProblem[];
}

export class RuntimeConstantReads {
  readonly #source: ts.SourceFile;
  readonly #fileName: string;
  readonly #consumer: RuntimeNameTable | null;
  readonly #recording: () => boolean;
  readonly #reads = new Map<number, RuntimeConstantRead>();
  readonly #imports = new Map<string, RuntimeOwner>();
  readonly #problems: PositionedProblem[] = [];

  constructor(source: ts.SourceFile, fileName: string, consumer: RuntimeNameTable | null, recording: () => boolean) {
    this.#source = source;
    this.#fileName = fileName;
    this.#consumer = consumer;
    this.#recording = recording;
  }

  get use(): RuntimeConstantUse {
    return {
      reads: [...this.#reads.values()].sort((a, b) => a.start - b.start),
      imports: [...this.#imports.values()],
      problems: sortedProblems([...this.#problems]),
    };
  }

  imported(specifier: string) {
    const owner = RuntimeConstantFacts.ownerOf(specifier, this.#fileName);
    if (owner) this.#imports.set(`${owner.scope}/${owner.module}`, owner);
  }

  follow(node: ts.Expression, scope: string) {
    const { current, parent } = climb(node);
    const access =
      (ts.isPropertyAccessExpression(parent) || ts.isElementAccessExpression(parent)) && parent.expression === current
        ? parent
        : null;
    if (access) this.#member(access, scope);
    else if (ts.isVariableDeclaration(parent) && parent.initializer === current)
      this.#destructure(parent, current, scope);
    else this.problem("passed-on", current, "the constants are handed on whole");
  }

  #member(access: ts.PropertyAccessExpression | ts.ElementAccessExpression, scope: string) {
    const name = memberName(access);
    const entry = name === null ? null : this.#consumer?.constantOf(scope, name);
    if (name === null) this.problem("computed-access", access, "the constant is picked at run time");
    else if (!entry) this.problem("unknown-name", access, `${name} is not a constant ${scope} hands out`);
    else if (entry.type === "namespace") this.follow(access, entry.scope);
    else {
      const [start, end] = [access.getStart(this.#source), access.end];
      this.#read({ kind: "member", start, end, ...RuntimeConstantReads.#nameOf(name, entry) });
    }
  }

  problem(reason: RuntimeUseReason, node: ts.Node, why: string) {
    if (!this.#recording()) return;
    const found = problemAt(this.#source, reason, node, why);
    if (!this.#problems.some(({ position }) => position === found.position)) this.#problems.push(found);
  }

  #destructure(declaration: ts.VariableDeclaration, initializer: ts.Expression, scope: string) {
    const list = declaration.parent;
    const statement = list.parent;
    const exported =
      ts.isVariableStatement(statement) &&
      !!statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
    const pattern = declaration.name;
    if (exported || !(list.flags & ts.NodeFlags.Const) || !ts.isObjectBindingPattern(pattern))
      return this.problem("passed-on", declaration, "the constants are held whole under another name");
    const keys: ({ key: string } & RuntimeConstantName)[] = [];
    for (const element of pattern.elements) {
      const key = element.propertyName ?? element.name;
      const name = ts.isIdentifier(key) ? key.text : staticName(key);
      const entry = name === null ? null : this.#consumer?.constantOf(scope, name);
      if (element.dotDotDotToken || name === null || !ts.isIdentifier(element.name))
        return this.problem("hidden-by-destructuring", element, "a rest, computed or nested key hides names");
      if (!entry) return this.problem("unknown-name", element, `${name} is not a constant ${scope} hands out`);
      if (entry.type === "namespace")
        return this.problem("passed-on", element, `${name} holds ${entry.scope}'s constants whole`);
      keys.push({ key: name, ...RuntimeConstantReads.#nameOf(name, entry) });
    }
    this.#read({ kind: "destructure", start: initializer.getStart(this.#source), end: initializer.end, keys });
  }

  #read(read: RuntimeConstantRead) {
    if (this.#recording()) this.#reads.set(read.start, read);
  }

  static #nameOf(name: string, entry: Exclude<RuntimeConstantEntry, { type: "namespace" }>): RuntimeConstantName {
    const { scope, module, file } = entry.fact;
    return { name, owner: { scope, module }, file, model: entry.type === "model" };
  }
}
