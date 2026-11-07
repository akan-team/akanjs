import ts from "typescript";

export interface ComponentSize {
  name: string;
  line: number;
  lineCount: number;
}

export interface ComponentNode {
  name: string;
  node: ts.FunctionDeclaration | ts.VariableDeclaration;
}

//? A hook is a component without markup: the same function-sized unit of screen code, so the same limits hold.
export class ComponentSizeScanner {
  static readonly #componentName = /^(?:[A-Z]|use[A-Z])[A-Za-z0-9]*$/;

  static componentsAndHooksOf(sourceFile: ts.SourceFile): ComponentNode[] {
    return sourceFile.statements.flatMap((statement): ComponentNode[] => {
      if (ts.isFunctionDeclaration(statement))
        return statement.name && statement.body && ComponentSizeScanner.#componentName.test(statement.name.text)
          ? [{ name: statement.name.text, node: statement }]
          : [];
      if (!ts.isVariableStatement(statement)) return [];
      return statement.declarationList.declarations.flatMap((declaration) =>
        ts.isIdentifier(declaration.name) &&
        ComponentSizeScanner.#componentName.test(declaration.name.text) &&
        declaration.initializer &&
        ComponentSizeScanner.#holdsFunction(declaration.initializer)
          ? [{ name: declaration.name.text, node: declaration }]
          : [],
      );
    });
  }

  measure(sourceFile: ts.SourceFile): ComponentSize[] {
    return ComponentSizeScanner.componentsAndHooksOf(sourceFile).map(({ name, node }) => {
      const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
      const endLine = sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
      return { name, line, lineCount: endLine - line + 1 };
    });
  }

  //? A wrapped component (`memo(() => …)`, `forwardRef(…)`) is still one component, measured with its wrapper.
  static #holdsFunction(expression: ts.Expression): boolean {
    let current = expression;
    while (ts.isParenthesizedExpression(current) || ts.isAsExpression(current) || ts.isSatisfiesExpression(current))
      current = current.expression;
    if (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) return true;
    return ts.isCallExpression(current) && current.arguments.some((arg) => ComponentSizeScanner.#holdsFunction(arg));
  }
}
