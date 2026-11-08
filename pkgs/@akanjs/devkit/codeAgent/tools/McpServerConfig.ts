import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { CodeAgentMcpServerRef } from "akanjs/common";
import { akanCodePaths } from "../agent/akanCodePaths";

export type McpServerScope = "global" | "workspace";

export interface McpDeclaredServer {
  ref: CodeAgentMcpServerRef;
  disabled: boolean;
  scope: McpServerScope;
}

interface ServerFileEntry {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  type?: string;
  disabled?: boolean;
  headers?: Record<string, string>;
  oauth?: { clientId?: string; clientSecret?: string; scope?: string };
}

interface ServerFile {
  mcpServers?: Record<string, ServerFileEntry>;
  servers?: Record<string, ServerFileEntry>;
}

// Global is the default home: a server's token already lives there, so one declaration serves every checkout.
// VS Code spells the key `servers`; a write keeps the file's own key, or it breaks the editor sharing the file.
export class McpServerConfig {
  static file(workspaceRoot: string, scope: McpServerScope = "workspace") {
    return scope === "global" ? akanCodePaths.globalMcpFile() : akanCodePaths.mcpFile(workspaceRoot);
  }

  /** Both files, in the order they are merged — global first, so the workspace's entry lands on top of it. */
  static files(workspaceRoot: string): { scope: McpServerScope; file: string }[] {
    return [
      { scope: "global", file: McpServerConfig.file(workspaceRoot, "global") },
      { scope: "workspace", file: McpServerConfig.file(workspaceRoot, "workspace") },
    ];
  }

  static read(workspaceRoot: string, scopes?: McpServerScope[]): CodeAgentMcpServerRef[] {
    return McpServerConfig.declared(workspaceRoot, scopes)
      .filter((entry) => !entry.disabled)
      .map((entry) => entry.ref);
  }

  /** Every declared server including the disabled ones, which is what a listing has to show. */
  static declared(workspaceRoot: string, scopes?: McpServerScope[]): McpDeclaredServer[] {
    const byName = new Map<string, McpDeclaredServer>();
    for (const { scope } of McpServerConfig.files(workspaceRoot).filter(
      (file) => !scopes || scopes.includes(file.scope),
    ))
      for (const [name, entry] of Object.entries(McpServerConfig.#parse(workspaceRoot, scope).map))
        byName.set(name, { ref: McpServerConfig.#refOf(name, entry), disabled: !!entry.disabled, scope });
    return [...byName.values()];
  }

  /** Replaces a same-name entry in the target file; a url is an http server, anything else a command and argv. */
  static add(workspaceRoot: string, name: string, target: string[], scope: McpServerScope = "global") {
    const [head, ...rest] = target;
    if (!head) throw new Error("Give the server a command to run, or a url to reach.");
    const entry: ServerFileEntry = /^https?:\/\//.test(head) ? { url: head } : { command: head, args: rest };
    const { file, key, map } = McpServerConfig.#parse(workspaceRoot, scope);
    const next = { ...map, [name]: entry };
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify({ [key]: next }, null, 2)}\n`);
    return McpServerConfig.#refOf(name, entry);
  }

  /** Removes it from the file `only` names, else the workspace file and then the global one; false when none has it. */
  static remove(workspaceRoot: string, name: string, only?: McpServerScope): McpServerScope | false {
    const candidates = McpServerConfig.files(workspaceRoot).filter(({ scope }) => !only || scope === only);
    for (const { scope } of candidates.reverse()) {
      const { file, key, map } = McpServerConfig.#parse(workspaceRoot, scope);
      if (!(name in map)) continue;
      const next = { ...map };
      delete next[name];
      writeFileSync(file, `${JSON.stringify({ [key]: next }, null, 2)}\n`);
      return scope;
    }
    return false;
  }

  static #refOf(name: string, entry: ServerFileEntry): CodeAgentMcpServerRef {
    return {
      name,
      transport: entry.url ? "http" : "stdio",
      ...(entry.command ? { command: entry.command } : {}),
      ...(entry.args ? { args: entry.args } : {}),
      ...(entry.url ? { url: entry.url } : {}),
      ...(entry.env ? { env: entry.env } : {}),
      ...(entry.headers ? { headers: entry.headers } : {}),
      ...(entry.oauth ? { oauth: entry.oauth } : {}),
    };
  }

  static targetOf(ref: CodeAgentMcpServerRef) {
    return ref.url ?? [ref.command, ...(ref.args ?? [])].filter(Boolean).join(" ");
  }

  /** Why a file yielded nothing, when it exists and yielded nothing — a listing has to say which. */
  static problem(workspaceRoot: string) {
    for (const { file } of McpServerConfig.files(workspaceRoot)) {
      if (!existsSync(file)) continue;
      try {
        JSON.parse(readFileSync(file, "utf8"));
      } catch (error) {
        return `${file} is not valid JSON — ${String(error)}`;
      }
    }
    return undefined;
  }

  static #parse(workspaceRoot: string, scope: McpServerScope) {
    const file = McpServerConfig.file(workspaceRoot, scope);
    const empty = { file, key: "mcpServers" as const, map: {} as Record<string, ServerFileEntry> };
    if (!existsSync(file)) return empty;
    try {
      const parsed = JSON.parse(readFileSync(file, "utf8")) as ServerFile;
      if (parsed.servers && !parsed.mcpServers) return { file, key: "servers" as const, map: parsed.servers };
      return { ...empty, map: parsed.mcpServers ?? {} };
    } catch {
      // A malformed file costs its servers, not the session; `problem` is what says so on the listing.
      return empty;
    }
  }
}
