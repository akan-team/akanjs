import path from "node:path";
import type { SysExecutor } from "./executors";

export type AbstractKind = "domain" | "service" | "scalar" | "other";

export class AbstractDoc {
  static readonly suffix = ".abstract.md";
  /** `akan quality` warns above this. */
  static readonly maxLines = 300;
  // Abstracts only live in facet folders; globbing the sys root instead would walk node_modules.
  static readonly #facetRoots = "{lib,ui,webkit,srvkit,common,plugin}";

  static isAbstractPath(filePath: string) {
    return filePath.endsWith(AbstractDoc.suffix);
  }
  static lineCountOf(content: string) {
    return content.split(/\r?\n/).length;
  }
  static kindOf(filePath: string): AbstractKind {
    const [root, folder, ...rest] = filePath.split("/");
    if (root !== "lib" || !folder) return "other";
    if (folder === "__scalar") return rest.length === 2 ? "scalar" : "other";
    if (rest.length !== 1) return "other";
    return folder.startsWith("_") ? "service" : "domain";
  }
  static async findAll(sys: SysExecutor, { module }: { module?: string | null } = {}) {
    const filePaths = (await sys.getAllFiles(`${AbstractDoc.#facetRoots}/**/*${AbstractDoc.suffix}`))
      .map((filePath) => filePath.split(path.sep).join("/"))
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const docs = await Promise.all(filePaths.map((filePath) => AbstractDoc.read(sys, filePath)));
    if (!module) return docs;
    return docs.filter((doc) => doc.moduleName === module || doc.folderName === module);
  }
  static async read(sys: SysExecutor, filePath: string) {
    const dirPath = filePath.split("/").slice(0, -1).join("/");
    const [content, folderFiles] = await Promise.all([sys.readFile(filePath), sys.readdir(dirPath)]);
    return new AbstractDoc(
      filePath,
      content,
      folderFiles.filter((fileName) => !AbstractDoc.isAbstractPath(fileName)),
    );
  }

  constructor(
    readonly path: string,
    readonly content: string,
    readonly siblingFiles: string[],
  ) {}
  get kind() {
    return AbstractDoc.kindOf(this.path);
  }
  get folderName() {
    return this.path.split("/").at(-2) ?? "";
  }
  get moduleName() {
    return (this.path.split("/").at(-1) ?? "").slice(0, -AbstractDoc.suffix.length);
  }
  get lineCount() {
    return AbstractDoc.lineCountOf(this.content);
  }
  // An AI editor that decides nothing needs changing answers in prose, which must not replace the abstract.
  canReplaceWith(candidate: string) {
    const next = candidate.trim();
    if (!next.startsWith("#")) return false;
    const lineCount = AbstractDoc.lineCountOf(next);
    return lineCount >= 3 && lineCount < this.lineCount;
  }
}
