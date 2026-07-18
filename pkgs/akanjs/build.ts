import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { $ } from "bun";
import ts from "typescript";

const PACKAGE_DIR = import.meta.dir;
const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT ?? process.cwd();
const OUT_DIR = process.env.DIST_DIR ?? `${WORKSPACE_ROOT}/dist/pkgs/akanjs`;
const TYPES_OUT_DIR = `${OUT_DIR}/types`;
const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"];
const TEST_FILE_PATTERNS = [
  "**/*.test.ts",
  "**/*.test.tsx",
  "**/*.test.js",
  "**/*.test.jsx",
  "**/*.spec.ts",
  "**/*.spec.tsx",
  "**/*.spec.js",
  "**/*.spec.jsx",
  "**/*.fixture.ts",
  "**/*.fixture.tsx",
];

const removeTestFiles = async () => {
  for (const pattern of TEST_FILE_PATTERNS) {
    const glob = new Bun.Glob(pattern);
    for await (const file of glob.scan({ cwd: OUT_DIR, onlyFiles: true })) {
      await rm(`${OUT_DIR}/${file}`, { force: true });
    }
  }
};
const COMMENT_FILE_PATTERNS = ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"];
const testFilePattern = /\.(?:test|spec|fixture)\.[cm]?[tj]sx?$/;

const isJSDocComment = (comment: string) => comment.startsWith("/**") && !comment.startsWith("/***/");

const stripStandaloneNonJsdocComments = (source: string) => {
  const lines = source.split(/(\r?\n)/);
  let result = "";
  let inBlockComment = false;

  for (let idx = 0; idx < lines.length; idx += 2) {
    const line = lines[idx] ?? "";
    const newline = lines[idx + 1] ?? "";
    const trimmed = line.trimStart();

    if (inBlockComment) {
      if (trimmed.includes("*/")) inBlockComment = false;
      continue;
    }

    if (trimmed.startsWith("//")) {
      continue;
    }

    if (trimmed.startsWith("/*") && !trimmed.startsWith("/**")) {
      if (!trimmed.includes("*/")) inBlockComment = true;
      continue;
    }

    result += line + newline;
  }

  return result;
};

const collapseExcessBlankLines = (source: string) => source.replace(/(?:[ \t]*\r?\n){3,}/g, "\n\n");

const stripNonJsdocCommentsFromSource = (source: string) => {
  const sourceFile = ts.createSourceFile("strip-comments.ts", source, ts.ScriptTarget.Latest, true);
  const removals = new Map<number, number>();
  const addRanges = (ranges: ts.CommentRange[] | undefined) => {
    for (const range of ranges ?? []) {
      const comment = source.slice(range.pos, range.end);
      if (!isJSDocComment(comment)) removals.set(range.pos, range.end);
    }
  };

  const visit = (node: ts.Node) => {
    addRanges(ts.getLeadingCommentRanges(source, node.pos));
    addRanges(ts.getTrailingCommentRanges(source, node.end));
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  const sortedRemovals = [...removals.entries()].sort(([left], [right]) => left - right);
  if (sortedRemovals.length === 0) return collapseExcessBlankLines(stripStandaloneNonJsdocComments(source));

  let result = "";
  let cursor = 0;
  for (const [start, end] of sortedRemovals) {
    result += source.slice(cursor, start);
    cursor = end;
  }
  result += source.slice(cursor);

  return collapseExcessBlankLines(stripStandaloneNonJsdocComments(result));
};

const stripNonJsdocComments = async (targetDir: string) => {
  for (const pattern of COMMENT_FILE_PATTERNS) {
    const glob = new Bun.Glob(pattern);
    for await (const file of glob.scan({ cwd: targetDir, onlyFiles: true })) {
      const filePath = `${targetDir}/${file}`;
      const source = await readFile(filePath, "utf-8");
      const stripped = stripNonJsdocCommentsFromSource(source);
      if (stripped !== source) await writeFile(filePath, stripped);
    }
  }
};

const stripDeclarationAssetImports = async (targetDir: string) => {
  const glob = new Bun.Glob("**/*.d.ts");
  for await (const file of glob.scan({ cwd: targetDir, onlyFiles: true })) {
    const filePath = `${targetDir}/${file}`;
    const source = await readFile(filePath, "utf-8");
    const stripped = source.replace(/^import\s+["'][^"']+\.(?:css|scss|sass)["'];\r?\n/gm, "");
    if (stripped !== source) await writeFile(filePath, stripped);
  }
};

const resolveDeclarationSpecifier = async (fromFilePath: string, specifier: string) => {
  if (!specifier.startsWith("./") && !specifier.startsWith("../")) return specifier;
  if (path.extname(specifier)) return specifier;

  const basePath = path.resolve(path.dirname(fromFilePath), specifier);
  if (await Bun.file(`${basePath}.d.ts`).exists()) return `${specifier}.d.ts`;
  if (await Bun.file(path.join(basePath, "index.d.ts")).exists()) return `${specifier}/index.d.ts`;
  return specifier;
};

const rewriteDeclarationRelativeSpecifiers = async (targetDir: string) => {
  const glob = new Bun.Glob("**/*.d.ts");
  const specifierPattern = /(from\s+|import\()(["'])(\.{1,2}\/[^"']+?)\2/g;
  for await (const file of glob.scan({ cwd: targetDir, onlyFiles: true })) {
    const filePath = `${targetDir}/${file}`;
    const source = await readFile(filePath, "utf-8");
    let rewritten = "";
    let cursor = 0;

    for (const match of source.matchAll(specifierPattern)) {
      const index = match.index ?? 0;
      const [fullMatch, prefix, quote, specifier] = match;
      rewritten += source.slice(cursor, index);
      rewritten += `${prefix}${quote}${await resolveDeclarationSpecifier(filePath, specifier)}${quote}`;
      cursor = index + fullMatch.length;
    }

    rewritten += source.slice(cursor);
    if (rewritten !== source) await writeFile(filePath, rewritten);
  }
};

const isSourceFile = (filePath: string) => SOURCE_EXTENSIONS.some((ext) => filePath.endsWith(ext));

const isEmittableSourceFile = (filePath: string) => {
  const relativePath = path.relative(PACKAGE_DIR, filePath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) return false;
  if (relativePath === "build.ts") return false;
  if (relativePath.startsWith(`build${path.sep}`)) return false;
  return isSourceFile(filePath) && !testFilePattern.test(filePath);
};

const formatDiagnosticMessages = (diagnostics: ts.Diagnostic[]) =>
  ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: () => WORKSPACE_ROOT,
    getNewLine: () => ts.sys.newLine,
  });

const collectSourceFiles = async () => {
  const files: string[] = [];
  const glob = new Bun.Glob("**/*.{ts,tsx,js,jsx}");
  for await (const file of glob.scan({ cwd: PACKAGE_DIR, onlyFiles: true })) {
    const filePath = path.join(PACKAGE_DIR, file);
    if (isEmittableSourceFile(filePath)) files.push(filePath);
  }
  return files;
};

const emitDeclarations = async () => {
  const configPath = path.join(PACKAGE_DIR, "tsconfig.json");
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  if (configFile.error) throw new Error(formatDiagnosticMessages([configFile.error]));

  const parsedConfig = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    PACKAGE_DIR,
    {
      declaration: true,
      declarationMap: false,
      emitDeclarationOnly: true,
      noEmit: false,
      noEmitOnError: false,
      outDir: TYPES_OUT_DIR,
      rootDir: PACKAGE_DIR,
      sourceMap: false,
      tsBuildInfoFile: path.join(TYPES_OUT_DIR, "tsconfig.tsbuildinfo"),
    },
    configPath,
  );
  if (parsedConfig.errors.length > 0) throw new Error(formatDiagnosticMessages(parsedConfig.errors));

  const fileNames = await collectSourceFiles();
  const program = ts.createProgram({ rootNames: fileNames, options: parsedConfig.options });
  const emitResult = program.emit();
  const diagnostics = ts.getPreEmitDiagnostics(program).concat(emitResult.diagnostics);
  const errors = diagnostics.filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
  if (errors.length > 0) {
    const formatted = formatDiagnosticMessages(errors);
    if (process.env.AKAN_BUILD_DECLARATION_DIAGNOSTICS === "error") throw new Error(formatted);
    if (process.env.AKAN_BUILD_DECLARATION_DIAGNOSTICS === "1") console.warn(formatted);
  }
};

const copyExistingDeclarationFiles = async () => {
  const glob = new Bun.Glob("**/*.d.ts");
  for await (const file of glob.scan({ cwd: PACKAGE_DIR, onlyFiles: true })) {
    const sourcePath = path.join(PACKAGE_DIR, file);
    const targetPath = path.join(TYPES_OUT_DIR, file);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, await readFile(sourcePath, "utf-8"));
  }
};

const writeDirectoryDeclarationFacades = async (targetDir: string) => {
  const glob = new Bun.Glob("**/index.d.ts");
  for await (const file of glob.scan({ cwd: targetDir, onlyFiles: true })) {
    const dirname = path.dirname(file);
    if (dirname === ".") continue;

    const facadePath = path.join(targetDir, `${dirname}.d.ts`);
    const target = `./${path.basename(dirname)}/index`;
    await writeFile(facadePath, `export * from ${JSON.stringify(target)};\n`);
  }
};

const toDeclarationPath = (target: string) => {
  const toTypesPath = (declarationPath: string) => `./types/${declarationPath.replace(/^\.\//, "")}`;
  for (const extension of [".tsx", ".ts", ".jsx", ".js"]) {
    if (target.endsWith(extension)) return toTypesPath(`${target.slice(0, -extension.length)}.d.ts`);
  }
  if (target.endsWith("/*")) return toTypesPath(`${target}.d.ts`);
  return target;
};

const toTypesExport = (target: string) => ({
  types: toDeclarationPath(target),
  import: target,
  default: target,
});

const addExtensionWildcardTypes = (exportsMap: Record<string, unknown>, key: string, target: string) => {
  if (!key.endsWith("/*") || !target.endsWith("/*")) return;
  const keyPrefix = key.slice(0, -1);
  const targetPrefix = target.slice(0, -1);
  exportsMap[`${keyPrefix}*.ts`] = toTypesExport(`${targetPrefix}*.ts`);
  exportsMap[`${keyPrefix}*.tsx`] = toTypesExport(`${targetPrefix}*.tsx`);
};

const rewriteExportsTypes = (packageJson: { exports?: Record<string, unknown> }) => {
  const exportsMap = packageJson.exports;
  if (!exportsMap) return;
  const rewrittenExports: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(exportsMap)) {
    if (typeof value === "string") {
      if (isSourceFile(value) || value.endsWith("/*")) {
        rewrittenExports[key] = toTypesExport(value);
        addExtensionWildcardTypes(rewrittenExports, key, value);
      } else {
        rewrittenExports[key] = value;
      }
      continue;
    }

    if (value && typeof value === "object" && "types" in value) {
      const exportValue = value as Record<string, unknown>;
      rewrittenExports[key] = {
        types: typeof exportValue.types === "string" ? toDeclarationPath(exportValue.types) : exportValue.types,
        ...Object.fromEntries(Object.entries(exportValue).filter(([condition]) => condition !== "types")),
      };
      continue;
    }

    rewrittenExports[key] = value;
  }

  packageJson.exports = rewrittenExports;
};

const build = async () => {
  try {
    await $`rm -rf ${OUT_DIR}`;
    await $`mkdir -p ${OUT_DIR}`;
    await $`cp -R ${PACKAGE_DIR}/. ${OUT_DIR}`;
    await $`rm -rf ${OUT_DIR}/build.ts`;
    await rm(`${OUT_DIR}/build`, { recursive: true, force: true });
    await rm(`${OUT_DIR}/tsconfig.json`, { force: true });
    await removeTestFiles();

    await emitDeclarations();
    await copyExistingDeclarationFiles();
    await writeDirectoryDeclarationFacades(TYPES_OUT_DIR);
    await stripDeclarationAssetImports(TYPES_OUT_DIR);
    await rewriteDeclarationRelativeSpecifiers(TYPES_OUT_DIR);
    await stripNonJsdocComments(OUT_DIR);

    const packageJson = await Bun.file(`${OUT_DIR}/package.json`).json();
    packageJson.main = "./index.ts";
    delete packageJson.bin;
    rewriteExportsTypes(packageJson);
    await Bun.write(`${OUT_DIR}/package.json`, `${JSON.stringify(packageJson, null, 2)}\n`);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

void build();
