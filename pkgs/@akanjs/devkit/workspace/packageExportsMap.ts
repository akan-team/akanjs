import { statSync } from "node:fs";
import path from "node:path";

export interface UnreachableSubpath {
  subpath: string;
  /** The path the `exports` map yields, or null when no entry matches the subpath at all. */
  target: string | null;
}

// Bun matches exports targets exactly (no extension, no index.ts), while this monorepo resolves `akanjs/*` through
// tsconfig paths, which probe both — so a broken map passes every in-repo test and fails for every installer.
export class PackageExportsMap {
  static async from(packageDir: string) {
    const manifest = (await Bun.file(path.join(packageDir, "package.json")).json()) as { exports?: unknown };
    return new PackageExportsMap(packageDir, manifest.exports);
  }
  /** Picks the target a runtime import would follow, walking conditional objects in Bun's order. */
  static #runtimeTargetOf(value: unknown): string | null {
    if (typeof value === "string") return value;
    if (Array.isArray(value)) {
      // Bun takes the first entry and stops; it does not fall through on a missing file.
      for (const entry of value) {
        const target = PackageExportsMap.#runtimeTargetOf(entry);
        if (target) return target;
      }
      return null;
    }
    if (!value || typeof value !== "object") return null;
    const conditions = value as Record<string, unknown>;
    for (const condition of ["bun", "import", "default", "require", "types"]) {
      if (!(condition in conditions)) continue;
      const target = PackageExportsMap.#runtimeTargetOf(conditions[condition]);
      if (target) return target;
    }
    return null;
  }
  #packageDir: string;
  #literals = new Map<string, string>();
  #patterns: { prefix: string; suffix: string; target: string }[] = [];
  constructor(packageDir: string, exportsField: unknown) {
    this.#packageDir = packageDir;
    if (!exportsField || typeof exportsField !== "object") return;
    for (const [key, value] of Object.entries(exportsField as Record<string, unknown>)) {
      if (!key.startsWith(".")) continue; // a bare conditional map has no subpaths to check
      const target = PackageExportsMap.#runtimeTargetOf(value);
      if (!target) continue;
      const star = key.indexOf("*");
      if (star === -1) this.#literals.set(key, target);
      else this.#patterns.push({ prefix: key.slice(0, star), suffix: key.slice(star + 1), target });
    }
    // Node picks the most specific pattern: longest prefix first, then longest suffix. So `./*.ts`
    // wins over `./*`, which is what keeps an already-suffixed specifier from gaining a second `.ts`.
    this.#patterns.sort((a, b) => b.prefix.length - a.prefix.length || b.suffix.length - a.suffix.length);
  }
  resolve(subpath: string): string | null {
    const literal = this.#literals.get(subpath);
    if (literal) return literal;
    for (const { prefix, suffix, target } of this.#patterns) {
      if (!subpath.startsWith(prefix) || !subpath.endsWith(suffix)) continue;
      if (subpath.length < prefix.length + suffix.length) continue;
      return target.replace(/\*/g, subpath.slice(prefix.length, subpath.length - suffix.length));
    }
    return null;
  }
  // A directory does not count: `{"./*": "./*"}` maps `./commandDecorators` onto a folder, which is not importable.
  resolveToFile(subpath: string): { target: string | null; exists: boolean } {
    const target = this.resolve(subpath);
    if (!target) return { target: null, exists: false };
    const stat = statSync(path.join(this.#packageDir, target), { throwIfNoEntry: false });
    return { target, exists: !!stat?.isFile() };
  }
  findUnreachable(subpaths: Iterable<string>): UnreachableSubpath[] {
    const unreachable: UnreachableSubpath[] = [];
    for (const subpath of subpaths) {
      const { target, exists } = this.resolveToFile(subpath);
      if (!exists) unreachable.push({ subpath, target });
    }
    return unreachable;
  }
}
