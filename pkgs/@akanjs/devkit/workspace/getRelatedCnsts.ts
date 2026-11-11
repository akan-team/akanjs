import { readFileSync, realpathSync } from "node:fs";
import { dirname } from "node:path";
import ora from "ora";
import * as ts from "typescript";

const tsTranspiler = new Bun.Transpiler({ loader: "ts" });
const tsxTranspiler = new Bun.Transpiler({ loader: "tsx" });

const getTranspiler = (filePath: string) => (filePath.endsWith(".tsx") ? tsxTranspiler : tsTranspiler);

const scanModuleSpecifiers = (source: string, filePath: string, includeExports: boolean) => {
  const scannedImports = getTranspiler(filePath)
    .scanImports(source)
    .map((imp) => imp.path)
    .filter(Boolean);

  if (includeExports) {
    const specifiers = new Set(scannedImports);
    const typeOnlyModuleRegex = /\b(?:import|export)\s+type\s+[\s\S]*?\s+from\s*["']([^"']+)["']/g;
    for (const match of source.matchAll(typeOnlyModuleRegex)) {
      const importPath = match[1];
      if (importPath) specifiers.add(importPath);
    }
    const exportFromRegex = /\bexport\s+(?:type\s+)?(?:\*|{[\s\S]*?})\s+from\s*["']([^"']+)["']/g;
    for (const match of source.matchAll(exportFromRegex)) {
      const importPath = match[1];
      if (importPath) specifiers.add(importPath);
    }
    return specifiers;
  }

  const importSpecifiers = new Set<string>();
  const importDeclarationRegex = /\bimport\s+(?:type\s+)?(?:["']([^"']+)["']|[\s\S]*?\s+from\s*["']([^"']+)["'])/g;
  for (const match of source.matchAll(importDeclarationRegex)) {
    const importPath = match[1] ?? match[2];
    if (importPath && (scannedImports.includes(importPath) || match[0].startsWith("import type"))) {
      importSpecifiers.add(importPath);
    }
  }

  return importSpecifiers;
};

export const parseTsConfig = (tsConfigPath: string = "./tsconfig.json") => {
  const configFile = ts.readConfigFile(tsConfigPath, (path) => {
    return ts.sys.readFile(path);
  });

  return ts.parseJsonConfigFileContent(configFile.config, ts.sys, dirname(realpathSync(tsConfigPath)));
};

const collectFiles = (constantFilePath: string, parsedConfig: ts.ParsedCommandLine, includeExports: boolean) => {
  const allFilesToAnalyze = new Set<string>([constantFilePath]);
  const analyzedFiles = new Set<string>();
  const spinner = ora(includeExports ? "Collecting files from exports..." : "Collecting related files...");
  spinner.start();
  const collect = (filePath: string) => {
    if (analyzedFiles.has(filePath)) return;
    analyzedFiles.add(filePath);
    const source = readFileSync(filePath, "utf-8");
    for (const importPath of scanModuleSpecifiers(source, filePath, includeExports)) {
      if (!importPath.startsWith(".")) continue;
      const resolved = ts.resolveModuleName(importPath, filePath, parsedConfig.options, ts.sys).resolvedModule
        ?.resolvedFileName;
      if (resolved && !allFilesToAnalyze.has(resolved)) {
        allFilesToAnalyze.add(resolved);
        collect(resolved);
      }
    }
  };
  collect(constantFilePath);
  spinner.succeed(`Found ${allFilesToAnalyze.size} related files${includeExports ? " from exports" : ""}.`);
  return { allFilesToAnalyze, analyzedFiles };
};

export const collectImportedFiles = (constantFilePath: string, parsedConfig: ts.ParsedCommandLine) =>
  collectFiles(constantFilePath, parsedConfig, false);

export const collectExportedFiles = (constantFilePath: string, parsedConfig: ts.ParsedCommandLine) =>
  collectFiles(constantFilePath, parsedConfig, true);

export const createTsProgram = (filePaths: Set<string>, options: ts.CompilerOptions) => {
  const spinner = ora("Creating TypeScript program for all files...");
  spinner.start();

  const program = ts.createProgram(Array.from(filePaths), options);
  const checker = program.getTypeChecker();

  spinner.succeed("TypeScript program created.");

  return {
    program,
    checker,
  };
};

export const createSymbolCache = (checker: ts.TypeChecker) => {
  const symbolCache = new Map<string, ts.Symbol | undefined>();

  return (node: ts.Node): ts.Symbol | undefined => {
    const cacheKey = `${node.getSourceFile().fileName}:${node.pos}:${node.end}`;

    if (!symbolCache.has(cacheKey)) {
      symbolCache.set(cacheKey, checker.getSymbolAtLocation(node));
    }

    return symbolCache.get(cacheKey);
  };
};

export const analyzeProperties = (filesToAnalyze: Set<string>, program: ts.Program, checker: ts.TypeChecker) => {
  const propertyMap = new Map<
    string,
    {
      filePath: string;
      isLibModule: boolean;
      isImport: boolean;
      isScalar: boolean;
      source: string;
      libName?: string;
    }
  >();

  const analyzedFiles = new Set<string>();
  const sourceLineCache = new Map<string, string[]>();
  const getCachedSymbol = createSymbolCache(checker);

  const spinner = ora("Analyzing property relationships...");
  spinner.start();

  function analyzeFileProperties(filePath: string) {
    if (analyzedFiles.has(filePath)) return;
    analyzedFiles.add(filePath);

    const source = program.getSourceFile(filePath);
    if (!source) return;

    if (!sourceLineCache.has(filePath)) {
      sourceLineCache.set(filePath, source.getFullText().split("\n"));
    }
    const sourceLines = sourceLineCache.get(filePath);

    function visit(node: ts.Node) {
      if (!source) return;

      if (ts.isPropertyAccessExpression(node)) {
        const left = node.expression;
        const right = node.name;
        const { line } = ts.getLineAndCharacterOfPosition(source, node.getStart());

        if (
          ts.isIdentifier(left) &&
          sourceLines &&
          sourceLines.length > line &&
          sourceLines[line] &&
          // ! Need to update
          (sourceLines[line]?.includes(`@Field.Prop(() => ${left.text}.${right.text}`) ||
            sourceLines[line].includes(`base.Filter(${left.text}.${right.text},`))
        ) {
          const symbol = getCachedSymbol(right);

          if (symbol?.declarations && symbol.declarations.length > 0) {
            const key = symbol.declarations[0]?.getSourceFile().fileName.split("/").pop()?.split(".")[0] ?? "";
            const property = propertyMap.get(key);
            const isScalar = symbol.declarations[0]?.getSourceFile().fileName.includes("_") ?? false;
            const symbolFilePath = symbol.declarations[0]
              ?.getSourceFile()
              .fileName.replace(`${ts.sys.getCurrentDirectory()}/`, "");
            if (!symbolFilePath) throw new Error(`No symbol file path found for ${left.text}.${right.text}`);

            if (property) {
              propertyMap.set(`${left.text}.${right.text}`, {
                filePath: symbolFilePath,
                isLibModule: true,
                isImport: false,
                libName: left.text,
                source: readFileSync(symbolFilePath, "utf-8"),
                isScalar,
              });
            } else {
              propertyMap.set(key, {
                filePath: symbolFilePath,
                isLibModule: true,
                isImport: false,
                libName: left.text,
                isScalar,
                source: readFileSync(symbolFilePath, "utf-8"),
              });
            }
          }
        }
      } else if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        const importPath = node.moduleSpecifier.text;

        if (importPath.startsWith(".")) {
          const resolved = ts.resolveModuleName(importPath, filePath, program.getCompilerOptions(), ts.sys)
            .resolvedModule?.resolvedFileName;
          const moduleName = importPath.split("/").pop()?.split(".")[0] ?? "";
          const property = propertyMap.get(moduleName);
          const isScalar = importPath.includes("_");

          if (moduleName && resolved && (!property || property.filePath !== resolved)) {
            propertyMap.set(moduleName, {
              filePath: resolved,
              isLibModule: false,
              isImport: true,
              isScalar,
              source: readFileSync(resolved, "utf-8"),
            });
          }
        }
      }

      ts.forEachChild(node, visit);
    }

    visit(source);
  }

  for (const filePath of filesToAnalyze) {
    analyzeFileProperties(filePath);
  }

  spinner.succeed(`Analysis complete. Found ${propertyMap.size} properties.`);

  return propertyMap;
};

export const getRelatedCnsts = (constantFilePath: string) => {
  const parsedConfig = parseTsConfig();
  const { allFilesToAnalyze } = collectImportedFiles(constantFilePath, parsedConfig);
  const { program, checker } = createTsProgram(allFilesToAnalyze, parsedConfig.options);
  const propertyMap = analyzeProperties(allFilesToAnalyze, program, checker);
  return Array.from(propertyMap.entries()).map(([key, value]) => ({ key, ...value }));
};
