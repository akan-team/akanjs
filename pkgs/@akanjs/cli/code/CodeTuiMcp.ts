import type { McpDeclaredServer, McpServerScope } from "@akanjs/devkit/codeAgent/tools/McpServerConfig";
import type { CodeAgentMcpServerRef, CodeAgentMcpStatus } from "akanjs/common";

export interface CodeTuiMcpView {
  status: CodeAgentMcpStatus[]; // the servers the session connected to when created, each with its sign-in state now
  declared: McpDeclaredServer[]; // what the files say now
  files: { scope: McpServerScope; file: string }[];
  problem?: string;
  workspaceApproved?: boolean;
}

interface McpRow {
  ref?: CodeAgentMcpServerRef;
  disabled?: boolean;
  scope?: McpServerScope;
  live?: CodeAgentMcpStatus;
  unapproved?: boolean;
}

export class CodeTuiMcp {
  /** Written into a tool name as `mcp__<name>__<tool>`, so two names that sanitize alike shadow each other. */
  static readonly namePattern = /^[a-zA-Z0-9_-]+$/;

  static readonly usage = [
    "/mcp add <name> <command> [args…]   declare a server this session starts",
    "/mcp add <name> <https://…>         declare one it reaches over http",
    "/mcp add --local <name> …           declare it for this repo only, not every repo",
    "/mcp login <name>                   sign in through the browser (OAuth)",
    "/mcp logout <name>                  forget the token, leaving the server declared",
    "/mcp remove <name>                  undeclare it, from this repo's file first",
    "/mcp remove --local <name>          undeclare it from this repo's file only",
    "/mcp reload                         reopen this session so the file takes effect",
  ];

  static #where(view: CodeTuiMcpView) {
    return view.files.map(({ scope, file }) => `${scope.padEnd(11)}${file}`);
  }

  static list(view: CodeTuiMcpView) {
    const lines = view.problem ? [view.problem, ""] : [];
    const rows = CodeTuiMcp.#rows(view);
    if (!rows.length)
      return [
        ...lines,
        "No MCP server is declared.",
        "",
        "Declare one here, or paste an editor's `mcpServers` block into either file:",
        ...CodeTuiMcp.#where(view),
        "",
        ...CodeTuiMcp.usage,
      ].join("\n");
    const width = (at: number) => Math.max(...rows.map((row) => (row[at] ?? "").length)) + 2;
    const [name, scope, transport, target] = [width(0), width(1), width(2), width(3)];
    return [
      ...lines,
      `${rows.length} server${rows.length === 1 ? "" : "s"}`,
      "",
      ...rows.map(
        ([a, b, c, d, e]) =>
          `${(a ?? "").padEnd(name)}${(b ?? "").padEnd(scope)}${(c ?? "").padEnd(transport)}${(d ?? "").padEnd(target)}${e ?? ""}`,
      ),
      "",
      ...CodeTuiMcp.#where(view),
      "",
      ...CodeTuiMcp.usage,
    ].join("\n");
  }

  static #rows(view: CodeTuiMcpView) {
    const byName = new Map<string, McpRow>();
    for (const entry of view.declared)
      byName.set(entry.ref.name, {
        ref: entry.ref,
        disabled: entry.disabled,
        scope: entry.scope,
        unapproved: entry.scope === "workspace" && view.workspaceApproved === false,
      });
    for (const live of view.status) byName.set(live.name, { ...byName.get(live.name), live });
    return [...byName]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, entry]) => {
        const transport = entry.live?.transport ?? entry.ref?.transport ?? "";
        const target = entry.live?.target ?? CodeTuiMcp.targetOf(entry.ref);
        return [name, entry.scope ?? "", transport, target, CodeTuiMcp.#stateOf(entry)];
      });
  }

  static #stateOf(entry: McpRow) {
    if (entry.disabled) return "disabled in the file";
    if (entry.unapproved && !entry.live) return "not approved · restart akan code to approve it";
    if (!entry.live) return "declared · /mcp reload to connect";
    // Before the error branch: a 401 is a server answering correctly, not a broken one.
    if (entry.live.auth === "required") return `sign-in needed · /mcp login ${entry.live.name}`;
    if (entry.live.error) return `unreachable — ${entry.live.error}`;
    const tools = `${entry.live.tools.length} tool${entry.live.tools.length === 1 ? "" : "s"}`;
    if (!entry.ref) return `${tools} · removed from the file`;
    return entry.live.auth === "authorized" ? `${tools} · signed in` : tools;
  }

  static targetOf(ref: CodeAgentMcpServerRef | undefined) {
    if (!ref) return "";
    return ref.url ?? [ref.command, ...(ref.args ?? [])].filter(Boolean).join(" ");
  }

  static tools(status: CodeAgentMcpStatus) {
    if (status.error) return `${status.name} is unreachable — ${status.error}`;
    if (status.auth === "required") return `${status.name} needs signing in — /mcp login ${status.name}`;
    if (!status.tools.length) return `${status.name} connected and published no tools.`;
    return [`${status.name} · ${status.target}`, "", status.tools.join("\n")].join("\n");
  }
}
