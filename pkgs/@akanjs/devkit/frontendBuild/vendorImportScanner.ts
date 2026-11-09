import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

export class VendorImportScanner {
  readonly #specifiers: Set<string>;
  readonly #names = new Map<string, Set<string>>();
  readonly #whole = new Set<string>();

  constructor(specifiers: readonly string[]) {
    this.#specifiers = new Set(specifiers);
    for (const specifier of specifiers) this.#names.set(specifier, new Set());
  }

  /** The names each specifier's importers read across a directory's `.js` files; a specifier read whole is left out. */
  static async exportsUsedIn(dir: string, specifiers: readonly string[]): Promise<Record<string, string[]>> {
    const scanner = new VendorImportScanner(specifiers);
    if (!fs.existsSync(dir)) return scanner.usedExports();
    for await (const relative of new Bun.Glob("**/*.js").scan({ cwd: dir }))
      scanner.scan(await Bun.file(path.join(dir, relative)).text(), relative);
    return scanner.usedExports();
  }

  scan(source: string, fileName = "chunk.js"): this {
    if (![...this.#specifiers].some((specifier) => source.includes(specifier))) return this;
    const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, false, ts.ScriptKind.JS);
    const visit = (node: ts.Node): void => {
      if (ts.isImportDeclaration(node)) this.#readImport(node);
      else if (ts.isExportDeclaration(node)) this.#readExport(node);
      else if (ts.isCallExpression(node)) this.#readCall(node);
      ts.forEachChild(node, visit);
    };
    visit(file);
    return this;
  }

  usedExports(): Record<string, string[]> {
    return Object.fromEntries(
      [...this.#names]
        .filter(([specifier]) => !this.#whole.has(specifier))
        .map(([specifier, names]) => [specifier, [...names].sort()]),
    );
  }

  #specifierOf(node: ts.Expression | undefined): string | null {
    if (!node || !ts.isStringLiteralLike(node)) return null;
    return this.#specifiers.has(node.text) ? node.text : null;
  }

  #readImport(node: ts.ImportDeclaration): void {
    const specifier = this.#specifierOf(node.moduleSpecifier);
    const clause = node.importClause;
    if (!specifier || !clause) return;
    if (clause.name) this.#add(specifier, "default");
    const bindings = clause.namedBindings;
    if (!bindings) return;
    if (ts.isNamespaceImport(bindings)) this.#whole.add(specifier);
    else for (const element of bindings.elements) this.#add(specifier, (element.propertyName ?? element.name).text);
  }

  #readExport(node: ts.ExportDeclaration): void {
    const specifier = this.#specifierOf(node.moduleSpecifier);
    if (!specifier) return;
    const clause = node.exportClause;
    if (!clause || ts.isNamespaceExport(clause)) this.#whole.add(specifier);
    else for (const element of clause.elements) this.#add(specifier, (element.propertyName ?? element.name).text);
  }

  //? Only `import()` reaches the import map: a `require` left in a browser chunk is Bun's shim, which throws there.
  #readCall(node: ts.CallExpression): void {
    if (node.expression.kind !== ts.SyntaxKind.ImportKeyword) return;
    const specifier = this.#specifierOf(node.arguments[0]);
    if (specifier) this.#whole.add(specifier);
  }

  #add(specifier: string, name: string): void {
    if (!/^[A-Za-z_$][\w$]*$/.test(name)) this.#whole.add(specifier);
    else this.#names.get(specifier)?.add(name);
  }
}
