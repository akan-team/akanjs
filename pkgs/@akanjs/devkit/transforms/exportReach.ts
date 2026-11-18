import ts from "typescript";
import { ObjectModule } from "./objectModule";

export interface ReachedImport {
  specifier: string;
  /** null: the whole module (a namespace handed on, a bare or dynamic import, a name the file re-exports as `*`). */
  names: string[] | null;
}

export type ExportReached =
  | { known: true; imports: ReachedImport[] }
  /** The file neither declares nor names it: one of its `export *` targets may. */
  | { known: false; stars: string[] };

interface ImportedName {
  specifier: string;
  /** `*` for a namespace import, `default` for a default import. */
  imported: string;
}

//? null: the name is read as a value of its own. A set: only these members of it are read (`View.General`).
type Reads = Map<string, Set<string> | null>;

interface Unit {
  reads: Reads;
  dynamic: string[];
}

const CJS_EXPORT_RE = /\b(?:module\.exports|exports\.[A-Za-z_$])/;

//* What an importer of one export of a server module can reach: the imports read by that export's declaration and by
//* the top-level declarations it reads in turn. A type reaches nothing. A statement that is not a declaration runs for
//* every importer, so what it reads is reached always. Names are matched by text, so a shadowed name counts as read:
//* the answer can hold more than the export uses, never less.
export class ExportReach {
  readonly stars: string[] = [];
  readonly #imports = new Map<string, ImportedName>();
  readonly #bare: string[] = [];
  readonly #units = new Map<string, Unit[]>();
  readonly #effects: Unit[] = [];
  readonly #exported = new Map<string, string>();
  readonly #reexports = new Map<string, ImportedName>();
  readonly #types = new Set<string>();

  //? null for a CommonJS module: what it exports is assigned at run time.
  static read(source: string, file: string): ExportReach | null {
    const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ObjectModule.scriptKindOf(file));
    const esm = sourceFile.statements.some(
      (statement) =>
        ts.isImportDeclaration(statement) ||
        ts.isExportDeclaration(statement) ||
        ts.isExportAssignment(statement) ||
        ExportReach.#has(statement, ts.SyntaxKind.ExportKeyword),
    );
    if (!esm && CJS_EXPORT_RE.test(source)) return null;
    const reach = new ExportReach();
    for (const statement of sourceFile.statements) reach.#collect(statement);
    return reach;
  }

  of(name: string): ExportReached {
    const reexport = this.#reexports.get(name);
    if (reexport) return { known: true, imports: [ExportReach.#whole(reexport)] };
    const local = this.#exported.get(name);
    if (local !== undefined) return { known: true, imports: this.#reached([ExportReach.#reading(local)], []) };
    if (this.#types.has(name)) return { known: true, imports: [] };
    return { known: false, stars: this.stars };
  }

  always(): ReachedImport[] {
    return this.#reached(this.#effects, this.#bare);
  }

  whole(): ReachedImport[] {
    const reexports = [...this.#reexports.values(), ...this.stars.map((specifier) => ({ specifier, imported: "*" }))];
    return ExportReach.#merged([
      ...this.#reached([...this.#effects, ...[...this.#units.values()].flat()], this.#bare),
      ...reexports.map(ExportReach.#whole),
    ]);
  }

  static #whole({ specifier, imported }: ImportedName): ReachedImport {
    return { specifier, names: imported === "*" ? null : [imported] };
  }

  static #reading(name: string): Unit {
    return { reads: new Map([[name, null]]), dynamic: [] };
  }

  #reached(starts: Unit[], bare: string[]): ReachedImport[] {
    const used = new Map<string, Set<string> | null>();
    const dynamic = new Set(bare);
    const seen = new Set<Unit>();
    const queue = [...starts];
    for (const unit of queue) {
      if (seen.has(unit)) continue;
      seen.add(unit);
      for (const specifier of unit.dynamic) dynamic.add(specifier);
      for (const [name, members] of unit.reads) {
        if (this.#imports.has(name)) {
          const known = used.get(name);
          if (members === null || known === null) used.set(name, null);
          else used.set(name, new Set([...(known ?? []), ...members]));
        }
        queue.push(...(this.#units.get(name) ?? []));
      }
    }
    const reached: ReachedImport[] = [...dynamic].map((specifier) => ({ specifier, names: null }));
    for (const [local, members] of used) {
      const { specifier, imported } = this.#imports.get(local) as ImportedName;
      if (imported !== "*") reached.push({ specifier, names: [imported] });
      else reached.push({ specifier, names: members ? [...members] : null });
    }
    return ExportReach.#merged(reached);
  }

  static #merged(reached: ReachedImport[]): ReachedImport[] {
    const bySpecifier = new Map<string, Set<string> | null>();
    for (const { specifier, names } of reached) {
      const known = bySpecifier.get(specifier);
      if (names === null || known === null) bySpecifier.set(specifier, null);
      else bySpecifier.set(specifier, new Set([...(known ?? []), ...names]));
    }
    return [...bySpecifier].map(([specifier, names]) => ({ specifier, names: names ? [...names].sort() : null }));
  }

  #collect(statement: ts.Statement) {
    if (ts.isImportDeclaration(statement)) return this.#collectImport(statement);
    if (ts.isExportDeclaration(statement)) return this.#collectExportList(statement);
    if (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) {
      if (ExportReach.#has(statement, ts.SyntaxKind.ExportKeyword)) this.#types.add(statement.name.text);
      return;
    }
    if (ExportReach.#has(statement, ts.SyntaxKind.DeclareKeyword) || ts.isEmptyStatement(statement)) return;
    if (ts.isImportEqualsDeclaration(statement)) return this.#collectImportEquals(statement);
    if (ts.isExportAssignment(statement)) {
      if (statement.isExportEquals) return this.#effects.push(ExportReach.#unitOf(statement));
      this.#exported.set("default", "default");
      return this.#declare("default", ExportReach.#unitOf(statement.expression));
    }
    if (ts.isVariableStatement(statement)) return this.#collectVariables(statement);
    if (
      ts.isFunctionDeclaration(statement) ||
      ts.isClassDeclaration(statement) ||
      ts.isEnumDeclaration(statement) ||
      ts.isModuleDeclaration(statement)
    ) {
      if (ts.isFunctionDeclaration(statement) && !statement.body) return;
      const name = statement.name && !ts.isStringLiteral(statement.name) ? statement.name.getText() : "default";
      this.#declare(name, ExportReach.#unitOf(statement));
      if (ExportReach.#has(statement, ts.SyntaxKind.DefaultKeyword)) this.#exported.set("default", name);
      else if (ExportReach.#has(statement, ts.SyntaxKind.ExportKeyword)) this.#exported.set(name, name);
      return;
    }
    const unit = ExportReach.#unitOf(statement);
    const owner = ts.isExpressionStatement(statement) ? this.#ownerOf(statement.expression) : null;
    if (owner) this.#declare(owner, unit);
    else this.#effects.push(unit);
  }

  //? `Card.Header = Header` and `Object.assign(Card, { Header })` change only `Card`, so they are read with it.
  #ownerOf(expression: ts.Expression): string | null {
    let target: ts.Expression | undefined;
    if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      target = expression.left;
      while (ts.isPropertyAccessExpression(target)) target = target.expression;
      if (target === expression.left) return null;
    } else if (
      ts.isCallExpression(expression) &&
      ts.isPropertyAccessExpression(expression.expression) &&
      expression.expression.name.text === "assign" &&
      ts.isIdentifier(expression.expression.expression) &&
      expression.expression.expression.text === "Object"
    )
      [target] = expression.arguments;
    return target && ts.isIdentifier(target) && this.#units.has(target.text) ? target.text : null;
  }

  #declare(name: string, unit: Unit) {
    this.#units.set(name, [...(this.#units.get(name) ?? []), unit]);
  }

  #collectImport(statement: ts.ImportDeclaration) {
    if (!ts.isStringLiteral(statement.moduleSpecifier)) return;
    const specifier = statement.moduleSpecifier.text;
    const clause = statement.importClause;
    if (!clause) return this.#bare.push(specifier);
    if (clause.phaseModifier === ts.SyntaxKind.TypeKeyword) return;
    if (clause.name) this.#imports.set(clause.name.text, { specifier, imported: "default" });
    const bindings = clause.namedBindings;
    if (!bindings) return;
    if (ts.isNamespaceImport(bindings)) return this.#imports.set(bindings.name.text, { specifier, imported: "*" });
    for (const element of bindings.elements)
      if (!element.isTypeOnly)
        this.#imports.set(element.name.text, { specifier, imported: (element.propertyName ?? element.name).text });
  }

  #collectImportEquals(statement: ts.ImportEqualsDeclaration) {
    if (statement.isTypeOnly) return;
    const reference = statement.moduleReference;
    if (ts.isExternalModuleReference(reference) && ts.isStringLiteral(reference.expression))
      this.#imports.set(statement.name.text, { specifier: reference.expression.text, imported: "*" });
    else this.#declare(statement.name.text, ExportReach.#unitOf(statement));
    if (ExportReach.#has(statement, ts.SyntaxKind.ExportKeyword))
      this.#exported.set(statement.name.text, statement.name.text);
  }

  #collectExportList(statement: ts.ExportDeclaration) {
    const from = statement.moduleSpecifier;
    const specifier = from && ts.isStringLiteral(from) ? from.text : null;
    const clause = statement.exportClause;
    if (!clause) {
      if (specifier && !statement.isTypeOnly) this.stars.push(specifier);
      return;
    }
    if (ts.isNamespaceExport(clause)) {
      if (statement.isTypeOnly) this.#types.add(clause.name.text);
      else if (specifier) this.#reexports.set(clause.name.text, { specifier, imported: "*" });
      return;
    }
    for (const element of clause.elements) {
      const exported = element.name.text;
      const local = (element.propertyName ?? element.name).text;
      if (statement.isTypeOnly || element.isTypeOnly) this.#types.add(exported);
      else if (specifier) this.#reexports.set(exported, { specifier, imported: local });
      else this.#exported.set(exported, local);
    }
  }

  #collectVariables(statement: ts.VariableStatement) {
    const exported = ExportReach.#has(statement, ts.SyntaxKind.ExportKeyword);
    for (const declaration of statement.declarationList.declarations) {
      const unit = ExportReach.#unitOf(declaration);
      for (const name of ExportReach.#boundNames(declaration.name)) {
        this.#declare(name, unit);
        if (exported) this.#exported.set(name, name);
      }
    }
  }

  static #boundNames(name: ts.BindingName): string[] {
    if (ts.isIdentifier(name)) return [name.text];
    return name.elements.flatMap((element) =>
      ts.isOmittedExpression(element) ? [] : ExportReach.#boundNames(element.name),
    );
  }

  static #unitOf(root: ts.Node): Unit {
    const unit: Unit = { reads: new Map(), dynamic: [] };
    const read = (name: string, member: string | null) => {
      const known = unit.reads.get(name);
      if (member === null || known === null) unit.reads.set(name, null);
      else unit.reads.set(name, (known ?? new Set<string>()).add(member));
    };
    const visit = (node: ts.Node): void => {
      if (ts.isExpressionWithTypeArguments(node)) {
        visit(node.expression);
        return;
      }
      if (ts.isTypeNode(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) return;
      if (ts.isIdentifier(node)) {
        read(node.text, null);
        return;
      }
      if (ts.isPropertyAccessExpression(node)) {
        if (ts.isIdentifier(node.expression)) read(node.expression.text, node.name.text);
        else visit(node.expression);
        return;
      }
      if (ts.isCallExpression(node)) {
        const [first] = node.arguments;
        const loads =
          node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) && node.expression.text === "require");
        if (loads && first && ts.isStringLiteralLike(first)) unit.dynamic.push(first.text);
      }
      if (ts.isPropertyAssignment(node) || ts.isJsxAttribute(node)) {
        if (ts.isComputedPropertyName(node.name)) visit(node.name);
        if (node.initializer) visit(node.initializer);
        return;
      }
      if (ts.isBindingElement(node)) {
        if (node.propertyName && ts.isComputedPropertyName(node.propertyName)) visit(node.propertyName);
        visit(node.name);
        if (node.initializer) visit(node.initializer);
        return;
      }
      if (
        (ts.isMethodDeclaration(node) || ts.isPropertyDeclaration(node) || ts.isAccessor(node)) &&
        !ts.isComputedPropertyName(node.name)
      ) {
        node.forEachChild((child) => (child === node.name ? undefined : visit(child)));
        return;
      }
      node.forEachChild(visit);
    };
    visit(root);
    return unit;
  }

  static #has(node: ts.Node, kind: ts.SyntaxKind) {
    return ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((modifier) => modifier.kind === kind);
  }
}
