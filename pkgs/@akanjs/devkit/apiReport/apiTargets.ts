import ts from "typescript";
import { ApiDeclarationPrinter } from "./apiDeclarationPrinter";

export interface ApiTarget {
  id: string;
  name: string;
  origin: string;
  file: ts.SourceFile | null;
  statements: ts.Statement[];
  thirdParty: string | null;
  members: ts.Symbol[] | null;
}

interface ImportBinding {
  specifier: string;
  imported: string;
}

//* Statements come from the emitted `.d.ts`, which also holds what the emit adds, such as a mixin class's `X_base`.
export class ApiTargets {
  readonly #program: ts.Program;
  readonly #checker: ts.TypeChecker;
  readonly #emitted: ReadonlyMap<string, string>;
  readonly #parsed = new Map<string, ts.SourceFile>();
  readonly #indexes = new Map<ts.SourceFile, Map<string, ts.Statement[]>>();
  readonly #imports = new Map<ts.SourceFile, Map<string, ImportBinding>>();
  readonly #modules = new Map<string, ts.SourceFile | null>();
  readonly #moduleExports = new Map<ts.SourceFile, Map<string, ts.Symbol>>();
  readonly #references = new Map<string, ApiTarget[]>();

  constructor(program: ts.Program, emitted: ReadonlyMap<string, string>) {
    this.#program = program;
    this.#checker = program.getTypeChecker();
    this.#emitted = emitted;
  }

  exportsOf(sourceFile: ts.SourceFile) {
    const moduleSymbol = this.#checker.getSymbolAtLocation(sourceFile);
    return moduleSymbol ? this.#checker.getExportsOfModule(moduleSymbol) : [];
  }

  typeTextOf(symbol: ts.Symbol) {
    const target = symbol.flags & ts.SymbolFlags.Alias ? this.#checker.getAliasedSymbol(symbol) : symbol;
    return this.#checker.typeToString(
      this.#checker.getTypeOfSymbol(target),
      undefined,
      ts.TypeFormatFlags.NoTruncation,
    );
  }

  ofSymbol(symbol: ts.Symbol): ApiTarget[] {
    const target = symbol.flags & ts.SymbolFlags.Alias ? this.#checker.getAliasedSymbol(symbol) : symbol;
    const targets = new Map<string, ApiTarget>();
    for (const declaration of target.declarations ?? []) {
      const resolved = this.#ofDeclaration(declaration);
      if (resolved && !targets.has(resolved.id)) targets.set(resolved.id, resolved);
    }
    return [...targets.values()];
  }

  expand(targets: ApiTarget[], seen = new Set<string>()): ApiTarget[] {
    return targets.flatMap((target) => {
      if (!target.members) return [target];
      if (seen.has(target.id)) return [];
      seen.add(target.id);
      return this.expand(
        target.members.flatMap((member) => this.ofSymbol(member)),
        seen,
      );
    });
  }

  referencesOf(target: ApiTarget): ApiTarget[] {
    const cached = this.#references.get(target.id);
    if (cached) return cached;
    const file = target.file;
    const found = file
      ? target.statements.flatMap((statement) =>
          this.#referencesIn(ApiDeclarationPrinter.prepared(statement), file, target.origin),
        )
      : [];
    const references = this.expand(found);
    this.#references.set(target.id, references);
    return references;
  }

  #ofDeclaration(declaration: ts.Declaration): ApiTarget | null {
    if (ts.isSourceFile(declaration)) {
      return {
        id: `${declaration.fileName}\0*`,
        name: "*",
        origin: declaration.fileName,
        file: null,
        statements: [],
        thirdParty: ApiTargets.packageOf(declaration.fileName),
        members: this.exportsOf(declaration),
      };
    }
    const sourceFile = declaration.getSourceFile();
    const name = ApiTargets.localNameOf(declaration);
    if (name === null) return null;
    const thirdParty = ApiTargets.packageOf(sourceFile.fileName);
    const base = { id: `${sourceFile.fileName}\0${name}`, name, origin: sourceFile.fileName, members: null };
    if (thirdParty) return { ...base, file: null, statements: [], thirdParty };
    const file = sourceFile.isDeclarationFile ? sourceFile : this.#declarationFileOf(sourceFile);
    if (!file) return { ...base, file: null, statements: [], thirdParty: null };
    const statements = this.#indexOf(file).get(name);
    if (statements) return { ...base, file, statements, thirdParty: null };
    const nested = ApiTargets.#statementOf(declaration);
    return {
      ...base,
      id: `${base.id}\0${declaration.pos}`,
      file,
      statements: nested && sourceFile.isDeclarationFile ? [nested] : [],
      thirdParty: null,
    };
  }

  #referencesIn(root: ts.Node, file: ts.SourceFile, origin: string): ApiTarget[] {
    const found: ApiTarget[] = [];
    const visit = (node: ts.Node) => {
      if (ts.isTypeReferenceNode(node))
        found.push(...this.#resolve(ApiTargets.#segmentsOf(node.typeName), node, file, origin));
      else if (ts.isExpressionWithTypeArguments(node))
        found.push(...this.#resolve(ApiTargets.#segmentsOf(node.expression), node, file, origin));
      else if (ts.isTypeQueryNode(node))
        found.push(...this.#resolve(ApiTargets.#segmentsOf(node.exprName), node, file, origin));
      else if (ts.isComputedPropertyName(node))
        found.push(...this.#resolve(ApiTargets.#segmentsOf(node.expression), node, file, origin));
      else if (ts.isImportTypeNode(node)) found.push(...this.#resolveImportType(node, origin));
      ts.forEachChild(node, visit);
    };
    visit(root);
    return found;
  }

  #resolve(segments: string[] | null, at: ts.Node, file: ts.SourceFile, origin: string): ApiTarget[] {
    const [head, next] = segments ?? [];
    if (!head || ApiTargets.#isTypeParameter(at, head)) return [];
    const local = this.#indexOf(file).get(head);
    if (local) return [this.#local(file, origin, head, local)];
    const binding = this.#importsOf(file).get(head);
    if (!binding) return [];
    const module = this.#moduleOf(binding.specifier, origin);
    if (!module) return [];
    if (binding.imported !== "*") return this.#exported(module, binding.imported);
    return next ? this.#exported(module, next) : this.#namespaceOf(module);
  }

  #resolveImportType(node: ts.ImportTypeNode, origin: string): ApiTarget[] {
    const argument = node.argument;
    if (!ts.isLiteralTypeNode(argument) || !ts.isStringLiteral(argument.literal)) return [];
    const module = this.#moduleOf(argument.literal.text, origin);
    if (!module) return [];
    const [name] = node.qualifier ? (ApiTargets.#segmentsOf(node.qualifier) ?? []) : [];
    return name ? this.#exported(module, name) : this.#namespaceOf(module);
  }

  #local(file: ts.SourceFile, origin: string, name: string, statements: ts.Statement[]): ApiTarget {
    return { id: `${origin}\0${name}`, name, origin, file, statements, thirdParty: null, members: null };
  }

  #exported(module: ts.SourceFile, name: string) {
    const symbol = this.#moduleExportsOf(module).get(name);
    return symbol ? this.ofSymbol(symbol) : [];
  }

  #namespaceOf(module: ts.SourceFile): ApiTarget[] {
    return [
      {
        id: `${module.fileName}\0*`,
        name: "*",
        origin: module.fileName,
        file: null,
        statements: [],
        thirdParty: null,
        members: [...this.#moduleExportsOf(module).values()],
      },
    ];
  }

  #moduleExportsOf(module: ts.SourceFile) {
    const cached = this.#moduleExports.get(module);
    if (cached) return cached;
    const exports = new Map(this.exportsOf(module).map((symbol) => [symbol.getName(), symbol]));
    this.#moduleExports.set(module, exports);
    return exports;
  }

  #moduleOf(specifier: string, origin: string) {
    const key = `${origin}\0${specifier}`;
    if (this.#modules.has(key)) return this.#modules.get(key) ?? null;
    const resolved = ts.resolveModuleName(specifier, origin, this.#program.getCompilerOptions(), ts.sys).resolvedModule;
    const fileName = resolved?.resolvedFileName;
    const module = fileName && !ApiTargets.packageOf(fileName) ? (this.#program.getSourceFile(fileName) ?? null) : null;
    this.#modules.set(key, module);
    return module;
  }

  #declarationFileOf(sourceFile: ts.SourceFile) {
    const cached = this.#parsed.get(sourceFile.fileName);
    if (cached) return cached;
    const text = this.#emitted.get(sourceFile.fileName);
    if (text === undefined) return null;
    const fileName = sourceFile.fileName.replace(/\.tsx?$/, ".d.ts");
    const parsed = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true);
    this.#parsed.set(sourceFile.fileName, parsed);
    return parsed;
  }

  #indexOf(file: ts.SourceFile) {
    const cached = this.#indexes.get(file);
    if (cached) return cached;
    const index = new Map<string, ts.Statement[]>();
    const add = (name: string, statement: ts.Statement) => index.set(name, [...(index.get(name) ?? []), statement]);
    for (const statement of file.statements) {
      if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations)
          if (ts.isIdentifier(declaration.name))
            add(declaration.name.text, ApiTargets.#narrowed(statement, declaration));
        continue;
      }
      const name = ApiDeclarationPrinter.isNamed(statement) ? ApiTargets.localNameOf(statement) : null;
      if (name !== null) add(name, statement);
    }
    this.#indexes.set(file, index);
    return index;
  }

  #importsOf(file: ts.SourceFile) {
    const cached = this.#imports.get(file);
    if (cached) return cached;
    const bindings = new Map<string, ImportBinding>();
    for (const statement of file.statements) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
      const specifier = statement.moduleSpecifier.text;
      const clause = statement.importClause;
      if (clause?.name) bindings.set(clause.name.text, { specifier, imported: "default" });
      const named = clause?.namedBindings;
      if (named && ts.isNamespaceImport(named)) bindings.set(named.name.text, { specifier, imported: "*" });
      if (named && ts.isNamedImports(named))
        for (const element of named.elements)
          bindings.set(element.name.text, { specifier, imported: (element.propertyName ?? element.name).text });
    }
    this.#imports.set(file, bindings);
    return bindings;
  }

  static localNameOf(declaration: ts.Declaration): string | null {
    const name = ts.getNameOfDeclaration(declaration);
    if (name && ts.isIdentifier(name)) return name.text;
    if (name) return null;
    const modifiers = ts.canHaveModifiers(declaration) ? ts.getModifiers(declaration) : undefined;
    return modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword) ? "default" : null;
  }

  static packageOf(fileName: string) {
    const normalized = fileName.replaceAll("\\", "/");
    const idx = normalized.lastIndexOf("/node_modules/");
    if (idx < 0) return null;
    const [scope = "", name = ""] = normalized.slice(idx + "/node_modules/".length).split("/");
    return scope.startsWith("@") ? `${scope}/${name}` : scope;
  }

  static #statementOf(declaration: ts.Declaration): ts.Statement | null {
    if (ts.isVariableDeclaration(declaration)) {
      const statement = declaration.parent.parent;
      return ts.isVariableStatement(statement) ? ApiTargets.#narrowed(statement, declaration) : null;
    }
    return ApiDeclarationPrinter.isNamed(declaration) ? declaration : null;
  }

  static #narrowed(statement: ts.VariableStatement, declaration: ts.VariableDeclaration) {
    if (statement.declarationList.declarations.length === 1) return statement;
    const narrowed = ts.factory.updateVariableStatement(
      statement,
      statement.modifiers,
      ts.factory.updateVariableDeclarationList(statement.declarationList, [declaration]),
    );
    ts.setOriginalNode(narrowed, statement);
    return narrowed;
  }

  static #segmentsOf(node: ts.Node): string[] | null {
    if (ts.isIdentifier(node)) return [node.text];
    if (ts.isQualifiedName(node)) {
      const left = ApiTargets.#segmentsOf(node.left);
      return left && [...left, node.right.text];
    }
    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.name)) {
      const left = ApiTargets.#segmentsOf(node.expression);
      return left && [...left, node.name.text];
    }
    return null;
  }

  static #isTypeParameter(at: ts.Node, name: string) {
    for (let node = at.parent; node && !ts.isSourceFile(node); node = node.parent) {
      const typeParameters = (node as { typeParameters?: ts.NodeArray<ts.TypeParameterDeclaration> }).typeParameters;
      if (typeParameters?.some((parameter) => parameter.name.text === name)) return true;
      if (ts.isMappedTypeNode(node) && node.typeParameter.name.text === name) return true;
      if (ts.isConditionalTypeNode(node) && ApiTargets.#infers(node.extendsType, name)) return true;
    }
    return false;
  }

  static #infers(node: ts.Node, name: string): boolean {
    if (ts.isInferTypeNode(node) && node.typeParameter.name.text === name) return true;
    return ts.forEachChild(node, (child) => ApiTargets.#infers(child, name) || undefined) ?? false;
  }
}
