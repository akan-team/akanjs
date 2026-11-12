import ts from "typescript";
import { insertOrderedFieldLine, locatedObject, type ObjectInsertionLocator } from "./fieldOrder";
import {
  expressionName,
  firstObjectReturnedByArrow,
  hasParseDiagnostics,
  heritageCall,
  nodeName,
  propertyName,
  sourceFileFor,
} from "./sourceAst";
import { findNamedImport } from "./sourceImports";
import { spliceText } from "./sourceText";

interface ArrayInsertionLocator {
  projectionStart: number;
  projectionEnd: number;
  fields: string[];
}

export interface AkanConstantFieldStructure {
  name: string;
  expressionBuilder: string | null;
}

export interface AkanConstantStructure {
  parseValid: boolean;
  inputObjectFound: boolean;
  builderName: string | null;
  fields: AkanConstantFieldStructure[];
  lightProjectionFields: string[];
  baseImports: string[];
}

const findConstantInputObject = (source: ts.SourceFile, className: string): ObjectInsertionLocator | null => {
  let locator: ObjectInsertionLocator | null = null;
  const visit = (node: ts.Node) => {
    if (locator) return;
    if (!ts.isClassDeclaration(node) || node.name?.text !== className) {
      ts.forEachChild(node, visit);
      return;
    }
    const viaCall = heritageCall(node);
    const callback = viaCall?.arguments.find((arg) => ts.isArrowFunction(arg) || ts.isFunctionExpression(arg));
    const objectLiteral = callback ? firstObjectReturnedByArrow(callback) : null;
    if (objectLiteral) locator = locatedObject(source, objectLiteral);
  };
  ts.forEachChild(source, visit);
  return locator;
};

const findLightProjectionArray = (source: ts.SourceFile, moduleClassName: string): ArrayInsertionLocator | null => {
  let locator: ArrayInsertionLocator | null = null;
  const visit = (node: ts.Node) => {
    if (locator) return;
    if (!ts.isClassDeclaration(node) || node.name?.text !== `Light${moduleClassName}`) {
      ts.forEachChild(node, visit);
      return;
    }
    const viaCall = heritageCall(node);
    const projectionArg = viaCall?.arguments.find((arg) => {
      const expression = ts.isAsExpression(arg) ? arg.expression : arg;
      return ts.isArrayLiteralExpression(expression);
    });
    const arrayLiteral = projectionArg
      ? ts.isAsExpression(projectionArg)
        ? projectionArg.expression
        : projectionArg
      : null;
    if (!projectionArg || !arrayLiteral || !ts.isArrayLiteralExpression(arrayLiteral)) return;
    locator = {
      projectionStart: projectionArg.getStart(source),
      projectionEnd: projectionArg.getEnd(),
      fields: arrayLiteral.elements
        .map((element) => (ts.isStringLiteralLike(element) ? element.text : null))
        .filter((field): field is string => field !== null),
    };
  };
  ts.forEachChild(source, visit);
  return locator;
};

const fieldExpressionBuilder = (property: ts.ObjectLiteralElementLike) => {
  if (!ts.isPropertyAssignment(property)) return null;
  const initializer = ts.isAsExpression(property.initializer) ? property.initializer.expression : property.initializer;
  if (!ts.isCallExpression(initializer)) return null;
  return expressionName(initializer.expression);
};

export const viaBuilderParameterName = (content: string, className: string) => {
  const source = sourceFileFor("constant.ts", content);
  let builderName: string | null = null;
  const visit = (node: ts.Node) => {
    if (builderName !== null) return;
    if (!ts.isClassDeclaration(node) || node.name?.text !== className) {
      ts.forEachChild(node, visit);
      return;
    }
    const viaCall = heritageCall(node);
    const callback = viaCall?.arguments.find((arg) => ts.isArrowFunction(arg) || ts.isFunctionExpression(arg));
    if (callback && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback))) {
      builderName = nodeName(callback.parameters[0]?.name);
    }
  };
  ts.forEachChild(source, visit);
  return builderName;
};

export const inspectConstantStructure = (
  content: string,
  className: string,
  moduleClassName: string,
): AkanConstantStructure => {
  const source = sourceFileFor("constant.ts", content);
  const inputObject = findConstantInputObject(source, className);
  const lightProjection = findLightProjectionArray(source, moduleClassName);
  const baseImport = findNamedImport(source, "akanjs/base");
  const fields: AkanConstantFieldStructure[] = [];
  if (inputObject) {
    const visit = (node: ts.Node) => {
      if (!ts.isClassDeclaration(node) || node.name?.text !== className) {
        ts.forEachChild(node, visit);
        return;
      }
      const viaCall = heritageCall(node);
      const callback = viaCall?.arguments.find((arg) => ts.isArrowFunction(arg) || ts.isFunctionExpression(arg));
      const objectLiteral = callback ? firstObjectReturnedByArrow(callback) : null;
      if (!objectLiteral) return;
      fields.push(
        ...objectLiteral.properties
          .map((property): AkanConstantFieldStructure | null => {
            const name = propertyName(property);
            if (!name) return null;
            return { name, expressionBuilder: fieldExpressionBuilder(property) };
          })
          .filter((field): field is AkanConstantFieldStructure => field !== null),
      );
    };
    ts.forEachChild(source, visit);
  }
  return {
    parseValid: !hasParseDiagnostics(source),
    inputObjectFound: inputObject !== null,
    builderName: viaBuilderParameterName(content, className),
    fields,
    lightProjectionFields: lightProjection?.fields ?? [],
    baseImports: baseImport?.names ?? [],
  };
};

export const insertIntoObject = (content: string, className: string, line: string) => {
  const fieldName = /^([A-Za-z_$][\w$]*)\s*:/.exec(line.trim())?.[1];
  if (!fieldName) return null;
  const source = sourceFileFor("constant.ts", content);
  const locator = findConstantInputObject(source, className);
  if (!locator) return null;
  return insertOrderedFieldLine(content, locator, fieldName, line, { fieldIndent: "  ", closingIndent: "" });
};

export const insertLightProjectionField = (content: string, moduleClassName: string, fieldName: string) => {
  const source = sourceFileFor("constant.ts", content);
  const locator = findLightProjectionArray(source, moduleClassName);
  if (!locator) return null;
  if (locator.fields.includes(fieldName)) return content;
  const nextFields = [...locator.fields, fieldName];
  const nextArray =
    nextFields.length === 0
      ? "[] as const"
      : `[\n${nextFields.map((field) => `  ${JSON.stringify(field)},`).join("\n")}\n] as const`;
  return spliceText(content, locator.projectionStart, locator.projectionEnd, nextArray);
};

export const insertEnumClass = (content: string, enumClassName: string, enumName: string, values: string[]) => {
  if (content.includes(`export class ${enumClassName} extends enumOf`)) return content;
  const enumClass = `export class ${enumClassName} extends enumOf("${enumName}", [\n${values
    .map((value) => `  ${JSON.stringify(value)},`)
    .join("\n")}\n] as const) {}\n\n`;
  const firstClassIndex = content.indexOf("export class ");
  if (firstClassIndex < 0) return `${content}\n${enumClass}`;
  return `${content.slice(0, firstClassIndex)}${enumClass}${content.slice(firstClassIndex)}`;
};

export const hasConstantInputField = (content: string, className: string, fieldName: string) => {
  const source = sourceFileFor("constant.ts", content);
  if (hasParseDiagnostics(source)) return false;
  return findConstantInputObject(source, className)?.fields.some((field) => field.name === fieldName) ?? false;
};
