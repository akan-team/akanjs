import ts from "typescript";
import type { Sys } from "../commandDecorators";
import { generatedFilePathsForTarget } from "./artifacts";
import { createPrimitiveWriteReport } from "./primitive";
import type {
  PrimitiveChangedFile,
  PrimitiveFileMap,
  PrimitiveGeneratedFile,
  PrimitiveNextAction,
  PrimitiveValidationCommand,
  WorkflowDiagnostic,
} from "./types";

export const getSysRoot = (sys: Sys) => `${sys.type}s/${sys.name}`;

export const sourceFile = (sys: Sys, path: string, action: PrimitiveChangedFile["action"], reason: string) => ({
  path: `${getSysRoot(sys)}/${path}`,
  action,
  reason,
});

export const moduleComponentName = (moduleName: string) =>
  moduleName
    .replace(/[-_]+/g, " ")
    .replace(/(?:^|\s+)([a-zA-Z0-9])/g, (_, char: string) => char.toUpperCase())
    .replace(/\s+/g, "");

export const moduleSourcePaths = (moduleName: string) => {
  const componentName = moduleComponentName(moduleName);
  return {
    abstract: `lib/${moduleName}/${moduleName}.abstract.md`,
    constant: `lib/${moduleName}/${moduleName}.constant.ts`,
    dictionary: `lib/${moduleName}/${moduleName}.dictionary.ts`,
    service: `lib/${moduleName}/${moduleName}.service.ts`,
    signal: `lib/${moduleName}/${moduleName}.signal.ts`,
    store: `lib/${moduleName}/${moduleName}.store.ts`,
    template: `lib/${moduleName}/${componentName}.Template.tsx`,
    unit: `lib/${moduleName}/${componentName}.Unit.tsx`,
    util: `lib/${moduleName}/${componentName}.Util.tsx`,
    view: `lib/${moduleName}/${componentName}.View.tsx`,
    zone: `lib/${moduleName}/${componentName}.Zone.tsx`,
  };
};

export const generatedFilesForSync = (sys: Sys, reason = "Generated files may change after sync.") =>
  generatedFilePathsForTarget(getSysRoot(sys), reason);

export const validationCommandsForTarget = (target: string) =>
  [
    { command: `akan sync ${target}`, reason: "Refresh generated Akan files from source conventions." },
    { command: `akan lint ${target}`, reason: "Validate formatting, imports, and static lint rules." },
  ] satisfies PrimitiveValidationCommand[];

export const nextActionsForTarget = (target: string) =>
  [
    { command: `akan sync ${target}`, reason: "Refresh generated Akan files after source changes." },
    { command: `akan lint ${target}`, reason: "Validate the target after generated files are refreshed." },
  ] satisfies PrimitiveNextAction[];

export const createPassedPrimitiveReport = ({
  command,
  changedFiles,
  generatedFiles,
  target,
  nextActions,
}: {
  command: string;
  changedFiles: PrimitiveChangedFile[];
  generatedFiles?: PrimitiveGeneratedFile[];
  target: string;
  nextActions?: PrimitiveNextAction[];
}) =>
  createPrimitiveWriteReport({
    command,
    changedFiles,
    generatedFiles: generatedFiles ?? [],
    validationCommands: validationCommandsForTarget(target),
    diagnostics: [],
    nextActions: nextActions ?? nextActionsForTarget(target),
  });

export const scalarChangedFiles = (sys: Sys, scalarName: string, files: PrimitiveFileMap) =>
  Object.values(files).map((file) =>
    sourceFile(sys, `lib/__scalar/${scalarName}/${file.filename}`, "create", "Scalar source file was created."),
  );

export const titleize = (value: string) =>
  value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

export const lowerlize = (value: string) => `${value.slice(0, 1).toLowerCase()}${value.slice(1)}`;

const koLabels: Record<string, string> = {
  amount: "금액",
  budget: "예산",
  category: "카테고리",
  content: "내용",
  count: "개수",
  createdAt: "생성일",
  date: "날짜",
  description: "설명",
  due: "마감일",
  dueAt: "마감일",
  email: "이메일",
  enabled: "활성화",
  endAt: "종료일",
  id: "ID",
  name: "이름",
  owner: "담당자",
  priority: "우선순위",
  project: "프로젝트",
  rating: "평점",
  startAt: "시작일",
  status: "상태",
  title: "제목",
  updatedAt: "수정일",
};

const splitFieldWords = (fieldName: string) =>
  fieldName
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean);

const koLabelForField = (fieldName: string) => {
  if (koLabels[fieldName]) return koLabels[fieldName];
  const words = splitFieldWords(fieldName);
  const translated = words.map((word) => koLabels[word] ?? koLabels[lowerlize(word)] ?? null);
  return translated.every(Boolean) ? translated.join(" ") : null;
};

export const bilingualLabelForField = (fieldName: string) => {
  const en = titleize(fieldName);
  return { en, ko: koLabelForField(fieldName) ?? en };
};

export const bilingualDescriptionForField = (fieldName: string) => {
  const label = bilingualLabelForField(fieldName);
  return {
    en: `Enter ${label.en.toLowerCase()}.`,
    ko: `${label.ko} 값을 입력합니다.`,
  };
};

export const normalizeFieldType = (typeName: string) => {
  const normalizedTypes: Record<string, string> = {
    string: "String",
    boolean: "Boolean",
    date: "Date",
    int: "Int",
    integer: "Int",
    float: "Float",
    double: "Float",
    decimal: "Float",
  };
  return normalizedTypes[typeName.toLowerCase()] ?? typeName;
};

export const ensureBaseTypeImport = (content: string, typeName: string) => {
  if (typeName !== "Int" && typeName !== "Float") return content;
  const source = sourceFileFor("constant.ts", content);
  const baseImport = findNamedImport(source, "akanjs/base");
  if (baseImport) {
    if (baseImport.names.includes(typeName)) return content;
    const nextNames = [...baseImport.names, typeName].sort();
    return spliceText(
      content,
      baseImport.namedBindingsStart,
      baseImport.namedBindingsEnd,
      `{ ${nextNames.join(", ")} }`,
    );
  }
  return `import { ${typeName} } from "akanjs/base";\n${content}`;
};

export type FieldDefaultValue = string | number | boolean | null;

const numericDefault = (typeName: "Int" | "Float", rawDefault: FieldDefaultValue): string | null => {
  if (typeof rawDefault === "number") {
    if (!Number.isFinite(rawDefault)) return null;
    if (typeName === "Int" && !Number.isInteger(rawDefault)) return null;
    return String(rawDefault);
  }
  if (typeof rawDefault !== "string") return null;
  const trimmed = rawDefault.trim();
  if (!trimmed || !Number.isFinite(Number(trimmed))) return null;
  if (typeName === "Int" && !/^-?\d+$/.test(trimmed)) return null;
  return trimmed;
};

const booleanDefault = (rawDefault: FieldDefaultValue): string | null => {
  if (typeof rawDefault === "boolean") return String(rawDefault);
  if (typeof rawDefault !== "string") return null;
  const lowered = rawDefault.trim().toLowerCase();
  return lowered === "true" || lowered === "false" ? lowered : null;
};

const dateDefault = (rawDefault: FieldDefaultValue): string | null => {
  if (typeof rawDefault === "number" && Number.isFinite(rawDefault)) return `new Date(${rawDefault})`;
  if (typeof rawDefault !== "string") return null;
  const trimmed = rawDefault.trim();
  if (!trimmed) return null;
  if (trimmed === "now") return "new Date()";
  if (!Number.isNaN(Date.parse(trimmed))) return `new Date(${JSON.stringify(trimmed)})`;
  return null;
};

export const coerceFieldDefault = (
  typeName: string,
  defaultValue?: FieldDefaultValue,
  options: { enumValues?: readonly string[] | null } = {},
): { expression: string | null; diagnostic?: WorkflowDiagnostic; normalized: boolean; normalizedType: string } => {
  const normalizedType = typeName.toLowerCase() === "enum" ? "enum" : normalizeFieldType(typeName);
  if (defaultValue === undefined || defaultValue === null || defaultValue === "") {
    return { expression: null, normalized: false, normalizedType };
  }
  if (normalizedType === "Int" || normalizedType === "Float") {
    const expression = numericDefault(normalizedType, defaultValue);
    if (expression !== null) return { expression, normalized: typeof defaultValue === "string", normalizedType };
    return {
      expression: null,
      normalized: false,
      normalizedType,
      diagnostic: {
        severity: "error",
        code: "primitive-default-value-invalid",
        input: "default",
        failureScope: "source-change",
        message: `Default value for ${normalizedType} must be a numeric literal. Received: ${JSON.stringify(defaultValue)}.`,
      },
    };
  }
  if (normalizedType === "Boolean") {
    const expression = booleanDefault(defaultValue);
    if (expression !== null) return { expression, normalized: typeof defaultValue === "string", normalizedType };
    return {
      expression: null,
      normalized: false,
      normalizedType,
      diagnostic: {
        severity: "error",
        code: "primitive-default-value-invalid",
        input: "default",
        failureScope: "source-change",
        message: `Default value for Boolean must be true or false. Received: ${JSON.stringify(defaultValue)}.`,
      },
    };
  }
  if (normalizedType === "Date") {
    const expression = dateDefault(defaultValue);
    if (expression !== null) return { expression, normalized: true, normalizedType };
    return {
      expression: null,
      normalized: false,
      normalizedType,
      diagnostic: {
        severity: "error",
        code: "primitive-default-value-invalid",
        input: "default",
        failureScope: "source-change",
        message: `Default value for Date must be "now", a timestamp, or a parseable date string. Received: ${JSON.stringify(
          defaultValue,
        )}.`,
      },
    };
  }
  if (normalizedType === "enum") {
    if (typeof defaultValue === "string" && options.enumValues?.includes(defaultValue)) {
      return { expression: JSON.stringify(defaultValue), normalized: false, normalizedType };
    }
    return {
      expression: null,
      normalized: false,
      normalizedType,
      diagnostic: {
        severity: "error",
        code: "primitive-default-value-invalid",
        input: "default",
        failureScope: "source-change",
        message: `Default value for enum must be one of: ${(options.enumValues ?? []).join(", ")}. Received: ${JSON.stringify(
          defaultValue,
        )}.`,
      },
    };
  }
  return {
    expression: JSON.stringify(String(defaultValue)),
    normalized: typeof defaultValue !== "string",
    normalizedType,
  };
};

export const fieldExpression = (
  typeName: string,
  defaultValue?: FieldDefaultValue,
  options: { enumValues?: readonly string[] | null; builderName?: string } = {},
) => {
  const typeExpression = normalizeFieldType(typeName);
  const defaultExpression = coerceFieldDefault(
    options.enumValues ? "enum" : typeExpression,
    defaultValue,
    options,
  ).expression;
  const defaultOption = defaultExpression ? `, { default: ${defaultExpression} }` : "";
  return `${options.builderName ?? "field"}(${typeExpression}${defaultOption})`;
};

export const fieldOrderingPriority = [
  "id",
  "name",
  "title",
  "status",
  "category",
  "description",
  "content",
  "startAt",
  "dueAt",
  "endAt",
  "createdAt",
  "updatedAt",
] as const;

type FieldOrderingName = string;

interface LocatedField {
  name: FieldOrderingName;
  start: number;
  fullStart: number;
  end: number;
}

interface ObjectInsertionLocator {
  objectStart: number;
  objectEnd: number;
  fields: LocatedField[];
}

interface ArrayInsertionLocator {
  projectionStart: number;
  projectionEnd: number;
  fields: string[];
}

interface NamedImportLocator {
  names: string[];
  namedBindingsStart: number;
  namedBindingsEnd: number;
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

export interface AkanDictionaryStructure {
  parseValid: boolean;
  modelObjectFound: boolean;
  chainOrderValid: boolean;
  chainMethods: string[];
  fields: string[];
}

const sourceFileFor = (fileName: string, content: string, scriptKind = ts.ScriptKind.TS) =>
  ts.createSourceFile(fileName, content, ts.ScriptTarget.Latest, true, scriptKind);

const hasParseDiagnostics = (source: ts.SourceFile) =>
  ((source as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics ?? []).length > 0;

const spliceText = (content: string, start: number, end: number, replacement: string) =>
  `${content.slice(0, start)}${replacement}${content.slice(end)}`;

const lineStartAt = (content: string, position: number) => content.lastIndexOf("\n", Math.max(0, position - 1)) + 1;

const lineEndAt = (content: string, position: number) => {
  const end = content.indexOf("\n", position);
  return end < 0 ? content.length : end + 1;
};

const lineIndentAt = (content: string, position: number) =>
  /^[ \t]*/.exec(content.slice(lineStartAt(content, position)))?.[0] ?? "";

const nodeName = (node: ts.PropertyName | ts.BindingName | undefined) => {
  if (!node) return null;
  if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)) return node.text;
  return null;
};

const propertyName = (node: ts.ObjectLiteralElementLike) =>
  ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node) || ts.isMethodDeclaration(node)
    ? nodeName(node.name)
    : null;

const expressionName = (expression: ts.Expression): string | null => {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  if (ts.isCallExpression(expression)) return expressionName(expression.expression);
  if (ts.isAsExpression(expression)) return expressionName(expression.expression);
  return null;
};

const firstObjectReturnedByArrow = (node: ts.Node): ts.ObjectLiteralExpression | null => {
  if (!ts.isArrowFunction(node) && !ts.isFunctionExpression(node)) return null;
  if (ts.isObjectLiteralExpression(node.body)) return node.body;
  if (ts.isParenthesizedExpression(node.body) && ts.isObjectLiteralExpression(node.body.expression)) {
    return node.body.expression;
  }
  if (!ts.isBlock(node.body)) return null;
  for (const statement of node.body.statements) {
    if (ts.isReturnStatement(statement) && statement.expression && ts.isObjectLiteralExpression(statement.expression)) {
      return statement.expression;
    }
  }
  return null;
};

const isViaCall = (expression: ts.Expression) =>
  ts.isCallExpression(expression) && expressionName(expression.expression) === "via";

const heritageCall = (node: ts.ClassDeclaration) => {
  const heritage = node.heritageClauses?.flatMap((clause) => [...clause.types]) ?? [];
  const expression = heritage.find((clause) => isViaCall(clause.expression))?.expression;
  return expression && ts.isCallExpression(expression) ? expression : null;
};

const callExpressionName = (node: ts.CallExpression) =>
  ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : expressionName(node.expression);

const locatedObject = (source: ts.SourceFile, objectLiteral: ts.ObjectLiteralExpression): ObjectInsertionLocator => ({
  objectStart: objectLiteral.getStart(source),
  objectEnd: objectLiteral.getEnd(),
  fields: objectLiteral.properties
    .map((property): LocatedField | null => {
      const name = propertyName(property);
      if (!name) return null;
      return {
        name,
        start: property.getStart(source),
        fullStart: property.getFullStart(),
        end: property.getEnd(),
      };
    })
    .filter((field): field is LocatedField => field !== null),
});

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

const findDictionaryModelObject = (source: ts.SourceFile, moduleClassName: string): DictionaryModelLocator | null => {
  let locator: DictionaryModelLocator | null = null;
  const visit = (node: ts.Node) => {
    if (locator) return;
    if (!ts.isCallExpression(node) || callExpressionName(node) !== "model") {
      ts.forEachChild(node, visit);
      return;
    }
    const typeArgument = node.typeArguments?.[0];
    if (!typeArgument || typeArgument.getText(source) !== moduleClassName) {
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

const findNamedImport = (source: ts.SourceFile, moduleSpecifier: string): NamedImportLocator | null => {
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    if (statement.moduleSpecifier.text !== moduleSpecifier) continue;
    const namedBindings = statement.importClause?.namedBindings;
    if (!namedBindings || !ts.isNamedImports(namedBindings)) continue;
    return {
      names: namedBindings.elements.map((element) => element.name.text),
      namedBindingsStart: namedBindings.getStart(source),
      namedBindingsEnd: namedBindings.getEnd(),
    };
  }
  return null;
};

const fieldExpressionBuilder = (property: ts.ObjectLiteralElementLike) => {
  if (!ts.isPropertyAssignment(property)) return null;
  const initializer = ts.isAsExpression(property.initializer) ? property.initializer.expression : property.initializer;
  if (!ts.isCallExpression(initializer)) return null;
  return expressionName(initializer.expression);
};

const priorityOf = (fieldName: string) => {
  const priority = (fieldOrderingPriority as readonly string[]).indexOf(fieldName);
  return priority < 0 ? null : priority;
};

export const insertionIndexForFieldOrder = (fieldNames: readonly string[], newFieldName: string) => {
  const newPriority = priorityOf(newFieldName);
  if (newPriority !== null) {
    const greaterPriorityIndex = fieldNames.findIndex((name) => {
      const existingPriority = priorityOf(name);
      return existingPriority !== null && existingPriority > newPriority;
    });
    if (greaterPriorityIndex >= 0) return greaterPriorityIndex;

    const lastPriorityIndex = fieldNames.reduce((lastIndex, name, index) => {
      const existingPriority = priorityOf(name);
      return existingPriority !== null ? index : lastIndex;
    }, -1);
    return lastPriorityIndex + 1;
  }

  const lastNonPriorityIndex = fieldNames.reduce(
    (lastIndex, name, index) => (priorityOf(name) === null ? index : lastIndex),
    -1,
  );
  return lastNonPriorityIndex >= 0 ? lastNonPriorityIndex + 1 : fieldNames.length;
};

const insertOrderedFieldLine = (
  content: string,
  locator: ObjectInsertionLocator,
  fieldName: string,
  line: string,
  options: { fieldIndent: string; closingIndent: string },
) => {
  if (locator.fields.some((field) => field.name === fieldName)) return content;
  const insertIndex = insertionIndexForFieldOrder(
    locator.fields.map((field) => field.name),
    fieldName,
  );
  const formattedLine = line.trim();
  if (locator.fields.length === 0) {
    return spliceText(
      content,
      locator.objectStart,
      locator.objectEnd,
      `{\n${options.fieldIndent}${formattedLine}\n${options.closingIndent}}`,
    );
  }

  const beforeField = locator.fields[insertIndex];
  if (beforeField) {
    const leadingComments = ts.getLeadingCommentRanges(content, beforeField.fullStart) ?? [];
    const insertAt = lineStartAt(content, leadingComments[0]?.pos ?? beforeField.start);
    const indent = lineIndentAt(content, beforeField.start) || options.fieldIndent;
    return spliceText(content, insertAt, insertAt, `${indent}${formattedLine}\n`);
  }

  const afterField = locator.fields[locator.fields.length - 1];
  const insertAt = lineEndAt(content, afterField.end);
  const indent = lineIndentAt(content, afterField.start) || options.fieldIndent;
  return spliceText(content, insertAt, insertAt, `${indent}${formattedLine}\n`);
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

export const insertTemplateField = ({
  content,
  moduleName,
  moduleClassName,
  fieldName,
  component,
}: {
  content: string;
  moduleName: string;
  moduleClassName: string;
  fieldName: string;
  component: "Field.Text" | "Field.Number" | "Field.Date";
}) => {
  if (content.includes(`l("${moduleName}.${fieldName}")`) || content.includes(`.${fieldName}`)) return content;
  const layoutEndIndex = content.indexOf("    </Layout.Template>");
  if (layoutEndIndex < 0) return null;
  const formName = `${moduleName}Form`;
  if (!content.includes(`const ${formName} = st.use.${moduleName}Form();`)) return null;
  const fieldSetter = `st.do.set${moduleComponentName(fieldName)}On${moduleClassName}`;
  const fieldBlock = `      <${component}
        label={l("${moduleName}.${fieldName}")}
        desc={l("${moduleName}.${fieldName}.desc")}
        value={${formName}.${fieldName}}
        onChange={${fieldSetter}}
      />
`;
  return `${content.slice(0, layoutEndIndex)}${fieldBlock}${content.slice(layoutEndIndex)}`;
};

export const ensureEnumImport = (content: string) => {
  if (content.includes("enumOf")) return content;
  const baseImport = /import \{ ([^}]+) \} from "akanjs\/base";/.exec(content);
  if (baseImport) {
    const names = baseImport[1]?.split(",").map((name) => name.trim()) ?? [];
    return content.replace(baseImport[0], `import { ${[...names, "enumOf"].sort().join(", ")} } from "akanjs/base";`);
  }
  return `import { enumOf } from "akanjs/base";\n${content}`;
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

export const hasConstantInputField = (content: string, className: string, fieldName: string) => {
  const source = sourceFileFor("constant.ts", content);
  if (hasParseDiagnostics(source)) return false;
  return findConstantInputObject(source, className)?.fields.some((field) => field.name === fieldName) ?? false;
};

export const hasDictionaryModelField = (content: string, moduleClassName: string, fieldName: string) => {
  const source = sourceFileFor("dictionary.ts", content);
  if (hasParseDiagnostics(source)) return false;
  return findDictionaryModelObject(source, moduleClassName)?.fields.some((field) => field.name === fieldName) ?? false;
};

export const ensureConstantTypeImport = (content: string, constantPath: string, typeName: string) => {
  if (new RegExp(`import type \\{[^}]*\\b${typeName}\\b[^}]*\\} from "${constantPath}";`).test(content)) return content;
  const importPattern = new RegExp(`import type \\{ ([^}]+) \\} from "${constantPath}";`);
  const existingImport = content.match(importPattern);
  if (existingImport !== null) {
    const names = existingImport[1]?.split(",").map((name) => name.trim()) ?? [];
    return content.replace(
      existingImport[0],
      `import type { ${[...names, typeName].sort().join(", ")} } from "${constantPath}";`,
    );
  }
  return `import type { ${typeName} } from "${constantPath}";\n${content}`;
};

export const insertDictionaryEnum = (content: string, enumClassName: string, enumName: string, values: string[]) => {
  if (content.includes(`.enum<${enumClassName}>("${enumName}"`)) return content;
  const enumBlock = `  .enum<${enumClassName}>("${enumName}", (t) => ({\n${values
    .map((value) => `    ${value}: t([${JSON.stringify(titleize(value))}, ${JSON.stringify(titleize(value))}]),`)
    .join("\n")}\n  }))\n`;
  const chainEndIndex = content.lastIndexOf(";");
  const insertBeforeIndex = [content.indexOf(".error("), content.indexOf(".translate("), chainEndIndex]
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];
  if (insertBeforeIndex === undefined) return null;
  return `${content.slice(0, insertBeforeIndex)}${enumBlock}${content.slice(insertBeforeIndex)}`;
};

export const parseValues = (value: string | null) =>
  value
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean) ?? [];

// ---- Service / signal insertion (add-mutation, add-slice) ----

export const hasSourceParseErrors = (content: string, fileName = "source.ts") =>
  hasParseDiagnostics(sourceFileFor(fileName, content));

const findClassDeclaration = (source: ts.SourceFile, className: string): ts.ClassDeclaration | null => {
  let found: ts.ClassDeclaration | null = null;
  const visit = (node: ts.Node) => {
    if (found) return;
    if (ts.isClassDeclaration(node) && node.name?.text === className) {
      found = node;
      return;
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(source, visit);
  return found;
};

const firstHeritageCall = (node: ts.ClassDeclaration): ts.CallExpression | null => {
  const expression = (node.heritageClauses?.flatMap((clause) => [...clause.types]) ?? [])[0]?.expression;
  return expression && ts.isCallExpression(expression) ? expression : null;
};

const factoryArrowOf = (call: ts.CallExpression): ts.ArrowFunction | ts.FunctionExpression | null => {
  const arg = call.arguments.find((argument) => ts.isArrowFunction(argument) || ts.isFunctionExpression(argument));
  return arg && (ts.isArrowFunction(arg) || ts.isFunctionExpression(arg)) ? arg : null;
};

export const hasClassMethod = (content: string, className: string, methodName: string) => {
  const node = findClassDeclaration(sourceFileFor("service.ts", content), className);
  return Boolean(
    node?.members.some((member) => ts.isMethodDeclaration(member) && nodeName(member.name) === methodName),
  );
};

export const insertClassMethod = (content: string, className: string, methodBlock: string): string | null => {
  const source = sourceFileFor("service.ts", content);
  const node = findClassDeclaration(source, className);
  if (!node) return null;
  const closeBrace = node.getEnd() - 1;
  if (content[closeBrace] !== "}") return null;
  const lead = content.slice(0, closeBrace).endsWith("\n") ? "" : "\n";
  return spliceText(content, closeBrace, closeBrace, `${lead}${methodBlock}\n`);
};

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
  // Compute the param edit first (its offsets precede the object), but apply it last so the
  // object splice (at a higher offset) does not invalidate the param region positions.
  const paramEdit = factoryParamEdit(content, source, located.arrow, param);
  if (paramEdit === null) return null;
  const withEntry = insertOrderedFieldLine(content, locator, entryName, entryLine, {
    fieldIndent: "  ",
    closingIndent: "",
  });
  if (withEntry === content) return null;
  return paramEdit === "unchanged" ? withEntry : spliceText(withEntry, paramEdit.start, paramEdit.end, paramEdit.text);
};
