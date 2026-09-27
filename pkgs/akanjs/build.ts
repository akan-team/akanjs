import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { $ } from "bun";
import ts from "typescript";

const PACKAGE_DIR = import.meta.dir;
const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT ?? process.cwd();
const OUT_DIR = process.env.DIST_DIR ?? `${WORKSPACE_ROOT}/dist/pkgs/akanjs`;
const TYPES_OUT_DIR = `${OUT_DIR}/types`;
interface EmbeddedPackage {
  name: string;
  /** Top-level entries the copy leaves out: workspace and tooling files nothing reads at runtime. */
  nonSourceEntries: string[];
  /** Every `test/` folder is left out, not only a top-level one. */
  nestedTests: boolean;
  /** `name/<subpath>` resolves through the package's `exports`, whose subpaths do not follow its folders. */
  viaExports: boolean;
}

//* Not published, so the dist embeds their source instead of naming dependencies no registry can resolve.
const EMBEDDED_PACKAGES = (
  [
    {
      name: "use-agentic",
      nonSourceEntries: ["bunfig.toml", "package.json", "test", "tsconfig.json"],
      nestedTests: false,
      viaExports: false,
    },
    {
      name: "@akanjs/native",
      nonSourceEntries: ["bunfig.toml", "docs", "examples", "package.json", "scripts", "tsconfig.json"],
      nestedTests: true,
      viaExports: true,
    },
  ] satisfies EmbeddedPackage[]
).map((embedded) => ({
  ...embedded,
  dir: path.resolve(PACKAGE_DIR, `../${embedded.name}`),
  outDir: `${OUT_DIR}/vendor/${embedded.name}`,
  typesOutDir: `${TYPES_OUT_DIR}/vendor/${embedded.name}`,
}));
type Embedded = (typeof EMBEDDED_PACKAGES)[number];

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
const specifierPatternOf = (name: string) =>
  new RegExp(
    `(\\bfrom\\s*|\\brequire\\s*\\(\\s*|\\bimport\\s*\\(\\s*|\\bimport\\s+)(["'])${escapeRegExp(name)}((?:/[^"']*)?)\\2`,
    "g",
  );
const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"];
const TEST_FILE_PATTERNS = ["**/*.{test,spec}.{ts,tsx,js,jsx}", "**/*.fixture.{ts,tsx}", "**/*.instance.ts"];

const removeTestFiles = async () => {
  for (const pattern of TEST_FILE_PATTERNS)
    for await (const file of new Bun.Glob(pattern).scan({ cwd: OUT_DIR, onlyFiles: true }))
      await rm(`${OUT_DIR}/${file}`, { force: true });
};
// `*.instance.ts` is a process a conformance test spawns, and it imports that test's fixture.
const testFilePattern = /\.(?:test|spec|fixture|instance)\.[cm]?[tj]sx?$/;

const rewriteFiles = async (
  targetDir: string,
  pattern: string,
  rewrite: (source: string, filePath: string) => string | Promise<string>,
) => {
  for await (const file of new Bun.Glob(pattern).scan({ cwd: targetDir, onlyFiles: true })) {
    const filePath = `${targetDir}/${file}`;
    const source = await readFile(filePath, "utf-8");
    const rewritten = await rewrite(source, filePath);
    if (rewritten !== source) await writeFile(filePath, rewritten);
  }
};

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

    if (trimmed.startsWith("//")) continue;

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

  let result = "";
  let cursor = 0;
  for (const [start, end] of [...removals.entries()].sort(([left], [right]) => left - right)) {
    result += source.slice(cursor, start);
    cursor = end;
  }
  result += source.slice(cursor);

  return collapseExcessBlankLines(stripStandaloneNonJsdocComments(result));
};

const stripNonJsdocComments = (targetDir: string) =>
  rewriteFiles(targetDir, "**/*.{ts,tsx,js,jsx}", stripNonJsdocCommentsFromSource);

const stripDeclarationAssetImports = (targetDir: string) =>
  rewriteFiles(targetDir, "**/*.d.ts", (source) =>
    source.replace(/^import\s+["'][^"']+\.(?:css|scss|sass)["'];\r?\n/gm, ""),
  );

const resolveDeclarationSpecifier = async (fromFilePath: string, specifier: string) => {
  if (!specifier.startsWith("./") && !specifier.startsWith("../")) return specifier;
  if (path.extname(specifier)) return specifier;

  const basePath = path.resolve(path.dirname(fromFilePath), specifier);
  if (await Bun.file(`${basePath}.d.ts`).exists()) return `${specifier}.d.ts`;
  if (await Bun.file(path.join(basePath, "index.d.ts")).exists()) return `${specifier}/index.d.ts`;
  return specifier;
};

const rewriteDeclarationRelativeSpecifiers = (targetDir: string) =>
  rewriteFiles(targetDir, "**/*.d.ts", async (source, filePath) => {
    let rewritten = "";
    let cursor = 0;
    for (const match of source.matchAll(/(from\s+|import\()(["'])(\.{1,2}\/[^"']+?)\2/g)) {
      const index = match.index ?? 0;
      const [fullMatch, prefix, quote, specifier] = match;
      rewritten += source.slice(cursor, index);
      rewritten += `${prefix}${quote}${await resolveDeclarationSpecifier(filePath, specifier)}${quote}`;
      cursor = index + fullMatch.length;
    }
    return rewritten + source.slice(cursor);
  });

const embedPackageSource = async (embedded: Embedded) => {
  await $`mkdir -p ${embedded.outDir}`;
  await $`cp -R ${embedded.dir}/. ${embedded.outDir}`;
  for (const entry of ["node_modules", ...embedded.nonSourceEntries])
    await rm(`${embedded.outDir}/${entry}`, { recursive: true, force: true });
  if (!embedded.nestedTests) return;
  const testDirs = await Array.fromAsync(new Bun.Glob("**/test").scan({ cwd: embedded.outDir, onlyFiles: false }));
  for (const testDir of testDirs) await rm(`${embedded.outDir}/${testDir}`, { recursive: true, force: true });
};

const exportTargetOf = (exportsMap: Record<string, unknown>, subpath: string) => {
  const key = `.${subpath}`;
  const direct = exportsMap[key];
  if (typeof direct === "string") return direct;
  for (const [pattern, target] of Object.entries(exportsMap)) {
    const [prefix = "", suffix = ""] = pattern.split("*");
    if (!pattern.includes("*") || typeof target !== "string") continue;
    if (key.length > prefix.length + suffix.length && key.startsWith(prefix) && key.endsWith(suffix))
      return target.replace("*", key.slice(prefix.length, key.length - suffix.length));
  }
  return null;
};

//* A declaration names the target without its extension, so the relative-specifier pass finds its `.d.ts`.
const rewriteEmbeddedSpecifiers = async (targetDir: string, embedded: Embedded, embeddedDir: string) => {
  const forTypes = embeddedDir === embedded.typesOutDir;
  const exportsMap = embedded.viaExports
    ? (((await Bun.file(`${embedded.dir}/package.json`).json()) as { exports?: Record<string, unknown> }).exports ?? {})
    : {};
  const toSubpath = (subpath: string) => {
    if (!embedded.viaExports) return subpath;
    const target = exportTargetOf(exportsMap, subpath);
    if (!target) throw new Error(`${embedded.name}${subpath} is not exported by ${embedded.name}`);
    const relative = target.replace(/^\.\//, "/");
    return forTypes ? relative.replace(/\.tsx?$/, "") : relative;
  };
  const pattern = specifierPatternOf(embedded.name);
  await rewriteFiles(targetDir, "**/*.{ts,tsx,js,jsx}", (source, filePath) => {
    if (filePath.startsWith(`${embeddedDir}/`)) return source;
    const relativeDir = path.relative(path.dirname(filePath), embeddedDir);
    const embeddedSpecifier = relativeDir.startsWith(".") ? relativeDir : `./${relativeDir}`;
    return source.replace(
      pattern,
      (_match, prefix: string, quote: string, subpath: string) =>
        `${prefix}${quote}${embeddedSpecifier}${toSubpath(subpath)}${quote}`,
    );
  });
};

const isSourceFile = (filePath: string) => SOURCE_EXTENSIONS.some((ext) => filePath.endsWith(ext));

const isEmittableSourceFile = (
  packageDir: string,
  filePath: string,
  excludedEntries: string[],
  nestedTests: boolean,
) => {
  const relativePath = path.relative(packageDir, filePath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) return false;
  const segments = relativePath.split(path.sep);
  const [topLevelEntry] = segments;
  if (["build.ts", "build", "node_modules", ...excludedEntries].includes(topLevelEntry ?? "")) return false;
  if (nestedTests && segments.includes("test")) return false;
  return isSourceFile(filePath) && !testFilePattern.test(filePath);
};

const formatDiagnosticMessages = (diagnostics: ts.Diagnostic[]) =>
  ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: () => WORKSPACE_ROOT,
    getNewLine: () => ts.sys.newLine,
  });

const collectSourceFiles = async (packageDir: string, excludedEntries: string[] = [], nestedTests = false) => {
  const files: string[] = [];
  for await (const file of new Bun.Glob("**/*.{ts,tsx,js,jsx}").scan({ cwd: packageDir, onlyFiles: true })) {
    const filePath = path.join(packageDir, file);
    if (isEmittableSourceFile(packageDir, filePath, excludedEntries, nestedTests)) files.push(filePath);
  }
  return files;
};

const emitDeclarations = async (
  packageDir: string,
  typesOutDir: string,
  excludedEntries: string[] = [],
  nestedTests = false,
) => {
  const configPath = path.join(packageDir, "tsconfig.json");
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  if (configFile.error) throw new Error(formatDiagnosticMessages([configFile.error]));

  const parsedConfig = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    packageDir,
    {
      declaration: true,
      declarationMap: false,
      emitDeclarationOnly: true,
      noEmit: false,
      noEmitOnError: false,
      outDir: typesOutDir,
      rootDir: packageDir,
      sourceMap: false,
      tsBuildInfoFile: path.join(typesOutDir, "tsconfig.tsbuildinfo"),
    },
    configPath,
  );
  if (parsedConfig.errors.length > 0) throw new Error(formatDiagnosticMessages(parsedConfig.errors));

  const fileNames = await collectSourceFiles(packageDir, excludedEntries, nestedTests);
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
  for await (const file of new Bun.Glob("**/*.d.ts").scan({ cwd: PACKAGE_DIR, onlyFiles: true })) {
    const sourcePath = path.join(PACKAGE_DIR, file);
    const targetPath = path.join(TYPES_OUT_DIR, file);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, await readFile(sourcePath, "utf-8"));
  }
};

const writeDirectoryDeclarationFacades = async (targetDir: string) => {
  for await (const file of new Bun.Glob("**/index.d.ts").scan({ cwd: targetDir, onlyFiles: true })) {
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
    if (typeof value === "string" && (isSourceFile(value) || value.endsWith("/*"))) {
      rewrittenExports[key] = toTypesExport(value);
      addExtensionWildcardTypes(rewrittenExports, key, value);
    } else if (value && typeof value === "object" && "types" in value) {
      const exportValue = value as Record<string, unknown>;
      rewrittenExports[key] = {
        types: typeof exportValue.types === "string" ? toDeclarationPath(exportValue.types) : exportValue.types,
        ...Object.fromEntries(Object.entries(exportValue).filter(([condition]) => condition !== "types")),
      };
    } else rewrittenExports[key] = value;
  }

  packageJson.exports = rewrittenExports;
};

const build = async () => {
  try {
    await $`rm -rf ${OUT_DIR}`;
    await $`mkdir -p ${OUT_DIR}`;
    await $`cp -R ${PACKAGE_DIR}/. ${OUT_DIR}`;
    //* `local/` is where test runs leave their databases and logs; gitignored, but `cp -R` would ship it.
    for (const entry of ["build.ts", "build", "tsconfig.json", "local"])
      await rm(`${OUT_DIR}/${entry}`, { recursive: true, force: true });
    for (const embedded of EMBEDDED_PACKAGES) await embedPackageSource(embedded);
    await removeTestFiles();
    for (const embedded of EMBEDDED_PACKAGES) await rewriteEmbeddedSpecifiers(OUT_DIR, embedded, embedded.outDir);

    await emitDeclarations(PACKAGE_DIR, TYPES_OUT_DIR);
    for (const embedded of EMBEDDED_PACKAGES)
      await emitDeclarations(embedded.dir, embedded.typesOutDir, embedded.nonSourceEntries, embedded.nestedTests);
    await copyExistingDeclarationFiles();
    await writeDirectoryDeclarationFacades(TYPES_OUT_DIR);
    await stripDeclarationAssetImports(TYPES_OUT_DIR);
    for (const embedded of EMBEDDED_PACKAGES)
      await rewriteEmbeddedSpecifiers(TYPES_OUT_DIR, embedded, embedded.typesOutDir);
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
