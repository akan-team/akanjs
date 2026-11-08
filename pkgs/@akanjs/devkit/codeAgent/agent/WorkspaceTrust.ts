import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  lstatSync,
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

interface ExtensionWalk {
  root: string;
  files: { name: string; path: string }[];
  bytes: number;
  seen: Set<string>;
  unchecked?: string;
}

const maxExtensionFiles = 10_000;
const maxExtensionBytes = 64 * 1024 * 1024;

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
    const checked = items.filter((item) => item.hash);
    if (!remember || !checked.length) return;
    const all = WorkspaceTrust.#read();
    const record: TrustRecord = { ...all[key] };
    for (const item of checked) record[item.kind] = item.hash;
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
      (!!item.hash && WorkspaceTrust.#read()[key]?.[item.kind] === item.hash)
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

  //? An item without a hash could not be checked: the trust file never keeps it, so it is asked about at every start.
  static #extensions(workspaceRoot: string): WorkspaceTrustItem | undefined {
    const dir = akanCodePaths.extensionsDir(workspaceRoot);
    let root: string;
    try {
      root = realpathSync(dir);
    } catch {
      return undefined;
    }
    const walk: ExtensionWalk = { root, files: [], bytes: 0, seen: new Set() };
    WorkspaceTrust.#walk(walk, dir, "");
    const lines = walk.files.map((file) => file.name);
    if (walk.unchecked) return { kind: "extensions", lines: [walk.unchecked, ...lines], hash: "" };
    if (!walk.files.length) return undefined;
    const hash = createHash("sha256");
    for (const file of walk.files) hash.update(`${file.name}\0${WorkspaceTrust.#digest(readFileSync(file.path))}\n`);
    return { kind: "extensions", lines, hash: hash.digest("hex") };
  }

  // Links are followed while they stay in the folder, since the engine follows them too.
  static #walk(walk: ExtensionWalk, dir: string, prefix: string) {
    let entries: string[];
    try {
      const real = realpathSync(dir);
      if (walk.seen.has(real)) return;
      walk.seen.add(real);
      entries = readdirSync(dir)
        .filter((entry) => entry !== ".git")
        .sort();
    } catch {
      return;
    }
    for (const entry of entries) {
      if (walk.unchecked) return;
      const full = path.join(dir, entry);
      const name = prefix ? `${prefix}/${entry}` : entry;
      try {
        if (lstatSync(full).isSymbolicLink() && !WorkspaceTrust.#inside(walk.root, realpathSync(full))) {
          walk.unchecked = `${name} links out of the folder: it cannot be checked, so it is asked about at every start`;
          return;
        }
        const stat = statSync(full);
        if (stat.isDirectory()) WorkspaceTrust.#walk(walk, full, name);
        else if (stat.isFile()) {
          walk.files.push({ name, path: full });
          walk.bytes += stat.size;
          if (walk.files.length > maxExtensionFiles || walk.bytes > maxExtensionBytes)
            walk.unchecked = `more than ${maxExtensionFiles} files or ${maxExtensionBytes >> 20} MiB: too many to check, so asked about at every start`;
        }
      } catch {}
    }
  }

  static #inside(root: string, real: string) {
    const relative = path.relative(root, real);
    return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
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
