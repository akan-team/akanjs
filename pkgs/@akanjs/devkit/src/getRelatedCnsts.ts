import * as fs from "fs";
import ora from "ora";
import * as ts from "typescript";

/**
 * TypeScript 설정 파일을 읽고 파싱하는 함수
 */
export const parseTsConfig = (tsConfigPath: string = "./tsconfig.json") => {
  const configFile = ts.readConfigFile(tsConfigPath, (path) => {
    return ts.sys.readFile(path);
  });

  return ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    fs.realpathSync(tsConfigPath).replace(/[^/\\]+$/, "")
  );
};

/**
 * 파일 내의 임포트를 기반으로 관련 파일을 수집하는 함수
 */
export const collectImportedFiles = (constantFilePath: string, parsedConfig: ts.ParsedCommandLine) => {
  const allFilesToAnalyze = new Set<string>([constantFilePath]);
  const analyzedFiles = new Set<string>();
  const spinner = ora("Collecting related files...");
  spinner.start();

  function collectImported(filePath: string) {
    if (analyzedFiles.has(filePath)) return;
    analyzedFiles.add(filePath);

    // 단일 파일 분석용 임시 프로그램
    const tempProgram = ts.createProgram([filePath], parsedConfig.options);
    const source = tempProgram.getSourceFile(filePath);
    if (!source) return;

    // 임포트만 찾아서 파일 목록 수집
    function collectImports(node: ts.Node) {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        const importPath = node.moduleSpecifier.text;

        if (importPath.startsWith(".")) {
          const resolved = ts.resolveModuleName(importPath, filePath, parsedConfig.options, ts.sys).resolvedModule
            ?.resolvedFileName;

          if (resolved && !allFilesToAnalyze.has(resolved)) {
            allFilesToAnalyze.add(resolved);
            // 재귀적으로 임포트된 파일의 임포트도 수집
            collectImported(resolved);
          }
        }
      }
      ts.forEachChild(node, collectImports);
    }

    collectImports(source);
  }

  // 임포트 기반 관련 파일 수집 실행
  collectImported(constantFilePath);
  spinner.succeed(`Found ${allFilesToAnalyze.size} related files.`);

  return {
    allFilesToAnalyze,
    analyzedFiles,
  };
};

/**
 * export 선언을 기반으로 관련 파일을 수집하는 함수
 */
export const collectExportedFiles = (constantFilePath: string, parsedConfig: ts.ParsedCommandLine) => {
  const allFilesToAnalyze = new Set<string>([constantFilePath]);
  const analyzedFiles = new Set<string>();
  const spinner = ora("Collecting files from exports...");
  spinner.start();

  function collectExported(filePath: string) {
    if (analyzedFiles.has(filePath)) return;
    analyzedFiles.add(filePath);

    // 단일 파일 분석용 임시 프로그램
    const tempProgram = ts.createProgram([filePath], parsedConfig.options);
    const source = tempProgram.getSourceFile(filePath);
    if (!source) return;

    // export 선언을 찾아서 파일 목록 수집
    function collectExports(node: ts.Node) {
      // export ... from 'module' 형태 검사
      if (
        ts.isExportDeclaration(node) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier) &&
        !node.exportClause
      ) {
        const exportPath = node.moduleSpecifier.text;

        if (exportPath.startsWith(".")) {
          const resolved = ts.resolveModuleName(exportPath, filePath, parsedConfig.options, ts.sys).resolvedModule
            ?.resolvedFileName;

          if (resolved && !allFilesToAnalyze.has(resolved)) {
            allFilesToAnalyze.add(resolved);
            // 재귀적으로 익스포트된 파일의 익스포트도 수집
            collectExported(resolved);
          }
        }
      }
      // export type { X } from 'module' 형태 검사
      else if (
        ts.isExportDeclaration(node) &&
        node.exportClause &&
        ts.isNamedExports(node.exportClause) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        const exportPath = node.moduleSpecifier.text;

        if (exportPath.startsWith(".")) {
          const resolved = ts.resolveModuleName(exportPath, filePath, parsedConfig.options, ts.sys).resolvedModule
            ?.resolvedFileName;

          if (resolved && !allFilesToAnalyze.has(resolved)) {
            allFilesToAnalyze.add(resolved);
            // 재귀적으로 익스포트된 파일의 익스포트도 수집
            collectExported(resolved);
          }
        }
      }
      // import 선언도 확인하여 더 많은 관련 파일을 발견
      else if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        const importPath = node.moduleSpecifier.text;

        if (importPath.startsWith(".")) {
          const resolved = ts.resolveModuleName(importPath, filePath, parsedConfig.options, ts.sys).resolvedModule
            ?.resolvedFileName;

          if (resolved && !allFilesToAnalyze.has(resolved)) {
            allFilesToAnalyze.add(resolved);
            // 재귀적으로 임포트된 파일도 확인
            collectExported(resolved);
          }
        }
      }

      // 내부 export 구문 검사 (export 변수/함수/클래스)
      // 이는 직접적인 파일 의존성은 없지만 관련 식별자를 추적하는 데 유용할 수 있음
      if (
        (ts.isVariableStatement(node) || ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) &&
        node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
      ) {
        // 이 부분에서 내부 변수/함수/클래스 선언의 의존성을 추적할 수 있음
        // 필요하다면 여기서 추가 분석 가능
      }

      ts.forEachChild(node, collectExports);
    }

    collectExports(source);
  }

  // export 기반 관련 파일 수집 실행
  collectExported(constantFilePath);
  spinner.succeed(`Found ${allFilesToAnalyze.size} related files from exports.`);

  return {
    allFilesToAnalyze,
    analyzedFiles,
  };
};

/**
 * TypeScript 프로그램 생성 함수
 */
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

/**
 * 심볼 캐싱 및 조회 함수 생성기
 */
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

/**
 * 파일 속성 분석 함수
 */
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

  // 파일 내 속성 분석 함수
  function analyzeFileProperties(filePath: string) {
    if (analyzedFiles.has(filePath)) return;
    analyzedFiles.add(filePath);

    const source = program.getSourceFile(filePath);
    if (!source) return;

    // 소스 라인 캐싱 (한 번만 분할)
    if (!sourceLineCache.has(filePath)) {
      sourceLineCache.set(filePath, source.getFullText().split("\n"));
    }
    const sourceLines = sourceLineCache.get(filePath);

    // 속성 분석 함수
    function visit(node: ts.Node) {
      if (!source) return;

      // 프로퍼티 접근 표현식 처리
      if (ts.isPropertyAccessExpression(node)) {
        const left = node.expression;
        const right = node.name;
        const { line } = ts.getLineAndCharacterOfPosition(source, node.getStart());

        // 패턴 검색 로직 - 기존 문자열 기반 검색 유지
        if (
          ts.isIdentifier(left) &&
          sourceLines &&
          sourceLines.length > line &&
          (sourceLines[line].includes(`@Field.Prop(() => ${left.text}.${right.text}`) ||
            sourceLines[line].includes(`base.Filter(${left.text}.${right.text},`))
        ) {
          // 캐싱된 심볼 사용
          const symbol = getCachedSymbol(right);

          if (symbol?.declarations && symbol.declarations.length > 0) {
            const key = symbol.declarations[0].getSourceFile().fileName.split("/").pop()?.split(".")[0] ?? "";
            const property = propertyMap.get(key);
            const isScalar = symbol.declarations[0].getSourceFile().fileName.includes("_");
            // 현재 작업 중인 디렉토리 이전은 제거
            const symbolFilePath = symbol.declarations[0]
              .getSourceFile()
              .fileName.replace(`${ts.sys.getCurrentDirectory()}/`, "");

            if (property) {
              propertyMap.set(`${left.text}.${right.text}`, {
                filePath: symbolFilePath,
                isLibModule: true,
                isImport: false,
                libName: left.text,
                source: fs.readFileSync(symbolFilePath, "utf-8"),
                isScalar,
              });
            } else {
              propertyMap.set(key, {
                filePath: symbolFilePath,
                isLibModule: true,
                isImport: false,
                libName: left.text,
                isScalar,
                source: fs.readFileSync(symbolFilePath, "utf-8"),
              });
            }
          }
        }
      } else if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        // 모듈 선언 표현식 처리
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
              source: fs.readFileSync(resolved, "utf-8"),
            });
          }
        }
      }

      // 모든 자식 노드 처리
      ts.forEachChild(node, visit);
    }

    // 파일 분석 시작
    visit(source);
  }

  // 모든 파일의 속성 관계 분석
  for (const filePath of filesToAnalyze) {
    analyzeFileProperties(filePath);
  }

  spinner.succeed(`Analysis complete. Found ${propertyMap.size} properties.`);

  return propertyMap;
};

/**
 * 메인 함수: 상수 파일 관련 요소 분석
 */
export const getRelatedCnsts = (constantFilePath: string) => {
  // 1. TypeScript 설정 파일 읽기 및 파싱
  const parsedConfig = parseTsConfig();

  // 2. 상수 파일 관련 파일 수집 (임포트 기반)
  const { allFilesToAnalyze } = collectImportedFiles(constantFilePath, parsedConfig);
  // 3. TypeScript 프로그램 생성 및 타입 체커 설정
  const { program, checker } = createTsProgram(allFilesToAnalyze, parsedConfig.options);

  // 4. 파일 속성 분석
  const propertyMap = analyzeProperties(allFilesToAnalyze, program, checker);

  // 5. 결과 반환
  return Array.from(propertyMap.entries()).map(([key, value]) => ({ key, ...value }));
};
