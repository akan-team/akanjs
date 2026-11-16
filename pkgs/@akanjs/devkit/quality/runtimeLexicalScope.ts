import ts from "typescript";

export class RuntimeLexicalScope {
  readonly #declared = new WeakMap<ts.Node, Map<string, ts.Identifier>>();

  resolve(identifier: ts.Identifier): ts.Identifier | null {
    for (let node: ts.Node | undefined = identifier.parent; node; node = node.parent) {
      const names = this.#namesOf(node);
      const found = names?.get(identifier.text);
      if (found) return found;
    }
    return null;
  }

  static isReference(identifier: ts.Identifier) {
    const parent = identifier.parent;
    if (ts.isPropertyAccessExpression(parent)) return parent.expression === identifier;
    if (ts.isQualifiedName(parent)) return parent.left === identifier;
    if (ts.isBindingElement(parent)) return parent.initializer === identifier;
    if (ts.isPropertyAssignment(parent) || ts.isPropertyDeclaration(parent) || ts.isParameter(parent))
      return parent.initializer === identifier;
    if (ts.isVariableDeclaration(parent) || ts.isEnumMember(parent)) return parent.initializer === identifier;
    if (
      ts.isImportSpecifier(parent) ||
      ts.isImportClause(parent) ||
      ts.isNamespaceImport(parent) ||
      ts.isExportSpecifier(parent) ||
      ts.isJsxAttribute(parent) ||
      ts.isLabeledStatement(parent) ||
      ts.isBreakOrContinueStatement(parent) ||
      ts.isTypeParameterDeclaration(parent)
    )
      return false;
    if (
      (ts.isFunctionLike(parent) ||
        ts.isClassLike(parent) ||
        ts.isInterfaceDeclaration(parent) ||
        ts.isTypeAliasDeclaration(parent) ||
        ts.isEnumDeclaration(parent) ||
        ts.isModuleDeclaration(parent) ||
        ts.isPropertySignature(parent) ||
        ts.isGetAccessor(parent) ||
        ts.isSetAccessor(parent)) &&
      (parent as ts.NamedDeclaration).name === identifier
    )
      return false;
    return true;
  }

  #namesOf(node: ts.Node) {
    const cached = this.#declared.get(node);
    if (cached) return cached;
    const names = RuntimeLexicalScope.#collect(node);
    if (names) this.#declared.set(node, names);
    return names;
  }

  static #collect(node: ts.Node): Map<string, ts.Identifier> | null {
    const names = new Map<string, ts.Identifier>();
    const addBinding = (name: ts.BindingName) => {
      if (ts.isIdentifier(name)) names.set(name.text, name);
      else for (const element of name.elements) if (!ts.isOmittedExpression(element)) addBinding(element.name);
    };
    const addStatements = (statements: readonly ts.Statement[]) => {
      for (const statement of statements) {
        if (ts.isVariableStatement(statement))
          for (const declaration of statement.declarationList.declarations) addBinding(declaration.name);
        else if (
          (ts.isFunctionDeclaration(statement) ||
            ts.isClassDeclaration(statement) ||
            ts.isEnumDeclaration(statement)) &&
          statement.name
        )
          names.set(statement.name.text, statement.name);
        else if (ts.isImportDeclaration(statement)) RuntimeLexicalScope.#addImport(statement, names);
      }
    };
    if (ts.isSourceFile(node) || ts.isBlock(node) || ts.isModuleBlock(node)) addStatements(node.statements);
    else if (ts.isCaseBlock(node)) for (const clause of node.clauses) addStatements(clause.statements);
    else if (ts.isFunctionLike(node)) {
      for (const parameter of node.parameters) addBinding(parameter.name);
      if ((ts.isFunctionExpression(node) || ts.isClassExpression(node)) && node.name)
        names.set(node.name.text, node.name);
    } else if (ts.isForStatement(node) || ts.isForInStatement(node) || ts.isForOfStatement(node)) {
      const initializer = node.initializer;
      if (initializer && ts.isVariableDeclarationList(initializer))
        for (const declaration of initializer.declarations) addBinding(declaration.name);
    } else if (ts.isCatchClause(node) && node.variableDeclaration) addBinding(node.variableDeclaration.name);
    else return null;
    return names;
  }

  static #addImport(statement: ts.ImportDeclaration, names: Map<string, ts.Identifier>) {
    const clause = statement.importClause;
    if (!clause) return;
    if (clause.name) names.set(clause.name.text, clause.name);
    const bindings = clause.namedBindings;
    if (bindings && ts.isNamespaceImport(bindings)) names.set(bindings.name.text, bindings.name);
    else if (bindings) for (const element of bindings.elements) names.set(element.name.text, element.name);
  }
}
