import { describe, expect, test } from "bun:test";
import type { McpDeclaredServer } from "@akanjs/devkit/codeAgent/tools/McpServerConfig";
import type { CodeAgentMcpServerRef, CodeAgentMcpStatus } from "akanjs/common";
import { CodeTuiMcp, type CodeTuiMcpView } from "./CodeTuiMcp";

const file = "/repo/.akan/code/mcp.json";
const globalFile = "/home/me/.akan/code/mcp.json";

const declared = (entry: CodeAgentMcpServerRef, patch: Partial<McpDeclaredServer> = {}): McpDeclaredServer => ({
  ref: entry,
  disabled: false,
  scope: "workspace",
  ...patch,
});

const ref = (name: string, patch: Partial<CodeAgentMcpServerRef> = {}): CodeAgentMcpServerRef => ({
  name,
  transport: "stdio",
  command: "npx",
  args: ["-y", `server-${name}`],
  ...patch,
});

const live = (name: string, patch: Partial<CodeAgentMcpStatus> = {}): CodeAgentMcpStatus => ({
  name,
  transport: "stdio",
  target: `npx -y server-${name}`,
  tools: [`mcp__${name}__search`, `mcp__${name}__read`],
  ...patch,
});

const view = (patch: Partial<CodeTuiMcpView> = {}): CodeTuiMcpView => ({
  status: [],
  declared: [],
  files: [
    { scope: "global", file: globalFile },
    { scope: "workspace", file },
  ],
  ...patch,
});

describe("/mcp", () => {
  test("each server says which file declares it, and both files are named", () => {
    const text = CodeTuiMcp.list(
      view({
        status: [live("office"), live("repobot")],
        declared: [declared(ref("office"), { scope: "global" }), declared(ref("repobot"))],
      }),
    );
    expect(text).toMatch(/office\s+global/);
    expect(text).toMatch(/repobot\s+workspace/);
    expect(text).toContain(globalFile);
    expect(text).toContain(file);
  });

  test("nothing declared says where to declare one", () => {
    const text = CodeTuiMcp.list(view());
    expect(text).toContain("No MCP server is declared.");
    expect(text).toContain(file);
    expect(text).toContain("/mcp add");
    expect(text).toContain("/mcp login");
  });

  test("a connected server reads as its transport, its target and its tool count", () => {
    const text = CodeTuiMcp.list(view({ status: [live("github")], declared: [declared(ref("github"))] }));
    expect(text).toContain("1 server");
    expect(text).toMatch(/github\s+workspace\s+stdio\s+npx -y server-github\s+2 tools/);
  });

  test("one tool is not 'tools'", () => {
    const status = live("solo", { tools: ["mcp__solo__go"] });
    expect(CodeTuiMcp.list(view({ status: [status], declared: [declared(ref("solo"))] }))).toContain("1 tool");
  });

  test("an unreachable server says why rather than going missing", () => {
    const status = live("linear", { transport: "http", target: "https://x", tools: [], error: "fetch failed" });
    const text = CodeTuiMcp.list(view({ status: [status], declared: [declared(ref("linear"))] }));
    expect(text).toContain("unreachable — fetch failed");
  });

  // The session's tool allowlist is built once, so a server added to the file afterwards is declared but not connected.
  test("a server the file gained after this session started asks for a reload", () => {
    const text = CodeTuiMcp.list(view({ status: [live("github")], declared: [declared(ref("new"))] }));
    expect(text).toContain("declared · /mcp reload to connect");
    expect(text).toMatch(/github\s+stdio\s+npx -y server-github\s+2 tools · removed from the file/);
  });

  test("a server this repo declares and nobody approved says so, and a home one is unaffected", () => {
    const text = CodeTuiMcp.list(
      view({
        workspaceApproved: false,
        declared: [declared(ref("repo")), declared(ref("home"), { scope: "global" })],
      }),
    );
    expect(text).toMatch(/repo\s+workspace\s+stdio\s+npx -y server-repo\s+not approved/);
    expect(text).toMatch(/home\s+global\s+stdio\s+npx -y server-home\s+declared · \/mcp reload to connect/);
  });

  test("a server removed from the file is still the one this session is holding", () => {
    expect(CodeTuiMcp.list(view({ status: [live("github")] }))).toContain("removed from the file");
  });

  test("a disabled entry is neither connected nor a failure", () => {
    const text = CodeTuiMcp.list(view({ declared: [declared(ref("off"), { disabled: true })] }));
    const row = text.split("\n").find((line) => line.startsWith("off"));
    expect(row).toContain("disabled in the file");
    expect(row).not.toContain("reload");
  });

  test("a server asking for sign-in is not reported as broken", () => {
    const status = live("linear", { transport: "http", target: "https://x", tools: [], auth: "required" });
    const text = CodeTuiMcp.list(view({ status: [status], declared: [declared(ref("linear"))] }));
    expect(text).toContain("sign-in needed · /mcp login linear");
    expect(text).not.toContain("unreachable");
  });

  test("a signed-in server says so beside its tool count", () => {
    const status = live("github", { auth: "authorized" });
    const text = CodeTuiMcp.list(view({ status: [status], declared: [declared(ref("github"))] }));
    expect(text).toContain("2 tools · signed in");
  });

  test("a server needing no credential says nothing about one", () => {
    const status = live("local", { auth: "none" });
    const text = CodeTuiMcp.list(view({ status: [status], declared: [declared(ref("local"))] }));
    expect(text).not.toContain("signed in");
    expect(text).not.toContain("sign-in");
  });

  test("a broken file is named above the list rather than read as an empty one", () => {
    expect(CodeTuiMcp.list(view({ problem: `${file} is not valid JSON — oops` }))).toContain("is not valid JSON");
  });

  test("servers are listed by name, so the order does not move between runs", () => {
    const text = CodeTuiMcp.list(
      view({
        status: [live("zulip"), live("github")],
        declared: [declared(ref("zulip")), declared(ref("github"))],
      }),
    );
    expect(text.indexOf("github")).toBeLessThan(text.indexOf("zulip"));
  });

  test("one server's tools are named the way the model sees them", () => {
    expect(CodeTuiMcp.tools(live("github"))).toContain("mcp__github__search");
    expect(CodeTuiMcp.tools(live("x", { tools: [], error: "no" }))).toContain("unreachable");
    expect(CodeTuiMcp.tools(live("x", { tools: [] }))).toContain("published no tools");
  });

  test("one server that needs a sign-in says so instead of listing tools that cannot answer", () => {
    const refused = live("linear", { transport: "http", target: "https://x", auth: "required" });
    expect(CodeTuiMcp.tools(refused)).toBe("linear needs signing in — /mcp login linear");
    expect(CodeTuiMcp.tools({ ...refused, tools: [] })).toBe("linear needs signing in — /mcp login linear");
  });

  test("a name that would collide inside a tool name is refused", () => {
    expect(CodeTuiMcp.namePattern.test("my-server_2")).toBe(true);
    for (const name of ["my server", "a.b", "a/b", ""]) expect(CodeTuiMcp.namePattern.test(name)).toBe(false);
  });
});
