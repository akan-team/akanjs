import ts from "typescript";
import { insertOrderedFieldLine, locatedObject } from "./fieldOrder";
import {
  factoryArrowOf,
  findClassDeclaration,
  firstHeritageCall,
  firstObjectReturnedByArrow,
  nodeName,
  propertyName,
  sourceFileFor,
} from "./sourceAst";
import { spliceText } from "./sourceText";

export interface FactoryParamPlan {
  mode: "destructure" | "positional";
  name: string;
}

const arrowParamInnerRegion = (
  content: string,
  source: ts.SourceFile,
  arrow: ts.ArrowFunction | ts.FunctionExpression,
) => {
  if (arrow.parameters.length > 0) {
    return {
      start: arrow.parameters[0].getStart(source),
      end: arrow.parameters[arrow.parameters.length - 1].getEnd(),
    };
  }
  const open = content.indexOf("(", arrow.getStart(source));
  if (open < 0) return null;
  const close = content.indexOf(")", open);
  if (close < 0) return null;
  return { start: open + 1, end: close };
};

const factoryParamEdit = (
  content: string,
  source: ts.SourceFile,
  arrow: ts.ArrowFunction | ts.FunctionExpression,
  plan: FactoryParamPlan,
): { start: number; end: number; text: string } | "unchanged" | null => {
  if (arrow.parameters.length > 1) return null;
  const region = arrowParamInnerRegion(content, source, arrow);
  if (!region) return null;
  if (arrow.parameters.length === 0) {
    return { ...region, text: plan.mode === "destructure" ? `{ ${plan.name} }` : plan.name };
  }
  const param = arrow.parameters[0];
  if (plan.mode === "positional") return nodeName(param.name) === plan.name ? "unchanged" : null;
  if (!ts.isObjectBindingPattern(param.name)) return null;
  const names = param.name.elements.map((element) => (ts.isIdentifier(element.name) ? element.name.text : null));
  if (names.some((name) => name === null)) return null;
  if (names.includes(plan.name)) return "unchanged";
  return {
    start: param.getStart(source),
    end: param.getEnd(),
    text: `{ ${[...(names as string[]), plan.name].join(", ")} }`,
  };
};

const factoryObjectOf = (source: ts.SourceFile, className: string) => {
  const node = findClassDeclaration(source, className);
  const call = node ? firstHeritageCall(node) : null;
  const arrow = call ? factoryArrowOf(call) : null;
  const object = arrow ? firstObjectReturnedByArrow(arrow) : null;
  return arrow && object ? { arrow, object } : null;
};

export const hasSignalFactoryEntry = (content: string, className: string, entryName: string) => {
  const located = factoryObjectOf(sourceFileFor("signal.ts", content), className);
  return Boolean(located?.object.properties.some((property) => propertyName(property) === entryName));
};

export const insertSignalFactoryEntry = (
  content: string,
  className: string,
  entryName: string,
  entryLine: string,
  param: FactoryParamPlan,
): string | null => {
  const source = sourceFileFor("signal.ts", content);
  const located = factoryObjectOf(source, className);
  if (!located) return null;
  const locator = locatedObject(source, located.object);
  if (locator.fields.some((field) => field.name === entryName)) return content;
  // Apply the param edit last: it sits before the object, so applying it first would shift the object's offsets.
  const paramEdit = factoryParamEdit(content, source, located.arrow, param);
  if (paramEdit === null) return null;
  const withEntry = insertOrderedFieldLine(content, locator, entryName, entryLine, {
    fieldIndent: "  ",
    closingIndent: "",
  });
  if (withEntry === content) return null;
  return paramEdit === "unchanged" ? withEntry : spliceText(withEntry, paramEdit.start, paramEdit.end, paramEdit.text);
};
