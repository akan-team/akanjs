import ts from "typescript";
import { bilingualDescriptionForField, bilingualLabelForField, titleize } from "./fieldLabel";
import { insertOrderedFieldLine, locatedObject, type ObjectInsertionLocator } from "./fieldOrder";
import {
  callExpressionName,
  expressionName,
  firstObjectReturnedByArrow,
  hasParseDiagnostics,
  sourceFileFor,
} from "./sourceAst";
import { lineStartAt, spliceText } from "./sourceText";

export interface AkanDictionaryStructure {
  parseValid: boolean;
  modelObjectFound: boolean;
  chainOrderValid: boolean;
  chainMethods: string[];
  fields: string[];
}

interface DictionaryModelLocator extends ObjectInsertionLocator {
  chainMethods: string[];
}

const chainMethodsForCall = (node: ts.Expression): string[] => {
  if (ts.isAsExpression(node) || ts.isParenthesizedExpression(node)) return chainMethodsForCall(node.expression);
  if (!ts.isCallExpression(node)) return [];
  if (ts.isPropertyAccessExpression(node.expression)) {
    return [...chainMethodsForCall(node.expression.expression), node.expression.name.text];
  }
  const name = expressionName(node.expression);
  return name ? [name] : [];
};

const outermostFluentCall = (node: ts.CallExpression) => {
  let current: ts.CallExpression = node;
  while (
    ts.isPropertyAccessExpression(current.parent) &&
    current.parent.expression === current &&
    ts.isCallExpression(current.parent.parent) &&
    current.parent.parent.expression === current.parent
  ) {
    current = current.parent.parent;
  }
  return current;
};

const protectedDictionaryChainOrder = ["model", "slice", "enum", "error", "translate"] as const;

const dictionaryChainOrderValid = (chainMethods: readonly string[]) => {
  const protectedOrder = new Map(protectedDictionaryChainOrder.map((method, index) => [method, index]));
  let lastOrder = -1;
  for (const method of chainMethods) {
    const order = protectedOrder.get(method as (typeof protectedDictionaryChainOrder)[number]);
    if (order === undefined) continue;
    if (order < lastOrder) return false;
    lastOrder = order;
  }
  return true;
};

const findDictionaryModelObject = (source: ts.SourceFile, moduleClassName: string) =>
  findDictionaryStageObject(source, "model", moduleClassName);

const findDictionaryStageObject = (
  source: ts.SourceFile,
  stage: string,
  typeName: string,
): DictionaryModelLocator | null => {
  let locator: DictionaryModelLocator | null = null;
  const visit = (node: ts.Node) => {
    if (locator) return;
    if (!ts.isCallExpression(node) || callExpressionName(node) !== stage) {
      ts.forEachChild(node, visit);
      return;
    }
    const typeArgument = node.typeArguments?.[0];
    if (!typeArgument || typeArgument.getText(source) !== typeName) {
      ts.forEachChild(node, visit);
      return;
    }
    const callback = node.arguments.find((arg) => ts.isArrowFunction(arg) || ts.isFunctionExpression(arg));
    const objectLiteral = callback ? firstObjectReturnedByArrow(callback) : null;
    if (objectLiteral) {
      locator = {
        ...locatedObject(source, objectLiteral),
        chainMethods: chainMethodsForCall(outermostFluentCall(node)),
      };
    }
  };
  ts.forEachChild(source, visit);
  return locator;
};

export const inspectDictionaryStructure = (content: string, moduleClassName: string): AkanDictionaryStructure => {
  const source = sourceFileFor("dictionary.ts", content);
  const modelObject = findDictionaryModelObject(source, moduleClassName);
  return {
    parseValid: !hasParseDiagnostics(source),
    modelObjectFound: modelObject !== null,
    chainOrderValid: modelObject ? dictionaryChainOrderValid(modelObject.chainMethods) : false,
    chainMethods: modelObject?.chainMethods ?? [],
    fields: modelObject?.fields.map((field) => field.name) ?? [],
  };
};

const dictionaryModelFieldLine = (fieldName: string) => {
  const label = bilingualLabelForField(fieldName);
  const desc = bilingualDescriptionForField(fieldName);
  return `${fieldName}: t([${JSON.stringify(label.en)}, ${JSON.stringify(label.ko)}]).desc([${JSON.stringify(
    desc.en,
  )}, ${JSON.stringify(desc.ko)}]),`;
};

export const insertDictionaryModelField = (content: string, moduleClassName: string, fieldName: string) => {
  const source = sourceFileFor("dictionary.ts", content);
  const locator = findDictionaryModelObject(source, moduleClassName);
  if (!locator) return null;
  return insertOrderedFieldLine(content, locator, fieldName, dictionaryModelFieldLine(fieldName), {
    fieldIndent: "    ",
    closingIndent: "  ",
  });
};

export const hasDictionaryModelField = (content: string, moduleClassName: string, fieldName: string) => {
  const source = sourceFileFor("dictionary.ts", content);
  if (hasParseDiagnostics(source)) return false;
  return findDictionaryModelObject(source, moduleClassName)?.fields.some((field) => field.name === fieldName) ?? false;
};

export const hasDictionaryEndpointEntry = (content: string, moduleClassName: string, entryName: string) => {
  const source = sourceFileFor("dictionary.ts", content);
  return (
    findDictionaryStageObject(source, "endpoint", `${moduleClassName}Endpoint`)?.fields.some(
      (field) => field.name === entryName,
    ) ?? false
  );
};

export const insertDictionaryEndpointEntry = (
  content: string,
  moduleClassName: string,
  entryName: string,
  entryText: string,
) => {
  const source = sourceFileFor("dictionary.ts", content);
  const locator = findDictionaryStageObject(source, "endpoint", `${moduleClassName}Endpoint`);
  if (!locator) return null;
  return insertOrderedFieldLine(content, locator, entryName, entryText, { fieldIndent: "    ", closingIndent: "  " });
};

const dictionaryChainOf = (node: ts.Node): ts.CallExpression | undefined => {
  if (
    ts.isCallExpression(node) &&
    outermostFluentCall(node) === node &&
    protectedDictionaryChainOrder.some((method) => chainMethodsForCall(node).includes(method))
  )
    return node;
  return ts.forEachChild(node, dictionaryChainOf);
};

const chainMethodNames = (call: ts.Expression): ts.Identifier[] => {
  if (!ts.isCallExpression(call) || !ts.isPropertyAccessExpression(call.expression)) return [];
  const name = call.expression.name;
  return [...chainMethodNames(call.expression.expression), ...(ts.isIdentifier(name) ? [name] : [])];
};

//* Located on the parsed chain, never by text search: the sample dictionary's header comment mentions `.error()`.
export const insertDictionaryEnum = (content: string, enumClassName: string, enumName: string, values: string[]) => {
  if (content.includes(`.enum<${enumClassName}>("${enumName}"`)) return content;
  const source = sourceFileFor("dictionary.ts", content);
  if (hasParseDiagnostics(source)) return null;
  const chain = dictionaryChainOf(source);
  if (!chain) return null;
  const enumBlock = `  .enum<${enumClassName}>("${enumName}", (t) => ({\n${values
    .map((value) => `    ${value}: t([${JSON.stringify(titleize(value))}, ${JSON.stringify(titleize(value))}]),`)
    .join("\n")}\n  }))\n`;
  const later = chainMethodNames(chain).find((name) => name.text === "error" || name.text === "translate");
  if (!later) return spliceText(content, chain.getEnd(), chain.getEnd(), `\n${enumBlock.trimEnd()}`);
  const dot = content.lastIndexOf(".", later.getStart(source));
  const lineStart = lineStartAt(content, dot);
  if (content.slice(lineStart, dot).trim() === "") return spliceText(content, lineStart, lineStart, enumBlock);
  return spliceText(content, dot, dot, `\n${enumBlock}`);
};
