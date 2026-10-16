import { builtinModules } from "node:module";
import * as path from "node:path";
import ignore from "ignore";
import ts from "typescript";
import type { App, Lib, Pkg } from "./commandDecorators";
import { FileSys } from "./fileSys";
import type { PackageJson, TsConfigJson } from "./types";

const testFileRegex = /\.(?:test|spec)\.[cm]?[tj]sx?$/;
// `__fixtures__` holds deliberately invalid lint-rule samples, whose imports are violations, not dependencies.
const skipDirs = ["node_modules", "dist", "build", ".git", ".next", "public", "ios", "android", "__fixtures__"];
const isSkippedPath = (filePath: string) => {
  const posixPath = filePath.split(path.sep).join("/");
  return skipDirs.some((dir) => posixPath.includes(`/${dir}/`) || posixPath.startsWith(`${dir}/`));
};
const builtinModuleSet = new Set([...builtinModules, ...builtinModules.map((mod) => `node:${mod}`)]);
const stripShebang = (source: string) => source.replace(/^#!.*(?:\r?\n|$)/, "");

export class TypeScriptDependencyScanner {
  #fileDependencies = new Map<string, string[]>();
  #fileRuntimeDependencies = new Map<string, string[]>();
  #fileTypeDependencies = new Map<string, string[]>();
  #visitedFiles = new Set<string>();
  readonly #tsTranspiler = new Bun.Transpiler({ loader: "ts" });
  readonly #tsxTranspiler = new Bun.Transpiler({ loader: "tsx" });
  readonly #directory: string;
  readonly #rootPackageJson: PackageJson;
  readonly #ig: ReturnType<typeof ignore>;
  readonly #workspaceRoot: string;

  constructor(
    directory: string,
    {
      workspaceRoot,
      rootPackageJson,
      gitignorePatterns = [],
    }: { workspaceRoot: string; tsconfig: TsConfigJson; rootPackageJson: PackageJson; gitignorePatterns?: string[] },
  ) {
    this.#directory = directory;
    this.#rootPackageJson = rootPackageJson;
    this.#ig = ignore().add(gitignorePatterns);
    this.#workspaceRoot = workspaceRoot;
  }

  async getMonorepoDependencies(
    projectName: string,
    { pkgs = [], libs = [] }: { pkgs?: string[]; libs?: string[] } = {},
  ): Promise<{ pkgDeps: string[]; libDeps: string[]; npmDeps: string[]; npmDevDeps: string[] }> {
    const npmSet = new Set(
      Object.keys({ ...this.#rootPackageJson.dependencies, ...this.#rootPackageJson.devDependencies }),
    );
    const pkgPathSet = new Set(pkgs);
    const libPathSet = new Set(libs.map((lib) => `@libs/${lib}`));
    await this.getDependencies();
    const [npmDepSet, pkgPathDepSet, libPathDepSet] = this.#getImportSetsFromDependencies(
      [npmSet, pkgPathSet, libPathSet],
      this.#fileRuntimeDependencies,
    );
    const [npmDevDepSet] = this.#getImportSetsFromDependencies([npmSet], this.#fileTypeDependencies);
    const pkgDeps = [...pkgPathDepSet];
    const libDeps = [...libPathDepSet]
      .map((path) => path.replace("@libs/", ""))
      .filter((libName) => libName !== projectName);
    return {
      pkgDeps,
      libDeps,
      npmDeps: [...npmDepSet],
      npmDevDeps: [...npmDevDepSet].filter((dep) => !npmDepSet.has(dep)),
    };
  }

  async getPackageBuildDependencies(
    projectName: string,
  ): Promise<{ npmDeps: string[]; npmDevDeps: string[]; missingDeps: string[] }> {
    const runtimeDeps = new Set<string>();
    const devDeps = new Set<string>();
    const sourceFiles = await this.#findFiles("**/*.{ts,tsx}", { excludeBuildFiles: true, excludeTestFiles: true });
    const cssFiles = await this.#findFiles("**/*.css");

    for (const filePath of sourceFiles) {
      const fileContent = await FileSys.readText(filePath);
      const { imports, typeImports } = this.#extractImports(fileContent, filePath);
      this.#addNormalizedImports(runtimeDeps, imports, projectName);
      this.#addNormalizedImports(devDeps, typeImports, projectName);
    }

    for (const filePath of cssFiles) {
      const fileContent = await FileSys.readText(filePath);
      this.#addNormalizedImports(runtimeDeps, this.#extractCssPluginImports(fileContent), projectName);
    }

    const buildFilePath = path.join(this.#directory, "build.ts");
    if (await FileSys.fileExists(buildFilePath)) {
      const fileContent = await FileSys.readText(buildFilePath);
      const { imports, typeImports } = this.#extractImports(fileContent, buildFilePath);
      this.#addNormalizedImports(devDeps, [...imports, ...typeImports], projectName);
    }

    for (const dep of runtimeDeps) devDeps.delete(dep);

    const rootDeps = { ...this.#rootPackageJson.dependencies, ...this.#rootPackageJson.devDependencies };
    const missingDeps: string[] = [];
    for (const dep of [...runtimeDeps, ...devDeps]) {
      if (rootDeps[dep] || (await this.#hasWorkspacePackage(dep))) continue;
      missingDeps.push(dep);
    }
    return {
      npmDeps: [...runtimeDeps].sort(),
      npmDevDeps: [...devDeps].sort(),
      missingDeps: missingDeps.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
    };
  }

  async #hasWorkspacePackage(dep: string) {
    const packageJsonPath = path.join(this.#workspaceRoot, "pkgs", dep, "package.json");
    if (!(await Bun.file(packageJsonPath).exists())) return false;
    try {
      const packageJson = await FileSys.readJson<PackageJson>(packageJsonPath);
      return packageJson.name === dep && !!packageJson.version;
    } catch {
      return false;
    }
  }

  async getImportSets<DepSets extends Set<string>[]>(depSets: DepSets): Promise<DepSets> {
    const fileDependencies = await this.getDependencies();
    return this.#getImportSetsFromDependencies(depSets, fileDependencies);
  }

  #getImportSetsFromDependencies<DepSets extends Set<string>[]>(
    depSets: DepSets,
    fileDependencies: Map<string, string[]>,
  ): DepSets {
    const importedDepSets = depSets.map(() => new Set<string>());
    for (const imps of fileDependencies.values())
      for (const imp of imps) {
        if (imp.startsWith(".")) continue;
        const parts = imp.split("/");
        for (let length = 1; length <= parts.length; length++) {
          const importName = parts.slice(0, length).join("/");
          const setIndex = depSets.findIndex((depSet) => depSet.has(importName));
          if (setIndex === -1) continue;
          importedDepSets[setIndex]?.add(importName);
          break;
        }
      }
    return importedDepSets as DepSets;
  }

  async getDependencies(): Promise<Map<string, string[]>> {
    this.#fileDependencies.clear();
    this.#fileRuntimeDependencies.clear();
    this.#fileTypeDependencies.clear();
    this.#visitedFiles.clear();

    for (const file of await this.#findFiles("**/*.{ts,tsx}")) await this.#analyzeFile(file, this.#directory);
    return this.#fileDependencies;
  }

  async #findFiles(
    pattern: string,
    {
      excludeBuildFiles = false,
      excludeTestFiles = false,
    }: { excludeBuildFiles?: boolean; excludeTestFiles?: boolean } = {},
  ): Promise<string[]> {
    const files: string[] = [];
    for await (const filePath of new Bun.Glob(pattern).scan({ cwd: this.#directory, onlyFiles: true })) {
      if (isSkippedPath(filePath)) continue;
      if (excludeBuildFiles && filePath === "build.ts") continue;
      if (excludeTestFiles && testFileRegex.test(filePath)) continue;
      const fullPath = path.join(this.#directory, filePath);
      if (!this.#ig.ignores(path.relative(this.#workspaceRoot, fullPath))) files.push(fullPath);
    }
    return files;
  }

  async #analyzeFile(filePath: string, baseDir: string): Promise<void> {
    if (this.#visitedFiles.has(filePath)) return;

    this.#visitedFiles.add(filePath);

    try {
      const fileContent = await FileSys.readText(filePath);
      const { imports, typeImports } = this.#extractImports(fileContent, filePath);
      const resolvedImports = await this.#resolveImports(imports, filePath, baseDir);
      const resolvedTypeImports = await this.#resolveImports(typeImports, filePath, baseDir);
      const relativePath = path.relative(baseDir, filePath);
      this.#fileDependencies.set(relativePath, [...new Set([...resolvedImports, ...resolvedTypeImports])]);
      this.#fileRuntimeDependencies.set(relativePath, resolvedImports);
      this.#fileTypeDependencies.set(relativePath, resolvedTypeImports);
    } catch {
      // Ignore files that cannot be parsed or read during best-effort dependency scanning.
    }
  }

  async #resolveImports(imports: string[], filePath: string, baseDir: string): Promise<string[]> {
    return await Promise.all(
      imports.map(async (importPath) => {
        if (!importPath.startsWith(".")) return importPath;
        return await this.#ensureExtension(`./${path.join(path.relative(baseDir, filePath), importPath)}`);
      }),
    );
  }

  async #ensureExtension(filePath: string): Promise<string> {
    if (await FileSys.fileExists(`${filePath}.ts`)) return `${filePath}.ts`;
    else if (await FileSys.fileExists(`${filePath}.tsx`)) return `${filePath}.tsx`;
    else if (await FileSys.fileExists(filePath)) return filePath;
    return `${filePath}.ts`;
  }

  #extractImports(source: string, filePath: string) {
    const transpiler = filePath.endsWith(".tsx") ? this.#tsxTranspiler : this.#tsTranspiler;
    const scanSource = stripShebang(source);
    const imports = new Set(
      transpiler
        .scanImports(scanSource)
        .map((imp) => imp.path)
        .filter(Boolean),
    );
    const typeImports = new Set<string>();

    const sourceFile = ts.createSourceFile(filePath, scanSource, ts.ScriptTarget.Latest, true);
    for (const statement of sourceFile.statements) {
      if (!ts.isImportDeclaration(statement)) continue;
      if (!ts.isStringLiteral(statement.moduleSpecifier)) continue;

      const importPath = statement.moduleSpecifier.text;
      const namedBindings = statement.importClause?.namedBindings;
      const isNamedTypeOnlyImport =
        namedBindings &&
        ts.isNamedImports(namedBindings) &&
        namedBindings.elements.length > 0 &&
        namedBindings.elements.every((element) => element.isTypeOnly);

      if ((statement.importClause?.isTypeOnly || isNamedTypeOnlyImport) && !imports.has(importPath)) {
        typeImports.add(importPath);
      }
    }

    return { imports: [...imports], typeImports: [...typeImports] };
  }

  #extractCssPluginImports(source: string) {
    const imports = new Set<string>();
    const pluginRegex = /@plugin\s+(?:url\()?["']([^"')]+)["']\)?/g;
    for (const match of source.matchAll(pluginRegex)) {
      const importPath = match[1];
      if (importPath) imports.add(importPath);
    }
    return [...imports];
  }

  #addNormalizedImports(deps: Set<string>, imports: string[], projectName: string) {
    for (const importPath of imports) {
      const dep = this.#normalizePackageImport(importPath, projectName);
      if (dep) deps.add(dep);
    }
  }

  #normalizePackageImport(importPath: string, projectName: string): string | null {
    if (
      importPath.startsWith(".") ||
      importPath.startsWith("/") ||
      importPath.startsWith("#") ||
      importPath.startsWith("bun:") ||
      builtinModuleSet.has(importPath)
    )
      return null;

    const parts = importPath.split("/");
    const packageName = importPath.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
    if (!packageName || packageName === projectName || importPath.startsWith(`${projectName}/`)) return null;
    return packageName;
  }

  generateDependencyGraph(): string {
    let graph = "Dependency Graph:\n\n";

    for (const [file, imports] of this.#fileDependencies.entries()) {
      graph += `${file}:\n`;

      const projectImports = imports.filter((i) => !i.startsWith("react") && !i.startsWith("@"));
      const externalImports = imports.filter((i) => i.startsWith("react") || i.startsWith("@"));

      if (projectImports.length > 0)
        graph += `  Project dependencies:\n${projectImports.map((imp) => `    → ${imp}\n`).join("")}`;
      if (externalImports.length > 0)
        graph += `  External dependencies:\n${externalImports.map((imp) => `    → ${imp}\n`).join("")}`;

      graph += "\n";
    }

    return graph;
  }

  static async from(exec: App | Lib | Pkg) {
    const [tsconfig, rootPackageJson, gitignorePatterns] = await Promise.all([
      exec.getTsConfig(),
      exec.workspace.getPackageJson(),
      exec.workspace.getGitignorePatterns(),
    ]);
    return new TypeScriptDependencyScanner(exec.cwdPath, {
      workspaceRoot: exec.workspace.cwdPath,
      tsconfig,
      rootPackageJson,
      gitignorePatterns,
    });
  }
}
