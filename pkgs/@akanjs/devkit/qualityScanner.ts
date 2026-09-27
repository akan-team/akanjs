import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { RESERVED_ROUTE_CONFIG_EXPORTS } from "akanjs/common";
import ignore from "ignore";
import ts from "typescript";
import { AbstractDoc } from "./abstractDoc";
import { FormSetterScanner } from "./formSetterScanner";
import { fileWarning, formatSsrBalance, type SsrBalanceEntry, SsrScanner } from "./ssrScanner";
import { isAllowedLibFacetRootFile, rootAllowedDirs, rootAllowedFiles, rootEntryHintOf } from "./workspaceLayout";

type QualitySeverity = "warning";
type QualityScope = "global" | "file" | "convention" | "layout" | "ssr" | "agent";

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
  ssrBalance: SsrBalanceEntry[];
  suggestedRules: string[];
}

export interface SourceFileInfo {
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
  "Hand a form control its store setter by reference so the field publishes an agent tool; put normalization in the control's transform prop and a multi-write in a _postSet<Field> hook on the store.",
  "Move shared app and lib utilities to common/ instead of creating apps/*/base or libs/*/base.",
  "Avoid large mixed-purpose class files; class export files should import helpers from neighboring utility files instead of declaring them inline.",
];

const CONVENTION_SUFFIXES = [
  ".constant.ts",
  ".dictionary.ts",
  ".document.ts",
  ".service.ts",
  ".signal.ts",
  ".store.ts",
] as const;

const RULE_FIXES: Record<string, string> = {
  "akan.global.duplicate-exported-function-name":
    "Rename one of the exports, or if they are the same thing, extract it into one shared module and import it in both places.",
  "akan.global.duplicate-exported-function-body":
    "Extract the shared implementation into a single exported helper and import it, instead of copying the body.",
  "akan.file.recommended-max-lines":
    "Split the file by responsibility — move Zones, Utils, or subcomponents into sibling files.",
  "akan.file.max-lines": "Break the file into smaller focused modules; keep one primary responsibility per file.",
  "akan.file.abstract-max-lines":
    "Trim the abstract by hand to a title, one sentence naming what the module owns, a `## Rules` list of the invariants the source cannot show, and an optional workflow chain.",
  "akan.file.placeholder-export":
    "Remove the placeholder export; generated indexes should only re-export real modules.",
  "akan.file.bang-comment-in-client":
    "Rewrite the marker as `// FIXME:` or `// TODO:`. Keep the bang form for server, srvkit, and CLI files.",
  "akan.file.dictionary-stale-text": "Replace the scaffold text with real localized copy for this dictionary entry.",
  "akan.file.global-declaration":
    "Move the global declaration into an approved low-level integration file (e.g. webkit) and keep it isolated.",
  "akan.file.window-augmentation":
    "Move the Window augmentation into an approved browser integration file and keep it isolated.",
  "akan.file.prototype-mutation": "Avoid prototype mutation, or isolate it in an approved low-level integration file.",
  "akan.file.class-export-global-declaration": "Move the helper to a sibling file and import it into the class module.",
  "akan.agent.unpublished-form-setter":
    "Pass the setter by reference where the wrapper only forwards (onChange={st.do.setTitleOnTask}); move normalization into the control's own transform prop; move a multi-write into a _postSet<Field> hook on the store, keeping the generated setter on the control.",
  "akan.file.component-internal-declaration":
    "Move the type or helper to a type/util file in ui/, webkit/, or common/ by purpose. If it is the component's props, declare it as `interface <Component>Props`.",
  "akan.file.component-export":
    "Move the value or type to a util/constant/type file in ui/, webkit/, or common/ and import it. Adding `export` is not a valid fix — only PascalCase components and their `<Component>Props` interface belong here.",
  "akan.layout.app-root-file":
    "Move the file into a conventional app folder (common, env, lib, page, private, public, script, srvkit, ui, or webkit).",
  "akan.layout.app-root-folder":
    "Move the folder's contents into a conventional app folder (common, env, lib, page, private, public, script, srvkit, ui, or webkit) and delete it.",
  "akan.layout.lib-root-file":
    "Move the file into a conventional lib folder (common, env, lib, page, private, public, srvkit, ui, or webkit).",
  "akan.layout.lib-root-folder":
    "Move the folder's contents into a conventional lib folder (common, env, lib, page, private, public, srvkit, ui, or webkit) and delete it.",
  "akan.layout.lib-facet-file":
    "Move the file into a domain module folder under lib/; keep the lib facet root limited to generated support facets.",
  "akan.layout.module-ui-file":
    "Rename the file to an allowed module UI name, or move it to ui/ if it is not a module component.",
  "akan.ssr.unnecessary-use-client":
    'Delete the "use client" directive so the file renders on the server. If it exists only to wrap one client child, drop the wrapper and use the child directly.',
  "akan.ssr.client-static-component":
    "Move the component to a server file — a <Model>.Unit.tsx / <Model>.View.tsx for a module, or a ui/ file with no directive — and reference it from the client file.",
  "akan.ssr.client-static-markup":
    "Keep the interactive element in the client component and hoist the static subtree into a server component, then accept it as `children` or render it through a Unit/View reference.",
  "akan.ssr.client-mount-load":
    "Load the data in the route with `fetch.initX(...)` / `fetch.viewX(...)` and pass the init/view object down as a prop; the client store hydrates from it and the effect goes away.",
  "akan.ssr.module-missing-server-view":
    "Add a <Model>.Unit.tsx for list/card rendering and a <Model>.View.tsx for the detail surface, then have the Zone delegate to them.",
  "akan.ssr.template-client-state":
    "Bind the field to the store instead: `value={xForm.field}` with `onChange={st.do.setFieldOnX}`.",
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
    const ssr = new SsrScanner().scan(sourceFiles);
    const warnings = [
      ...this.#scanGlobalQuality(sourceFiles),
      ...sourceFiles.flatMap((sourceFile) => this.#scanSingleFileQuality(sourceFile)),
      ...sourceFiles.flatMap((sourceFile) => this.#scanComponentQuality(sourceFile)),
      ...sourceFiles.flatMap((sourceFile) => this.#scanConventionQuality(sourceFile)),
      ...sourceFiles.flatMap((sourceFile) => this.#scanLayoutQuality(sourceFile)),
      ...abstractFiles.flatMap((abstractFile) => this.#scanAbstractQuality(abstractFile)),
      ...new FormSetterScanner().scan(sourceFiles),
      ...ssr.warnings,
    ];

    return {
      workspaceRoot,
      scannedFiles: sourceFiles.length + abstractFiles.length,
      warnings: warnings
        .map((warning) => ({ ...warning, fix: warning.fix ?? getRuleFix(warning.rule) }))
        .sort(compareWarnings),
      ssrBalance: ssr.balance,
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
    if (recommendedLineLimit && lineCount > recommendedLineLimit)
      warnings.push(
        fileWarning(
          "akan.file.recommended-max-lines",
          "file",
          sourceFile.file,
          `File has ${lineCount} lines. Recommended limit for this file type is ${recommendedLineLimit} lines.`,
        ),
      );
    if (lineCount > MAX_FILE_LINES)
      warnings.push(
        fileWarning(
          "akan.file.max-lines",
          "file",
          sourceFile.file,
          `File has ${lineCount} lines. Keep single files under ${MAX_FILE_LINES} lines.`,
        ),
      );

    warnings.push(...getBangCommentWarnings(sourceFile));
    warnings.push(...getPlaceholderExportWarnings(sourceFile));
    warnings.push(...getDictionaryTextWarnings(sourceFile));
    warnings.push(...getGlobalMutationWarnings(sourceFile));

    const exportedClassNames = getExportedClassNames(sourceFile.sourceFile);
    if (exportedClassNames.length === 0) return warnings;
    const allowedInterfaceNames = new Set(exportedClassNames.map((name) => `${name}Options`));
    for (const declaration of getTopLevelDeclarations(sourceFile)) {
      if (declaration.kind === "class" && exportedClassNames.includes(declaration.name)) continue;
      if (declaration.kind === "interface" && allowedInterfaceNames.has(declaration.name)) continue;
      warnings.push(
        fileWarning(
          "akan.file.class-export-global-declaration",
          "file",
          sourceFile.file,
          `Class export files should not declare top-level ${declaration.kind} "${declaration.name}". Move helpers to another file and import them.`,
          declaration.line,
        ),
      );
    }
    return warnings;
  }

  #scanComponentQuality(sourceFile: SourceFileInfo): QualityWarning[] {
    if (!isComponentDeclarationFile(sourceFile.file)) return [];
    const isPage = isPageRouteFile(sourceFile.file);
    const declarations = getComponentFileDeclarations(sourceFile.sourceFile);
    const compoundComponentNames = getCompoundComponentNames(sourceFile.sourceFile);
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
        warnings.push(
          fileWarning(
            "akan.file.component-export",
            "file",
            sourceFile.file,
            `Component file exports ${declaration.kind} "${declaration.name}", which is not a PascalCase component${isPage ? " or reserved route export" : ""}.`,
            declaration.line,
          ),
        );
        continue;
      }
      if (isComponentValueKind(declaration.kind) && compoundComponentNames.has(declaration.name)) continue;
      if (isRestrictedInternalKind(declaration.kind))
        warnings.push(
          fileWarning(
            "akan.file.component-internal-declaration",
            "file",
            sourceFile.file,
            `Component file declares non-exported ${declaration.kind} "${declaration.name}". Only "interface <Component>Props" may stay internal.`,
            declaration.line,
          ),
        );
    }
    return warnings;
  }

  #scanConventionQuality(sourceFile: SourceFileInfo): QualityWarning[] {
    const suffix = CONVENTION_SUFFIXES.find((candidate) => sourceFile.file.endsWith(candidate));
    if (!suffix) return [];

    const modelName = toPascalCase(path.basename(sourceFile.file, suffix));
    return getTopLevelDeclarations(sourceFile)
      .filter((declaration) => !isAllowedConventionDeclaration(suffix, modelName, declaration))
      .map((declaration) =>
        fileWarning(
          `akan.convention${suffix.replace(".ts", "")}`,
          "convention",
          sourceFile.file,
          `${path.basename(sourceFile.file)} should not declare top-level ${declaration.kind} "${declaration.name}". Allowed declarations: ${getConventionDescription(suffix, modelName)}.`,
          declaration.line,
        ),
      );
  }

  #scanAbstractQuality({ file, content }: TextFileInfo): QualityWarning[] {
    const lineCount = AbstractDoc.lineCountOf(content);
    if (lineCount <= AbstractDoc.maxLines) return [];
    return [
      fileWarning(
        "akan.file.abstract-max-lines",
        "file",
        file,
        `Abstract has ${lineCount} lines. Keep abstracts under ${AbstractDoc.maxLines} lines and compact them periodically.`,
      ),
    ];
  }

  #scanLayoutQuality(sourceFile: SourceFileInfo): QualityWarning[] {
    const warnings: QualityWarning[] = [];
    const rootEntry = getSysRootEntry(sourceFile.file);
    if (rootEntry) {
      const { type, name, isDir } = rootEntry;
      const allowed = isDir ? rootAllowedDirs[type].has(name) : rootAllowedFiles[type].has(name);
      const kind = isDir ? "folder" : "file";
      if (!allowed)
        warnings.push(
          fileWarning(
            `akan.layout.${type}-root-${kind}`,
            "layout",
            sourceFile.file,
            `Unexpected ${type} root ${kind} "${name}". ${
              rootEntryHintOf(type, name) ?? `Keep ${type} code in conventional ${type} folders.`
            }`,
          ),
        );
    }

    const libFacetFile = getLibFacetRootFile(sourceFile.file);
    if (libFacetFile && !isAllowedLibFacetRootFile(libFacetFile))
      warnings.push(
        fileWarning(
          "akan.layout.lib-facet-file",
          "layout",
          sourceFile.file,
          `Unexpected lib facet root file "${libFacetFile}". Keep direct lib/ root files limited to generated support facets.`,
        ),
      );

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
    "SSR balance (component files, JSX elements rendered per side):",
    "",
    ...formatSsrBalance(result.ssrBalance),
    "",
    "Suggested quality rules:",
    "",
    ...result.suggestedRules.map((rule) => `  - ${rule}`),
  ];
  return sections.join("\n");
}

export function formatSsrScanResult(result: QualityScanResult) {
  const sections = [
    "Akan SSR Balance Scan",
    `workspace: ${result.workspaceRoot}`,
    `scanned files: ${result.scannedFiles}`,
    `ssr warnings: ${result.warnings.length}`,
    "",
    "Server render share (component files, JSX elements rendered per side):",
    "",
    ...formatSsrBalance(result.ssrBalance),
    "",
    "Warnings:",
    "",
    ...formatQualityWarnings(result.warnings),
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
  // UI component names (Card, Button) repeat across apps and libs by design; only the name check is relaxed.
  const nameExempt = isPageRouteFile(sourceFile.file) || isUiComponentFile(sourceFile.file);
  const add = (
    name: string,
    kind: ExportedFunctionLike["kind"],
    node: ts.Node,
    body: ts.Node | undefined,
    isEnumClass = false,
  ) =>
    declarations.push({
      name,
      kind,
      file: sourceFile.file,
      line: getLine(sourceFile.sourceFile, node),
      bodyFingerprint: getBodyFingerprint(sourceFile.sourceFile, body),
      duplicateNameExempt: nameExempt || isConventionDuplicateNameExempt(sourceFile.file, isEnumClass),
    });
  for (const statement of sourceFile.sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name && isExported(statement))
      add(statement.name.text, "function", statement, statement.body);
    if (ts.isClassDeclaration(statement) && statement.name && isExported(statement))
      add(statement.name.text, "class", statement, statement, isEnumClassStatement(sourceFile.sourceFile, statement));
    if (ts.isVariableStatement(statement) && isExported(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || !isFunctionLikeInitializer(declaration.initializer)) continue;
        add(declaration.name.text, "function-variable", declaration, declaration.initializer);
      }
    }
  }
  return declarations;
}

function sysSegments(file: string) {
  const segments = file.split("/");
  return segments[0] === "apps" || segments[0] === "libs" ? segments : null;
}

function isPageRouteFile(file: string) {
  return sysSegments(file)?.[2] === "page";
}

function isUiComponentFile(file: string) {
  return sysSegments(file)?.[2] === "ui";
}

function isConventionDuplicateNameExempt(file: string, isEnumClass: boolean) {
  if (!sysSegments(file)?.includes("lib")) return false;
  if (file.endsWith(".tsx") || /\.(document|service|signal|store)\.ts$/.test(file)) return true;
  // Model view classes may repeat across modules; enum classes must stay uniquely named.
  if (file.endsWith(".constant.ts")) return !isEnumClass;
  return false;
}

function isEnumClassStatement(sourceFile: ts.SourceFile, statement: ts.Statement) {
  if (!ts.isClassDeclaration(statement)) return false;
  const heritageClause = statement.heritageClauses?.find((clause) => clause.token === ts.SyntaxKind.ExtendsKeyword);
  const expression = heritageClause?.types[0]?.expression;
  return !!expression && expression.getText(sourceFile).startsWith("enumOf(");
}

function getExportedClassNames(sourceFile: ts.SourceFile) {
  return sourceFile.statements
    .filter((statement): statement is ts.ClassDeclaration => ts.isClassDeclaration(statement))
    .filter((statement) => isExported(statement))
    .map((statement) => statement.name?.text)
    .filter((name): name is string => !!name);
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

// `Like.WithDislike = WithDislike` makes both names components, so the local definition and its Props may stay unexported.
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
  return isPage && RESERVED_ROUTE_CONFIG_EXPORTS.has(declaration.name);
}

function isPascalCaseName(name: string) {
  return /^[A-Z]/.test(name) && !/^[A-Z0-9_]+$/.test(name);
}

function isDefaultExportStatement(statement: ts.Statement) {
  if (ts.isExportAssignment(statement)) return !statement.isExportEquals;
  if (!ts.canHaveModifiers(statement)) return false;
  return !!ts.getModifiers(statement)?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword);
}

// Bun keeps `//!` and `/*!` through minification. GritQL's `file($name, $body)` spans tokens only, so the grit rule
// misses a marker in the file's leading or trailing trivia; the raw text is read here.
function getBangCommentWarnings(sourceFile: SourceFileInfo): QualityWarning[] {
  if (!isClientReachableFile(sourceFile.file)) return [];
  // Anchored to line start or to whitespace after code, so a literal like `"https://host//!path"` is not a hit.
  return findPatternLines(sourceFile.content, /(?:^|[^\s/][ \t]+)\/[*/]!/).map((line) =>
    fileWarning(
      "akan.file.bang-comment-in-client",
      "file",
      sourceFile.file,
      "A `//!` or `/*!` marker survives minification and ships to the browser.",
      line,
    ),
  );
}

// Mirrors the path scope of `no-bang-comment-in-client.grit` in `biome.base.json`.
function isClientReachableFile(file: string) {
  if (/\.(test|spec)\.tsx?$/.test(file)) return false;
  if (/\.(constant|store)\.ts$/.test(file)) return true;
  if (/\.(Template|Unit|Util|View|Zone)\.tsx$/.test(file)) return true;
  const segments = file.split("/");
  if (segments.includes("ui") || segments.includes("webkit")) return /\.tsx?$/.test(file);
  if (segments.includes("common")) return file.endsWith(".ts");
  return segments.includes("page") && file.endsWith(".tsx");
}

function getPlaceholderExportWarnings(sourceFile: SourceFileInfo): QualityWarning[] {
  if (!sourceFile.file.endsWith("/index.ts") && !sourceFile.file.endsWith("/index.tsx")) return [];
  return getTopLevelDeclarations(sourceFile)
    .filter((declaration) => declaration.exported && PLACEHOLDER_EXPORT_NAMES.has(declaration.name))
    .map((declaration) =>
      fileWarning(
        "akan.file.placeholder-export",
        "file",
        sourceFile.file,
        `Generated or barrel index file should not export placeholder "${declaration.name}".`,
        declaration.line,
      ),
    );
}

function getDictionaryTextWarnings(sourceFile: SourceFileInfo): QualityWarning[] {
  if (!sourceFile.file.endsWith(".dictionary.ts")) return [];
  const stalePatterns = [{ pattern: /\b[A-Z][A-Za-z0-9]* description\b/, label: "scaffold description text" }];
  return stalePatterns.flatMap(({ pattern, label }) =>
    findPatternLines(sourceFile.content, pattern).map((line) =>
      fileWarning(
        "akan.file.dictionary-stale-text",
        "file",
        sourceFile.file,
        `Dictionary text appears to contain ${label}.`,
        line,
      ),
    ),
  );
}

function getGlobalMutationWarnings(sourceFile: SourceFileInfo): QualityWarning[] {
  const warnings: QualityWarning[] = [];
  for (const statement of sourceFile.sourceFile.statements) {
    const warn = (rule: string, message: string) =>
      warnings.push(fileWarning(rule, "file", sourceFile.file, message, getLine(sourceFile.sourceFile, statement)));
    if (ts.isModuleDeclaration(statement) && statement.name.getText(sourceFile.sourceFile) === "global")
      warn("akan.file.global-declaration", "Global declarations require an explicit low-level integration allowlist.");
    if (ts.isInterfaceDeclaration(statement) && statement.name.text === "Window")
      warn(
        "akan.file.window-augmentation",
        "Window augmentation should be isolated to approved browser integration files.",
      );
    if (
      ts.isExpressionStatement(statement) &&
      statement.expression.getText(sourceFile.sourceFile).includes(".prototype.")
    )
      warn(
        "akan.file.prototype-mutation",
        "Prototype mutation should be avoided or isolated to approved low-level integration files.",
      );
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
  const declared = (name: string, kind: string, at = line) => ({
    name,
    kind,
    line: at,
    exported: isExported(statement),
    node: statement,
  });
  if (ts.isClassDeclaration(statement) && statement.name) return [declared(statement.name.text, "class")];
  if (ts.isFunctionDeclaration(statement) && statement.name) return [declared(statement.name.text, "function")];
  if (ts.isInterfaceDeclaration(statement)) return [declared(statement.name.text, "interface")];
  if (ts.isTypeAliasDeclaration(statement)) return [declared(statement.name.text, "type")];
  if (ts.isEnumDeclaration(statement)) return [declared(statement.name.text, "enum")];
  if (ts.isVariableStatement(statement))
    return statement.declarationList.declarations
      .filter((declaration) => ts.isIdentifier(declaration.name))
      .map((declaration) =>
        declared((declaration.name as ts.Identifier).text, "variable", getLine(sourceFile, declaration)),
      );
  if (ts.isExportDeclaration(statement))
    return [{ name: "export declaration", kind: "export", line, exported: true, node: statement }];
  return [];
}

function getConventionClassNames(suffix: (typeof CONVENTION_SUFFIXES)[number], model: string) {
  if (suffix === ".constant.ts") return [`${model}Input`, `${model}Object`, model, `Light${model}`, `${model}Insight`];
  if (suffix === ".document.ts") return [`${model}Filter`, model, `${model}Model`];
  if (suffix === ".service.ts") return [`${model}Service`];
  if (suffix === ".signal.ts") return [`${model}Internal`, `${model}Slice`, `${model}Endpoint`];
  if (suffix === ".store.ts") return [`${model}Store`];
  return [];
}

function isAllowedConventionDeclaration(
  suffix: (typeof CONVENTION_SUFFIXES)[number],
  modelName: string,
  declaration: TopLevelDeclaration,
) {
  if (suffix === ".dictionary.ts") return isExportedConst(declaration) && declaration.name === "dictionary";
  if (declaration.kind !== "class") return false;
  if (getConventionClassNames(suffix, modelName).includes(declaration.name)) return true;
  return suffix === ".constant.ts" && isEnumClassStatement(declaration.node.getSourceFile(), declaration.node);
}

function getConventionDescription(suffix: (typeof CONVENTION_SUFFIXES)[number], modelName: string) {
  if (suffix === ".dictionary.ts") return "export const dictionary";
  const names = [
    ...getConventionClassNames(suffix, modelName),
    ...(suffix === ".constant.ts" ? ["enumOf classes"] : []),
  ];
  return names.length > 1 ? `${names.slice(0, -1).join(", ")}, or ${names.at(-1)}` : names[0];
}

const sysRootTypes = { apps: "app", libs: "lib" } as const;

function getSysRootEntry(file: string) {
  const segments = file.split("/");
  const root = segments[0];
  const name = segments[2];
  if (!root || !name || segments.length < 3) return null;
  const type = sysRootTypes[root as keyof typeof sysRootTypes];
  if (!type) return null;
  return { type, name, isDir: segments.length > 3 };
}

function getLibFacetRootFile(file: string) {
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
  return fileWarning(
    "akan.layout.module-ui-file",
    "layout",
    file,
    `Unexpected ${kind} module UI filename "${fileName}". Expected one of: ${[...allowedFileNames].join(", ")}.`,
  );
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
  if (moduleName.startsWith("__")) return { moduleName, fileName, kind: "scalar" as const };
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
  return !!(ts.getCombinedModifierFlags(node as ts.Declaration) & ts.ModifierFlags.Export);
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
