import { capitalize, formSetterNames } from "akanjs/common";
import ts from "typescript";
import type { QualityWarning, SourceFileInfo } from "./qualityScanner";

// Only a setter passed by reference publishes its field (`data-akan-action`, agent tool). The grit rule flags only pure
// forwarding wrappers; this counts every field left unpublished whatever the reason. A zero-parameter handler is a
// button setting a constant, not a form control, so it is not counted.
export class FormSetterScanner {
  static #constantPath = /(?:^|\/)lib\/([^_/][^/]*)\/\1\.constant\.ts$/;
  static #baseFields = ["id", "createdAt", "updatedAt", "removedAt"];

  scan(sourceFiles: SourceFileInfo[]): QualityWarning[] {
    const fieldSetters = FormSetterScanner.#fieldSettersOf(sourceFiles);
    return sourceFiles
      .filter((sourceFile) => sourceFile.file.endsWith(".tsx"))
      .flatMap((f) => this.#scanFile(f, fieldSetters));
  }

  // Built forward from the constants: matching `set…On…` also caught slice setters such as `setPageOfProductOnSale`.
  static #fieldSettersOf(sourceFiles: SourceFileInfo[]) {
    const setters = new Set<string>();
    for (const { file, sourceFile } of sourceFiles) {
      const refName = FormSetterScanner.#constantPath.exec(file)?.[1];
      if (!refName) continue;
      const className = capitalize(refName);
      const fullModelClasses = new Set([`${className}Input`, `${className}Object`, `Light${className}`, className]);
      const keys = new Set(FormSetterScanner.#baseFields);
      for (const statement of sourceFile.statements)
        if (ts.isClassDeclaration(statement) && statement.name && fullModelClasses.has(statement.name.text))
          for (const key of FormSetterScanner.#viaFieldKeysOf(statement)) keys.add(key);
      for (const key of keys) setters.add(formSetterNames(className, key).setFieldOnModel);
    }
    return setters;
  }

  static #viaFieldKeysOf(declaration: ts.ClassDeclaration): string[] {
    const via = declaration.heritageClauses?.find((clause) => clause.token === ts.SyntaxKind.ExtendsKeyword)?.types[0]
      ?.expression;
    if (!via || !ts.isCallExpression(via)) return [];
    return via.arguments.flatMap((argument) => {
      if (!ts.isArrowFunction(argument) && !ts.isFunctionExpression(argument)) return [];
      const fields = FormSetterScanner.#returnedObjectOf(argument.body);
      return (fields?.properties ?? []).flatMap((property) =>
        property.name && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))
          ? [property.name.text]
          : [],
      );
    });
  }

  static #returnedObjectOf(body: ts.ConciseBody): ts.ObjectLiteralExpression | null {
    let expression: ts.Node | undefined = body;
    if (ts.isBlock(body)) expression = body.statements.find(ts.isReturnStatement)?.expression;
    while (expression && (ts.isParenthesizedExpression(expression) || ts.isAsExpression(expression)))
      expression = expression.expression;
    return expression && ts.isObjectLiteralExpression(expression) ? expression : null;
  }

  #scanFile({ file, sourceFile }: SourceFileInfo, fieldSetters: Set<string>): QualityWarning[] {
    const wrapped: { setter: string; line: number }[] = [];
    const visit = (node: ts.Node) => {
      if (ts.isJsxAttribute(node)) {
        const setter = FormSetterScanner.#wrappedSetterOf(node, fieldSetters);
        if (setter) wrapped.push({ setter, line: FormSetterScanner.#lineOf(sourceFile, node) });
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    if (!wrapped.length) return [];
    const setters = [...new Set(wrapped.map((entry) => entry.setter))].sort();
    return [
      {
        rule: "akan.agent.unpublished-form-setter",
        scope: "agent",
        severity: "warning",
        message:
          setters.length === 1
            ? `${setters[0]} is reached through a wrapper, so that field publishes no agent tool and carries no data-akan-action.`
            : `${setters.length} field setters are reached through a wrapper, so those fields publish no agent tool and carry no data-akan-action: ${setters.join(", ")}.`,
        file,
        line: wrapped[0]?.line,
        locations: wrapped.map(({ line }) => ({ file, line })),
      },
    ];
  }

  /** The setter a handler prop writes behind a wrapper, or null when it is passed by reference or absent. */
  static #wrappedSetterOf(attribute: ts.JsxAttribute, fieldSetters: Set<string>): string | null {
    if (!ts.isIdentifier(attribute.name) || !/^on[A-Z]/.test(attribute.name.text)) return null;
    const initializer = attribute.initializer;
    if (!initializer || !ts.isJsxExpression(initializer) || !initializer.expression) return null;
    const handler = initializer.expression;
    if (!ts.isArrowFunction(handler) && !ts.isFunctionExpression(handler)) return null;
    if (!handler.parameters.length) return null;
    return FormSetterScanner.#setterCallIn(handler.body, fieldSetters);
  }

  static #setterCallIn(node: ts.Node, fieldSetters: Set<string>): string | null {
    let found: string | null = null;
    const visit = (current: ts.Node) => {
      if (found) return;
      if (ts.isCallExpression(current) && ts.isPropertyAccessExpression(current.expression)) {
        const { expression, name } = current.expression;
        if (
          ts.isPropertyAccessExpression(expression) &&
          ts.isIdentifier(expression.expression) &&
          expression.expression.text === "st" &&
          expression.name.text === "do" &&
          fieldSetters.has(name.text)
        ) {
          found = name.text;
          return;
        }
      }
      ts.forEachChild(current, visit);
    };
    visit(node);
    return found;
  }

  static #lineOf(sourceFile: ts.SourceFile, node: ts.Node) {
    return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
  }
}
