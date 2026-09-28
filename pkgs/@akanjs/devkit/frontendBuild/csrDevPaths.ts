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

  //? Present under this very name: on a case-insensitive disk (APFS, NTFS) `ui/card.tsx` still exists after a rename to
  //? `ui/Card.tsx`, but the compiler names the module by the disk's spelling, so the old id is gone.
  static isNamed(file: string): boolean {
    try {
      return fs.realpathSync(file) === file;
    } catch {
      // Missing is an answer here.
      return false;
    }
  }

  //? Bun's own precedence, measured: the registry must pick the file the pages bundle and client-ssr build pick.
  static readonly #scriptExtensions = [".tsx", ".jsx", ".mts", ".ts", ".mjs", ".js", ".cts", ".cjs"];

  /** A relative import resolved against the disk as it is now: the file, a script extension, or a folder's entry. */
  static resolveOnDisk(base: string): string | null {
    const isFile = (candidate: string) => fs.statSync(candidate, { throwIfNoEntry: false })?.isFile() ?? false;
    const file = [base, ...CsrDevPaths.#scriptExtensions.map((extension) => `${base}${extension}`)].find(isFile);
    if (file) return file;
    const main = CsrDevPaths.#packageMainOf(base);
    const fromMain = main ? [main, ...CsrDevPaths.#scriptExtensions.map((extension) => `${main}${extension}`)] : [];
    return (
      [...fromMain, ...CsrDevPaths.#scriptExtensions.map((extension) => path.join(base, `index${extension}`))].find(
        isFile,
      ) ?? null
    );
  }

  static #packageMainOf(dir: string): string | null {
    try {
      const { main } = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")) as { main?: unknown };
      return typeof main === "string" ? path.join(dir, main) : null;
    } catch {
      // No package.json, or one without a usable main: the folder's index answers.
      return null;
    }
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
