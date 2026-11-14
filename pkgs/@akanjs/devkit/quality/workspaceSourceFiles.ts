import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import ignore from "ignore";
import ts from "typescript";
import { AbstractDoc } from "./abstractDoc";
import type { SourceFileInfo } from "./qualityScanner";

type IgnoreFilter = ReturnType<typeof ignore>;

export class WorkspaceSourceFiles {
  readonly #workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.#workspaceRoot = workspaceRoot;
  }

  async collect(dirs: string[] = ["apps", "libs"]) {
    const ignoreFilter = ignore().add(await this.#readGitIgnore());
    const files = new Set<string>();
    for (const dir of dirs) {
      const absoluteDir = path.join(this.#workspaceRoot, dir);
      if (await WorkspaceSourceFiles.#isDirectory(absoluteDir)) await this.#walk(absoluteDir, ignoreFilter, files);
    }
    return [...files].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  }

  async read(file: string): Promise<SourceFileInfo> {
    const absolutePath = path.join(this.#workspaceRoot, file);
    const content = await readFile(absolutePath, "utf8");
    const scriptKind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    return {
      file,
      absolutePath,
      content,
      sourceFile: ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, scriptKind),
    };
  }

  async #readGitIgnore() {
    const gitIgnorePath = path.join(this.#workspaceRoot, ".gitignore");
    if (!(await Bun.file(gitIgnorePath).exists())) return [];
    return (await readFile(gitIgnorePath, "utf8")).split(/\r?\n/);
  }

  async #walk(currentPath: string, ignoreFilter: IgnoreFilter, files: Set<string>) {
    const entries = await readdir(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(currentPath, entry.name);
      const relativePath = path.relative(this.#workspaceRoot, absolutePath).split(path.sep).join("/");
      if (WorkspaceSourceFiles.#shouldSkip(relativePath, entry.isDirectory(), ignoreFilter)) continue;

      if (entry.isDirectory()) {
        await this.#walk(absolutePath, ignoreFilter, files);
        continue;
      }
      if ((relativePath.endsWith(".ts") || relativePath.endsWith(".tsx")) && !relativePath.endsWith(".d.ts")) {
        files.add(relativePath);
      } else if (AbstractDoc.isAbstractPath(relativePath)) {
        files.add(relativePath);
      }
    }
  }

  static #shouldSkip(relativePath: string, isDirectory: boolean, ignoreFilter: IgnoreFilter) {
    const ignorePath = isDirectory ? `${relativePath}/` : relativePath;
    return (
      relativePath === ".git" ||
      relativePath.includes("/.git/") ||
      relativePath.includes("/node_modules/") ||
      ignoreFilter.ignores(relativePath) ||
      ignoreFilter.ignores(ignorePath)
    );
  }

  static async #isDirectory(absolutePath: string) {
    try {
      return (await stat(absolutePath)).isDirectory();
    } catch {
      return false;
    }
  }
}
