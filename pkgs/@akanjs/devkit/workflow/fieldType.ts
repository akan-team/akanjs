import ts from "typescript";
import type { Sys } from "../commandDecorators";
import { ensureBaseImport, ensureNamedImport, getSysRoot, moduleComponentName, moduleSourcePaths } from "./source";
import { sourceFileFor } from "./sourceAst";
import type { WorkflowDiagnostic } from "./types";

const builtInFieldTypes = new Set(["String", "Boolean", "Date", "Map"]);
const baseFieldTypes = new Set(["Int", "Float", "ID", "Any", "Binary", "ImageResult"]);
const fieldTypeReference = /^\[*([A-Za-z_$][\w$]*)((?:\.[A-Za-z_$][\w$]*)*)\]*$/;

export const ensureBaseTypeImport = (content: string, typeName: string) => {
  const [, name = "", member] = fieldTypeReference.exec(typeName) ?? [];
  if (member || !baseFieldTypes.has(name)) return content;
  return ensureBaseImport(content, name);
};

const valueNamesOf = (content: string) => {
  const names = new Set<string>();
  for (const statement of sourceFileFor("source.ts", content).statements) {
    if (ts.isImportDeclaration(statement)) {
      const clause = statement.importClause;
      if (!clause || clause.isTypeOnly) continue;
      if (clause.name) names.add(clause.name.text);
      const bindings = clause.namedBindings;
      if (bindings && ts.isNamespaceImport(bindings)) names.add(bindings.name.text);
      else for (const element of bindings?.elements ?? []) if (!element.isTypeOnly) names.add(element.name.text);
    } else if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations)
        if (ts.isIdentifier(declaration.name)) names.add(declaration.name.text);
    } else if (
      (ts.isClassDeclaration(statement) || ts.isEnumDeclaration(statement) || ts.isFunctionDeclaration(statement)) &&
      statement.name
    )
      names.add(statement.name.text);
  }
  return names;
};

export const fieldTypeSource = async (
  sys: Sys,
  module: string,
  typeName: string,
  constantContent: string,
): Promise<{ import?: { name: string; from: string }; diagnostic?: WorkflowDiagnostic }> => {
  const reference = fieldTypeReference.exec(typeName);
  if (!reference)
    return {
      diagnostic: {
        severity: "error",
        code: "primitive-field-type-unknown",
        input: "type",
        message: `Field type "${typeName}" is not a type name field() takes. Name one type, such as Address, or a list of one, such as [Address], then plan this again.`,
      },
    };
  const [, name = "", member] = reference;
  if (builtInFieldTypes.has(name) || baseFieldTypes.has(name) || valueNamesOf(constantContent).has(name)) return {};
  const [scalars, models] = await Promise.all([sys.getScalarModules(), sys.getDatabaseModules()]);
  const scalar = member ? undefined : scalars.find((scalarName) => moduleComponentName(scalarName) === name);
  if (scalar) return { import: { name, from: `../__scalar/${scalar}/${scalar}.constant` } };
  const model = member ? undefined : models.find((modelName) => moduleComponentName(modelName) === name);
  if (model) return { import: { name, from: `../${model}/${model}.constant` } };
  const root = getSysRoot(sys);
  const constantPath = `${root}/${moduleSourcePaths(module).constant}`;
  const named = (kind: string, names: string[]) =>
    names.length ? `Its ${kind} are ${names.map(moduleComponentName).join(", ")}.` : `It has no ${kind}.`;
  return {
    diagnostic: {
      severity: "error",
      code: "primitive-field-type-unknown",
      input: "type",
      message: [
        `Field type "${typeName}" names ${name}, which is not a built-in or akanjs/base type, not imported by ${constantPath}, and not a scalar or model in ${root}.`,
        named("scalars", scalars),
        named("models", models),
        `Create the scalar with the create-scalar workflow first, or import ${name} into ${constantPath}, then plan this again.`,
      ].join(" "),
    },
  };
};

export const withFieldTypeImport = async (
  sys: Sys,
  module: string,
  typeName: string,
  content: string,
  diagnostics: WorkflowDiagnostic[],
) => {
  const withBaseImport = ensureBaseTypeImport(content, typeName);
  const source = await fieldTypeSource(sys, module, typeName, withBaseImport);
  if (source.diagnostic) diagnostics.push(source.diagnostic);
  return source.import ? ensureNamedImport(withBaseImport, source.import.from, source.import.name) : withBaseImport;
};
