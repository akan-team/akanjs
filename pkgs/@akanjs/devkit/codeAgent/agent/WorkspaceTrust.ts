import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { McpServerConfig } from "../tools/McpServerConfig";
import { akanCodePaths } from "./akanCodePaths";

export type WorkspaceTrustKind = "mcp" | "extensions";

export interface WorkspaceTrustItem {
  kind: WorkspaceTrustKind;
  lines: string[];
  hash: string;
}

type TrustRecord = Partial<Record<WorkspaceTrustKind, string>>;

// A repo's mcp.json starts processes and its extensions/ load as code, so each waits for a yes to its exact content.
export class WorkspaceTrust {
  static readonly #granted = new Map<string, string>();

  static items(workspaceRoot: string, kinds: WorkspaceTrustKind[] = ["mcp", "extensions"]) {
    return kinds
      .map((kind) => WorkspaceTrust.#itemOf(workspaceRoot, kind))
      .filter((item): item is WorkspaceTrustItem => !!item);
  }

  static pending(workspaceRoot: string, kinds?: WorkspaceTrustKind[]) {
    return WorkspaceTrust.items(workspaceRoot, kinds).filter((item) => !WorkspaceTrust.#approved(workspaceRoot, item));
  }

  static isTrusted(workspaceRoot: string, kind: WorkspaceTrustKind) {
    const item = WorkspaceTrust.#itemOf(workspaceRoot, kind);
    return !item || WorkspaceTrust.#approved(workspaceRoot, item);
  }

  static approve(workspaceRoot: string, items: WorkspaceTrustItem[], remember: boolean) {
    const key = WorkspaceTrust.#keyOf(workspaceRoot);
    for (const item of items) WorkspaceTrust.#granted.set(`${key}\n${item.kind}`, item.hash);
    if (!remember || !items.length) return;
    const all = WorkspaceTrust.#read();
    const record: TrustRecord = { ...all[key] };
    for (const item of items) record[item.kind] = item.hash;
    WorkspaceTrust.#write({ ...all, [key]: record });
  }

  static carry<T>(workspaceRoot: string, kind: WorkspaceTrustKind, edit: () => T): T {
    const before = WorkspaceTrust.#itemOf(workspaceRoot, kind);
    const trusted = !before || WorkspaceTrust.#approved(workspaceRoot, before);
    const remembered = !before || WorkspaceTrust.#read()[WorkspaceTrust.#keyOf(workspaceRoot)]?.[kind] === before.hash;
    const result = edit();
    const after = WorkspaceTrust.#itemOf(workspaceRoot, kind);
    if (trusted && after) WorkspaceTrust.approve(workspaceRoot, [after], remembered);
    return result;
  }

  static #approved(workspaceRoot: string, item: WorkspaceTrustItem) {
    const key = WorkspaceTrust.#keyOf(workspaceRoot);
    return (
      WorkspaceTrust.#granted.get(`${key}\n${item.kind}`) === item.hash ||
      WorkspaceTrust.#read()[key]?.[item.kind] === item.hash
    );
  }

  static #itemOf(workspaceRoot: string, kind: WorkspaceTrustKind): WorkspaceTrustItem | undefined {
    return kind === "mcp" ? WorkspaceTrust.#mcp(workspaceRoot) : WorkspaceTrust.#extensions(workspaceRoot);
  }

  static #mcp(workspaceRoot: string): WorkspaceTrustItem | undefined {
    const servers = McpServerConfig.read(workspaceRoot, ["workspace"]).sort((a, b) => a.name.localeCompare(b.name));
    if (!servers.length) return undefined;
    return {
      kind: "mcp",
      lines: servers.map((ref) => `${ref.name}: ${McpServerConfig.targetOf(ref)}`),
      hash: WorkspaceTrust.#digest(WorkspaceTrust.#canonical(servers)),
    };
  }

  static #extensions(workspaceRoot: string): WorkspaceTrustItem | undefined {
    const dir = akanCodePaths.extensionsDir(workspaceRoot);
    if (!existsSync(dir)) return undefined;
    const files = WorkspaceTrust.#files(dir, "", new Set());
    if (!files.length) return undefined;
    const hash = createHash("sha256");
    for (const file of files) hash.update(`${file.name}\0${WorkspaceTrust.#digest(readFileSync(file.path))}\n`);
    return { kind: "extensions", lines: files.map((file) => file.name), hash: hash.digest("hex") };
  }

  // Links are followed, since the engine follows them too.
  static #files(dir: string, prefix: string, seen: Set<string>): { name: string; path: string }[] {
    let real: string;
    try {
      real = realpathSync(dir);
    } catch {
      return [];
    }
    if (seen.has(real)) return [];
    seen.add(real);
    return readdirSync(dir)
      .filter((entry) => entry !== ".git")
      .sort()
      .flatMap((entry) => {
        const full = path.join(dir, entry);
        const name = prefix ? `${prefix}/${entry}` : entry;
        try {
          const stat = statSync(full);
          if (stat.isDirectory()) return WorkspaceTrust.#files(full, name, seen);
          return stat.isFile() ? [{ name, path: full }] : [];
        } catch {
          return [];
        }
      });
  }

  static #keyOf(workspaceRoot: string) {
    try {
      return realpathSync(workspaceRoot);
    } catch {
      return path.resolve(workspaceRoot);
    }
  }

  static #digest(content: string | Buffer) {
    return createHash("sha256").update(content).digest("hex");
  }

  static #canonical(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map((entry) => WorkspaceTrust.#canonical(entry)).join(",")}]`;
    if (value && typeof value === "object")
      return `{${Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, entry]) => `${JSON.stringify(key)}:${WorkspaceTrust.#canonical(entry)}`)
        .join(",")}}`;
    return JSON.stringify(value);
  }

  static #read(): Record<string, TrustRecord> {
    const file = akanCodePaths.trustFile();
    if (!existsSync(file)) return {};
    try {
      const parsed = JSON.parse(readFileSync(file, "utf8")) as { workspaces?: Record<string, TrustRecord> };
      return parsed.workspaces ?? {};
    } catch {
      return {};
    }
  }

  static #write(workspaces: Record<string, TrustRecord>) {
    akanCodePaths.ensureGlobalDir();
    const file = akanCodePaths.trustFile();
    const temp = `${file}.${process.pid}.tmp`;
    writeFileSync(temp, `${JSON.stringify({ workspaces }, null, 2)}\n`, { mode: 0o600 });
    renameSync(temp, file);
    chmodSync(file, 0o600);
  }
}
