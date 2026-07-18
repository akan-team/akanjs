import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const BARREL_FACETS = new Set(["common", "srvkit", "ui", "webkit", "plugin"]);
const FACET_SOURCE_FILE_RE = /\.(ts|tsx)$/;
const FACET_EXCLUDED_FILE_RE = /(^index\.tsx?$|\.d\.ts$|\.(test|spec)\.(ts|tsx)$|\.css$|\.scss$|\.sass$)/;
// `ui` exports PascalCase names only; `common`/`srvkit`/`webkit` export camelCase names only. Names with
// dots, underscores, or hyphens (e.g. `foo.helper`, `Globe_Dynamic`, `kebab-case`) match neither and are skipped.
const FACET_PASCAL_CASE_RE = /^[A-Z][A-Za-z0-9]*$/;
const FACET_CAMEL_CASE_RE = /^[a-z][A-Za-z0-9]*$/;
const MODULE_UI_TYPES = ["Template", "Unit", "Util", "View", "Zone"] as const;
const SERVICE_UI_TYPES = ["Util", "Zone"] as const;
const SCALAR_UI_TYPES = ["Template", "Unit"] as const;

export interface GeneratedIndexSyncResult {
  changedFiles: string[];
  errors: string[];
}

export interface DevGeneratedIndexSyncOptions {
  workspaceRoot: string;
}

export class DevGeneratedIndexSync {
  readonly #workspaceRoot: string;

  constructor({ workspaceRoot }: DevGeneratedIndexSyncOptions) {
    this.#workspaceRoot = path.resolve(workspaceRoot);
  }

  async syncForBatch(files: string[]): Promise<GeneratedIndexSyncResult> {
    const indexPaths = new Set<string>();
    const errors: string[] = [];

    for (const file of files) {
      const facetIndex = this.#facetIndexFor(file);
      if (facetIndex) indexPaths.add(facetIndex);
      const moduleIndex = await this.#moduleIndexForDirectoryEvent(file).catch((err) => {
        errors.push(`[generated-index] module detection failed for ${file}: ${formatError(err)}`);
        return null;
      });
      if (moduleIndex) indexPaths.add(moduleIndex);
    }

    const changedFiles: string[] = [];
    for (const indexPath of [...indexPaths].sort()) {
      try {
        const changed = await this.#syncIndex(indexPath);
        if (changed) changedFiles.push(indexPath);
      } catch (err) {
        errors.push(`[generated-index] sync failed for ${indexPath}: ${formatError(err)}`);
      }
    }

    return { changedFiles, errors };
  }

  #facetIndexFor(file: string): string | null {
    const abs = path.resolve(file);
    const rel = path.relative(this.#workspaceRoot, abs);
    if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
    const parts = rel.split(path.sep).filter(Boolean);
    if (parts.length < 4) return null;
    const [scope, project, facet, child] = parts;
    if ((scope !== "apps" && scope !== "libs") || !project || !facet || !BARREL_FACETS.has(facet)) return null;
    if (!child || child.startsWith(".") || child === "index.ts" || child === "index.tsx") return null;
    return path.join(this.#workspaceRoot, scope, project, facet, "index.ts");
  }

  async #moduleIndexForDirectoryEvent(file: string): Promise<string | null> {
    const abs = path.resolve(file);
    const rel = path.relative(this.#workspaceRoot, abs);
    if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
    const parts = rel.split(path.sep).filter(Boolean);
    if (parts.length !== 4 && parts.length !== 5) return null;
    const [scope, project, libSegment, moduleSegment, scalarSegment] = parts;
    if ((scope !== "apps" && scope !== "libs") || !project || libSegment !== "lib") return null;

    const isExistingDirectory = await stat(abs)
      .then((s) => s.isDirectory())
      .catch(() => false);
    const looksLikeDeletedDirectory = !path.extname(abs);
    if (!isExistingDirectory && !looksLikeDeletedDirectory) return null;

    if (moduleSegment === "__scalar" && scalarSegment) {
      return path.join(this.#workspaceRoot, scope, project, "lib", "__scalar", scalarSegment, "index.ts");
    }
    if (!moduleSegment || moduleSegment === "__scalar") return null;
    return path.join(this.#workspaceRoot, scope, project, "lib", moduleSegment, "index.ts");
  }

  async #syncIndex(indexPath: string): Promise<boolean> {
    const dir = path.dirname(indexPath);
    const content = await this.#contentForIndex(indexPath);
    if (content === null) {
      if (!(await exists(indexPath))) return false;
      await rm(indexPath, { force: true });
      return true;
    }

    const current = await readFile(indexPath, "utf8").catch(() => null);
    if (current === content) return false;
    await mkdir(dir, { recursive: true });
    await writeFile(indexPath, content);
    return true;
  }

  async #contentForIndex(indexPath: string): Promise<string | null> {
    const parts = path.relative(this.#workspaceRoot, indexPath).split(path.sep).filter(Boolean);
    const facet = parts.at(-2);
    if (facet && BARREL_FACETS.has(facet)) return this.#facetContent(path.dirname(indexPath));
    return this.#moduleContent(path.dirname(indexPath));
  }

  async #facetContent(dir: string): Promise<string | null> {
    const nameCasePattern = path.basename(dir) === "ui" ? FACET_PASCAL_CASE_RE : FACET_CAMEL_CASE_RE;
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    const exportNames = entries
      .flatMap((entry) => {
        const name = entry.name;
        if (name.startsWith(".")) return [];
        if (entry.isDirectory()) return nameCasePattern.test(name) ? [name] : [];
        if (!entry.isFile()) return [];
        if (!FACET_SOURCE_FILE_RE.test(name) || FACET_EXCLUDED_FILE_RE.test(name)) return [];
        const exportName = name.replace(FACET_SOURCE_FILE_RE, "");
        return nameCasePattern.test(exportName) ? [exportName] : [];
      })
      .sort();
    if (exportNames.length === 0) return null;
    return `${exportNames.map((name) => `export * from "./${name}";`).join("\n")}\n`;
  }

  async #moduleContent(dir: string): Promise<string | null> {
    const rel = path.relative(this.#workspaceRoot, dir);
    const parts = rel.split(path.sep).filter(Boolean);
    const moduleSegment = parts.at(-1);
    if (!moduleSegment) return null;
    const isScalar = parts.at(-2) === "__scalar";
    const rawModel = moduleSegment.startsWith("_") ? moduleSegment.slice(1) : moduleSegment;
    if (!rawModel) return null;
    const modelName = capitalize(rawModel);
    const allowedTypes = isScalar
      ? SCALAR_UI_TYPES
      : moduleSegment.startsWith("_")
        ? SERVICE_UI_TYPES
        : MODULE_UI_TYPES;
    const fileTypes: string[] = [];
    for (const type of allowedTypes) {
      if (await exists(path.join(dir, `${modelName}.${type}.tsx`))) fileTypes.push(type);
    }
    if (fileTypes.length === 0) return null;
    return `\n${fileTypes.map((type) => `import * as ${type} from "./${modelName}.${type}";`).join("\n")}\n\nexport const ${modelName} = { ${fileTypes.join(", ")} };`;
  }
}

const exists = async (file: string) =>
  stat(file)
    .then(() => true)
    .catch(() => false);

const capitalize = (value: string) => `${value.charAt(0).toUpperCase()}${value.slice(1)}`;

const formatError = (err: unknown) => (err instanceof Error ? err.message : String(err));
