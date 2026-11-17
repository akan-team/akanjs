import ts from "typescript";
import { RuntimeLexicalScope } from "./runtimeLexicalScope";
import type { RuntimeNameTable, RuntimeNeed, RuntimeOwner } from "./runtimeNameTable";
import { uncast } from "./runtimeSyntax";

type SlicePart = "sliceName" | "refName";

export type RuntimeSliceKeyPiece = string | { part: SlicePart; capitalized: boolean };

export interface RuntimeSlice {
  sliceName: string;
  refName: string | null;
  loads: (owner: RuntimeOwner, needs: RuntimeNeed) => boolean;
}

interface Search {
  object: ts.Identifier | null;
}

const maxDepth = 8;
const sliceType = { name: "SliceMeta", from: "akanjs/fetch" };
const capitalizer = { name: "capitalize", from: "akanjs/common" };
const isPart = (name: string | null): name is SlicePart => name === "sliceName" || name === "refName";
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export class RuntimeSliceKey {
  static readonly #slices = new WeakMap<RuntimeNameTable, RuntimeSlice[]>();
  readonly #lexical: RuntimeLexicalScope;
  readonly #source: ts.SourceFile;

  constructor(lexical: RuntimeLexicalScope, source: ts.SourceFile) {
    this.#lexical = lexical;
    this.#source = source;
  }

  piecesOf(expression: ts.Expression): RuntimeSliceKeyPiece[] | null {
    const pieces = this.#piecesOf(expression, { object: null }, 0);
    return pieces?.some((piece) => typeof piece !== "string") ? pieces : null;
  }

  copiesSliceName(expression: ts.Expression): boolean {
    const [only, ...rest] = this.#piecesOf(expression, { object: null }, 0) ?? [];
    return !rest.length && !!only && typeof only !== "string" && !only.capitalized && only.part === "sliceName";
  }

  static nameOf(pieces: RuntimeSliceKeyPiece[], slice: RuntimeSlice): string | null {
    let name = "";
    for (const piece of pieces) {
      const text = typeof piece === "string" ? piece : slice[piece.part];
      if (text === null) return null;
      name += typeof piece !== "string" && piece.capitalized ? capitalize(text) : text;
    }
    return name;
  }

  //? A slice arrives from a client file naming it or from the server with its model's reference: `loads` is what both loaded.
  static slicesOf(table: RuntimeNameTable): RuntimeSlice[] {
    const known = RuntimeSliceKey.#slices.get(table);
    if (known) return known;
    const names = new Set([...table.keysOf("fetch.slice"), ...table.keysOf("st.slice")]);
    const slices = [...names].map((sliceName): RuntimeSlice => {
      const named = [table.lookup("fetch.slice", sliceName), table.lookup("st.slice", sliceName)].flatMap((entry) =>
        entry ? [entry] : [],
      );
      const refName = named.flatMap(({ owners }) => owners)[0]?.module ?? null;
      const store = refName === null ? null : table.lookup("st.use", refName);
      const handed = store ?? (refName === null ? null : table.lookup("fetch.serializedSignal", refName));
      const ways = [
        ...named.map(({ owners, uses, needs }) => [
          ...owners.map((owner) => ({ owner, needs })),
          ...uses.map((owner) => ({ owner, needs: "descriptor" as const })),
        ]),
        (handed?.owners ?? []).map((owner) => ({ owner, needs: store ? ("store" as const) : ("descriptor" as const) })),
      ];
      const loads = (owner: RuntimeOwner, needs: RuntimeNeed) =>
        ways.every((way) =>
          way.some(
            (loaded) =>
              loaded.owner.scope === owner.scope &&
              loaded.owner.module === owner.module &&
              (loaded.needs === "store" || needs === "descriptor"),
          ),
        );
      return { sliceName, refName, loads };
    });
    RuntimeSliceKey.#slices.set(table, slices);
    return slices;
  }

  #piecesOf(expression: ts.Expression, search: Search, depth: number): RuntimeSliceKeyPiece[] | null {
    const value = uncast(expression);
    if (ts.isStringLiteralLike(value)) return [value.text];
    if (ts.isTemplateExpression(value)) {
      const pieces: RuntimeSliceKeyPiece[] = [value.head.text];
      for (const span of value.templateSpans) {
        const inner = this.#piecesOf(span.expression, search, depth);
        if (!inner) return null;
        pieces.push(...inner, span.literal.text);
      }
      return pieces;
    }
    if (ts.isBinaryExpression(value) && value.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const left = this.#piecesOf(value.left, search, depth);
      const right = left && this.#piecesOf(value.right, search, depth);
      return left && right ? [...left, ...right] : null;
    }
    if (ts.isCallExpression(value)) {
      const [argument, ...rest] = value.arguments;
      const callee = uncast(value.expression);
      if (!argument || rest.length || !ts.isIdentifier(callee) || !this.#imports(callee, capitalizer)) return null;
      const [first, ...others] = (this.#piecesOf(argument, search, depth) ?? []).filter((piece) => piece !== "");
      if (first === undefined) return null;
      return [typeof first === "string" ? capitalize(first) : { ...first, capitalized: true }, ...others];
    }
    if (ts.isPropertyAccessExpression(value)) {
      const object = uncast(value.expression);
      const part = value.name.text;
      const slice = isPart(part) && ts.isIdentifier(object) && this.#isSlice(object, search);
      return slice ? [{ part, capitalized: false }] : null;
    }
    return ts.isIdentifier(value) && depth < maxDepth ? this.#namedPieces(value, search, depth) : null;
  }

  #namedPieces(identifier: ts.Identifier, search: Search, depth: number): RuntimeSliceKeyPiece[] | null {
    const name = this.#lexical.resolve(identifier);
    const declared = name?.parent;
    if (!declared || !("name" in declared) || declared.name !== name) return null;
    if (ts.isVariableDeclaration(declared))
      return RuntimeSliceKey.#isConst(declared) && declared.initializer
        ? this.#piecesOf(declared.initializer, search, depth + 1)
        : null;
    const taken = ts.isBindingElement(declared) ? RuntimeSliceKey.#takenFrom(declared) : null;
    const holder = taken?.holder;
    if (!taken || !holder || !isPart(taken.key) || !ts.isVariableDeclaration(holder)) return null;
    const object = RuntimeSliceKey.#isConst(holder) && holder.initializer ? uncast(holder.initializer) : null;
    const slice = !!object && ts.isIdentifier(object) && this.#isSlice(object, search);
    return slice ? [{ part: taken.key, capitalized: false }] : null;
  }

  #isSlice(identifier: ts.Identifier, search: Search) {
    const name = this.#lexical.resolve(identifier);
    const declared = name?.parent;
    if (!name || !declared || !("name" in declared) || declared.name !== name) return false;
    search.object ??= name;
    if (search.object !== name) return false;
    if (ts.isParameter(declared))
      return (
        !declared.dotDotDotToken &&
        !declared.initializer &&
        !this.#isReassigned(name, declared.parent) &&
        this.#isSliceType(declared.type, 0)
      );
    const taken = ts.isBindingElement(declared) ? RuntimeSliceKey.#takenFrom(declared) : null;
    const holder = taken?.holder;
    if (!taken || !holder || taken.key === null || !ts.isParameter(holder) || holder.dotDotDotToken) return false;
    if (holder.initializer || this.#isReassigned(name, holder.parent)) return false;
    return this.#isSliceType(this.#memberType(holder.type, taken.key, 0), 0);
  }

  #isReassigned(name: ts.Identifier, scope: ts.Node) {
    let found = false;
    const visit = (node: ts.Node) => {
      if (found) return;
      if (ts.isIdentifier(node) && node.text === name.text && RuntimeSliceKey.#isTarget(node)) {
        found = RuntimeLexicalScope.isReference(node) && this.#lexical.resolve(node) === name;
        return;
      }
      ts.forEachChild(node, visit);
    };
    visit(scope);
    return found;
  }

  static #isTarget(node: ts.Node) {
    let current = node;
    while (
      ts.isParenthesizedExpression(current.parent) ||
      ts.isNonNullExpression(current.parent) ||
      ts.isAsExpression(current.parent) ||
      ts.isTypeAssertionExpression(current.parent) ||
      ts.isSatisfiesExpression(current.parent) ||
      ts.isSpreadElement(current.parent) ||
      ts.isSpreadAssignment(current.parent) ||
      ts.isArrayLiteralExpression(current.parent) ||
      ts.isObjectLiteralExpression(current.parent) ||
      ts.isShorthandPropertyAssignment(current.parent) ||
      (ts.isPropertyAssignment(current.parent) && current.parent.initializer === current)
    )
      current = current.parent;
    const parent = current.parent;
    if (ts.isBinaryExpression(parent))
      return (
        parent.left === current &&
        parent.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
        parent.operatorToken.kind <= ts.SyntaxKind.LastAssignment
      );
    if (ts.isPrefixUnaryExpression(parent) || ts.isPostfixUnaryExpression(parent))
      return parent.operator === ts.SyntaxKind.PlusPlusToken || parent.operator === ts.SyntaxKind.MinusMinusToken;
    return (ts.isForInStatement(parent) || ts.isForOfStatement(parent)) && parent.initializer === current;
  }

  #isSliceType(type: ts.TypeNode | undefined, depth: number): boolean {
    if (!type || depth > maxDepth) return false;
    if (ts.isParenthesizedTypeNode(type)) return this.#isSliceType(type.type, depth + 1);
    if (ts.isIntersectionTypeNode(type)) return type.types.some((member) => this.#isSliceType(member, depth + 1));
    if (ts.isUnionTypeNode(type)) {
      const [only, ...rest] = type.types.filter((member) => !RuntimeSliceKey.#isEmptyType(member));
      return !rest.length && this.#isSliceType(only, depth + 1);
    }
    if (!ts.isTypeReferenceNode(type) || !ts.isIdentifier(type.typeName)) return false;
    if (this.#imports(type.typeName, sliceType)) return true;
    const local = this.#localType(type.typeName);
    if (local && ts.isTypeAliasDeclaration(local)) return this.#isSliceType(local.type, depth + 1);
    const bases = local?.heritageClauses?.flatMap((clause) => [...clause.types]) ?? [];
    return bases.some((base) => ts.isIdentifier(base.expression) && this.#imports(base.expression, sliceType));
  }

  #memberType(type: ts.TypeNode | undefined, key: string, depth: number): ts.TypeNode | undefined {
    if (!type || depth > maxDepth) return undefined;
    if (ts.isIntersectionTypeNode(type))
      return type.types.map((member) => this.#memberType(member, key, depth + 1)).find((found) => !!found);
    const local =
      ts.isTypeReferenceNode(type) && ts.isIdentifier(type.typeName) ? this.#localType(type.typeName) : null;
    if (local && ts.isTypeAliasDeclaration(local)) return this.#memberType(local.type, key, depth + 1);
    const members = local?.members ?? (ts.isTypeLiteralNode(type) ? type.members : []);
    const member = members.find(
      (candidate) =>
        ts.isPropertySignature(candidate) && ts.isIdentifier(candidate.name) && candidate.name.text === key,
    );
    return member && ts.isPropertySignature(member) ? member.type : undefined;
  }

  #localType(name: ts.Identifier) {
    if (this.#lexical.resolve(name)) return null;
    const found = this.#source.statements.filter(
      (statement): statement is ts.InterfaceDeclaration | ts.TypeAliasDeclaration =>
        (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) &&
        statement.name.text === name.text &&
        !statement.typeParameters,
    );
    return found.length === 1 ? (found[0] ?? null) : null;
  }

  #imports(identifier: ts.Identifier, { name, from }: { name: string; from: string }) {
    const specifier = this.#lexical.resolve(identifier)?.parent;
    if (!specifier || !ts.isImportSpecifier(specifier)) return false;
    const module = specifier.parent.parent.parent.moduleSpecifier;
    return (
      (specifier.propertyName ?? specifier.name).text === name && ts.isStringLiteral(module) && module.text === from
    );
  }

  static #takenFrom(element: ts.BindingElement) {
    const pattern = element.parent;
    if (element.dotDotDotToken || element.initializer || !ts.isObjectBindingPattern(pattern)) return null;
    const key = element.propertyName ?? element.name;
    return { key: ts.isIdentifier(key) || ts.isStringLiteralLike(key) ? key.text : null, holder: pattern.parent };
  }

  static #isConst(declaration: ts.VariableDeclaration) {
    const list = declaration.parent;
    return ts.isVariableDeclarationList(list) && !!(list.flags & ts.NodeFlags.Const);
  }

  static #isEmptyType(type: ts.TypeNode) {
    if (type.kind === ts.SyntaxKind.UndefinedKeyword) return true;
    return ts.isLiteralTypeNode(type) && type.literal.kind === ts.SyntaxKind.NullKeyword;
  }
}
