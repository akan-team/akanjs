import { createAst } from "@akanjs/language";
import ts from "typescript";

export const {
  sourceFileFor,
  nodeName,
  propertyName,
  expressionName,
  callExpressionName,
  firstObjectReturnedByArrow,
  heritageCall,
} = createAst(ts);
