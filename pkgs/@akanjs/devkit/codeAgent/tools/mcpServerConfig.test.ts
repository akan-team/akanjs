import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { akanCodePaths } from "../agent/akanCodePaths";
import { WorkspaceTrust } from "../agent/WorkspaceTrust";
import { McpServerConfig, type McpServerScope } from "./McpServerConfig";

const roots: string[] = [];

// Without this every add() writes into the real ~/.akan/code/mcp.json of whoever runs the suite.
beforeAll(() => {
  const home = mkdtempSync(path.join(tmpdir(), "akan-home-"));
  roots.push(home);
  process.env.AKAN_CODE_HOME = home;
  expect(akanCodePaths.globalMcpFile().startsWith(home)).toBe(true);
});

const globalFile = (file: string) => {
  const target = akanCodePaths.globalMcpFile();
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, file);
};

const workspace = (file?: string) => {
  const root = mkdtempSync(path.join(tmpdir(), "akan-mcp-"));
  roots.push(root);
  if (file === undefined) return root;
  const target = McpServerConfig.file(root);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, file);
  return root;
};

const written = (root: string) =>
  JSON.parse(readFileSync(McpServerConfig.file(root), "utf8")) as Record<string, object>;

afterEach(() => {
  rmSync(akanCodePaths.globalMcpFile(), { force: true });
  for (const root of roots.slice(1)) rmSync(root, { recursive: true, force: true });
  roots.splice(1);
});

describe("MCP server config", () => {
  test("an editor's own block is read as it is written", () => {
    const root = workspace(
      JSON.stringify({
        mcpServers: {
          github: { command: "npx", args: ["-y", "@modelcontextprotocol/server-github"] },
          linear: { url: "https://mcp.linear.app/sse" },
        },
      }),
    );
    expect(McpServerConfig.read(root)).toEqual([
      { name: "github", transport: "stdio", command: "npx", args: ["-y", "@modelcontextprotocol/server-github"] },
      { name: "linear", transport: "http", url: "https://mcp.linear.app/sse" },
    ]);
  });

  test("a static token and a hand-issued oauth client travel from the file", () => {
    const root = workspace(
      JSON.stringify({
        mcpServers: {
          sentry: {
            url: "https://mcp.sentry.dev/mcp",
            headers: { "x-api-key": "from-the-file" },
            oauth: { clientId: "abc", scope: "project:read" },
          },
        },
      }),
    );
    expect(McpServerConfig.read(root)[0]).toMatchObject({
      headers: { "x-api-key": "from-the-file" },
      oauth: { clientId: "abc", scope: "project:read" },
    });
  });

  test("a disabled server is declared but never connected", () => {
    const root = workspace(JSON.stringify({ mcpServers: { off: { command: "x", disabled: true } } }));
    expect(McpServerConfig.read(root)).toEqual([]);
    expect(McpServerConfig.declared(root)).toEqual([
      { ref: { name: "off", transport: "stdio", command: "x" }, disabled: true, scope: "workspace" },
    ]);
  });

  test("a url is an http server and anything else is a command with its argv", () => {
    const root = workspace();
    expect(McpServerConfig.add(root, "linear", ["https://mcp.linear.app/sse"], "workspace")).toEqual({
      name: "linear",
      transport: "http",
      url: "https://mcp.linear.app/sse",
    });
    expect(McpServerConfig.add(root, "github", ["npx", "-y", "server-github"], "workspace")).toEqual({
      name: "github",
      transport: "stdio",
      command: "npx",
      args: ["-y", "server-github"],
    });
    expect(Object.keys(written(root).mcpServers ?? {})).toEqual(["linear", "github"]);
  });

  test("a VS Code file keeps its own spelling through a write", () => {
    const root = workspace(JSON.stringify({ servers: { a: { command: "a" } } }));
    McpServerConfig.add(root, "b", ["b"], "workspace");
    const file = written(root);
    expect(Object.keys(file)).toEqual(["servers"]);
    expect(Object.keys(file.servers ?? {})).toEqual(["a", "b"]);
  });

  test("adding the same name twice replaces the entry rather than doubling it", () => {
    const root = workspace();
    McpServerConfig.add(root, "a", ["old"], "workspace");
    McpServerConfig.add(root, "a", ["new", "--flag"], "workspace");
    expect(McpServerConfig.read(root)).toEqual([{ name: "a", transport: "stdio", command: "new", args: ["--flag"] }]);
  });

  test("removing says whether it removed anything", () => {
    const root = workspace(JSON.stringify({ mcpServers: { a: { command: "a" } } }));
    expect(McpServerConfig.remove(root, "nope")).toBe(false);
    expect(McpServerConfig.remove(root, "a")).toBe("workspace");
    expect(McpServerConfig.read(root)).toEqual([]);
  });

  test("a server with nothing to reach it by is refused", () => {
    expect(() => McpServerConfig.add(workspace(), "a", [], "workspace")).toThrow();
  });

  test("a malformed file costs its servers and is named rather than thrown", () => {
    const root = workspace("{ not json");
    expect(McpServerConfig.read(root)).toEqual([]);
    expect(McpServerConfig.problem(root)).toContain("not valid JSON");
  });

  test("no file at all is not a problem", () => {
    const root = workspace();
    expect(McpServerConfig.read(root)).toEqual([]);
    expect(McpServerConfig.problem(root)).toBeUndefined();
  });

  test("a server declared in the home file is read from a workspace that declares nothing", () => {
    globalFile(JSON.stringify({ mcpServers: { office: { url: "https://office.example/mcp" } } }));
    const root = workspace();
    expect(McpServerConfig.read(root)).toEqual([
      { name: "office", transport: "http", url: "https://office.example/mcp" },
    ]);
    expect(McpServerConfig.declared(root)[0]?.scope).toBe("global");
  });

  test("both files are merged, and the workspace wins the name they share", () => {
    globalFile(JSON.stringify({ mcpServers: { office: { url: "https://home/mcp" }, shared: { command: "home" } } }));
    const root = workspace(JSON.stringify({ mcpServers: { shared: { command: "repo" } } }));
    expect(McpServerConfig.declared(root).map((entry) => [entry.ref.name, entry.scope])).toEqual([
      ["office", "global"],
      ["shared", "workspace"],
    ]);
    expect(McpServerConfig.read(root).find((ref) => ref.name === "shared")?.command).toBe("repo");
  });

  test("a write goes to the scope it was asked for, and leaves the other file alone", () => {
    const root = workspace();
    McpServerConfig.add(root, "office", ["https://office.example/mcp"]);
    expect(McpServerConfig.declared(root)).toEqual([
      {
        ref: { name: "office", transport: "http", url: "https://office.example/mcp" },
        disabled: false,
        scope: "global",
      },
    ]);
    expect(existsSync(McpServerConfig.file(root, "workspace"))).toBe(false);
  });

  test("removing finds the file the server is actually in", () => {
    globalFile(JSON.stringify({ mcpServers: { office: { command: "x" } } }));
    const root = workspace(JSON.stringify({ mcpServers: { repobot: { command: "y" } } }));
    expect(McpServerConfig.remove(root, "office")).toBe("global");
    expect(McpServerConfig.remove(root, "repobot")).toBe("workspace");
    expect(McpServerConfig.read(root)).toEqual([]);
  });

  test("removing a name both files declare takes the workspace's, and the home file's then applies", () => {
    globalFile(JSON.stringify({ mcpServers: { shared: { command: "home" } } }));
    const root = workspace(JSON.stringify({ mcpServers: { shared: { command: "repo" } } }));
    expect(McpServerConfig.remove(root, "shared")).toBe("workspace");
    expect(McpServerConfig.declared(root)).toEqual([
      { ref: { name: "shared", transport: "stdio", command: "home" }, disabled: false, scope: "global" },
    ]);
  });

  test("a remove that names a scope touches only that file", () => {
    globalFile(JSON.stringify({ mcpServers: { office: { command: "x" }, shared: { command: "home" } } }));
    const root = workspace(JSON.stringify({ mcpServers: { shared: { command: "repo" } } }));
    expect(McpServerConfig.remove(root, "office", "workspace")).toBe(false);
    expect(McpServerConfig.remove(root, "shared", "global")).toBe("global");
    expect(McpServerConfig.declared(root).map((entry) => [entry.ref.name, entry.scope])).toEqual([
      ["office", "global"],
      ["shared", "workspace"],
    ]);
  });

  test("a scope is what a caller names, never guessed from the shape", () => {
    const root = workspace();
    const scopes: McpServerScope[] = ["global", "workspace"];
    for (const scope of scopes) McpServerConfig.add(root, `in-${scope}`, ["x"], scope);
    expect(McpServerConfig.declared(root).map((entry) => entry.scope)).toEqual(["global", "workspace"]);
  });

  test("a server reads back as the one line it is reached at", () => {
    expect(McpServerConfig.targetOf({ name: "a", transport: "stdio", command: "npx", args: ["-y", "x"] })).toBe(
      "npx -y x",
    );
    expect(McpServerConfig.targetOf({ name: "a", transport: "http", url: "https://x" })).toBe("https://x");
  });
});

describe("workspace trust", () => {
  const extension = (root: string, name: string, body: string) => {
    const file = path.join(akanCodePaths.extensionsDir(root), name);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, body);
  };

  afterEach(() => {
    rmSync(akanCodePaths.trustFile(), { force: true });
  });

  test("a repo with no servers or extensions of its own needs no approval", () => {
    const root = workspace();
    McpServerConfig.add(root, "home", ["https://home.example/mcp"], "global");
    expect(WorkspaceTrust.pending(root)).toEqual([]);
    expect(WorkspaceTrust.isTrusted(root, "mcp")).toBe(true);
  });

  test("the repo's servers and extensions wait for approval, and a remembered one stays approved", () => {
    const root = workspace(JSON.stringify({ mcpServers: { tool: { command: "node", args: ["x.js"] } } }));
    extension(root, "hello.ts", "export default () => {};");
    expect(WorkspaceTrust.pending(root).map((item) => item.kind)).toEqual(["mcp", "extensions"]);
    expect(WorkspaceTrust.pending(root)[0]?.lines).toEqual(["tool: node x.js"]);
    WorkspaceTrust.approve(root, WorkspaceTrust.pending(root), true);
    expect(WorkspaceTrust.pending(root)).toEqual([]);
    expect(Object.keys(JSON.parse(readFileSync(akanCodePaths.trustFile(), "utf8")).workspaces)).toHaveLength(1);
  });

  test.skipIf(process.platform === "win32")("the trust file is readable only by its owner", () => {
    const root = workspace(JSON.stringify({ mcpServers: { tool: { command: "node" } } }));
    WorkspaceTrust.approve(root, WorkspaceTrust.pending(root), true);
    expect(statSync(akanCodePaths.trustFile()).mode & 0o777).toBe(0o600);
  });

  test("a change to what was approved is asked about again", () => {
    const root = workspace(JSON.stringify({ mcpServers: { tool: { command: "node", args: ["x.js"] } } }));
    extension(root, "hello.ts", "export default () => {};");
    WorkspaceTrust.approve(root, WorkspaceTrust.pending(root), true);
    writeFileSync(
      McpServerConfig.file(root),
      JSON.stringify({ mcpServers: { tool: { command: "node", args: ["y.js"] } } }),
    );
    extension(root, "nested/more.ts", "export default () => {};");
    expect(WorkspaceTrust.pending(root).map((item) => item.kind)).toEqual(["mcp", "extensions"]);
    expect(WorkspaceTrust.isTrusted(root, "mcp")).toBe(false);
  });

  test("an approval that is not remembered lasts only for this process", () => {
    const root = workspace(JSON.stringify({ mcpServers: { tool: { command: "node" } } }));
    WorkspaceTrust.approve(root, WorkspaceTrust.pending(root), false);
    expect(WorkspaceTrust.isTrusted(root, "mcp")).toBe(true);
    expect(existsSync(akanCodePaths.trustFile())).toBe(false);
  });

  test("an edit made through akan code keeps the approval the content had", () => {
    const root = workspace(JSON.stringify({ mcpServers: { tool: { command: "node" } } }));
    WorkspaceTrust.approve(root, WorkspaceTrust.pending(root), true);
    WorkspaceTrust.carry(root, "mcp", () =>
      McpServerConfig.add(root, "more", ["https://more.example/mcp"], "workspace"),
    );
    expect(WorkspaceTrust.isTrusted(root, "mcp")).toBe(true);
    const untrusted = workspace(JSON.stringify({ mcpServers: { tool: { command: "node" } } }));
    WorkspaceTrust.carry(untrusted, "mcp", () => McpServerConfig.add(untrusted, "more", ["x"], "workspace"));
    expect(WorkspaceTrust.isTrusted(untrusted, "mcp")).toBe(false);
  });

  test("a disabled server needs no approval", () => {
    const root = workspace(JSON.stringify({ mcpServers: { tool: { command: "node", disabled: true } } }));
    expect(WorkspaceTrust.pending(root)).toEqual([]);
  });
});
