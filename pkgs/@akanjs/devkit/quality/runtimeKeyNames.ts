import ts from "typescript";
import type { RuntimeLexicalScope } from "./runtimeLexicalScope";
import { staticName } from "./runtimeSyntax";

const maxDepth = 8;

export class RuntimeKeyNames {
  readonly #lexical: RuntimeLexicalScope;

  constructor(lexical: RuntimeLexicalScope) {
    this.#lexical = lexical;
  }

  //? An assertion to literal names wins over the value under it: the author states the key behaves as that name.
  namesOf(expression: ts.Expression, depth = 0): string[] | null {
    let value = expression;
    while (ts.isParenthesizedExpression(value) || ts.isNonNullExpression(value)) value = value.expression;
    if (ts.isStringLiteralLike(value) || ts.isNumericLiteral(value)) return [value.text];
    if (ts.isAsExpression(value) || ts.isTypeAssertionExpression(value) || ts.isSatisfiesExpression(value))
      return RuntimeKeyNames.#literalsOf(value.type) ?? this.namesOf(value.expression, depth);
    const initializer = ts.isIdentifier(value) && depth < maxDepth ? this.constantOf(value) : null;
    return initializer ? this.namesOf(initializer, depth + 1) : null;
  }

  ofProperty(name: ts.PropertyName | ts.BindingName): string[] | null {
    if (ts.isComputedPropertyName(name)) return this.namesOf(name.expression);
    const text = staticName(name);
    return text === null ? null : [text];
  }

  constantOf(identifier: ts.Identifier): ts.Expression | null {
    const declaration = this.#lexical.resolve(identifier)?.parent;
    if (!declaration || !ts.isVariableDeclaration(declaration) || !ts.isIdentifier(declaration.name)) return null;
    const list = declaration.parent;
    const constant = ts.isVariableDeclarationList(list) && !!(list.flags & ts.NodeFlags.Const);
    return constant ? (declaration.initializer ?? null) : null;
  }

  static #literalsOf(type: ts.TypeNode): string[] | null {
    if (ts.isParenthesizedTypeNode(type)) return RuntimeKeyNames.#literalsOf(type.type);
    if (ts.isLiteralTypeNode(type)) return ts.isStringLiteralLike(type.literal) ? [type.literal.text] : null;
    if (!ts.isUnionTypeNode(type)) return null;
    const names = type.types.map((member) => RuntimeKeyNames.#literalsOf(member));
    return names.every((member): member is string[] => member !== null) ? [...new Set(names.flat())] : null;
  }
}
