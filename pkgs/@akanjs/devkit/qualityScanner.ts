import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import ignore from "ignore";
import ts from "typescript";

type QualitySeverity = "warning";
type QualityScope = "global" | "file" | "convention" | "layout";

export interface QualityWarning {
  rule: string;
  scope: QualityScope;
  severity: QualitySeverity;
  message: string;
  file?: string;
  line?: number;
  locations?: Array<{ file: string; line: number }>;
}

export interface QualityScanResult {
  workspaceRoot: string;
  scannedFiles: number;
  warnings: QualityWarning[];
  suggestedRules: string[];
}

interface SourceFileInfo {
  file: string;
  absolutePath: string;
  content: string;
  sourceFile: ts.SourceFile;
}

interface ExportedFunctionLike {
  name: string;
  kind: "class" | "function" | "function-variable";
  file: string;
  line: number;
  bodyFingerprint?: string;
  duplicateNameExempt: boolean;
}

interface TopLevelDeclaration {
  name: string;
  kind: string;
  line: number;
  exported: boolean;
  node: ts.Statement;
}

const MAX_FILE_LINES = 2000;
const PLACEHOLDER_EXPORT_NAMES = new Set([
  "aa",
  "dumb",
  "dumb2",
  "someBaseLogic",
  "someCommonLogic",
  "someFrontendLogic",
  "someBackendLogic",
]);

const SUGGESTED_RULES = [
  "Keep generated scanSync index files out of hand-written changes; generated indexes should only contain one-depth export statements.",
  "Generated Akan index files should not contain placeholder exports such as aa, dumb, dumb2, or some*Logic.",
  "Dictionary text should not contain scaffold wording, misspellings, or stale copied domain nouns.",
  "Warn earlier on very long Akan files: 500 lines for services, 800 lines for Template/Zone files, and 1000 lines for Util files.",
  "Global declarations, Window augmentation, and prototype mutation should stay in explicitly approved low-level integration files.",
  "Keep app root folders small and conventional: application code belongs under common, env, lib, page, private, public, script, srvkit, ui, or webkit.",
  "Keep apps/*/lib and libs/*/lib root files limited to generated support facets such as cnst.ts, db.ts, dict.ts, sig.ts, srv.ts, st.ts, useClient.ts, and useServer.ts.",
  "Use domain module folders consistently: lib/<model> for database modules, lib/_<service> for service modules, and lib/__scalar/<scalar> for scalar modules.",
  "Keep module UI filenames predictable: database modules use <Model>.Template/Unit/Util/View/Zone.tsx, service modules use <Service>.Util/Zone.tsx, and scalar modules use <Scalar>.Template/Unit.tsx.",
  "Move shared app utilities to apps/*/common instead of creating apps/*/base.",
  "Avoid large mixed-purpose class files; class export files should import helpers from neighboring utility files instead of declaring them inline.",
];

const APP_ROOT_FILES = new Set([
  "akan.app.json",
  "akan.config.ts",
  "capacitor.config.ts",
  "client.ts",
  "main.ts",
  "package.json",
  "server.ts",
  "tsconfig.json",
]);

const LIB_ROOT_FILES = new Set([
  "cnst.ts",
  "db.ts",
  "dict.ts",
  "option.ts",
  "sig.ts",
  "srv.ts",
  "st.ts",
  "useClient.ts",
  "useServer.ts",
]);

const CONVENTION_SUFFIXES = [
  ".constant.ts",
  ".dictionary.ts",
  ".document.ts",
  ".service.ts",
  ".signal.ts",
  ".store.ts",
] as const;

export class AkanQualityScanner {
  async scan(workspaceRoot: string): Promise<QualityScanResult> {
    const targetFiles = await this.#collectTargetFiles(workspaceRoot);
    const sourceFiles = await Promise.all(targetFiles.map((file) => this.#readSourceFile(workspaceRoot, file)));
    const warnings = [
      ...this.#scanGlobalQuality(sourceFiles),
      ...sourceFiles.flatMap((sourceFile) => this.#scanSingleFileQuality(sourceFile)),
      ...sourceFiles.flatMap((sourceFile) => this.#scanConventionQuality(sourceFile)),
      ...sourceFiles.flatMap((sourceFile) => this.#scanLayoutQuality(sourceFile)),
    ];

    return {
      workspaceRoot,
      scannedFiles: sourceFiles.length,
      warnings: warnings.sort(compareWarnings),
      suggestedRules: SUGGESTED_RULES,
    };
  }

  async #collectTargetFiles(workspaceRoot: string) {
    const ignoreFilter = ignore().add(await this.#readGitIgnore(workspaceRoot));
    const files: string[] = [];
    for (const targetRoot of ["apps", "libs"]) {
      const absoluteTargetRoot = path.join(workspaceRoot, targetRoot);
      if (!(await isDirectory(absoluteTargetRoot))) continue;
      await this.#walkTargetFiles(workspaceRoot, absoluteTargetRoot, ignoreFilter, files);
    }
    return files.sort();
  }

  async #readGitIgnore(workspaceRoot: string) {
    const gitIgnorePath = path.join(workspaceRoot, ".gitignore");
    if (!(await Bun.file(gitIgnorePath).exists())) return [];
    return (await readFile(gitIgnorePath, "utf8")).split(/\r?\n/);
  }

  async #walkTargetFiles(
    workspaceRoot: string,
    currentPath: string,
    ignoreFilter: ReturnType<typeof ignore>,
    files: string[],
  ) {
    const entries = await readdir(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(currentPath, entry.name);
      const relativePath = toPosix(path.relative(workspaceRoot, absolutePath));
      if (shouldSkipPath(relativePath, entry.isDirectory(), ignoreFilter)) continue;

      if (entry.isDirectory()) {
        await this.#walkTargetFiles(workspaceRoot, absolutePath, ignoreFilter, files);
        continue;
      }
      if ((relativePath.endsWith(".ts") || relativePath.endsWith(".tsx")) && !relativePath.endsWith(".d.ts")) {
        files.push(relativePath);
      }
    }
  }

  async #readSourceFile(workspaceRoot: string, file: string): Promise<SourceFileInfo> {
    const absolutePath = path.join(workspaceRoot, file);
    const content = await readFile(absolutePath, "utf8");
    return {
      file,
      absolutePath,
      content,
      sourceFile: ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, getScriptKind(file)),
    };
  }

  #scanGlobalQuality(sourceFiles: SourceFileInfo[]): QualityWarning[] {
    const exportedFunctionLikes = sourceFiles.flatMap((sourceFile) => getExportedFunctionLikes(sourceFile));
    const warnings: QualityWarning[] = [];

    const nameCheckedDeclarations = exportedFunctionLikes.filter((declaration) => !declaration.duplicateNameExempt);
    for (const [name, declarations] of groupBy(nameCheckedDeclarations, (declaration) => declaration.name)) {
      if (declarations.length < 2) continue;
      warnings.push({
        rule: "akan.global.duplicate-exported-function-name",
        scope: "global",
        severity: "warning",
        message: `Exported function or class name "${name}" is declared in ${declarations.length} files.`,
        locations: declarations.map(({ file, line }) => ({ file, line })),
      });
    }

    const declarationsWithBody = exportedFunctionLikes.filter((declaration) => declaration.bodyFingerprint);
    for (const [fingerprint, declarations] of groupBy(
      declarationsWithBody,
      (declaration) => declaration.bodyFingerprint ?? "",
    )) {
      const uniqueNames = new Set(declarations.map((declaration) => declaration.name));
      if (declarations.length < 2 || uniqueNames.size < 2 || fingerprint === "") continue;
      warnings.push({
        rule: "akan.global.duplicate-exported-function-body",
        scope: "global",
        severity: "warning",
        message: `Exported functions/classes share the same implementation body: ${declarations
          .map((declaration) => declaration.name)
          .join(", ")}.`,
        locations: declarations.map(({ file, line }) => ({ file, line })),
      });
    }

    return warnings;
  }

  #scanSingleFileQuality(sourceFile: SourceFileInfo): QualityWarning[] {
    const warnings: QualityWarning[] = [];
    const lineCount = sourceFile.content.split(/\r?\n/).length;
    const recommendedLineLimit = getRecommendedLineLimit(sourceFile.file);
    if (recommendedLineLimit && lineCount > recommendedLineLimit) {
      warnings.push({
        rule: "akan.file.recommended-max-lines",
        scope: "file",
        severity: "warning",
        file: sourceFile.file,
        message: `File has ${lineCount} lines. Recommended limit for this file type is ${recommendedLineLimit} lines.`,
      });
    }
    if (lineCount > MAX_FILE_LINES) {
      warnings.push({
        rule: "akan.file.max-lines",
        scope: "file",
        severity: "warning",
        file: sourceFile.file,
        message: `File has ${lineCount} lines. Keep single files under ${MAX_FILE_LINES} lines.`,
      });
    }

    warnings.push(...getPlaceholderExportWarnings(sourceFile));
    warnings.push(...getDictionaryTextWarnings(sourceFile));
    warnings.push(...getGlobalMutationWarnings(sourceFile));

    const exportedClassNames = getExportedClassNames(sourceFile.sourceFile);
    if (exportedClassNames.length === 0) return warnings;
    const allowedInterfaceNames = new Set(exportedClassNames.map((name) => `${name}Options`));
    for (const declaration of getTopLevelDeclarations(sourceFile)) {
      if (declaration.kind === "class" && exportedClassNames.includes(declaration.name)) continue;
      if (declaration.kind === "interface" && allowedInterfaceNames.has(declaration.name)) continue;
      warnings.push({
        rule: "akan.file.class-export-global-declaration",
        scope: "file",
        severity: "warning",
        file: sourceFile.file,
        line: declaration.line,
        message: `Class export files should not declare top-level ${declaration.kind} "${declaration.name}". Move helpers to another file and import them.`,
      });
    }
    return warnings;
  }

  #scanConventionQuality(sourceFile: SourceFileInfo): QualityWarning[] {
    const suffix = CONVENTION_SUFFIXES.find((candidate) => sourceFile.file.endsWith(candidate));
    if (!suffix) return [];

    const modelName = toPascalCase(path.basename(sourceFile.file, suffix));
    const warnings: QualityWarning[] = [];
    for (const declaration of getTopLevelDeclarations(sourceFile)) {
      if (isAllowedConventionDeclaration(suffix, modelName, declaration)) continue;
      warnings.push({
        rule: `akan.convention${suffix.replace(".ts", "")}`,
        scope: "convention",
        severity: "warning",
        file: sourceFile.file,
        line: declaration.line,
        message: `${path.basename(sourceFile.file)} should not declare top-level ${declaration.kind} "${declaration.name}". Allowed declarations: ${getConventionDescription(
          suffix,
          modelName,
        )}.`,
      });
    }
    return warnings;
  }

  #scanLayoutQuality(sourceFile: SourceFileInfo): QualityWarning[] {
    const segments = sourceFile.file.split("/");
    const warnings: QualityWarning[] = [];
    if (segments[0] === "apps" && segments.length === 3 && !APP_ROOT_FILES.has(segments[2])) {
      warnings.push({
        rule: "akan.layout.app-root-file",
        scope: "layout",
        severity: "warning",
        file: sourceFile.file,
        message: `Unexpected app root file "${segments[2]}". Keep application code in conventional app folders.`,
      });
    }

    const libRootFile = getLibRootFile(sourceFile.file);
    if (libRootFile && !LIB_ROOT_FILES.has(libRootFile)) {
      warnings.push({
        rule: "akan.layout.lib-root-file",
        scope: "layout",
        severity: "warning",
        file: sourceFile.file,
        message: `Unexpected lib root file "${libRootFile}". Keep direct lib root files limited to generated support facets.`,
      });
    }

    const moduleUiWarning = getModuleUiWarning(sourceFile.file);
    if (moduleUiWarning) warnings.push(moduleUiWarning);
    return warnings;
  }
}

export function formatQualityScanResult(result: QualityScanResult) {
  const sections = [
    "Akan Code Quality Scan",
    `workspace: ${result.workspaceRoot}`,
    `scanned files: ${result.scannedFiles}`,
    `warnings: ${result.warnings.length}`,
    "",
    "Warnings:",
    "",
    ...formatQualityWarnings(result.warnings),
    "",
    "Suggested quality rules:",
    "",
    ...result.suggestedRules.map((rule) => `  - ${rule}`),
  ];
  return sections.join("\n");
}

export function formatQualityWarnings(warnings: QualityWarning[]) {
  if (warnings.length === 0) return ["No warnings found."];
  return warnings.flatMap((warning) => {
    const location = formatQualityLocation(warning.file, warning.line);
    const lines = [`${location} - warning ${warning.rule}: ${warning.message}`];
    if (warning.locations?.length) {
      lines.push(
        ...warning.locations.map(({ file, line }) => `  note: related location ${formatQualityLocation(file, line)}`),
      );
    }
    return lines;
  });
}

function formatQualityLocation(file: string | undefined, line: number | undefined) {
  return `${file ?? "<global>"}:${line ?? 1}:1`;
}

function getExportedFunctionLikes(sourceFile: SourceFileInfo): ExportedFunctionLike[] {
  const declarations: ExportedFunctionLike[] = [];
  const pageExempt = isPageRouteFile(sourceFile.file);
  for (const statement of sourceFile.sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name && isExported(statement)) {
      declarations.push({
        name: statement.name.text,
        kind: "function",
        file: sourceFile.file,
        line: getLine(sourceFile.sourceFile, statement),
        bodyFingerprint: getBodyFingerprint(sourceFile.sourceFile, statement.body),
        duplicateNameExempt: pageExempt || isConventionDuplicateNameExempt(sourceFile.file, false),
      });
    }
    if (ts.isClassDeclaration(statement) && statement.name && isExported(statement)) {
      declarations.push({
        name: statement.name.text,
        kind: "class",
        file: sourceFile.file,
        line: getLine(sourceFile.sourceFile, statement),
        bodyFingerprint: getBodyFingerprint(sourceFile.sourceFile, statement),
        duplicateNameExempt:
          pageExempt ||
          isConventionDuplicateNameExempt(sourceFile.file, isEnumClassStatement(sourceFile.sourceFile, statement)),
      });
    }
    if (ts.isVariableStatement(statement) && isExported(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || !isFunctionLikeInitializer(declaration.initializer)) continue;
        declarations.push({
          name: declaration.name.text,
          kind: "function-variable",
          file: sourceFile.file,
          line: getLine(sourceFile.sourceFile, declaration),
          bodyFingerprint: getBodyFingerprint(sourceFile.sourceFile, declaration.initializer),
          duplicateNameExempt: pageExempt || isConventionDuplicateNameExempt(sourceFile.file, false),
        });
      }
    }
  }
  return declarations;
}

function isPageRouteFile(file: string) {
  const segments = file.split("/");
  return (segments[0] === "apps" || segments[0] === "libs") && segments[2] === "page";
}

function isConventionDuplicateNameExempt(file: string, isEnumClass: boolean) {
  if (!isInLibModule(file)) return false;
  if (file.endsWith(".tsx")) return true;
  if (
    file.endsWith(".document.ts") ||
    file.endsWith(".service.ts") ||
    file.endsWith(".signal.ts") ||
    file.endsWith(".store.ts")
  )
    return true;
  // Model view classes may repeat across modules; enum classes must stay uniquely named.
  if (file.endsWith(".constant.ts")) return !isEnumClass;
  return false;
}

function isInLibModule(file: string) {
  const segments = file.split("/");
  return (segments[0] === "apps" || segments[0] === "libs") && segments.includes("lib");
}

function isEnumClassStatement(sourceFile: ts.SourceFile, statement: ts.Statement) {
  if (!ts.isClassDeclaration(statement)) return false;
  const heritageClause = statement.heritageClauses?.find((clause) => clause.token === ts.SyntaxKind.ExtendsKeyword);
  const expression = heritageClause?.types[0]?.expression;
  return !!expression && expression.getText(sourceFile).startsWith("enumOf(");
}

function getExportedClassNames(sourceFile: ts.SourceFile) {
  return sourceFile.statements
    .filter((statement): statement is ts.ClassDeclaration => ts.isClassDeclaration(statement) && !!statement.name)
    .filter((statement) => isExported(statement))
    .map((statement) => statement.name!.text);
}

function getPlaceholderExportWarnings(sourceFile: SourceFileInfo): QualityWarning[] {
  if (!sourceFile.file.endsWith("/index.ts") && !sourceFile.file.endsWith("/index.tsx")) return [];
  return getTopLevelDeclarations(sourceFile)
    .filter((declaration) => declaration.exported && PLACEHOLDER_EXPORT_NAMES.has(declaration.name))
    .map((declaration) => ({
      rule: "akan.file.placeholder-export",
      scope: "file",
      severity: "warning",
      file: sourceFile.file,
      line: declaration.line,
      message: `Generated or barrel index file should not export placeholder "${declaration.name}".`,
    }));
}

function getDictionaryTextWarnings(sourceFile: SourceFileInfo): QualityWarning[] {
  if (!sourceFile.file.endsWith(".dictionary.ts")) return [];
  const stalePatterns = [{ pattern: /\b[A-Z][A-Za-z0-9]* description\b/, label: "scaffold description text" }];
  return stalePatterns.flatMap(({ pattern, label }) =>
    findPatternLines(sourceFile.content, pattern).map((line) => ({
      rule: "akan.file.dictionary-stale-text",
      scope: "file",
      severity: "warning",
      file: sourceFile.file,
      line,
      message: `Dictionary text appears to contain ${label}.`,
    })),
  );
}

function getGlobalMutationWarnings(sourceFile: SourceFileInfo): QualityWarning[] {
  const warnings: QualityWarning[] = [];
  for (const statement of sourceFile.sourceFile.statements) {
    if (ts.isModuleDeclaration(statement) && statement.name.getText(sourceFile.sourceFile) === "global") {
      warnings.push({
        rule: "akan.file.global-declaration",
        scope: "file",
        severity: "warning",
        file: sourceFile.file,
        line: getLine(sourceFile.sourceFile, statement),
        message: "Global declarations require an explicit low-level integration allowlist.",
      });
    }
    if (ts.isInterfaceDeclaration(statement) && statement.name.text === "Window") {
      warnings.push({
        rule: "akan.file.window-augmentation",
        scope: "file",
        severity: "warning",
        file: sourceFile.file,
        line: getLine(sourceFile.sourceFile, statement),
        message: "Window augmentation should be isolated to approved browser integration files.",
      });
    }
    if (
      ts.isExpressionStatement(statement) &&
      statement.expression.getText(sourceFile.sourceFile).includes(".prototype.")
    ) {
      warnings.push({
        rule: "akan.file.prototype-mutation",
        scope: "file",
        severity: "warning",
        file: sourceFile.file,
        line: getLine(sourceFile.sourceFile, statement),
        message: "Prototype mutation should be avoided or isolated to approved low-level integration files.",
      });
    }
  }
  return warnings;
}

function getTopLevelDeclarations(sourceFile: SourceFileInfo): TopLevelDeclaration[] {
  return sourceFile.sourceFile.statements.flatMap((statement) =>
    getTopLevelDeclaration(sourceFile.sourceFile, statement),
  );
}

function getTopLevelDeclaration(sourceFile: ts.SourceFile, statement: ts.Statement): TopLevelDeclaration[] {
  const line = getLine(sourceFile, statement);
  if (ts.isClassDeclaration(statement) && statement.name) {
    return [{ name: statement.name.text, kind: "class", line, exported: isExported(statement), node: statement }];
  }
  if (ts.isFunctionDeclaration(statement) && statement.name) {
    return [{ name: statement.name.text, kind: "function", line, exported: isExported(statement), node: statement }];
  }
  if (ts.isInterfaceDeclaration(statement)) {
    return [{ name: statement.name.text, kind: "interface", line, exported: isExported(statement), node: statement }];
  }
  if (ts.isTypeAliasDeclaration(statement)) {
    return [{ name: statement.name.text, kind: "type", line, exported: isExported(statement), node: statement }];
  }
  if (ts.isEnumDeclaration(statement)) {
    return [{ name: statement.name.text, kind: "enum", line, exported: isExported(statement), node: statement }];
  }
  if (ts.isVariableStatement(statement)) {
    return statement.declarationList.declarations
      .filter((declaration) => ts.isIdentifier(declaration.name))
      .map((declaration) => ({
        name: (declaration.name as ts.Identifier).text,
        kind: "variable",
        line: getLine(sourceFile, declaration),
        exported: isExported(statement),
        node: statement,
      }));
  }
  if (ts.isExportDeclaration(statement)) {
    return [{ name: "export declaration", kind: "export", line, exported: true, node: statement }];
  }
  return [];
}

function isAllowedConventionDeclaration(
  suffix: (typeof CONVENTION_SUFFIXES)[number],
  modelName: string,
  declaration: TopLevelDeclaration,
) {
  if (suffix === ".dictionary.ts") return isExportedConst(declaration) && declaration.name === "dictionary";
  if (suffix === ".constant.ts") return isAllowedConstantDeclaration(modelName, declaration);
  if (suffix === ".document.ts")
    return (
      declaration.kind === "class" && [`${modelName}Filter`, modelName, `${modelName}Model`].includes(declaration.name)
    );
  if (suffix === ".service.ts") return declaration.kind === "class" && declaration.name === `${modelName}Service`;
  if (suffix === ".signal.ts")
    return (
      declaration.kind === "class" &&
      [`${modelName}Internal`, `${modelName}Slice`, `${modelName}Endpoint`].includes(declaration.name)
    );
  if (suffix === ".store.ts") return declaration.kind === "class" && declaration.name === `${modelName}Store`;
  return false;
}

function isAllowedConstantDeclaration(modelName: string, declaration: TopLevelDeclaration) {
  if (declaration.kind !== "class") return false;
  if (
    [`${modelName}Input`, `${modelName}Object`, modelName, `Light${modelName}`, `${modelName}Insight`].includes(
      declaration.name,
    )
  )
    return true;
  if (!ts.isClassDeclaration(declaration.node)) return false;
  const heritageClause = declaration.node.heritageClauses?.find(
    (clause) => clause.token === ts.SyntaxKind.ExtendsKeyword,
  );
  const expression = heritageClause?.types[0]?.expression;
  return !!expression && expression.getText().startsWith("enumOf(");
}

function getConventionDescription(suffix: (typeof CONVENTION_SUFFIXES)[number], modelName: string) {
  if (suffix === ".dictionary.ts") return "export const dictionary";
  if (suffix === ".constant.ts")
    return `${modelName}Input, ${modelName}Object, ${modelName}, Light${modelName}, ${modelName}Insight, or enumOf classes`;
  if (suffix === ".document.ts") return `${modelName}Filter, ${modelName}, or ${modelName}Model`;
  if (suffix === ".service.ts") return `${modelName}Service`;
  if (suffix === ".signal.ts") return `${modelName}Internal, ${modelName}Slice, or ${modelName}Endpoint`;
  return `${modelName}Store`;
}

function getLibRootFile(file: string) {
  const segments = file.split("/");
  if ((segments[0] === "libs" || segments[0] === "apps") && segments.length === 4 && segments[2] === "lib")
    return segments[3];
  return null;
}

function getModuleUiWarning(file: string): QualityWarning | null {
  if (!file.endsWith(".tsx")) return null;
  const moduleInfo = getModuleInfo(file);
  if (!moduleInfo) return null;
  const { moduleName, fileName, kind } = moduleInfo;
  const pascalName = toPascalCase(moduleName.replace(/^_+/, ""));
  const allowedSuffixes =
    kind === "database"
      ? ["Template", "Unit", "Util", "View", "Zone"]
      : kind === "service"
        ? ["Util", "Zone"]
        : ["Template", "Unit"];
  const allowedFileNames = new Set(allowedSuffixes.map((suffix) => `${pascalName}.${suffix}.tsx`));
  if (allowedFileNames.has(fileName) || fileName.endsWith(".test.tsx") || fileName.endsWith(".spec.tsx")) return null;
  return {
    rule: "akan.layout.module-ui-file",
    scope: "layout",
    severity: "warning",
    file,
    message: `Unexpected ${kind} module UI filename "${fileName}". Expected one of: ${[...allowedFileNames].join(", ")}.`,
  };
}

function getModuleInfo(file: string) {
  const segments = file.split("/");
  const libIndex = segments.indexOf("lib");
  if (libIndex < 0) return null;
  const moduleName = segments[libIndex + 1];
  if (moduleName === "__scalar") {
    if (segments.length !== libIndex + 4) return null;
    return { moduleName: segments[libIndex + 2], fileName: segments[libIndex + 3], kind: "scalar" as const };
  }
  if (segments.length !== libIndex + 3) return null;
  const fileName = segments[libIndex + 2];
  if (moduleName.startsWith("__")) {
    const scalarName = moduleName === "__scalar" ? segments[libIndex + 2] : moduleName;
    return { moduleName: scalarName, fileName, kind: "scalar" as const };
  }
  if (moduleName.startsWith("_")) return { moduleName, fileName, kind: "service" as const };
  return { moduleName, fileName, kind: "database" as const };
}

function isExportedConst(declaration: TopLevelDeclaration) {
  return (
    declaration.exported &&
    ts.isVariableStatement(declaration.node) &&
    (declaration.node.declarationList.flags & ts.NodeFlags.Const) !== 0
  );
}

function isExported(node: ts.Node) {
  return (
    !!ts.getCombinedModifierFlags(node as ts.Declaration) &&
    !!(ts.getCombinedModifierFlags(node as ts.Declaration) & ts.ModifierFlags.Export)
  );
}

function isFunctionLikeInitializer(node: ts.Expression | undefined) {
  return !!node && (ts.isArrowFunction(node) || ts.isFunctionExpression(node));
}

function getBodyFingerprint(sourceFile: ts.SourceFile, node: ts.Node | undefined) {
  if (!node) return undefined;
  const normalizedBody = node.getText(sourceFile).replace(/\s+/g, " ").trim();
  if (normalizedBody.length < 80) return undefined;
  return createHash("sha256").update(normalizedBody).digest("hex");
}

function shouldSkipPath(relativePath: string, isDirectory: boolean, ignoreFilter: ReturnType<typeof ignore>) {
  const ignorePath = isDirectory ? `${relativePath}/` : relativePath;
  return (
    relativePath === ".git" ||
    relativePath.includes("/.git/") ||
    relativePath.includes("/node_modules/") ||
    ignoreFilter.ignores(relativePath) ||
    ignoreFilter.ignores(ignorePath)
  );
}

async function isDirectory(absolutePath: string) {
  try {
    return (await stat(absolutePath)).isDirectory();
  } catch {
    return false;
  }
}

function getScriptKind(file: string) {
  return file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
}

function getLine(sourceFile: ts.SourceFile, node: ts.Node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function getRecommendedLineLimit(file: string) {
  if (file.endsWith(".service.ts")) return 500;
  if (file.endsWith(".Template.tsx") || file.endsWith(".Zone.tsx")) return 800;
  if (file.endsWith(".Util.tsx")) return 1000;
  return null;
}

function findPatternLines(content: string, pattern: RegExp) {
  return content.split(/\r?\n/).flatMap((line, index) => (pattern.test(line) ? [index + 1] : []));
}

function toPascalCase(value: string) {
  return value.replace(/(^|[-_./])([a-zA-Z0-9])/g, (_, __, char: string) => char.toUpperCase()).replace(/[-_./]/g, "");
}

function toPosix(value: string) {
  return value.split(path.sep).join("/");
}

function groupBy<T>(items: T[], getKey: (item: T) => string) {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const key = getKey(item);
    grouped.set(key, [...(grouped.get(key) ?? []), item]);
  }
  return grouped;
}

function compareWarnings(a: QualityWarning, b: QualityWarning) {
  return (
    a.scope.localeCompare(b.scope) ||
    (a.file ?? "").localeCompare(b.file ?? "") ||
    (a.line ?? 0) - (b.line ?? 0) ||
    a.rule.localeCompare(b.rule)
  );
}
