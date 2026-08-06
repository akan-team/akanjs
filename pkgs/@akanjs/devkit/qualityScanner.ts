import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import ignore from "ignore";
import ts from "typescript";
import { AbstractDoc } from "./abstractDoc";

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
  fix?: string;
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

interface TextFileInfo {
  file: string;
  content: string;
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

interface ComponentFileDeclaration {
  name: string;
  kind: "interface" | "type" | "function" | "variable" | "class" | "enum";
  line: number;
  exported: boolean;
  isDefaultExport: boolean;
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
  "Keep app root folders small and conventional: application code belongs under common, env, lib, page, plugin, private, public, script, srvkit, ui, or webkit.",
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

// Non-PascalCase exports the framework recognizes on page/layout route modules (see PageModule/LayoutModule
// in pkgs/akanjs/client/csrTypes.ts). PascalCase route exports (Loading, NotFound, Error) pass the component
// check, and the `default` export is handled separately.
const PAGE_RESERVED_EXPORTS = new Set([
  "pageConfig",
  "head",
  "metadata",
  "generateHead",
  "generateMetadata",
  "fonts",
  "manifest",
  "theme",
  "reconnect",
  "wsConnect",
  "layoutStyle",
  "gaTrackingId",
]);

// How to remediate each rule, keyed by rule id. Surfaced as a `fix:` line per warning (text + JSON output)
// so the scan result tells the reader what to do, not just what is wrong.
const RULE_FIXES: Record<string, string> = {
  "akan.global.duplicate-exported-function-name":
    "Rename one of the exports, or if they are the same thing, extract it into one shared module and import it in both places.",
  "akan.global.duplicate-exported-function-body":
    "Extract the shared implementation into a single exported helper and import it, instead of copying the body.",
  "akan.file.recommended-max-lines":
    "Split the file by responsibility — move Zones, Utils, or subcomponents into sibling files.",
  "akan.file.max-lines": "Break the file into smaller focused modules; keep one primary responsibility per file.",
  "akan.file.abstract-max-lines":
    "Run `akan compact <app-or-lib>` to rewrite the abstract with the AI editor, keeping only the invariants and workflows the source files cannot show.",
  "akan.file.placeholder-export":
    "Remove the placeholder export; generated indexes should only re-export real modules.",
  "akan.file.dictionary-stale-text": "Replace the scaffold text with real localized copy for this dictionary entry.",
  "akan.file.global-declaration":
    "Move the global declaration into an approved low-level integration file (e.g. webkit) and keep it isolated.",
  "akan.file.window-augmentation":
    "Move the Window augmentation into an approved browser integration file and keep it isolated.",
  "akan.file.prototype-mutation": "Avoid prototype mutation, or isolate it in an approved low-level integration file.",
  "akan.file.class-export-global-declaration": "Move the helper to a sibling file and import it into the class module.",
  "akan.file.component-internal-declaration":
    "Move the type or helper to a type/util file in ui/, webkit/, or common/ by purpose. If it is the component's props, declare it as `interface <Component>Props`.",
  "akan.file.component-export":
    "Move the value or type to a util/constant/type file in ui/, webkit/, or common/ and import it. Adding `export` is not a valid fix — only PascalCase components and their `<Component>Props` interface belong here.",
  "akan.layout.app-root-file":
    "Move the file into a conventional app folder (common, env, lib, page, private, public, script, srvkit, ui, or webkit).",
  "akan.layout.lib-root-file":
    "Move the file into a domain module folder under lib/; keep lib root limited to generated support facets.",
  "akan.layout.module-ui-file":
    "Rename the file to an allowed module UI name, or move it to ui/ if it is not a module component.",
};

function getRuleFix(rule: string): string | undefined {
  if (rule.startsWith("akan.convention"))
    return "Keep only the model's allowed declarations in this file; move other logic to the matching domain file (service, document, store, etc.).";
  return RULE_FIXES[rule];
}

export class AkanQualityScanner {
  async scan(workspaceRoot: string): Promise<QualityScanResult> {
    const targetFiles = await this.#collectTargetFiles(workspaceRoot);
    const sourceFiles = await Promise.all(
      targetFiles
        .filter((file) => !AbstractDoc.isAbstractPath(file))
        .map((file) => this.#readSourceFile(workspaceRoot, file)),
    );
    const abstractFiles = await Promise.all(
      targetFiles
        .filter((file) => AbstractDoc.isAbstractPath(file))
        .map((file) => this.#readTextFile(workspaceRoot, file)),
    );
    const warnings = [
      ...this.#scanGlobalQuality(sourceFiles),
      ...sourceFiles.flatMap((sourceFile) => this.#scanSingleFileQuality(sourceFile)),
      ...sourceFiles.flatMap((sourceFile) => this.#scanComponentQuality(sourceFile)),
      ...sourceFiles.flatMap((sourceFile) => this.#scanConventionQuality(sourceFile)),
      ...sourceFiles.flatMap((sourceFile) => this.#scanLayoutQuality(sourceFile)),
      ...abstractFiles.flatMap((abstractFile) => this.#scanAbstractQuality(abstractFile)),
    ];

    return {
      workspaceRoot,
      scannedFiles: sourceFiles.length + abstractFiles.length,
      warnings: warnings
        .map((warning) => ({ ...warning, fix: warning.fix ?? getRuleFix(warning.rule) }))
        .sort(compareWarnings),
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
      } else if (AbstractDoc.isAbstractPath(relativePath)) {
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

  async #readTextFile(workspaceRoot: string, file: string): Promise<TextFileInfo> {
    return { file, content: await readFile(path.join(workspaceRoot, file), "utf8") };
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

  #scanComponentQuality(sourceFile: SourceFileInfo): QualityWarning[] {
    if (!isComponentDeclarationFile(sourceFile.file)) return [];
    const isPage = isPageRouteFile(sourceFile.file);
    const declarations = getComponentFileDeclarations(sourceFile.sourceFile);
    // Compound/namespaced components (e.g. `Like.WithDislike = WithDislike`) are valid without being exported.
    const compoundComponentNames = getCompoundComponentNames(sourceFile.sourceFile);
    // Components are the exported (or compound) PascalCase values; their "<Component>Props" interface may live here.
    const componentNames = declarations
      .filter((declaration) => declaration.exported && isComponentValueKind(declaration.kind))
      .filter((declaration) => isPascalCaseName(declaration.name))
      .map((declaration) => declaration.name);
    const allowedComponentNames = new Set([...componentNames, ...compoundComponentNames]);
    const allowedPropsInterfaces = new Set([...allowedComponentNames].map((name) => `${name}Props`));
    const warnings: QualityWarning[] = [];
    for (const declaration of declarations) {
      if (declaration.isDefaultExport) continue;
      if (declaration.kind === "interface" && allowedPropsInterfaces.has(declaration.name)) continue;
      if (declaration.exported) {
        if (isAllowedComponentExport(declaration, isPage)) continue;
        warnings.push({
          rule: "akan.file.component-export",
          scope: "file",
          severity: "warning",
          file: sourceFile.file,
          line: declaration.line,
          message: `Component file exports ${declaration.kind} "${declaration.name}", which is not a PascalCase component${isPage ? " or reserved route export" : ""}.`,
        });
        continue;
      }
      // A non-exported PascalCase component attached as a compound member is an accepted pattern.
      if (isComponentValueKind(declaration.kind) && compoundComponentNames.has(declaration.name)) continue;
      if (isRestrictedInternalKind(declaration.kind)) {
        warnings.push({
          rule: "akan.file.component-internal-declaration",
          scope: "file",
          severity: "warning",
          file: sourceFile.file,
          line: declaration.line,
          message: `Component file declares non-exported ${declaration.kind} "${declaration.name}". Only "interface <Component>Props" may stay internal.`,
        });
      }
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

  #scanAbstractQuality({ file, content }: TextFileInfo): QualityWarning[] {
    const lineCount = AbstractDoc.lineCountOf(content);
    if (lineCount <= AbstractDoc.maxLines) return [];
    return [
      {
        rule: "akan.file.abstract-max-lines",
        scope: "file",
        severity: "warning",
        file,
        message: `Abstract has ${lineCount} lines. Keep abstracts under ${AbstractDoc.maxLines} lines and compact them periodically.`,
      },
    ];
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
    if (warning.fix) lines.push(`  fix: ${warning.fix}`);
    return lines;
  });
}

function formatQualityLocation(file: string | undefined, line: number | undefined) {
  return `${file ?? "<global>"}:${line ?? 1}:1`;
}

function getExportedFunctionLikes(sourceFile: SourceFileInfo): ExportedFunctionLike[] {
  const declarations: ExportedFunctionLike[] = [];
  // UI component names (e.g. Card, Button) naturally repeat across apps/libs, so exempt ui files from the
  // duplicate-exported-name check. This only relaxes the name check; the shared-body check still applies.
  const nameExempt = isPageRouteFile(sourceFile.file) || isUiComponentFile(sourceFile.file);
  for (const statement of sourceFile.sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name && isExported(statement)) {
      declarations.push({
        name: statement.name.text,
        kind: "function",
        file: sourceFile.file,
        line: getLine(sourceFile.sourceFile, statement),
        bodyFingerprint: getBodyFingerprint(sourceFile.sourceFile, statement.body),
        duplicateNameExempt: nameExempt || isConventionDuplicateNameExempt(sourceFile.file, false),
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
          nameExempt ||
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
          duplicateNameExempt: nameExempt || isConventionDuplicateNameExempt(sourceFile.file, false),
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

function isUiComponentFile(file: string) {
  const segments = file.split("/");
  return (segments[0] === "apps" || segments[0] === "libs") && segments[2] === "ui";
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

function isComponentDeclarationFile(file: string) {
  if (!file.endsWith(".tsx")) return false;
  const segments = file.split("/");
  const [root, , area] = segments;
  if (root !== "apps" && root !== "libs") return false;
  if (area === "lib" || area === "ui") return true;
  return root === "apps" && area === "page";
}

function getComponentFileDeclarations(sourceFile: ts.SourceFile): ComponentFileDeclaration[] {
  const reExportedNames = new Set<string>();
  for (const statement of sourceFile.statements) {
    if (ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
      for (const element of statement.exportClause.elements)
        reExportedNames.add((element.propertyName ?? element.name).text);
    }
  }
  const declarations: ComponentFileDeclaration[] = [];
  for (const statement of sourceFile.statements) {
    const isDefaultExport = isDefaultExportStatement(statement);
    const inlineExported = isExported(statement);
    const add = (name: string, kind: ComponentFileDeclaration["kind"], line: number) =>
      declarations.push({ name, kind, line, exported: inlineExported || reExportedNames.has(name), isDefaultExport });
    if (ts.isInterfaceDeclaration(statement)) add(statement.name.text, "interface", getLine(sourceFile, statement));
    else if (ts.isTypeAliasDeclaration(statement)) add(statement.name.text, "type", getLine(sourceFile, statement));
    else if (ts.isEnumDeclaration(statement)) add(statement.name.text, "enum", getLine(sourceFile, statement));
    else if (ts.isFunctionDeclaration(statement) && statement.name)
      add(statement.name.text, "function", getLine(sourceFile, statement));
    else if (ts.isClassDeclaration(statement) && statement.name)
      add(statement.name.text, "class", getLine(sourceFile, statement));
    else if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name)) continue;
        const kind = isFunctionLikeInitializer(declaration.initializer) ? "function" : "variable";
        add(declaration.name.text, kind, getLine(sourceFile, declaration));
      }
    }
  }
  return declarations;
}

// Detects compound/namespaced component assignments like `Like.WithDislike = WithDislike`. The PascalCase
// member is the public component name; when the right side is a PascalCase identifier it is the local
// definition. Both are treated as valid components so the definition and its "<Component>Props" may stay local.
function getCompoundComponentNames(sourceFile: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  for (const statement of sourceFile.statements) {
    if (!ts.isExpressionStatement(statement)) continue;
    const { expression } = statement;
    if (!ts.isBinaryExpression(expression) || expression.operatorToken.kind !== ts.SyntaxKind.EqualsToken) continue;
    if (!ts.isPropertyAccessExpression(expression.left) || !isPascalCaseName(expression.left.name.text)) continue;
    names.add(expression.left.name.text);
    if (ts.isIdentifier(expression.right) && isPascalCaseName(expression.right.text)) names.add(expression.right.text);
  }
  return names;
}

function isComponentValueKind(kind: ComponentFileDeclaration["kind"]) {
  return kind === "variable" || kind === "function" || kind === "class";
}

function isRestrictedInternalKind(kind: ComponentFileDeclaration["kind"]) {
  return kind === "interface" || kind === "type" || kind === "function";
}

function isAllowedComponentExport(declaration: ComponentFileDeclaration, isPage: boolean) {
  if (isComponentValueKind(declaration.kind) && isPascalCaseName(declaration.name)) return true;
  return isPage && PAGE_RESERVED_EXPORTS.has(declaration.name);
}

function isPascalCaseName(name: string) {
  // PascalCase component names start uppercase and are not SCREAMING_SNAKE_CASE constants.
  return /^[A-Z]/.test(name) && !/^[A-Z0-9_]+$/.test(name);
}

function isDefaultExportStatement(statement: ts.Statement) {
  if (ts.isExportAssignment(statement)) return !statement.isExportEquals;
  return !!(ts.getCombinedModifierFlags(statement as ts.Declaration) & ts.ModifierFlags.Default);
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
