import fs from "node:fs";
import path from "node:path";

export class CsrDevPaths {
  static readonly modulePrefix = "akan-module:";
  static readonly stubPrefix = "stub:";
  static readonly vendorPrefix = "vendor:";
  readonly root: string;

  constructor(workspaceRoot: string) {
    this.root = CsrDevPaths.realpath(workspaceRoot);
  }

  idOf(file: string): string {
    const real = CsrDevPaths.realpath(file);
    const relative = path.relative(this.root, real);
    const id = relative.startsWith("..") || path.isAbsolute(relative) ? real : relative;
    return id.split(path.sep).join("/");
  }

  fileOf(id: string): string {
    return path.isAbsolute(id) ? id : path.join(this.root, id);
  }

  static isStub(target: string): boolean {
    return target.startsWith(CsrDevPaths.stubPrefix);
  }

  static isVendorFile(file: string): boolean {
    return file.includes(`${path.sep}node_modules${path.sep}`);
  }

  static isScript(file: string): boolean {
    return /\.[cm]?[jt]sx?$/.test(file);
  }

  static mtimeOf(file: string): number {
    return fs.statSync(file, { throwIfNoEntry: false })?.mtimeMs ?? -1;
  }

  static async hashOf(file: string): Promise<string> {
    const source = Bun.file(file);
    return (await source.exists()) ? Bun.hash(await source.arrayBuffer()).toString(36) : "";
  }

  static realpath(file: string): string {
    // A deleted file keeps its own path, so its id still matches the graph entry it leaves behind.
    return fs.existsSync(file) ? fs.realpathSync(file) : path.resolve(file);
  }

  static readonly #scriptExtensions = [".tsx", ".ts", ".jsx", ".js", ".mjs", ".cjs", ".mts", ".cts"];

  /** A relative import resolved against the disk as it is now: the file, a script extension, or a folder's index. */
  static resolveOnDisk(base: string): string | null {
    const candidates = [
      base,
      ...CsrDevPaths.#scriptExtensions.map((extension) => `${base}${extension}`),
      ...CsrDevPaths.#scriptExtensions.map((extension) => path.join(base, `index${extension}`)),
    ];
    return candidates.find((candidate) => fs.statSync(candidate, { throwIfNoEntry: false })?.isFile()) ?? null;
  }

  static tryResolve(specifier: string, from: string): string | null {
    try {
      return Bun.resolveSync(specifier, from);
    } catch {
      // Unresolvable is an answer here; the caller decides whether it is an error.
      return null;
    }
  }

  static lineCount(text: string): number {
    let count = 0;
    for (let index = text.indexOf("\n"); index !== -1; index = text.indexOf("\n", index + 1)) count += 1;
    return count;
  }
}
