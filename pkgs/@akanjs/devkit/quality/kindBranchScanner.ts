import path from "node:path";
import ts from "typescript";
import type { QualityWarning, SourceFileInfo } from "./qualityScanner";

interface EnumDeclaration {
  name: string;
  sys: string;
  file: string;
  line: number;
  module: string;
  values: string[];
}

interface BranchSite {
  value: string;
  file: string;
  line: number;
}

//? Enums sharing a value form one group: short of the type checker, nothing tells which one a literal means.
export class KindBranchScanner {
  static readonly rule = "akan.global.kind-branch";
  static readonly minFileNum = 3;
  static readonly #kindName = /(Kind|Type|Mode)$/;
  static readonly #kindSubject = /^(kind|type|mode)$|[a-z](Kind|Type|Mode)$/;
  static readonly #equalities = new Set([
    ts.SyntaxKind.EqualsEqualsEqualsToken,
    ts.SyntaxKind.ExclamationEqualsEqualsToken,
    ts.SyntaxKind.EqualsEqualsToken,
    ts.SyntaxKind.ExclamationEqualsToken,
  ]);

  scan(sourceFiles: SourceFileInfo[]): QualityWarning[] {
    const enums = sourceFiles.flatMap((sourceFile) => KindBranchScanner.#enumsOf(sourceFile));
    const ownersByValue = new Map<string, EnumDeclaration[]>();
    for (const declaration of enums)
      for (const value of declaration.values)
        ownersByValue.set(value, [...(ownersByValue.get(value) ?? []), declaration]);
    const sitesByGroup = new Map<string, { owners: EnumDeclaration[]; sites: BranchSite[] }>();
    for (const sourceFile of sourceFiles) {
      if (!/^(apps|libs)\//.test(sourceFile.file) || /\.(test|spec)\.tsx?$/.test(sourceFile.file)) continue;
      const sys = KindBranchScanner.#sysOf(sourceFile.file);
      //? An app reaches every lib's enums; a lib only its own, as nothing here knows which libs it depends on.
      for (const site of KindBranchScanner.#sitesIn(sourceFile, ownersByValue)) {
        const owners = (ownersByValue.get(site.value) ?? []).filter(
          (owner) => owner.sys === sys || (owner.sys.startsWith("libs/") && sys.startsWith("apps/")),
        );
        if (!owners.length || owners.some(({ module }) => site.file.startsWith(module))) continue;
        const group = owners.map(({ name, file }) => `${file}#${name}`).join(",");
        const entry = sitesByGroup.get(group) ?? { owners, sites: [] };
        entry.sites.push(site);
        sitesByGroup.set(group, entry);
      }
    }
    return [...sitesByGroup.values()].flatMap(({ owners, sites }) => KindBranchScanner.#warningOf(owners, sites));
  }

  static #warningOf(owners: EnumDeclaration[], sites: BranchSite[]): QualityWarning[] {
    const filesByValue = new Map<string, Set<string>>();
    for (const { value, file } of sites) filesByValue.set(value, (filesByValue.get(value) ?? new Set()).add(file));
    const values = [...filesByValue]
      .filter(([, files]) => files.size >= KindBranchScanner.minFileNum)
      .map(([value]) => value)
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const [owner] = owners;
    if (!owner || !values.length) return [];
    const branched = sites.filter(({ value }) => values.includes(value));
    const fileNum = new Set(branched.map(({ file }) => file)).size;
    const enumNames = owners.map(({ name }) => `cnst.${name}`).join(" / ");
    return [
      {
        rule: KindBranchScanner.rule,
        scope: "global",
        severity: "warning",
        file: owner.file,
        line: owner.line,
        message: `${values.map((value) => `"${value}"`).join(", ")} of ${enumNames} ${values.length > 1 ? "are" : "is"} branched on in ${fileNum} files outside the enum's module.`,
        locations: branched.map(({ file, line }) => ({ file, line })),
        fix: `Declare one table keyed by the kind, \`{ [kind in cnst.${owner.name}["value"]]: … }\` (a component, label or handler per kind), and look the kind up in it instead of comparing it in each file.`,
      },
    ];
  }

  static #sitesIn({ file, sourceFile }: SourceFileInfo, ownersByValue: Map<string, EnumDeclaration[]>) {
    const sites: BranchSite[] = [];
    const record = (literal: ts.Expression, subject: ts.Expression) => {
      if (!ts.isStringLiteralLike(literal) || !ownersByValue.has(literal.text)) return;
      if (!KindBranchScanner.#isKindSubject(subject)) return;
      sites.push({
        value: literal.text,
        file,
        line: sourceFile.getLineAndCharacterOfPosition(literal.getStart(sourceFile)).line + 1,
      });
    };
    const visit = (node: ts.Node) => {
      if (ts.isBinaryExpression(node) && KindBranchScanner.#equalities.has(node.operatorToken.kind)) {
        record(node.left, node.right);
        record(node.right, node.left);
      } else if (ts.isCaseClause(node) && ts.isSwitchStatement(node.parent.parent))
        record(node.expression, node.parent.parent.expression);
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    return sites;
  }

  //? Only a subject named for a kind (`kind`, `pin.kind`, `viewMode`) counts: a bare `"active"` matches too much.
  static #isKindSubject(subject: ts.Expression) {
    let current = subject;
    while (ts.isParenthesizedExpression(current) || ts.isAsExpression(current) || ts.isNonNullExpression(current))
      current = current.expression;
    const name = ts.isIdentifier(current)
      ? current.text
      : ts.isPropertyAccessExpression(current)
        ? current.name.text
        : ts.isElementAccessExpression(current) && ts.isStringLiteralLike(current.argumentExpression)
          ? current.argumentExpression.text
          : "";
    return KindBranchScanner.#kindSubject.test(name);
  }

  static #enumsOf({ file, sourceFile }: SourceFileInfo): EnumDeclaration[] {
    if (!/^(apps|libs)\/[^/]+\/lib\/.+\.constant\.ts$/.test(file)) return [];
    return sourceFile.statements.flatMap((statement) => {
      if (!ts.isClassDeclaration(statement) || !statement.name) return [];
      if (!KindBranchScanner.#kindName.test(statement.name.text)) return [];
      const values = KindBranchScanner.#enumValuesOf(statement);
      if (!values) return [];
      return [
        {
          name: statement.name.text,
          sys: KindBranchScanner.#sysOf(file),
          file,
          line: sourceFile.getLineAndCharacterOfPosition(statement.getStart(sourceFile)).line + 1,
          module: `${path.posix.dirname(file)}/`,
          values,
        },
      ];
    });
  }

  static #sysOf(file: string) {
    return file.split("/").slice(0, 2).join("/");
  }

  static #enumValuesOf(statement: ts.ClassDeclaration) {
    for (const clause of statement.heritageClauses ?? [])
      for (const { expression } of clause.types) {
        if (!ts.isCallExpression(expression) || !ts.isIdentifier(expression.expression)) continue;
        if (expression.expression.text !== "enumOf") continue;
        let list = expression.arguments[1];
        while (list && (ts.isAsExpression(list) || ts.isParenthesizedExpression(list))) list = list.expression;
        if (!list || !ts.isArrayLiteralExpression(list)) return null;
        return list.elements.filter(ts.isStringLiteralLike).map(({ text }) => text);
      }
    return null;
  }
}
