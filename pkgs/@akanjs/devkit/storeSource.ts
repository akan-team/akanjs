import { modelNames } from "akanjs/common";
import ts from "typescript";
import type { SourceFileInfo } from "./qualityScanner";

export interface StoreClass {
  name: string;
  refName: string | null;
}

export interface StoreMethod {
  store: string;
  name: string;
  isStatic: boolean;
  body: ts.Block;
}

export type StoreCallTarget =
  | { kind: "fetch"; name: string }
  | { kind: "action"; name: string; isOwn: boolean }
  | { kind: "static"; store: string; name: string };

export class StoreSource {
  readonly file: string;
  readonly stores: StoreClass[] = [];
  readonly methods: StoreMethod[] = [];
  readonly #fetchNames: Set<string>;
  readonly #ownActionsByStore = new Map<string, Set<string>>();
  readonly #rootAliasesByMethod = new Map<StoreMethod, Set<string>>();

  //? The actions `store()` generates that send a mutation; `upload<Field>On<Model>` only stages a file the form saves.
  static generatedWritesOf(refName: string) {
    const names = modelNames(refName);
    return [
      names.createModel,
      names.updateModel,
      names.removeModel,
      names.mergeModel,
      names.createModelInForm,
      names.updateModelInForm,
      names.submitModel,
    ];
  }

  constructor({ file, sourceFile }: Pick<SourceFileInfo, "file" | "sourceFile">) {
    this.file = file;
    this.#fetchNames = StoreSource.#fetchBindingsOf(sourceFile);
    for (const statement of sourceFile.statements) {
      if (!ts.isClassDeclaration(statement) || !statement.name) continue;
      const refName = StoreSource.#refNameOf(statement);
      if (refName === undefined) continue;
      const store = statement.name.text;
      this.stores.push({ name: store, refName });
      const ownActions = new Set(refName ? StoreSource.generatedWritesOf(refName) : []);
      for (const member of statement.members) {
        if (!ts.isMethodDeclaration(member) || !member.body) continue;
        const isStatic = !!ts.getModifiers(member)?.some(({ kind }) => kind === ts.SyntaxKind.StaticKeyword);
        const name = member.name.getText(sourceFile);
        if (!isStatic) ownActions.add(name);
        const method = { store, name, isStatic, body: member.body };
        this.methods.push(method);
        this.#rootAliasesByMethod.set(method, StoreSource.#rootAliasesIn(member));
      }
      this.#ownActionsByStore.set(store, ownActions);
    }
  }

  targetsIn(method: StoreMethod) {
    const targets: StoreCallTarget[] = [];
    const visit = (node: ts.Node) => {
      const target = ts.isCallExpression(node) ? this.targetOf(method, node) : null;
      if (target) targets.push(target);
      ts.forEachChild(node, visit);
    };
    visit(method.body);
    return targets;
  }

  targetOf(method: StoreMethod, call: ts.CallExpression): StoreCallTarget | null {
    const callee = call.expression;
    if (!ts.isPropertyAccessExpression(callee) && !ts.isElementAccessExpression(callee)) return null;
    const name = ts.isPropertyAccessExpression(callee)
      ? callee.name.text
      : ts.isStringLiteralLike(callee.argumentExpression)
        ? callee.argumentExpression.text
        : null;
    if (name === null) return null;
    const receiver = StoreSource.#unwrap(callee.expression);
    const isThis = receiver.kind === ts.SyntaxKind.ThisKeyword;
    if (isThis && method.isStatic) return { kind: "static", store: method.store, name };
    if (!isThis && !ts.isIdentifier(receiver)) return null;
    if (ts.isIdentifier(receiver) && this.#fetchNames.has(receiver.text)) return { kind: "fetch", name };
    if (isThis || (ts.isIdentifier(receiver) && this.#rootAliasesByMethod.get(method)?.has(receiver.text)))
      return { kind: "action", name, isOwn: !!this.#ownActionsByStore.get(method.store)?.has(name) };
    return ts.isIdentifier(receiver) ? { kind: "static", store: receiver.text, name } : null;
  }

  //? `this`, cast to `RootStore` or not, an alias of it, or a `RootStore` parameter reaches every store's action.
  static #rootAliasesIn(method: ts.MethodDeclaration) {
    const aliases = new Set<string>();
    const visit = (node: ts.Node) => {
      if (ts.isParameter(node) && ts.isIdentifier(node.name) && StoreSource.#isRootStoreType(node.type))
        aliases.add(node.name.text);
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer &&
        StoreSource.#unwrap(node.initializer).kind === ts.SyntaxKind.ThisKeyword
      )
        aliases.add(node.name.text);
      ts.forEachChild(node, visit);
    };
    visit(method);
    return aliases;
  }

  static #isRootStoreType(type: ts.TypeNode | undefined) {
    return (
      !!type && ts.isTypeReferenceNode(type) && ts.isIdentifier(type.typeName) && type.typeName.text === "RootStore"
    );
  }

  static #unwrap(expression: ts.Expression) {
    let current = expression;
    while (
      ts.isParenthesizedExpression(current) ||
      ts.isAsExpression(current) ||
      ts.isTypeAssertionExpression(current) ||
      ts.isSatisfiesExpression(current) ||
      ts.isNonNullExpression(current)
    )
      current = current.expression;
    return current;
  }

  static #refNameOf(statement: ts.ClassDeclaration) {
    for (const clause of statement.heritageClauses ?? []) {
      if (clause.token !== ts.SyntaxKind.ExtendsKeyword) continue;
      for (const { expression } of clause.types) {
        if (!ts.isCallExpression(expression) || !ts.isIdentifier(expression.expression)) continue;
        if (expression.expression.text !== "store") continue;
        const sig = expression.arguments[0];
        return sig && ts.isPropertyAccessExpression(sig) ? sig.name.text : null;
      }
    }
    return undefined;
  }

  static #fetchBindingsOf(sourceFile: ts.SourceFile) {
    const names = new Set<string>();
    for (const statement of sourceFile.statements) {
      if (!ts.isImportDeclaration(statement) || statement.importClause?.isTypeOnly) continue;
      const bindings = statement.importClause?.namedBindings;
      if (!bindings || !ts.isNamedImports(bindings)) continue;
      for (const element of bindings.elements)
        if (!element.isTypeOnly && (element.propertyName ?? element.name).text === "fetch")
          names.add(element.name.text);
    }
    return names;
  }
}
