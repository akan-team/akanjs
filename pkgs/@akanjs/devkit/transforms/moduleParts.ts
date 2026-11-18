import ts from "typescript";
import { ExportReach } from "./exportReach";
import { ObjectModule } from "./objectModule";
import { PartPurity } from "./partPurity";

interface Unit {
  at: number;
  texts: string[];
  declares: string[];
  reads: Set<string>;
  pure: boolean;
  publics: string[];
  listed: string[];
}

interface ValueImport {
  from: string;
  bare: boolean;
  defaultName?: string;
  namespace?: string;
  named: { local: string; text: string }[];
}

interface Part {
  id: string;
  units: Unit[];
}

const REST = "rest";
const SHARED = "__akanPart_";
const MACRO_ATTRIBUTE = /with\s*\{\s*type\s*:\s*["']macro["']\s*\}/;

//* One source file as several modules, so a bundler placing whole modules can load one export without the others.
//* A top-level declaration that only builds a value is a part, with the declarations it alone reads and the ones it
//* is in a cycle with. Every other statement, and what those read, is the `rest` part each part imports, so what the
//* file does when it loads still happens before any of its exports is used. Names are matched by text, so a part can
//* import more than it reads, never less.
export class ModuleParts {
  static readonly query = "?akan-part=";
  static readonly specifier = /\?akan-part=([\w$]+)$/;

  //? Dropped once the parts are placed: a build keeps the parts of every file it loads, and a syntax tree is large.
  #tree: ts.SourceFile | null;
  readonly #directives: string[] = [];
  readonly #types: string[] = [];
  readonly #typeNames = new Set<string>();
  readonly #declaredTypes = new Set<string>();
  readonly #imports: ValueImport[] = [];
  readonly #importLocals = new Set<string>();
  readonly #units: Unit[] = [];
  readonly #ownerOf = new Map<string, Unit>();
  readonly #lists: { local: string; exported: string }[] = [];
  readonly #purity = new PartPurity();
  #overloads: string[] = [];
  #parts: Part[] = [];
  #partOfLocal = new Map<string, string>();
  #partOfPublic = new Map<string, string>();
  #lent = new Set<string>();

  private constructor(sourceFile: ts.SourceFile) {
    this.#tree = sourceFile;
  }

  get #sourceFile(): ts.SourceFile {
    if (!this.#tree) throw new Error("[akan] a module's parts are read from its source once");
    return this.#tree;
  }

  //? null: the file stays one module (a shape this cannot place, or nothing to gain from parts).
  static read(source: string, file: string): ModuleParts | null {
    if (MACRO_ATTRIBUTE.test(source) || source.includes(SHARED)) return null;
    const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ObjectModule.scriptKindOf(file));
    const parts = new ModuleParts(sourceFile);
    let prologue = true;
    for (const statement of sourceFile.statements) {
      if (prologue && ts.isExpressionStatement(statement) && ts.isStringLiteral(statement.expression)) {
        parts.#directives.push(statement.getText(sourceFile));
        continue;
      }
      prologue = false;
      if (!parts.#collect(statement)) return null;
    }
    const placed = parts.#place();
    parts.#tree = null;
    return placed ? parts : null;
  }

  get ids(): string[] {
    return this.#parts.map(({ id }) => id);
  }

  get exports(): string[] {
    return [...this.#partOfPublic.keys()];
  }

  partOf(exported: string): string | null {
    return this.#partOfPublic.get(exported) ?? null;
  }

  isType(exported: string): boolean {
    return this.#typeNames.has(exported);
  }

  facade(self: string): string {
    const lines = [...this.#directives];
    for (const { id } of this.#parts) {
      const names = [...this.#partOfPublic].filter(([, part]) => part === id).map(([name]) => name);
      if (names.length) lines.push(`export { ${names.join(", ")} } from ${ModuleParts.#from(self, id)};`);
    }
    return `${lines.join("\n")}\n`;
  }

  sourceOf(id: string, self: string): string | null {
    const part = this.#parts.find((candidate) => candidate.id === id);
    if (!part) return null;
    const reads = new Set(part.units.flatMap((unit) => [...unit.reads]));
    const own = new Set(part.units.flatMap((unit) => unit.declares));
    const lines = [...this.#directives];
    if (id !== REST && this.#parts.some((candidate) => candidate.id === REST))
      lines.push(`import ${ModuleParts.#from(self, REST)};`);
    for (const imported of this.#imports) {
      const line = ModuleParts.#importOf(imported, reads, id === REST);
      if (line) lines.push(line);
    }
    const borrowed = new Map<string, string[]>();
    for (const name of reads) {
      const from = this.#partOfLocal.get(name);
      if (from && from !== id && !own.has(name)) borrowed.set(from, [...(borrowed.get(from) ?? []), name]);
    }
    for (const [from, names] of borrowed)
      lines.push(
        `import { ${names.map((name) => `${SHARED}${name} as ${name}`).join(", ")} } from ${ModuleParts.#from(self, from)};`,
      );
    lines.push(...this.#types, ...part.units.flatMap((unit) => unit.texts));
    const lent = [...own].filter((name) => this.#lent.has(name)).map((name) => `${name} as ${SHARED}${name}`);
    const listed = part.units.flatMap((unit) => unit.listed);
    if (lent.length + listed.length) lines.push(`export { ${[...lent, ...listed].join(", ")} };`);
    return `${lines.join("\n")}\n`;
  }

  static #from(self: string, id: string): string {
    return JSON.stringify(`${self}${ModuleParts.query}${id}`);
  }

  //? `rest` keeps every import the file makes for its effect alone, in the order written.
  static #importOf(
    { from, bare, defaultName, namespace, named }: ValueImport,
    reads: Set<string>,
    rest: boolean,
  ): string | null {
    if (bare) return rest ? `import ${from};` : null;
    const bound: string[] = [];
    if (defaultName && reads.has(defaultName)) bound.push(defaultName);
    if (namespace && reads.has(namespace)) bound.push(`* as ${namespace}`);
    const read = named.filter(({ local }) => reads.has(local));
    if (read.length) bound.push(`{ ${read.map(({ text }) => text).join(", ")} }`);
    return bound.length ? `import ${bound.join(", ")} from ${from};` : null;
  }

  #collect(statement: ts.Statement): boolean {
    const text = statement.getFullText(this.#sourceFile).replace(/^\s*\n/, "");
    if (ts.isImportDeclaration(statement)) return this.#collectImport(statement);
    if (ts.isEmptyStatement(statement)) return true;
    if (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) {
      this.#types.push(text);
      this.#declaredTypes.add(statement.name.text);
      if (ModuleParts.#has(statement, ts.SyntaxKind.ExportKeyword)) this.#typeNames.add(statement.name.text);
      return true;
    }
    if (ModuleParts.#has(statement, ts.SyntaxKind.DeclareKeyword)) {
      this.#types.push(text);
      return true;
    }
    if (ts.isImportEqualsDeclaration(statement) || ts.isModuleDeclaration(statement)) return false;
    if (ts.isExportDeclaration(statement)) return this.#collectExportList(statement);
    if (ts.isExportAssignment(statement)) {
      if (statement.isExportEquals) return false;
      this.#add(statement, text, { publics: ["default"], pure: this.#purity.of(statement.expression) });
      return true;
    }
    if (ts.isVariableStatement(statement)) return this.#collectVariables(statement, text);
    if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement) || ts.isEnumDeclaration(statement))
      return this.#collectDeclaration(statement, text);
    const given = ts.isExpressionStatement(statement) ? ModuleParts.#given(statement.expression) : null;
    const owner = given && this.#ownerOf.get(given.to);
    if (!given || !owner) {
      this.#add(statement, text, { pure: false });
      return true;
    }
    owner.texts.push(text);
    for (const name of ExportReach.namesReadBy(statement)) owner.reads.add(name);
    owner.pure &&= given.values.every((value) => this.#purity.of(value));
    return true;
  }

  #collectImport(statement: ts.ImportDeclaration): boolean {
    if (!ts.isStringLiteral(statement.moduleSpecifier)) return false;
    const clause = statement.importClause;
    if (clause?.phaseModifier === ts.SyntaxKind.TypeKeyword) return true;
    const bindings = clause?.namedBindings;
    const namespace = bindings && ts.isNamespaceImport(bindings) ? bindings.name.text : undefined;
    const named = (bindings && ts.isNamedImports(bindings) ? [...bindings.elements] : [])
      .filter((element) => !element.isTypeOnly)
      .map((element) => ({ local: element.name.text, text: element.getText(this.#sourceFile) }));
    const tail = statement.attributes ? ` ${statement.attributes.getText(this.#sourceFile)}` : "";
    const from = `${statement.moduleSpecifier.getText(this.#sourceFile)}${tail}`;
    const defaultName = clause?.name?.text;
    for (const local of [defaultName, namespace, ...named.map(({ local }) => local)])
      if (local) this.#importLocals.add(local);
    //? `import {} from` binds nothing and still loads the module, as a bare import does.
    const bare = !clause || (!defaultName && !!bindings && ts.isNamedImports(bindings) && !bindings.elements.length);
    this.#imports.push({ from, bare, defaultName, namespace, named });
    this.#purity.note(statement);
    if (bare) this.#add(statement, "", { pure: false });
    return true;
  }

  #collectExportList(statement: ts.ExportDeclaration): boolean {
    const clause = statement.exportClause;
    if (!clause) return statement.isTypeOnly;
    if (ts.isNamespaceExport(clause)) {
      if (statement.isTypeOnly) this.#typeNames.add(clause.name.text);
      else this.#add(statement, statement.getText(this.#sourceFile), { publics: [clause.name.text] });
      return true;
    }
    const values = clause.elements.filter((element) => !statement.isTypeOnly && !element.isTypeOnly);
    for (const element of clause.elements) if (!values.includes(element)) this.#typeNames.add(element.name.text);
    if (!statement.moduleSpecifier) {
      for (const element of values)
        this.#lists.push({ local: (element.propertyName ?? element.name).text, exported: element.name.text });
      return true;
    }
    if (!values.length) return true;
    const from = statement.moduleSpecifier.getText(this.#sourceFile);
    const names = values.map((element) => element.getText(this.#sourceFile));
    const tail = statement.attributes ? ` ${statement.attributes.getText(this.#sourceFile)}` : "";
    this.#add(statement, `export { ${names.join(", ")} } from ${from}${tail};`, {
      publics: values.map((element) => element.name.text),
    });
    return true;
  }

  #collectVariables(statement: ts.VariableStatement, text: string): boolean {
    const { flags, declarations } = statement.declarationList;
    if ((flags & ts.NodeFlags.BlockScoped) !== ts.NodeFlags.Const) return false;
    const declares = declarations.flatMap((declaration) => ModuleParts.#boundNames(declaration.name));
    const pure = declarations.every(
      (declaration) => declaration.initializer && this.#purity.of(declaration.initializer),
    );
    const exported = ModuleParts.#has(statement, ts.SyntaxKind.ExportKeyword);
    this.#add(statement, text, { declares, pure, publics: exported ? declares : [] });
    return true;
  }

  #collectDeclaration(
    statement: ts.FunctionDeclaration | ts.ClassDeclaration | ts.EnumDeclaration,
    text: string,
  ): boolean {
    if (ts.isFunctionDeclaration(statement) && !statement.body) {
      this.#overloads.push(text);
      return true;
    }
    const declares = statement.name ? [statement.name.text] : [];
    const publics = ModuleParts.#has(statement, ts.SyntaxKind.DefaultKeyword)
      ? ["default"]
      : ModuleParts.#has(statement, ts.SyntaxKind.ExportKeyword)
        ? declares
        : [];
    const pure = !ts.isClassDeclaration(statement) || this.#purity.ofClass(statement);
    this.#add(statement, [...this.#overloads, text].join("\n"), { declares, pure, publics });
    this.#overloads = [];
    return true;
  }

  #add(
    statement: ts.Statement,
    text: string,
    { declares = [], pure = true, publics = [] }: { declares?: string[]; pure?: boolean; publics?: string[] },
  ) {
    const reads = ts.isImportDeclaration(statement) ? new Set<string>() : ExportReach.namesReadBy(statement);
    const known = declares.map((name) => this.#ownerOf.get(name)).find((unit) => unit !== undefined);
    const unit = known ?? {
      at: statement.pos,
      texts: [],
      declares: [],
      reads: new Set(),
      pure: true,
      publics: [],
      listed: [],
    };
    if (text) unit.texts.push(text);
    unit.declares.push(...declares);
    unit.publics.push(...publics);
    unit.pure &&= pure;
    for (const name of reads) unit.reads.add(name);
    for (const name of declares) this.#ownerOf.set(name, unit);
    if (!known) this.#units.push(unit);
  }

  #place(): boolean {
    for (const { local, exported } of this.#lists) {
      const owner = this.#ownerOf.get(local);
      if (owner) owner.listed.push(local === exported ? local : `${local} as ${exported}`);
      else if (this.#importLocals.has(local))
        this.#units.push({
          at: this.#sourceFile.end,
          texts: [`export { ${local === exported ? local : `${local} as ${exported}`} };`],
          declares: [],
          reads: new Set([local]),
          pure: true,
          publics: [exported],
          listed: [],
        });
      else if (this.#declaredTypes.has(local)) this.#typeNames.add(exported);
      else return false;
      if (owner) owner.publics.push(exported);
    }
    const dependencies = new Map<Unit, Set<Unit>>();
    for (const unit of this.#units) {
      const read = [...unit.reads].map((name) => this.#ownerOf.get(name));
      dependencies.set(unit, new Set(read.filter((owner): owner is Unit => !!owner && owner !== unit)));
    }
    const rest = ModuleParts.#closureOf(
      this.#units.filter((unit) => !unit.pure),
      dependencies,
    );
    const groups = ModuleParts.#grouped(
      this.#units.filter((unit) => !rest.has(unit)),
      dependencies,
    );
    const parts = groups.map((units) => units.sort((a, b) => a.at - b.at)).sort(([a], [b]) => a.at - b.at);
    this.#parts = parts.map((units, index) => ({ id: `p${index}`, units }));
    if (rest.size) this.#parts.push({ id: REST, units: [...rest].sort((a, b) => a.at - b.at) });
    if (this.#parts.length < 2) return false;
    for (const { id, units } of this.#parts)
      for (const unit of units) {
        for (const name of unit.declares) this.#partOfLocal.set(name, id);
        for (const name of unit.publics) this.#partOfPublic.set(name, id);
      }
    for (const { id, units } of this.#parts)
      for (const unit of units)
        for (const name of unit.reads) {
          const from = this.#partOfLocal.get(name);
          if (from && from !== id) this.#lent.add(name);
        }
    return true;
  }

  static #closureOf(starts: Unit[], dependencies: Map<Unit, Set<Unit>>): Set<Unit> {
    const reached = new Set(starts);
    for (const unit of reached) for (const dependency of dependencies.get(unit) ?? []) reached.add(dependency);
    return reached;
  }

  //? Units in a cycle load together. One no export names, read by a single group, joins it; read by none, it is dropped.
  static #grouped(units: Unit[], dependencies: Map<Unit, Set<Unit>>): Unit[][] {
    const groupOf = new Map<Unit, Set<Unit>>();
    for (const unit of units) {
      if (groupOf.has(unit)) continue;
      const down = ModuleParts.#closureOf([unit], dependencies);
      const cycle = new Set(
        units.filter((other) => down.has(other) && ModuleParts.#closureOf([other], dependencies).has(unit)),
      );
      for (const member of cycle) groupOf.set(member, cycle);
    }
    const groups = new Set(groupOf.values());
    const readersOf = (group: Set<Unit>) =>
      [...groups].filter(
        (other) =>
          other !== group && [...other].some((unit) => [...group].some((own) => dependencies.get(unit)?.has(own))),
      );
    for (let settled = false; !settled; ) {
      settled = true;
      for (const group of groups) {
        if ([...group].some((unit) => unit.publics.length)) continue;
        const readers = readersOf(group);
        if (readers.length > 1) continue;
        for (const unit of group) readers[0]?.add(unit);
        groups.delete(group);
        settled = false;
      }
    }
    return [...groups].map((group) => [...group]);
  }

  //? `A.b = v` and `Object.assign(A, v)` belong to the part declaring `A`: they only add to a value it built.
  static #given(expression: ts.Expression): { to: string; values: ts.Expression[] } | null {
    let target: ts.Expression | undefined;
    let values: ts.Expression[] = [];
    if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      target = expression.left;
      while (ts.isPropertyAccessExpression(target)) target = target.expression;
      if (target === expression.left) return null;
      values = [expression.right];
    } else if (
      ts.isCallExpression(expression) &&
      ts.isPropertyAccessExpression(expression.expression) &&
      expression.expression.name.text === "assign" &&
      ts.isIdentifier(expression.expression.expression) &&
      expression.expression.expression.text === "Object"
    ) {
      [target, ...values] = expression.arguments;
      values = values.map((value) => (ts.isSpreadElement(value) ? value.expression : value));
    }
    return target && ts.isIdentifier(target) ? { to: target.text, values } : null;
  }

  static #boundNames(name: ts.BindingName): string[] {
    if (ts.isIdentifier(name)) return [name.text];
    return name.elements.flatMap((element) =>
      ts.isOmittedExpression(element) ? [] : ModuleParts.#boundNames(element.name),
    );
  }

  static #has(node: ts.Node, kind: ts.SyntaxKind) {
    return ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((modifier) => modifier.kind === kind);
  }
}
