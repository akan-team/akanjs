import ts from "typescript";
import { ModuleParts } from "./moduleParts";
import { ObjectModule } from "./objectModule";

export interface PartImportsOptions {
  resolve: (specifier: string, importer: string) => Promise<string | null>;
  //? Null for a file that stays one module.
  partsOf: (file: string) => Promise<ModuleParts | null>;
}

interface Asked {
  imported: string;
  local: string;
}

interface Statement {
  kind: "import" | "export";
  specifier: string;
  written: string;
  names: Asked[];
}

interface Edit {
  start: number;
  end: number;
  text: string;
}

const FROM = /\bfrom\s*["']/;

//* Sends each name an import or re-export asks of a file in parts to the part holding it, so a bundler follows that
//* part alone. A namespace import, `export *`, a bare import and `import()` keep asking the file, which loads them all.
export class PartImports {
  readonly #resolve: PartImportsOptions["resolve"];
  readonly #partsOf: PartImportsOptions["partsOf"];

  constructor({ resolve, partsOf }: PartImportsOptions) {
    this.#resolve = resolve;
    this.#partsOf = partsOf;
  }

  async rewrite(source: string, importer: string): Promise<string | null> {
    if (!FROM.test(source)) return null;
    const sourceFile = ts.createSourceFile(
      importer,
      source,
      ts.ScriptTarget.Latest,
      true,
      ObjectModule.scriptKindOf(importer),
    );
    const edits: Edit[] = [];
    for (const statement of sourceFile.statements) {
      const asked = PartImports.#askedBy(statement);
      if (!asked) continue;
      const file = await this.#resolve(asked.specifier, importer);
      const parts = file && file !== importer ? await this.#partsOf(file) : null;
      if (!file || !parts) continue;
      const lines = PartImports.#lines(asked, parts, file);
      edits.push({ start: statement.getStart(sourceFile), end: statement.end, text: lines.join("\n") });
    }
    if (edits.length === 0) return null;
    let next = "";
    let cursor = 0;
    for (const { start, end, text } of edits) {
      next += `${source.slice(cursor, start)}${text}`;
      cursor = end;
    }
    return `${next}${source.slice(cursor)}`;
  }

  static #askedBy(statement: ts.Statement): Statement | null {
    if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) return null;
    const { moduleSpecifier, attributes } = statement;
    if (!moduleSpecifier || !ts.isStringLiteral(moduleSpecifier) || attributes) return null;
    if (ModuleParts.specifier.test(moduleSpecifier.text)) return null;
    const from = { specifier: moduleSpecifier.text, written: moduleSpecifier.getText() };
    const namesOf = (elements: readonly (ts.ImportSpecifier | ts.ExportSpecifier)[]) =>
      elements
        .filter((element) => !element.isTypeOnly)
        .map((element) => ({ imported: (element.propertyName ?? element.name).text, local: element.name.text }));
    if (ts.isExportDeclaration(statement)) {
      const clause = statement.exportClause;
      if (statement.isTypeOnly || !clause || !ts.isNamedExports(clause)) return null;
      const names = namesOf(clause.elements);
      return names.length ? { kind: "export", ...from, names } : null;
    }
    const clause = statement.importClause;
    if (!clause || clause.phaseModifier === ts.SyntaxKind.TypeKeyword) return null;
    const bindings = clause.namedBindings;
    if (bindings && ts.isNamespaceImport(bindings)) return null;
    const names = namesOf(bindings?.elements ?? []);
    if (clause.name) names.unshift({ imported: "default", local: clause.name.text });
    return names.length ? { kind: "import", ...from, names } : null;
  }

  //? A name the file's parts do not hold stays asked of the file, so the bundler reports it as it did before.
  static #lines({ kind, names, written }: Statement, parts: ModuleParts, file: string): string[] {
    const byTarget = new Map<string, Asked[]>();
    for (const asked of names) {
      const part = parts.partOf(asked.imported);
      if (!part && parts.isType(asked.imported)) continue;
      const target = part ? JSON.stringify(`${file}${ModuleParts.query}${part}`) : written;
      byTarget.set(target, [...(byTarget.get(target) ?? []), asked]);
    }
    return [...byTarget].map(([target, held]) => {
      const list = held.map(({ imported, local }) => (imported === local ? local : `${imported} as ${local}`));
      return `${kind} { ${list.join(", ")} } from ${target};`;
    });
  }
}
