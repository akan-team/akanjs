import type { SysExecutor } from "./executors";

export type AbstractKind = "domain" | "service" | "scalar" | "other";

/** One `*.abstract.md` file: the agent-facing summary a module carries next to its source. */
export class AbstractDoc {
  static readonly suffix = ".abstract.md";
  /** `akan quality` warns above this and points at `akan compact`. */
  static readonly maxLines = 300;
  /** `akan compact` floor, and the line budget it compacts down to, so a compacted file is never a candidate again. */
  static readonly compactMinLines = 40;
  // Abstracts only live in facet folders; globbing the sys root instead would walk node_modules.
  static readonly #facetRoots = "{lib,ui,webkit,srvkit,common,plugin}";

  static isAbstractPath(filePath: string) {
    return filePath.endsWith(AbstractDoc.suffix);
  }
  static lineCountOf(content: string) {
    return content.split(/\r?\n/).length;
  }
  /** Module kind read off the sys-relative path; anything outside a `lib/` module folder is "other". */
  static kindOf(filePath: string): AbstractKind {
    const [root, folder, ...rest] = filePath.split("/");
    if (root !== "lib" || !folder) return "other";
    if (folder === "__scalar") return rest.length === 2 ? "scalar" : "other";
    if (rest.length !== 1) return "other";
    return folder.startsWith("_") ? "service" : "domain";
  }
  static async findAll(sys: SysExecutor, { module }: { module?: string | null } = {}) {
    const filePaths = (await sys.getAllFiles(`${AbstractDoc.#facetRoots}/**/*${AbstractDoc.suffix}`)).sort();
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
  // An AI editor answers in prose when it decides nothing needs changing, and that prose would silently
  // replace the abstract — so a candidate must look like a markdown file and be shorter than what it replaces.
  canReplaceWith(candidate: string) {
    const next = candidate.trim();
    if (!next.startsWith("#")) return false;
    const lineCount = AbstractDoc.lineCountOf(next);
    return lineCount >= 3 && lineCount < this.lineCount;
  }
}
