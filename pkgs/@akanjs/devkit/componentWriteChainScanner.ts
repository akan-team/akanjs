import ts from "typescript";
import { ComponentSizeScanner } from "./componentSizeScanner";
import { StoreAccessScanner } from "./storeAccessScanner";
import { WritePath } from "./writePath";
import type { WritingActionIndex } from "./writingActionIndex";

export interface ComponentWriteChain {
  component: string;
  line: number;
  writes: string[];
  writeCount: number;
}

//? A callback an array method or a promise runs belongs to the handler that started it; any other function is one.
export class ComponentWriteChainScanner {
  static readonly #inlineCallers = new Set([
    "map",
    "flatMap",
    "forEach",
    "filter",
    "reduce",
    "some",
    "every",
    "find",
    "findIndex",
    "then",
    "catch",
    "finally",
  ]);
  readonly #index: WritingActionIndex;

  constructor(index: WritingActionIndex) {
    this.#index = index;
  }

  scan(sourceFile: ts.SourceFile): ComponentWriteChain[] {
    const stNames = StoreAccessScanner.stNamesOf(sourceFile);
    if (!stNames.size) return [];
    const path = new WritePath(
      (call) => {
        const action = ComponentWriteChainScanner.#actionOf(call.expression, stNames);
        return !!action && this.#index.isWritingAction(action);
      },
      { enters: ComponentWriteChainScanner.#isInlineCallback },
    );
    return ComponentSizeScanner.componentsAndHooksOf(sourceFile).flatMap(({ name, node }) =>
      ComponentWriteChainScanner.#handlersIn(node).flatMap((handler) => {
        const writes = path.along(handler);
        const writeCount = path.countOf(writes);
        const second = writes[1] ?? writes[0];
        if (writeCount < 2 || !second) return [];
        return [
          {
            component: name,
            line: sourceFile.getLineAndCharacterOfPosition(second.getStart(sourceFile)).line + 1,
            writes: writes.map((call) => path.labelOf(call, sourceFile)),
            writeCount,
          },
        ];
      }),
    );
  }

  static #handlersIn(component: ts.Node) {
    const bodies: ts.ConciseBody[] = [];
    const visit = (node: ts.Node) => {
      if (
        ComponentWriteChainScanner.#isFunction(node) &&
        node.body &&
        !ComponentWriteChainScanner.#isInlineCallback(node)
      )
        bodies.push(node.body);
      ts.forEachChild(node, visit);
    };
    visit(component);
    return bodies;
  }

  static #isFunction(node: ts.Node): node is ts.FunctionLikeDeclaration {
    return (
      ts.isArrowFunction(node) ||
      ts.isFunctionExpression(node) ||
      ts.isFunctionDeclaration(node) ||
      ts.isMethodDeclaration(node)
    );
  }

  static #isInlineCallback(fn: ts.Node) {
    const call = fn.parent;
    return (
      !!call &&
      ts.isCallExpression(call) &&
      call.arguments.some((arg) => arg === fn) &&
      ts.isPropertyAccessExpression(call.expression) &&
      ComponentWriteChainScanner.#inlineCallers.has(call.expression.name.text)
    );
  }

  static #actionOf(callee: ts.Expression, stNames: Set<string>) {
    if (!ts.isPropertyAccessExpression(callee) || !ts.isPropertyAccessExpression(callee.expression)) return null;
    const { expression: st, name } = callee.expression;
    return ts.isIdentifier(st) && stNames.has(st.text) && name.text === "do" ? callee.name.text : null;
  }
}
