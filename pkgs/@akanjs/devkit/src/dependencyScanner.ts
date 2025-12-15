import * as fs from "fs";
import ignore from "ignore";
import * as path from "path";
import * as ts from "typescript";

import type { PackageJson, TsConfigJson } from "./types";

export class TypeScriptDependencyScanner {
  #fileDependencies = new Map<string, string[]>();
  #visitedFiles = new Set<string>();
  private readonly directory: string;
  private readonly tsconfig: TsConfigJson;
  private readonly rootPackageJson: PackageJson;
  private readonly ig: ReturnType<typeof ignore>;
  private readonly workspaceRoot: string;

  constructor(
    directory: string,
    {
      workspaceRoot,
      tsconfig,
      rootPackageJson,
      gitignorePatterns = [],
    }: { workspaceRoot: string; tsconfig: TsConfigJson; rootPackageJson: PackageJson; gitignorePatterns?: string[] }
  ) {
    this.directory = directory;
    this.tsconfig = tsconfig;
    this.rootPackageJson = rootPackageJson;
    this.ig = ignore().add(gitignorePatterns);
    this.workspaceRoot = workspaceRoot;
  }

  async getMonorepoDependencies(
    projectName: string
  ): Promise<{ pkgDeps: string[]; libDeps: string[]; npmDeps: string[] }> {
    const npmSet = new Set(
      Object.keys({ ...this.rootPackageJson.dependencies, ...this.rootPackageJson.devDependencies })
    );
    const pkgPathSet = new Set(
      Object.keys(this.tsconfig.compilerOptions.paths ?? {})
        .filter((path) => this.tsconfig.compilerOptions.paths?.[path]?.some((resolve) => resolve.startsWith("pkgs/")))
        .map((path) => path.replace("/*", ""))
    );
    const libPathSet = new Set(
      Object.keys(this.tsconfig.compilerOptions.paths ?? {})
        .filter((path) => this.tsconfig.compilerOptions.paths?.[path]?.some((resolve) => resolve.startsWith("libs/")))
        .map((path) => path.replace("/*", ""))
    );
    const [npmDepSet, pkgPathDepSet, libPathDepSet] = await this.getImportSets([npmSet, pkgPathSet, libPathSet]);
    const pkgDeps = [...pkgPathDepSet].map((path) => {
      const pathSplitLength = path.split("/").length;
      return (this.tsconfig.compilerOptions.paths?.[path]?.[0] ?? "*")
        .split("/")
        .slice(1, 1 + pathSplitLength)
        .join("/");
    });
    const libDeps = [...libPathDepSet]
      .map((path) => {
        const pathSplitLength = path.split("/").length;
        return (this.tsconfig.compilerOptions.paths?.[path]?.[0] ?? "*")
          .split("/")
          .slice(1, 1 + pathSplitLength)
          .join("/");
      })
      .filter((libName) => libName !== projectName);
    return { pkgDeps, libDeps, npmDeps: [...npmDepSet] };
  }

  async getImportSets(depSets: Set<string>[]): Promise<Set<string>[]> {
    const fileDependencies = await this.getDependencies();
    const importedDepSets = new Array<Set<string>>(depSets.length);
    for (let i = 0; i < depSets.length; i++) importedDepSets[i] = new Set<string>();
    fileDependencies.forEach((imps) => {
      imps.forEach((imp) => {
        if (imp.startsWith(".")) return;
        const moduleName = imp;
        const moduleNameParts = moduleName.split("/");
        const subModuleLength = moduleNameParts.length;
        for (let i = 0; i < subModuleLength; i++) {
          const importName = moduleNameParts.slice(0, i + 1).join("/");
          for (let j = 0; j < depSets.length; j++) {
            if (depSets[j].has(importName)) {
              importedDepSets[j].add(importName);
              return;
            }
          }
        }
      });
    });
    return importedDepSets;
  }

  async getDependencies(): Promise<Map<string, string[]>> {
    this.#fileDependencies.clear();
    this.#visitedFiles.clear();

    const files = await this.#findTypeScriptFiles(this.directory);

    for (const file of files) await this.#analyzeFile(file, this.directory);

    return this.#fileDependencies;
  }

  async #findTypeScriptFiles(directory: string): Promise<string[]> {
    const files: string[] = [];

    const processDirectory = async (dir: string) => {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(this.workspaceRoot, fullPath);

        // Check if the file/directory is ignored
        if (this.ig.ignores(relativePath)) continue;

        if (entry.isDirectory()) {
          // Skip node_modules and other common directories to ignore
          if (!["node_modules", "dist", "build", ".git", ".next", "public", "ios", "android"].includes(entry.name))
            await processDirectory(fullPath);
        } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))) files.push(fullPath);
      }
    };

    await processDirectory(directory);
    return files;
  }

  async #analyzeFile(filePath: string, baseDir: string): Promise<void> {
    if (this.#visitedFiles.has(filePath)) return;

    this.#visitedFiles.add(filePath);

    try {
      const fileContent = await fs.promises.readFile(filePath, "utf-8");
      const imports = this.#extractImports(fileContent, filePath);

      // Convert imports to absolute or relative paths
      const resolvedImports = imports.map((importPath) => {
        if (importPath.startsWith(".")) {
          // Handle relative imports
          const resolvedPath = "./" + path.join(path.relative(baseDir, filePath), importPath);
          return this.#ensureExtension(resolvedPath);
        }
        return importPath; // Keep package imports as is
      });

      // Store the dependencies
      const relativePath = path.relative(baseDir, filePath);
      this.#fileDependencies.set(relativePath, resolvedImports);
    } catch (error) {
      //   console.error(`Error analyzing file ${filePath}:`, error);
    }
  }

  #ensureExtension(filePath: string): string {
    if (fs.existsSync(`${filePath}.ts`)) return `${filePath}.ts`;
    else if (fs.existsSync(`${filePath}.tsx`)) return `${filePath}.tsx`;
    else if (fs.existsSync(filePath)) return filePath;
    return `${filePath}.ts`;
  }

  #extractImports(source: string, filePath: string): string[] {
    const imports: string[] = [];

    // Create a TypeScript source file
    const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true);

    // Visit each node in the source file
    const visit = (node: ts.Node) => {
      // Check if the node is an import declaration (static imports)
      if (ts.isImportDeclaration(node)) {
        const moduleSpecifier = node.moduleSpecifier;

        // Extract the import path
        if (ts.isStringLiteral(moduleSpecifier)) imports.push(moduleSpecifier.text);
      }

      // Check for dynamic imports: import("module")
      if (ts.isCallExpression(node)) {
        // Check if it's an import() call
        if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
          // Get the first argument which should be the module path
          if (node.arguments.length > 0) {
            const arg = node.arguments[0];
            if (ts.isStringLiteral(arg)) imports.push(arg.text);
          }
        }

        // Also check for import() calls within arrow functions
        // This handles cases like: () => import("module")
        if (ts.isArrowFunction(node.expression)) {
          // && node.expression.body) {
          const body = node.expression.body;
          if (ts.isCallExpression(body) && body.expression.kind === ts.SyntaxKind.ImportKeyword) {
            if (body.arguments.length > 0) {
              const arg = body.arguments[0];
              if (ts.isStringLiteral(arg)) imports.push(arg.text);
            }
          }
        }
      }

      // Visit child nodes
      ts.forEachChild(node, visit);
    };

    // Start visiting from the root node
    visit(sourceFile);

    // Remove duplicates
    return [...new Set(imports)];
  }

  generateDependencyGraph(): string {
    let graph = "Dependency Graph:\n\n";

    for (const [file, imports] of this.#fileDependencies.entries()) {
      graph += `${file}:\n`;

      const projectImports = imports.filter((i) => !i.startsWith("react") && !i.startsWith("@"));
      const externalImports = imports.filter((i) => i.startsWith("react") || i.startsWith("@"));

      if (projectImports.length > 0) {
        graph += "  Project dependencies:\n";
        projectImports.forEach((imp) => {
          graph += `    → ${imp}\n`;
        });
      }

      if (externalImports.length > 0) {
        graph += "  External dependencies:\n";
        externalImports.forEach((imp) => {
          graph += `    → ${imp}\n`;
        });
      }

      graph += "\n";
    }

    return graph;
  }
}
