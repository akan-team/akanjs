import { access } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import type { AkanModuleContext } from "../akanContext";
import type { Workspace } from "../commandDecorators";
import { moduleComponentName, moduleSourcePaths } from "./source";
import type {
  AkanConstantIndex,
  AkanDictionaryIndex,
  AkanFieldOutline,
  AkanFieldPresence,
  AkanIndexedFile,
  AkanIndexedFileKind,
  AkanModuleContextIndex,
  AkanProjectionOutline,
  AkanSourceSpan,
  WorkflowDiagnostic,
} from "./types";

export interface BuildAkanModuleContextIndexOptions {
  field?: string;
}

const indexFileKinds = [
  "abstract",
  "constant",
  "dictionary",
  "service",
  "signal",
  "store",
  "template",
  "unit",
  "util",
  "view",
  "zone",
] as const;

const sourceText = async (filePath: string) => {
  try {
    return await Bun.file(filePath).text();
  } catch {
    return null;
  }
};

const fileExists = async (filePath: string) => {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
};

const sourceFileFor = (filePath: string, content: string) =>
  ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

const parseDiagnosticsFor = (source: ts.SourceFile, filePath: string): WorkflowDiagnostic[] => {
  const parseDiagnostics =
    (source as ts.SourceFile & { parseDiagnostics?: readonly ts.DiagnosticWithLocation[] }).parseDiagnostics ?? [];
  return parseDiagnostics.map((diagnostic) => ({
    severity: "error",
    code: "module-index-typescript-parse-error",
    message: `TypeScript parse diagnostic TS${diagnostic.code} in ${filePath}: ${ts.flattenDiagnosticMessageText(
      diagnostic.messageText,
      "\n",
    )}`,
    context: { target: filePath, paths: [filePath] },
  }));
};

const spanFor = (source: ts.SourceFile, file: string, node: ts.Node): AkanSourceSpan => {
  const startOffset = node.getStart(source);
  const endOffset = node.getEnd();
  const start = source.getLineAndCharacterOfPosition(startOffset);
  const end = source.getLineAndCharacterOfPosition(endOffset);
  return {
    file,
    startLine: start.line + 1,
    endLine: end.line + 1,
    startOffset,
    endOffset,
  };
};

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

const expressionSummary = (expression: ts.Expression): string => {
  if (ts.isAsExpression(expression)) return expressionSummary(expression.expression);
  if (ts.isIdentifier(expression) || ts.isPropertyAccessExpression(expression))
    return expressionName(expression) ?? "expression";
  if (ts.isArrayLiteralExpression(expression)) return "array-literal";
  if (ts.isObjectLiteralExpression(expression)) return "object-literal";
  if (ts.isStringLiteralLike(expression)) return "string-literal";
  if (ts.isNumericLiteral(expression)) return "numeric-literal";
  if (expression.kind === ts.SyntaxKind.TrueKeyword || expression.kind === ts.SyntaxKind.FalseKeyword) {
    return "boolean-literal";
  }
  if (ts.isCallExpression(expression)) {
    const callee = expressionName(expression.expression);
    return callee ? `${callee}(...)` : "call-expression";
  }
  return ts.SyntaxKind[expression.kind] ?? "expression";
};

const typeSummaryForInitializer = (initializer: ts.Expression | undefined) => {
  if (!initializer) return undefined;
  const expression = ts.isAsExpression(initializer) ? initializer.expression : initializer;
  if (!ts.isCallExpression(expression)) return expressionSummary(expression);
  const callee = expressionName(expression.expression);
  const firstArg = expression.arguments[0];
  const argSummary = firstArg ? expressionSummary(firstArg) : "";
  return [callee, argSummary ? `(${argSummary})` : ""].filter(Boolean).join("");
};

const fieldsFromObject = (
  source: ts.SourceFile,
  file: string,
  objectLiteral: ts.ObjectLiteralExpression,
  kind: AkanFieldOutline["kind"],
) =>
  objectLiteral.properties
    .map((property, index): AkanFieldOutline | null => {
      const name = propertyName(property);
      if (!name) return null;
      const initializer = ts.isPropertyAssignment(property) ? property.initializer : undefined;
      return {
        name,
        kind,
        order: index,
        ...(initializer ? { typeSummary: typeSummaryForInitializer(initializer) } : {}),
        sourceSpan: spanFor(source, file, property),
      };
    })
    .filter((field): field is AkanFieldOutline => field !== null);

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

interface ParsedConstantIndex {
  index: AkanConstantIndex;
  diagnostics: WorkflowDiagnostic[];
}

interface ParsedDictionaryIndex {
  index?: AkanDictionaryIndex;
  diagnostics: WorkflowDiagnostic[];
  modelFound: boolean;
}

const parseConstantIndex = (filePath: string, content: string, moduleClassName: string): ParsedConstantIndex => {
  const source = sourceFileFor(filePath, content);
  const diagnostics = parseDiagnosticsFor(source, filePath);
  const inputClassName = `${moduleClassName}Input`;
  let inputClass: ts.ClassDeclaration | null = null;
  let inputViaFound = false;
  let inputBuilderFound = false;
  let inputBuilderObjectFound = false;
  let builderName: string | null = null;
  let fields: AkanFieldOutline[] = [];
  let lightProjection: AkanProjectionOutline | undefined;

  const visit = (node: ts.Node) => {
    if (!ts.isClassDeclaration(node) || !node.name) {
      ts.forEachChild(node, visit);
      return;
    }
    const className = node.name.text;
    const viaCall = heritageCall(node);
    if (className === inputClassName) {
      inputClass = node;
      if (!viaCall) return;
      inputViaFound = true;
      const callback = viaCall.arguments.find((arg) => ts.isArrowFunction(arg) || ts.isFunctionExpression(arg));
      if (callback && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback))) {
        inputBuilderFound = true;
        builderName = nodeName(callback.parameters[0]?.name) ?? null;
        const objectLiteral = firstObjectReturnedByArrow(callback);
        if (objectLiteral) {
          inputBuilderObjectFound = true;
          fields = fieldsFromObject(source, filePath, objectLiteral, "constant");
        }
      }
    }
    if (!viaCall) return;
    if (className === `Light${moduleClassName}`) {
      const projectionArg = viaCall.arguments.find((arg) => {
        const expression = ts.isAsExpression(arg) ? arg.expression : arg;
        return ts.isArrayLiteralExpression(expression);
      });
      const arrayLiteral = projectionArg
        ? ts.isAsExpression(projectionArg)
          ? projectionArg.expression
          : projectionArg
        : null;
      if (arrayLiteral && ts.isArrayLiteralExpression(arrayLiteral)) {
        lightProjection = {
          className,
          sourceSpan: spanFor(source, filePath, arrayLiteral),
          fields: arrayLiteral.elements
            .map((element, order): AkanFieldOutline | null =>
              ts.isStringLiteralLike(element)
                ? {
                    name: element.text,
                    kind: "lightProjection",
                    order,
                    typeSummary: "string-literal",
                    sourceSpan: spanFor(source, filePath, element),
                  }
                : null,
            )
            .filter((field): field is AkanFieldOutline => field !== null),
        };
      }
    }
  };
  ts.forEachChild(source, visit);

  if (!inputClass) {
    diagnostics.push({
      severity: "error",
      code: "module-index-constant-input-missing",
      message: `Constant input class ${inputClassName} was not found in ${filePath}.`,
      context: { target: inputClassName, paths: [filePath] },
    });
  } else if (!inputViaFound) {
    diagnostics.push({
      severity: "error",
      code: "module-index-constant-via-missing",
      message: `Constant input class ${inputClassName} does not extend via(...) in ${filePath}.`,
      context: { target: inputClassName, paths: [filePath] },
    });
  } else if (!inputBuilderFound) {
    diagnostics.push({
      severity: "error",
      code: "module-index-constant-builder-missing",
      message: `Constant input class ${inputClassName} does not provide a via(...) builder callback in ${filePath}.`,
      context: { target: inputClassName, paths: [filePath] },
    });
  } else if (!inputBuilderObjectFound) {
    diagnostics.push({
      severity: "error",
      code: "module-index-constant-builder-object-missing",
      message: `Constant input class ${inputClassName} builder does not return an object literal in ${filePath}.`,
      context: { target: inputClassName, paths: [filePath] },
    });
  }

  return {
    index: {
      path: filePath,
      inputClassName,
      builderName,
      fields,
      ...(lightProjection ? { lightProjection } : {}),
      ...(inputClass ? { sourceSpan: spanFor(source, filePath, inputClass) } : {}),
    },
    diagnostics,
  };
};

const callExpressionName = (node: ts.CallExpression) =>
  ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : expressionName(node.expression);

const parseDictionaryIndex = (filePath: string, content: string, moduleClassName: string): ParsedDictionaryIndex => {
  const source = sourceFileFor(filePath, content);
  const diagnostics = parseDiagnosticsFor(source, filePath);
  let index: AkanDictionaryIndex | undefined;
  let modelFound = false;

  const visit = (node: ts.Node) => {
    if (modelFound || !ts.isCallExpression(node)) {
      ts.forEachChild(node, visit);
      return;
    }
    if (callExpressionName(node) !== "model") {
      ts.forEachChild(node, visit);
      return;
    }
    const typeArgument = node.typeArguments?.[0];
    if (!typeArgument || typeArgument.getText(source) !== moduleClassName) {
      ts.forEachChild(node, visit);
      return;
    }
    modelFound = true;
    const callback = node.arguments.find((arg) => ts.isArrowFunction(arg) || ts.isFunctionExpression(arg));
    if (!callback || (!ts.isArrowFunction(callback) && !ts.isFunctionExpression(callback))) {
      diagnostics.push({
        severity: "error",
        code: "module-index-dictionary-builder-missing",
        message: `Dictionary .model<${moduleClassName}> branch does not provide a builder callback in ${filePath}.`,
        context: { target: moduleClassName, paths: [filePath] },
      });
      return;
    }
    const objectLiteral = firstObjectReturnedByArrow(callback);
    if (!objectLiteral) {
      diagnostics.push({
        severity: "error",
        code: "module-index-dictionary-builder-object-missing",
        message: `Dictionary .model<${moduleClassName}> builder does not return an object literal in ${filePath}.`,
        context: { target: moduleClassName, paths: [filePath] },
      });
    }
    index = {
      path: filePath,
      modelClassName: moduleClassName,
      translatorName: nodeName(callback.parameters[0]?.name),
      fields: objectLiteral ? fieldsFromObject(source, filePath, objectLiteral, "dictionary") : [],
      sourceSpan: spanFor(source, filePath, node),
    };
  };
  ts.forEachChild(source, visit);
  return { index, diagnostics, modelFound };
};

const expectedFilesFor = (module: AkanModuleContext): AkanIndexedFile[] => {
  const paths = moduleSourcePaths(module.name);
  return indexFileKinds.map((kind) => {
    const expectedModulePath = paths[kind];
    const expectedFilename = path.basename(expectedModulePath);
    const actualFilename =
      module.files.find((file) => file === expectedFilename) ??
      module.files.find((file) => file.toLowerCase() === expectedFilename.toLowerCase());
    const present = actualFilename !== undefined;
    const casing = !present ? "missing" : actualFilename === expectedFilename ? "match" : "mismatch";
    return {
      kind: kind as AkanIndexedFileKind,
      path: `${module.path}/${actualFilename ?? expectedFilename}`,
      expectedPath: `${module.path}/${expectedFilename}`,
      filename: actualFilename ?? expectedFilename,
      expectedFilename,
      present,
      casing,
    };
  });
};

const diagnosticsForFiles = (files: AkanIndexedFile[]): WorkflowDiagnostic[] =>
  files.flatMap((file) => {
    if (file.kind !== "constant" && file.kind !== "dictionary") return [];
    if (file.casing === "match") return [];
    return [
      {
        severity: "error",
        code: file.casing === "missing" ? "module-index-file-missing" : "module-index-file-casing-mismatch",
        message:
          file.casing === "missing"
            ? `Expected ${file.kind} file is missing: ${file.expectedPath}.`
            : `Expected ${file.expectedPath}, but found ${file.path}.`,
        context: { target: file.expectedPath, paths: [file.path, file.expectedPath] },
      },
    ];
  });

const fieldPresence = (
  requestedField: string | undefined,
  constantFields: AkanFieldOutline[],
  dictionaryFields: AkanFieldOutline[],
  lightFields: AkanFieldOutline[],
) => {
  const names = new Set([
    ...constantFields.map((field) => field.name),
    ...dictionaryFields.map((field) => field.name),
    ...lightFields.map((field) => field.name),
    ...(requestedField ? [requestedField] : []),
  ]);
  return [...names].sort().map(
    (name): AkanFieldPresence => ({
      name,
      requested: requestedField === name,
      constant: constantFields.some((field) => field.name === name),
      dictionary: dictionaryFields.some((field) => field.name === name),
      lightProjection: lightFields.some((field) => field.name === name),
    }),
  );
};

const partialPresenceDiagnostics = (presence: AkanFieldPresence[], module: AkanModuleContext): WorkflowDiagnostic[] =>
  presence
    .filter(
      (field) =>
        field.constant !== field.dictionary || (field.lightProjection && (!field.constant || !field.dictionary)),
    )
    .map((field) => ({
      severity: "warning",
      code: "module-index-field-presence-partial",
      message: `${module.sysName}:${module.name}.${field.name} presence differs across constant, dictionary, and lightProjection.`,
      context: {
        target: `${module.sysName}:${module.name}.${field.name}`,
        paths: [`${module.path}/${module.name}.constant.ts`, `${module.path}/${module.name}.dictionary.ts`],
      },
    }));

export const buildAkanModuleContextIndex = async (
  workspace: Workspace,
  module: AkanModuleContext,
  options: BuildAkanModuleContextIndexOptions = {},
): Promise<AkanModuleContextIndex> => {
  const files = expectedFilesFor(module);
  const diagnostics = diagnosticsForFiles(files);
  const moduleClassName = moduleComponentName(module.name);
  const constantFile = files.find((file) => file.kind === "constant");
  const dictionaryFile = files.find((file) => file.kind === "dictionary");
  const constantContent =
    constantFile?.present && constantFile.casing === "match"
      ? await sourceText(path.join(workspace.workspaceRoot, constantFile.path))
      : null;
  const dictionaryContent =
    dictionaryFile?.present && dictionaryFile.casing === "match"
      ? await sourceText(path.join(workspace.workspaceRoot, dictionaryFile.path))
      : null;
  const parsedConstant =
    constantFile && constantContent
      ? parseConstantIndex(constantFile.path, constantContent, moduleClassName)
      : undefined;
  const constant = parsedConstant?.index;
  const parsedDictionary =
    dictionaryFile && dictionaryContent
      ? parseDictionaryIndex(dictionaryFile.path, dictionaryContent, moduleClassName)
      : undefined;
  const dictionary = parsedDictionary?.index;
  const presence = fieldPresence(
    options.field,
    constant?.fields ?? [],
    dictionary?.fields ?? [],
    constant?.lightProjection?.fields ?? [],
  );

  if (
    constantFile?.present &&
    constantFile.casing === "match" &&
    !(await fileExists(path.join(workspace.workspaceRoot, constantFile.path)))
  ) {
    diagnostics.push({
      severity: "error",
      code: "module-index-file-unreadable",
      message: `Expected constant file could not be read: ${constantFile.path}.`,
      context: { paths: [constantFile.path] },
    });
  }
  if (parsedConstant) diagnostics.push(...parsedConstant.diagnostics);
  if (parsedDictionary) diagnostics.push(...parsedDictionary.diagnostics);
  if (dictionaryFile?.present && dictionaryFile.casing === "match" && !parsedDictionary?.modelFound) {
    diagnostics.push({
      severity: "error",
      code: "module-index-dictionary-model-missing",
      message: `Dictionary .model<${moduleClassName}> branch was not found in ${dictionaryFile.path}.`,
      context: { paths: [dictionaryFile.path] },
    });
  }

  diagnostics.push(...partialPresenceDiagnostics(presence, module));

  return {
    schemaVersion: 1,
    app: module.sysName,
    module: module.name,
    moduleClassName,
    files,
    fieldPresence: presence,
    ...(constant ? { constant } : {}),
    ...(dictionary ? { dictionary } : {}),
    diagnostics,
  };
};
