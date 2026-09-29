import fs from "node:fs";
import path from "node:path";

export class CsrDevPaths {
  static readonly modulePrefix = "akan-module:";
  static readonly stubPrefix = "stub:";
  static readonly emptyStubPrefix = "stub:empty:";
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

  //? `.native`: on Windows Bun's `fs.realpathSync` keeps the spelling it was given, where the native call returns the
  //? disk's (as macOS's plain call does), and a module id must not depend on which spelling reached it first.
  static realpath(file: string): string {
    // A deleted file keeps its own path, so its id still matches the graph entry it leaves behind.
    return fs.existsSync(file) ? fs.realpathSync.native(file) : path.resolve(file);
  }

  //? Present under this very name: on a case-insensitive disk (APFS, NTFS) `ui/card.tsx` still exists after a rename to
  //? `ui/Card.tsx`, but the compiler names the module by the disk's spelling, so the old id is gone.
  static isNamed(file: string): boolean {
    try {
      return fs.realpathSync.native(file) === file;
    } catch {
      // Missing is an answer here.
      return false;
    }
  }

  //? Bun's own precedence for a browser build, measured (Bun 1.4.2): the registry must pick the file every other build
  //? picks, and a `require` call weighs the extensions differently from an import.
  static readonly #extensions = {
    import: [".tsx", ".jsx", ".mts", ".ts", ".mjs", ".js", ".cts", ".cjs"],
    require: [".tsx", ".ts", ".jsx", ".cts", ".cjs", ".js", ".mjs", ".mts"],
  } as const;

  /** A relative import resolved against the disk as it is now: the file, a script extension, or a folder's entry. */
  static resolveOnDisk(base: string, kind: "import" | "require" = "import"): string | null {
    return CsrDevPaths.#asFile(base, kind) ?? CsrDevPaths.#asFolder(base, kind);
  }

  //? A specifier ending in `/`, `.` or `..` names the folder alone, for Bun too: `./Foo/` never takes a `Foo.tsx`.
  static resolveRelative(dir: string, specifier: string, kind: "import" | "require" = "import"): string | null {
    const base = path.resolve(dir, specifier);
    const folder = /(^|[\\/])\.\.?$|[\\/]$/.test(specifier);
    return folder ? CsrDevPaths.#asFolder(base, kind) : CsrDevPaths.resolveOnDisk(base, kind);
  }

  static #asFile(base: string, kind: "import" | "require"): string | null {
    const isFile = (candidate: string) => fs.statSync(candidate, { throwIfNoEntry: false })?.isFile() ?? false;
    return [base, ...CsrDevPaths.#extensions[kind].map((extension) => `${base}${extension}`)].find(isFile) ?? null;
  }

  //? A folder's package.json names its entry as a browser build reads it: `browser` (the string form), then `module`
  //? (an import only), then `main`, which may itself name a folder; without one, its `index`.
  static #asFolder(dir: string, kind: "import" | "require"): string | null {
    const entry = CsrDevPaths.#packageEntryOf(dir, kind);
    const named = entry
      ? (CsrDevPaths.#asFile(path.join(dir, entry), kind) ?? CsrDevPaths.#indexOf(path.join(dir, entry), kind))
      : null;
    return named ?? CsrDevPaths.#indexOf(dir, kind);
  }

  static #indexOf(dir: string, kind: "import" | "require"): string | null {
    return CsrDevPaths.#asFile(path.join(dir, "index"), kind);
  }

  static #packageEntryOf(dir: string, kind: "import" | "require"): string | null {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")) as Record<string, unknown>;
      const fields = kind === "require" ? [pkg.browser, pkg.main] : [pkg.browser, pkg.module, pkg.main];
      const entry = fields.find((field) => typeof field === "string");
      return typeof entry === "string" ? entry : null;
    } catch {
      // No package.json, or one that names no entry: the folder's index answers.
      return null;
    }
  }

  //? The package folder's ctime: Bun installs by cloning (macOS) or hard-linking (Linux) its cache, so a file keeps the
  //? cache's mtime, and a hard link's ctime moves whenever another project links the same version; the folder is made
  //? by this project's install alone.
  /** A bare specifier whose package landed in a `node_modules` at or above `from` after `since`. */
  static installedSince(specifier: string, from: string, since: number): boolean {
    const [first = "", second = ""] = specifier.split("/");
    const name = first.startsWith("@") ? `${first}/${second}` : first;
    if (!name || name.startsWith(".")) return false;
    for (let dir = path.resolve(from); ; dir = path.dirname(dir)) {
      const pkgDir = path.join(dir, "node_modules", name);
      if (fs.existsSync(path.join(pkgDir, "package.json")))
        return (fs.statSync(pkgDir, { throwIfNoEntry: false })?.ctimeMs ?? 0) > since;
      if (path.dirname(dir) === dir) return false;
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
