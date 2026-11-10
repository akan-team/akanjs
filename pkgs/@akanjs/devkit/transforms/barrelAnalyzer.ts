import fs from "node:fs";
import path from "node:path";
import { Logger } from "akanjs/common";
import { parseNamedList } from "./moduleSyntax";

export interface BarrelExportTarget {
  subpath: string;
  originalName: string;
  /** `export * as name from`: an import of the name binds the whole module at `subpath`. */
  namespace?: boolean;
}

export type BarrelExportMap = Map<string, BarrelExportTarget>;

export interface PackageEntry {
  pkgName: string;
  /** Absolute path of the barrel entry file. */
  entryFile: string;
  /** Absolute base directory for subpath computation, typically `dirname(entryFile)`. */
  pkgDir: string;
  /** Emit concrete file paths, for package exports that do not support extensionless deep imports. */
  preserveFilePath?: boolean;
}

export interface BarrelAnalyzerOptions {
  resolvePackage: (pkgName: string) => Promise<PackageEntry | null>;
  /** Resolves to an absolute file path on disk. */
  resolveRelative?: (fromFile: string, relSpec: string) => Promise<string | null>;
}

// `Transpiler.scan` gives the export names but not their sources; this regex supplies the name↔source mapping.
const REEXPORT_RE =
  /(?:^|\n)\s*export\s+(?:type\s+)?(?:(\*)(?:\s+as\s+(\w+))?|\{\s*([^}]*?)\s*\})\s+from\s+(["'])([^"']+)\4;?/g;

// `Transpiler.scan` omits `export { A, B as C };`. The lookahead sits right after `}` so whitespace backtracking
// cannot also match `export type { X } from "./y"`.
const LOCAL_NAMED_RE = /(?:^|\n)\s*export\s+\{\s*([^}]*?)\s*\}(?!\s*from)/g;

const CANDIDATE_EXTS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];

export class BarrelAnalyzer {
  readonly #logger = new Logger("BarrelAnalyzer");
  readonly #opts: BarrelAnalyzerOptions;
  readonly #cache = new Map<string, Promise<BarrelExportMap | null>>();
  readonly #read = new Map<string, Set<string>>();
  readonly #realDirs = new Map<string, string>();
  readonly #tsTranspiler = new Bun.Transpiler({ loader: "ts" });
  readonly #tsxTranspiler = new Bun.Transpiler({ loader: "tsx" });

  constructor(opts: BarrelAnalyzerOptions) {
    this.#opts = opts;
  }

  analyze(pkgName: string): Promise<BarrelExportMap | null> {
    const cached = this.#cache.get(pkgName);
    if (cached) return cached;
    const promise = this.#analyzeSafe(pkgName);
    this.#cache.set(pkgName, promise);
    return promise;
  }

  async filesOf(pkgName: string): Promise<string[]> {
    await this.analyze(pkgName);
    return [...(this.#read.get(pkgName) ?? [])];
  }

  //? A file beside one the analysis read counts too: created, it can take over a star export's specifier (`Foo.tsx`
  //? beside `Foo/index.tsx`) with no read file changed. Both sides by realpath: a watcher names a symlinked lib's
  //? files by their real path, where the walk went through the link.
  forget(files: string[]): Map<string, Promise<BarrelExportMap | null>> {
    const dirs = new Set(files.map((file) => realDirOf(file)));
    const forgotten = new Map<string, Promise<BarrelExportMap | null>>();
    for (const [pkgName, read] of this.#read) {
      const analysis = this.#cache.get(pkgName);
      if (!analysis || ![...read].some((file) => dirs.has(this.#realDirOf(file)))) continue;
      forgotten.set(pkgName, analysis);
      this.#cache.delete(pkgName);
      this.#read.delete(pkgName);
    }
    return forgotten;
  }

  #realDirOf(file: string): string {
    let dir = this.#realDirs.get(file);
    if (dir === undefined) {
      dir = realDirOf(file);
      this.#realDirs.set(file, dir);
    }
    return dir;
  }

  async #analyzeSafe(pkgName: string): Promise<BarrelExportMap | null> {
    try {
      const pkg = await this.#opts.resolvePackage(pkgName);
      if (!pkg) return null;
      const map: BarrelExportMap = new Map();
      const read = new Set<string>();
      this.#read.set(pkgName, read);
      await this.#walk(pkg.entryFile, pkg, map, read);
      return map;
    } catch (err) {
      this.#logger.error(`analyze failed for ${pkgName}: ${(err as Error).message}`);
      return null;
    }
  }

  async #walk(absFile: string, pkg: PackageEntry, map: BarrelExportMap, visited: Set<string>): Promise<void> {
    if (visited.has(absFile)) return;
    visited.add(absFile);
    const file = Bun.file(absFile);
    if (!(await file.exists())) return;
    const source = await file.text();
    const currentSubpath = this.#subpathFor(pkg, absFile);
    if (!currentSubpath) return;

    // scan leaves out `export *` names (they surface only as imports), so star re-exports are walked below.
    const authoritative = this.#scanExports(source, absFile);
    // Barrels rarely proxy defaults, and rewriting `import X from "pkg"` needs different semantics.
    authoritative.delete("default");

    const attributed = new Set<string>();
    const attribute = (listBody: string, subpath: string) => {
      for (const item of parseNamedList(listBody)) {
        if (item.isType || item.imported === "default" || !authoritative.has(item.local)) continue;
        attributed.add(item.local);
        if (!map.has(item.local)) map.set(item.local, { subpath, originalName: item.imported });
      }
    };

    // A module's own exports shadow the names its stars bring (ES), so every one is mapped before a star is walked.
    const starSpecs: string[] = [];
    for (const m of source.matchAll(REEXPORT_RE)) {
      const star = m[1];
      const nsAs = m[2];
      const namedList = m[3];
      const spec = m[5] ?? "";
      if (!isRelative(spec)) continue;

      if (star) {
        if (!nsAs) starSpecs.push(spec);
        else if (authoritative.has(nsAs)) {
          attributed.add(nsAs);
          const targetAbs = await this.#resolveRel(absFile, spec);
          const targetSubpath = targetAbs ? this.#subpathFor(pkg, targetAbs) : null;
          if (targetSubpath && !map.has(nsAs))
            map.set(nsAs, { subpath: targetSubpath, originalName: nsAs, namespace: true });
        }
        continue;
      }

      if (namedList !== undefined) {
        const targetAbs = await this.#resolveRel(absFile, spec);
        if (!targetAbs) continue;
        const targetSubpath = this.#subpathFor(pkg, targetAbs);
        if (targetSubpath) attribute(namedList, targetSubpath);
      }
    }

    LOCAL_NAMED_RE.lastIndex = 0;
    let n: RegExpExecArray | null = LOCAL_NAMED_RE.exec(source);
    while (n !== null) {
      const body = n[1] ?? "";
      n = LOCAL_NAMED_RE.exec(source);
      attribute(body, currentSubpath);
    }

    for (const name of authoritative) {
      if (attributed.has(name)) continue;
      if (map.has(name)) continue;
      map.set(name, { subpath: currentSubpath, originalName: name });
    }

    for (const spec of starSpecs) {
      const targetAbs = await this.#resolveRel(absFile, spec);
      if (targetAbs) await this.#walk(targetAbs, pkg, map, visited);
    }
  }

  #scanExports(source: string, absFile: string): Set<string> {
    try {
      const transpiler = [".tsx", ".jsx"].includes(path.extname(absFile)) ? this.#tsxTranspiler : this.#tsTranspiler;
      const { exports } = transpiler.scan(source);
      return new Set(exports);
    } catch (err) {
      this.#logger.error(`scan failed: ${(err as Error).message}`);
      return new Set();
    }
  }

  #subpathFor(pkg: PackageEntry, absFile: string): string | null {
    const rel = path.relative(pkg.pkgDir, absFile);
    if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return null;
    if (pkg.preserveFilePath) return `${pkg.pkgName}/${rel.split(path.sep).join("/")}`;
    const ext = CANDIDATE_EXTS.find((candidate) => rel.endsWith(candidate));
    const parts = (ext ? rel.slice(0, -ext.length) : rel).split(path.sep);
    // `xxx/index` collapses to `xxx`: callers import `@pkg/xxx`, never `@pkg/xxx/index`.
    if (parts[parts.length - 1] === "index") parts.pop();
    const tail = parts.join("/");
    return tail === "" ? pkg.pkgName : `${pkg.pkgName}/${tail}`;
  }

  async #resolveRel(fromFile: string, relSpec: string): Promise<string | null> {
    if (this.#opts.resolveRelative) return this.#opts.resolveRelative(fromFile, relSpec);
    return defaultResolveRelative(fromFile, relSpec);
  }
}

const realDirOf = (file: string): string => {
  const dir = path.dirname(path.resolve(file));
  try {
    return fs.realpathSync.native(dir);
  } catch {
    // A directory removed with the file keeps its own path.
    return dir;
  }
};

const isRelative = (spec: string): boolean => {
  return spec.startsWith("./") || spec.startsWith("../") || spec === "." || spec === "..";
};

const defaultResolveRelative = async (fromFile: string, relSpec: string): Promise<string | null> => {
  const baseDir = path.dirname(fromFile);
  const joined = path.resolve(baseDir, relSpec);
  if (path.extname(joined)) {
    if (await Bun.file(joined).exists()) return joined;
    return null;
  }
  for (const ext of CANDIDATE_EXTS) {
    const cand = joined + ext;
    if (await Bun.file(cand).exists()) return cand;
  }
  for (const ext of CANDIDATE_EXTS) {
    const cand = path.join(joined, `index${ext}`);
    if (await Bun.file(cand).exists()) return cand;
  }
  return null;
};
