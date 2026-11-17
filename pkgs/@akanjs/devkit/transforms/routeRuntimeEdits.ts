import ts from "typescript";
import { RuntimeImports } from "../quality/runtimeImports";
import { type ConstantRewrite, RouteConstants } from "./routeConstants";

export interface RouteRuntimeTextEdit {
  start: number;
  end: number;
  text: string;
}

const handleNames = new Set(["fetch", "sig", "st"]);
//? The tab's one store: a scope's `lib/st.ts` exports this same object, and a key answers once its module has loaded.
const tabStore = '"akanjs/store"';

export class RouteRuntimeEdits {
  //? `handlesOnly`: in a file whose names cannot be told, an import is repointed only where it takes nothing but handles.
  static importEdit(
    statement: ts.Statement,
    sourceFile: ts.SourceFile,
    fileName: string,
    { handlesOnly = false, constants = null }: { handlesOnly?: boolean; constants?: ConstantRewrite | null } = {},
  ): RouteRuntimeTextEdit[] {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) return [];
    const clause = statement.importClause;
    const target = RuntimeImports.targetOf(statement.moduleSpecifier.text, fileName);
    if (!target?.scope || !clause || clause.isTypeOnly) return [];
    const pageRuntime = JSON.stringify(`@${target.scope}/lib/usePage`);
    const specifier = statement.moduleSpecifier;
    const named = !clause.name && clause.namedBindings && ts.isNamedImports(clause.namedBindings);
    const onlyStore =
      named &&
      (clause.namedBindings as ts.NamedImports).elements.every(
        (element) => element.isTypeOnly || (element.propertyName ?? element.name).text === "st",
      );
    if (handlesOnly && ((target.kind === "st" && !onlyStore) || (target.kind === "useClient" && !named))) return [];
    if (target.kind === "useClient" || target.kind === "st")
      return [
        {
          start: specifier.getStart(sourceFile),
          end: specifier.end,
          text: target.kind === "st" ? tabStore : pageRuntime,
        },
      ];
    if (target.kind !== "client" || clause.name || !clause.namedBindings || !ts.isNamedImports(clause.namedBindings))
      return [];
    const { elements } = clause.namedBindings;
    const handleOf = (element: ts.ImportSpecifier) =>
      element.isTypeOnly ? "" : (element.propertyName ?? element.name).text;
    const isHandle = (element: ts.ImportSpecifier) => handleNames.has(handleOf(element));
    const [handles, rest] = [elements.filter(isHandle), elements.filter((element) => !isHandle(element))];
    const typedCnst = (element: ts.ImportSpecifier) => !!constants && handleOf(element) === "cnst";
    if (!handles.length)
      return constants ? RouteConstants.typedEdits(statement, sourceFile, (imported) => imported === "cnst") : [];
    const namesOf = (list: ts.ImportSpecifier[]) => list.map((element) => element.getText(sourceFile)).join(", ");
    const typesOnly = rest.every((element) => element.isTypeOnly || typedCnst(element));
    const restNames = typesOnly
      ? rest.map((element) => element.getText(sourceFile).replace(/^type\s+/, "")).join(", ")
      : rest.map((element) => `${typedCnst(element) ? "type " : ""}${element.getText(sourceFile)}`).join(", ");
    const [stores, descriptors] = [
      handles.filter((element) => handleOf(element) === "st"),
      handles.filter((element) => handleOf(element) !== "st"),
    ];
    const lines = [
      ...(descriptors.length ? [`import { ${namesOf(descriptors)} } from ${pageRuntime};`] : []),
      ...(stores.length ? [`import { ${namesOf(stores)} } from ${tabStore};`] : []),
      ...(rest.length
        ? [`import ${typesOnly ? "type " : ""}{ ${restNames} } from ${specifier.getText(sourceFile)};`]
        : []),
    ];
    const [start, end] = [statement.getStart(sourceFile), statement.end];
    const newlines = sourceFile.text.slice(start, end).split("\n").length - 1;
    return [{ start, end, text: `${lines.join(" ")}${"\n".repeat(newlines)}` }];
  }

  //? After the directives, on the first statement's own line: `"use client"` stays first and no line moves.
  static leading(sourceFile: ts.SourceFile, imports: string[]): RouteRuntimeTextEdit {
    const first = sourceFile.statements.find(
      (statement) => !ts.isExpressionStatement(statement) || !ts.isStringLiteral(statement.expression),
    );
    const at = first ? first.getStart(sourceFile) : sourceFile.text.length;
    return { start: at, end: at, text: `${imports.join(" ")} ` };
  }

  static apply(source: string, edits: RouteRuntimeTextEdit[]) {
    return [...edits]
      .sort((a, b) => b.start - a.start || b.end - a.end)
      .reduce(
        (text, { start, end, text: replacement }) => text.slice(0, start) + replacement + text.slice(end),
        source,
      );
  }
}
