import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

export interface AkanContextFile {
  path: string;
  content: string;
}

export interface AkanContextFilesOptions {
  workspaceRoot: string;
  cwd: string;
}

// The engine takes only the first of `AGENTS.override.md · AGENTS.md · CLAUDE.md` per directory and never reads
// `.cursor/rules`; this appends what it drops, after the engine's own list.
export class AkanContextFiles {
  /** Cursor's frontmatter block, which is metadata for its own rule picker and not instruction for a model. */
  static readonly #frontmatter = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

  static extend(base: AkanContextFile[], options: AkanContextFilesOptions): AkanContextFile[] {
    const seen = new Set(base.map((file) => file.path));
    // Keyed by content too: the usual way to carry both names is a symlink or a one-line pointer.
    const contents = new Set(base.map((file) => file.content.trim()));
    const added: AkanContextFile[] = [];
    for (const file of [...AkanContextFiles.#claude(base), ...AkanContextFiles.#cursor(options)]) {
      if (seen.has(file.path) || contents.has(file.content.trim()) || !file.content.trim()) continue;
      seen.add(file.path);
      contents.add(file.content.trim());
      added.push(file);
    }
    return [...base, ...added];
  }

  // Not beside an `AGENTS.override.md`: that file exists to displace the others in its directory.
  static #claude(base: AkanContextFile[]) {
    const files: AkanContextFile[] = [];
    for (const file of base) {
      if (!/^AGENTS\.(md|MD)$/.test(path.basename(file.path))) continue;
      for (const name of ["CLAUDE.md", "CLAUDE.MD"]) {
        const candidate = path.join(path.dirname(file.path), name);
        const content = AkanContextFiles.#read(candidate);
        if (content !== undefined) files.push({ path: candidate, content });
      }
    }
    return files;
  }

  // Only `alwaysApply: true` or frontmatter-less rules: Cursor's `globs`/`description`/manual kinds are scoped.
  static #cursor(options: AkanContextFilesOptions) {
    const files: AkanContextFile[] = [];
    const roots = [...new Set([options.workspaceRoot, options.cwd])];
    for (const root of roots) {
      const legacy = AkanContextFiles.#read(path.join(root, ".cursorrules"));
      if (legacy !== undefined) files.push({ path: path.join(root, ".cursorrules"), content: legacy });
      for (const file of AkanContextFiles.#mdcFiles(path.join(root, ".cursor", "rules"))) {
        const raw = AkanContextFiles.#read(file);
        if (raw === undefined) continue;
        const body = AkanContextFiles.#applied(raw);
        if (body !== undefined) files.push({ path: file, content: body });
      }
    }
    return files;
  }

  static #applied(raw: string) {
    const match = AkanContextFiles.#frontmatter.exec(raw);
    if (!match) return raw;
    if (!/^\s*alwaysApply\s*:\s*true\s*$/m.test(match[1] ?? "")) return undefined;
    return raw.slice(match[0].length);
  }

  /** Sorted, because the order rules reach the model in is otherwise the order a directory happens to list. */
  static #mdcFiles(dir: string) {
    if (!existsSync(dir)) return [];
    try {
      return readdirSync(dir, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith(".mdc"))
        .map((entry) => path.join(entry.parentPath ?? dir, entry.name))
        .sort();
    } catch {
      return [];
    }
  }

  static #read(file: string) {
    try {
      if (!existsSync(file) || !statSync(file).isFile()) return undefined;
      return readFileSync(file, "utf8").replace(/^﻿/, "");
    } catch {
      // A rule file that cannot be read costs its own rules. It must not cost the session its start.
      return undefined;
    }
  }
}
