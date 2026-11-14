import ts from "typescript";
import { ComponentSizeScanner } from "./componentSizeScanner";
import type { WritingActionIndex } from "./writingActionIndex";

export interface StoreAccessCount {
  component: string;
  line: number;
  accessCount: number;
}

const formSetterPrefixes = ["set", "add", "sub", "addOrSub", "upload"];
const startsUpper = (text: string) => /^[A-Z]/.test(text);

const isFormSetterName = (name: string) => {
  if (!/^\w+$/.test(name)) return false;
  if (name.startsWith("writeOn")) return startsUpper(name.slice("writeOn".length));
  return formSetterPrefixes.some(
    (prefix) =>
      name.startsWith(prefix) &&
      startsUpper(name.slice(prefix.length)) &&
      /On[A-Z]/.test(name.slice(prefix.length + 1)),
  );
};

//? A generated form setter only binds a field to its control: a long form is a size breach, not a busy component.
export class StoreAccessScanner {
  readonly #index: WritingActionIndex;

  constructor(index: WritingActionIndex) {
    this.#index = index;
  }

  static stNamesOf(sourceFile: ts.SourceFile) {
    return StoreAccessScanner.localNamesOf(sourceFile, "st");
  }

  static localNamesOf(sourceFile: ts.SourceFile, imported: string) {
    const names = new Set<string>();
    for (const statement of sourceFile.statements) {
      if (!ts.isImportDeclaration(statement) || statement.importClause?.isTypeOnly) continue;
      const bindings = statement.importClause?.namedBindings;
      if (!bindings || !ts.isNamedImports(bindings)) continue;
      for (const element of bindings.elements)
        if (!element.isTypeOnly && (element.propertyName ?? element.name).text === imported)
          names.add(element.name.text);
    }
    return names;
  }

  measure(sourceFile: ts.SourceFile): StoreAccessCount[] {
    const stNames = StoreAccessScanner.stNamesOf(sourceFile);
    if (!stNames.size) return [];
    return ComponentSizeScanner.componentsAndHooksOf(sourceFile).map(({ name, node }) => {
      let accessCount = 0;
      const visit = (child: ts.Node) => {
        if (
          ts.isPropertyAccessExpression(child) &&
          ts.isIdentifier(child.expression) &&
          stNames.has(child.expression.text) &&
          !this.#isFormSetter(child)
        )
          accessCount += 1;
        ts.forEachChild(child, visit);
      };
      visit(node);
      return {
        component: name,
        line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
        accessCount,
      };
    });
  }

  #isFormSetter(access: ts.PropertyAccessExpression) {
    const action = access.parent;
    return (
      access.name.text === "do" &&
      ts.isPropertyAccessExpression(action) &&
      action.expression === access &&
      isFormSetterName(action.name.text) &&
      !this.#index.isWritingAction(action.name.text)
    );
  }
}
